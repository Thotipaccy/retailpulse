package com.retailpulse.service;

import com.retailpulse.exception.BadRequestException;
import com.retailpulse.exception.ResourceNotFoundException;
import com.retailpulse.model.InventoryPurchase;
import com.retailpulse.model.InventoryRecord;
import com.retailpulse.model.Product;
import com.retailpulse.model.PurchaseOrder;
import com.retailpulse.model.Store;
import com.retailpulse.model.TransactionItem;
import com.retailpulse.model.User;
import com.retailpulse.repository.InventoryPurchaseRepository;
import com.retailpulse.repository.InventoryRecordRepository;
import com.retailpulse.repository.ProductRepository;
import com.retailpulse.repository.PurchaseOrderRepository;
import com.retailpulse.repository.StoreRepository;
import com.retailpulse.repository.TransactionItemRepository;
import com.retailpulse.security.CustomUserDetailsService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.*;

@Service
@RequiredArgsConstructor
public class InventoryService {

    private static final String DEFAULT_STORE_ID = "store-001";

    private final InventoryRecordRepository inventoryRecordRepository;
    private final InventoryPurchaseRepository inventoryPurchaseRepository;
    private final ProductRepository productRepository;
    private final StoreRepository storeRepository;
    private final TransactionItemRepository transactionItemRepository;
    private final PurchaseOrderRepository purchaseOrderRepository;
    private final CustomUserDetailsService userDetailsService;
    private final AIServiceClient aiServiceClient;
    private final AuditLogService auditLogService;

    public Map<String, Object> getSummary() {
        List<InventoryRecord> all = inventoryRecordRepository.findAllWithDetails();
        long healthy = all.stream().filter(r -> r.getQuantityOnHand() > r.getProduct().getReorderPoint()).count();
        long low = all.stream().filter(r -> r.getQuantityOnHand() <= r.getProduct().getReorderPoint() && r.getQuantityOnHand() > 0).count();
        long critical = all.stream().filter(r -> r.getQuantityOnHand() == 0).count();

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalProducts", all.size());
        summary.put("healthy", healthy);
        summary.put("low", low);
        summary.put("critical", critical);
        summary.put("overstock", all.stream().filter(r -> r.getQuantityOnHand() > r.getProduct().getReorderPoint() * 5).count());
        summary.put("aiPowered", aiServiceClient.isHealthy());
        summary.put("supplierInsights", buildSupplierInsights());
        return summary;
    }

    public List<Map<String, Object>> getStockLevels(boolean includeInactive) {
        List<InventoryRecord> records = includeInactive
                ? inventoryRecordRepository.findAllWithDetails()
                : inventoryRecordRepository.findAllActiveWithDetails();
        return records.stream().map(this::toStockMap).toList();
    }

    public List<Map<String, Object>> getTurnover() {
        LocalDateTime since = LocalDateTime.now().minusDays(90);

        // COGS per category: SUM(quantity_sold × average_purchase_cost)
        // Use lineTotal from actual sales as COGS proxy (qty * purchase cost was used when recording)
        List<Object[]> cogsRows = transactionItemRepository.sumCogsByCategorySince(since);
        Map<String, BigDecimal> cogsByCategory = new LinkedHashMap<>();
        for (Object[] r : cogsRows) {
            BigDecimal cogsVal = new BigDecimal(String.valueOf(r[1]));
            // Cap COGS at a reasonable scale (limit catastrophically large values from bad data)
            cogsByCategory.put(String.valueOf(r[0]), cogsVal);
        }

        // Current inventory value per category: SUM(quantityOnHand × average_purchase_cost)
        // Use latest average purchase cost per product for accuracy
        Map<String, BigDecimal> inventoryValueByCategory = new LinkedHashMap<>();
        for (InventoryRecord ir : inventoryRecordRepository.findAllActiveWithDetails()) {
            String cat = ir.getProduct().getCategory().getCategoryName();
            // Use unit purchase cost (not sale price) if available
            BigDecimal costPerUnit = ir.getProduct().getUnitCost();
            if (costPerUnit == null || costPerUnit.compareTo(BigDecimal.ZERO) <= 0) {
                // Fall back to a fraction of unit price as cost estimate
                costPerUnit = ir.getProduct().getUnitPrice().multiply(new BigDecimal("0.6"));
            }
            BigDecimal value = costPerUnit.multiply(BigDecimal.valueOf(ir.getQuantityOnHand()));
            inventoryValueByCategory.merge(cat, value, BigDecimal::add);
        }

        if (cogsByCategory.isEmpty()) {
            return List.of();
        }

        return cogsByCategory.entrySet().stream()
                .filter(e -> e.getValue().compareTo(BigDecimal.ZERO) > 0)
                .map(e -> {
                    String category = e.getKey();
                    BigDecimal cogs = e.getValue();
                    BigDecimal inventoryValue = inventoryValueByCategory.getOrDefault(category, BigDecimal.ONE);
                    if (inventoryValue.compareTo(BigDecimal.ZERO) == 0) inventoryValue = BigDecimal.ONE;
                    // Annualise: multiply by (365/90) to get annual turnover rate
                    double turnoverRaw = cogs.divide(inventoryValue, 4, RoundingMode.HALF_UP).doubleValue();
                    double annualTurnover = turnoverRaw * (365.0 / 90.0);
                    // Cap at 52 (once per week) — anything higher is a data anomaly
                    double turnoverRate = Math.min(annualTurnover, 52.0);
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("name", category);
                    row.put("turnover", Math.round(turnoverRate * 10.0) / 10.0);
                    row.put("cogs", cogs.longValue());
                    row.put("inventoryValue", inventoryValue.longValue());
                    return row;
                })
                .sorted((a, b) -> Double.compare((double) b.get("turnover"), (double) a.get("turnover")))
                .limit(6)
                .toList();
    }

    public List<Map<String, Object>> getStockoutRisks() {
        List<InventoryRecord> records = inventoryRecordRepository
                .findByStockoutRiskGreaterThanEqualOrderByStockoutRiskDesc(new BigDecimal("0.3"));

        Optional<List<Map<String, Object>>> aiRisks = aiServiceClient.assessStockout(
                records.stream().map(this::toAiProductPayload).toList());

        List<Map<String, Object>> risks;
        if (aiRisks.isPresent() && !aiRisks.get().isEmpty()) {
            Map<String, Map<String, Object>> byProduct = new HashMap<>();
            for (Map<String, Object> risk : aiRisks.get()) {
                byProduct.put(String.valueOf(risk.get("product_id")), risk);
            }
            risks = records.stream().map(r -> {
                Map<String, Object> m = toStockMap(r);
                Map<String, Object> ai = byProduct.get(r.getProduct().getProductId());
                if (ai != null) {
                    m.put("stockoutRisk", ai.get("stockout_probability"));
                    m.put("daysUntilStockout", ai.get("days_until_stockout"));
                    m.put("riskLevel", ai.get("risk_level"));
                    m.put("aiPowered", true);
                } else {
                    m.put("stockoutRisk", r.getStockoutRisk());
                    m.put("daysUntilStockout", computeDaysUntilStockout(r));
                }
                return m;
            }).toList();
        } else {
            risks = records.stream().map(r -> {
                Map<String, Object> m = toStockMap(r);
                m.put("stockoutRisk", r.getStockoutRisk());
                m.put("daysUntilStockout", computeDaysUntilStockout(r));
                return m;
            }).toList();
        }

        return risks.stream()
                .filter(m -> {
                    int days = ((Number) m.getOrDefault("daysUntilStockout", 999)).intValue();
                    return days <= 30; // Return up to 30 days so frontend toggle can filter 7/14/30
                })
                .toList();
    }

    public List<Map<String, Object>> getReorderRecommendations() {
        List<InventoryRecord> records = inventoryRecordRepository.findBelowReorderPoint();
        Optional<List<Map<String, Object>>> aiRisks = aiServiceClient.assessStockout(
                records.stream().map(this::toAiProductPayload).toList());

        if (aiRisks.isPresent() && !aiRisks.get().isEmpty()) {
            Map<String, Map<String, Object>> byProduct = new HashMap<>();
            for (Map<String, Object> risk : aiRisks.get()) {
                byProduct.put(String.valueOf(risk.get("product_id")), risk);
            }
            return records.stream().map(r -> {
                Map<String, Object> m = toStockMap(r);
                Map<String, Object> ai = byProduct.get(r.getProduct().getProductId());
                if (ai != null) {
                    m.put("suggestedOrder", ai.get("recommended_order"));
                    m.put("priority", "critical".equals(ai.get("risk_level")) ? "high" : "medium");
                    m.put("potentialLossRwf", ai.get("potential_loss_rwf"));
                    m.put("aiPowered", true);
                } else {
                    int suggested = r.getProduct().getReorderPoint() * 2 - r.getQuantityOnHand();
                    m.put("priority", r.getStockoutRisk().compareTo(new BigDecimal("0.5")) >= 0 ? "high" : "medium");
                    m.put("suggestedOrder", Math.max(suggested, r.getProduct().getReorderPoint()));
                }
                attachSupplierInsight(m, r.getProduct().getProductId());
                return m;
            }).toList();
        }

        return records.stream().map(r -> {
            Map<String, Object> m = toStockMap(r);
            int suggested = r.getProduct().getReorderPoint() * 2 - r.getQuantityOnHand();
            m.put("priority", r.getStockoutRisk().compareTo(new BigDecimal("0.5")) >= 0 ? "high" : "medium");
            m.put("suggestedOrder", Math.max(suggested, r.getProduct().getReorderPoint()));
            attachSupplierInsight(m, r.getProduct().getProductId());
            return m;
        }).toList();
    }

    private void attachSupplierInsight(Map<String, Object> target, String productId) {
        List<Object[]> supplierAvgs = inventoryPurchaseRepository.averageCostBySupplierForProduct(productId);
        // Always attach the latest supplier regardless of count
        List<String> latestSupplier = inventoryPurchaseRepository.findLatestSupplierForProduct(productId);
        if (!latestSupplier.isEmpty()) {
            target.put("latestSupplier", latestSupplier.get(0));
        }
        if (supplierAvgs.size() >= 2) {
            String lower = String.valueOf(supplierAvgs.get(0)[0]);
            String higher = String.valueOf(supplierAvgs.get(supplierAvgs.size() - 1)[0]);
            target.put("supplierInsight", lower + "'s prices are typically lower than " + higher);
            target.put("cheapestSupplier", lower);
        } else if (supplierAvgs.size() == 1) {
            target.put("cheapestSupplier", String.valueOf(supplierAvgs.get(0)[0]));
        }
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getVelocity() {
        LocalDateTime since = LocalDateTime.now().minusMonths(6);
        List<TransactionItem> items = transactionItemRepository.findWithDetailsSince(since);

        Map<String, long[]> categoryTotals = new HashMap<>();
        for (TransactionItem ti : items) {
            String cat = ti.getProduct().getCategory().getCategoryName();
            categoryTotals.computeIfAbsent(cat, k -> new long[2]);
            categoryTotals.get(cat)[0] += ti.getQuantity();
            categoryTotals.get(cat)[1] += ti.getLineTotal().longValue();
        }

        List<Map<String, Object>> monthly = new ArrayList<>();
        for (int i = 5; i >= 0; i--) {
            YearMonth ym = YearMonth.now().minusMonths(i);
            String label = ym.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH);
            long qty = items.stream()
                    .filter(ti -> YearMonth.from(ti.getTransaction().getTransactionDate()).equals(ym))
                    .mapToLong(TransactionItem::getQuantity)
                    .sum();
            monthly.add(Map.of("month", label, "unitsSold", qty));
        }

        double avgQty = categoryTotals.values().stream().mapToLong(v -> v[0]).average().orElse(0);
        List<Map<String, Object>> fastMovers = new ArrayList<>();
        List<Map<String, Object>> slowMovers = new ArrayList<>();
        categoryTotals.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue()[0], a.getValue()[0]))
                .forEach(e -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("category", e.getKey());
                    row.put("unitsSold", e.getValue()[0]);
                    row.put("revenue", e.getValue()[1]);
                    if (e.getValue()[0] >= avgQty) fastMovers.add(row);
                    else slowMovers.add(row);
                });

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("monthly", monthly);
        result.put("fastMovers", fastMovers);
        result.put("slowMovers", slowMovers);
        return result;
    }

    @Transactional
    public Map<String, Object> submitPurchaseOrder(String userId, List<Map<String, Object>> items) {
        if (items == null || items.isEmpty()) {
            throw new com.retailpulse.exception.BadRequestException("Purchase order must have at least one item");
        }
        User user = userDetailsService.loadEntityById(userId);
        BigDecimal total = BigDecimal.ZERO;
        for (Map<String, Object> item : items) {
            int qty = ((Number) item.getOrDefault("quantity", item.getOrDefault("orderQty", 1))).intValue();
            BigDecimal price = new BigDecimal(String.valueOf(item.getOrDefault("unitPrice", item.getOrDefault("price", 0))));
            total = total.add(price.multiply(BigDecimal.valueOf(qty)));
        }
        String itemsJson;
        try {
            itemsJson = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(items);
        } catch (Exception ex) {
            itemsJson = items.toString();
        }
        String poId = "po-" + UUID.randomUUID().toString().substring(0, 8);
        PurchaseOrder order = PurchaseOrder.builder()
                .id(poId)
                .user(user)
                .status("SUBMITTED")
                .totalAmount(total.setScale(2, RoundingMode.HALF_UP))
                .itemsJson(itemsJson)
                .createdAt(LocalDateTime.now())
                .build();
        purchaseOrderRepository.save(order);
        auditLogService.log(userId, "PURCHASE_ORDER_CREATE",
                "Created PO " + poId + " with " + items.size() + " items, total " + order.getTotalAmount(),
                "purchase_orders", poId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderId", poId);
        result.put("status", order.getStatus());
        result.put("totalAmount", order.getTotalAmount());
        result.put("itemCount", items.size());
        result.put("createdAt", order.getCreatedAt().toString());
        return result;
    }

    public List<Map<String, Object>> getPendingPurchaseOrders(String userId) {
        List<PurchaseOrder> orders = purchaseOrderRepository.findByUserUserIdAndStatusOrderByCreatedAtDesc(userId, "SUBMITTED");
        return orders.stream().map(order -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("orderId", order.getId());
            map.put("status", order.getStatus());
            map.put("totalAmount", order.getTotalAmount());
            map.put("createdAt", order.getCreatedAt().toString());
            try {
                map.put("items", new com.fasterxml.jackson.databind.ObjectMapper().readValue(order.getItemsJson(), List.class));
            } catch (Exception e) {
                map.put("items", new ArrayList<>());
            }
            return map;
        }).toList();
    }

    @Transactional
    public void markPurchaseOrderReceived(String userId, String orderId) {
        PurchaseOrder order = purchaseOrderRepository.findById(orderId)
                .orElseThrow(() -> new com.retailpulse.exception.ResourceNotFoundException("Purchase order not found"));
        if (!order.getUser().getUserId().equals(userId)) {
            throw new com.retailpulse.exception.BadRequestException("Cannot modify this order");
        }
        order.setStatus("RECEIVED");
        purchaseOrderRepository.save(order);
        auditLogService.log(userId, "PURCHASE_ORDER_RECEIVE", "Received PO " + orderId, "purchase_orders", orderId);
    }


    @Transactional
    public Map<String, Object> autoCreatePurchaseOrders(String userId) {
        List<Map<String, Object>> recommendations = getReorderRecommendations();
        if (recommendations.isEmpty()) {
            throw new com.retailpulse.exception.BadRequestException("No reorder recommendations available");
        }
        // Build PO items list — each item uses recommended supplier & purchase cost
        List<Map<String, Object>> poItems = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        for (Map<String, Object> rec : recommendations) {
            int qty = ((Number) rec.getOrDefault("suggestedOrder", rec.get("reorderPoint"))).intValue();
            // Use cheapestSupplier if available, else latestSupplier
            String supplier = (String) rec.getOrDefault("cheapestSupplier",
                    rec.getOrDefault("latestSupplier", "Pending Supplier"));
            BigDecimal unitPrice = new BigDecimal(String.valueOf(rec.getOrDefault("unitCost", rec.get("unitPrice"))));
            if (unitPrice.compareTo(BigDecimal.ZERO) == 0) {
                unitPrice = new BigDecimal(String.valueOf(rec.getOrDefault("unitPrice", BigDecimal.ONE)));
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("productId", rec.get("productId"));
            item.put("productName", rec.get("productName"));
            item.put("quantity", qty);
            item.put("unitPrice", unitPrice);
            item.put("supplier", supplier);
            poItems.add(item);
            total = total.add(unitPrice.multiply(BigDecimal.valueOf(qty)));
        }
        // Create a single consolidated Purchase Order (SUBMITTED/pending status)
        Map<String, Object> poResult = submitPurchaseOrder(userId, poItems);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("orderId", poResult.get("orderId"));
        response.put("ordersCreated", 1);
        response.put("itemCount", poItems.size());
        response.put("totalAmount", total.setScale(2, RoundingMode.HALF_UP));
        response.put("message", "Purchase Order created and is pending receipt. Receive it when goods arrive.");
        return response;
    }

    @Transactional
    public Map<String, Object> recordPurchases(String userId, List<Map<String, Object>> items) {
        if (items == null || items.isEmpty()) {
            throw new BadRequestException("At least one purchase line is required");
        }
        List<Map<String, Object>> recorded = new ArrayList<>();
        for (Map<String, Object> item : items) {
            recorded.add(recordPurchase(userId, item));
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("count", recorded.size());
        result.put("purchases", recorded);
        return result;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getPurchaseHistory(String productId) {
        return inventoryPurchaseRepository.findByProductIdOrderByPurchaseDateDesc(productId).stream()
                .map(p -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("purchaseId", p.getPurchaseId());
                    row.put("date", p.getPurchaseDate().toLocalDate().toString());
                    row.put("quantity", p.getQuantity());
                    row.put("unitCost", p.getUnitPurchaseCost());
                    row.put("supplier", p.getSupplierName());
                    row.put("supplierContact", p.getSupplierContact());
                    row.put("invoiceNumber", p.getInvoiceNumber());
                    row.put("totalCost", p.getTotalCost());
                    return row;
                })
                .toList();
    }

    @Transactional
    public Map<String, Object> recordPurchase(String userId, Map<String, Object> request) {
        String productId = String.valueOf(request.get("productId"));
        int quantity = ((Number) request.get("quantity")).intValue();
        if (quantity <= 0) {
            throw new BadRequestException("Quantity must be greater than zero");
        }
        BigDecimal unitCost = new BigDecimal(String.valueOf(request.get("unitPurchaseCost")));
        if (unitCost.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BadRequestException("Unit purchase cost must be greater than zero");
        }
        String supplierName = String.valueOf(request.get("supplierName")).trim();
        if (supplierName.isEmpty()) {
            throw new BadRequestException("Supplier name is required");
        }
        String supplierContact = request.get("supplierContact") != null
                ? String.valueOf(request.get("supplierContact")).trim() : null;
        String invoiceNumber = request.get("invoiceNumber") != null
                ? String.valueOf(request.get("invoiceNumber")).trim() : null;
        String storeId = request.get("storeId") != null
                ? String.valueOf(request.get("storeId")) : DEFAULT_STORE_ID;

        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found"));
        Store store = storeRepository.findById(storeId)
                .orElseThrow(() -> new ResourceNotFoundException("Store not found"));
        User user = userDetailsService.loadEntityById(userId);

        InventoryRecord record = inventoryRecordRepository
                .findByProductProductIdAndStoreStoreId(productId, storeId)
                .orElseThrow(() -> new ResourceNotFoundException("Inventory record not found for product"));

        LocalDateTime now = LocalDateTime.now();
        BigDecimal totalCost = unitCost.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP);

        record.setQuantityOnHand(record.getQuantityOnHand() + quantity);
        record.setSupplierName(supplierName);
        record.setSupplierContact(supplierContact);
        record.setInvoiceNumber(invoiceNumber);
        record.setUnitPurchaseCost(unitCost);
        record.setLastPurchaseDate(now);
        record.setLastUpdated(now);
        inventoryRecordRepository.save(record);

        String purchaseId = "pur-" + UUID.randomUUID().toString().substring(0, 8);
        InventoryPurchase purchase = InventoryPurchase.builder()
                .purchaseId(purchaseId)
                .product(product)
                .store(store)
                .user(user)
                .quantity(quantity)
                .unitPurchaseCost(unitCost)
                .totalCost(totalCost)
                .supplierName(supplierName)
                .supplierContact(supplierContact)
                .invoiceNumber(invoiceNumber)
                .purchaseDate(now)
                .createdAt(now)
                .build();
        inventoryPurchaseRepository.save(purchase);

        auditLogService.log(userId, "INVENTORY_PURCHASE",
                "Recorded purchase of " + quantity + " units of " + product.getProductName()
                        + " from " + supplierName + " at " + unitCost + " RWF/unit",
                "inventory_purchases", purchaseId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("purchaseId", purchaseId);
        result.put("productId", productId);
        result.put("quantity", quantity);
        result.put("unitPurchaseCost", unitCost);
        result.put("totalCost", totalCost);
        result.put("supplierName", supplierName);
        result.put("quantityOnHand", record.getQuantityOnHand());
        result.put("purchaseDate", now.toString());
        return result;
    }

    private List<Map<String, Object>> buildSupplierInsights() {
        Map<String, List<BigDecimal>> bySupplier = new HashMap<>();
        for (InventoryPurchase purchase : inventoryPurchaseRepository.findAll()) {
            bySupplier.computeIfAbsent(purchase.getSupplierName(), k -> new ArrayList<>())
                    .add(purchase.getUnitPurchaseCost());
        }
        if (bySupplier.size() < 2) {
            return List.of();
        }

        List<Map.Entry<String, BigDecimal>> averages = bySupplier.entrySet().stream()
                .map(e -> Map.entry(e.getKey(), averageCost(e.getValue())))
                .sorted(Map.Entry.comparingByValue())
                .toList();

        String cheapest = averages.get(0).getKey();
        String expensive = averages.get(averages.size() - 1).getKey();
        if (averages.get(0).getValue().compareTo(averages.get(averages.size() - 1).getValue()) >= 0) {
            return List.of();
        }

        Map<String, Object> insight = new LinkedHashMap<>();
        insight.put("message", cheapest + "'s prices are typically lower than " + expensive);
        insight.put("cheapestSupplier", cheapest);
        insight.put("cheapestAvgCost", averages.get(0).getValue());
        insight.put("comparisonSupplier", expensive);
        insight.put("comparisonAvgCost", averages.get(averages.size() - 1).getValue());
        return List.of(insight);
    }

    private BigDecimal averageCost(List<BigDecimal> costs) {
        if (costs.isEmpty()) {
            return BigDecimal.ZERO;
        }
        BigDecimal sum = costs.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        return sum.divide(BigDecimal.valueOf(costs.size()), 2, RoundingMode.HALF_UP);
    }

    private Map<String, Object> toAiProductPayload(InventoryRecord r) {
        int reorder = r.getProduct().getReorderPoint();
        int qty = r.getQuantityOnHand();
        double dailyDemand = Math.max(1.0, reorder / 7.0);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("product_id", r.getProduct().getProductId());
        payload.put("current_stock", qty);
        payload.put("daily_demand_avg", dailyDemand);
        payload.put("lead_time_days", 5);
        payload.put("reorder_point", reorder);
        payload.put("unit_price", r.getProduct().getUnitPrice());
        return payload;
    }

    private int computeDaysUntilStockout(InventoryRecord r) {
        if (r.getQuantityOnHand() <= 0) {
            return 0;
        }
        LocalDateTime since = LocalDateTime.now().minusDays(30);
        String productId = r.getProduct().getProductId();
        long sold = transactionItemRepository.sumQuantityByProductSince(since).stream()
                .filter(row -> productId.equals(row[0]))
                .mapToLong(row -> ((Number) row[2]).longValue())
                .findFirst()
                .orElse(0L);
        double dailyDemand = sold > 0 ? sold / 30.0 : Math.max(1.0, r.getProduct().getReorderPoint() / 7.0);
        return Math.max(1, (int) Math.ceil(r.getQuantityOnHand() / dailyDemand));
    }

    private Map<String, Object> toStockMap(InventoryRecord r) {
        String status = resolveStatus(r);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("productId", r.getProduct().getProductId());
        m.put("skuCode", r.getProduct().getSkuCode());
        m.put("productName", r.getProduct().getProductName());
        m.put("category", r.getProduct().getCategory().getCategoryName());
        m.put("unitPrice", r.getProduct().getUnitPrice());
        m.put("unitCost", r.getProduct().getUnitCost());
        m.put("quantityOnHand", r.getQuantityOnHand());
        m.put("reorderPoint", r.getProduct().getReorderPoint());
        m.put("stockStatus", status);
        m.put("storeId", r.getStore().getStoreId());
        m.put("isActive", Boolean.TRUE.equals(r.getProduct().getIsActive()));
        m.put("daysUntilStockout", computeDaysUntilStockout(r));
        // Attach latest purchase info for product cards
        String productId = r.getProduct().getProductId();
        attachSupplierInsight(m, productId);
        // Latest purchase details (date, cost, supplier)
        List<InventoryPurchase> recentPurchases = inventoryPurchaseRepository
                .findByProductIdOrderByPurchaseDateDesc(productId);
        if (!recentPurchases.isEmpty()) {
            InventoryPurchase latest = recentPurchases.get(0);
            m.put("lastPurchaseDate", latest.getPurchaseDate().toLocalDate().toString());
            m.put("lastPurchaseCost", latest.getUnitPurchaseCost());
            m.put("lastPurchaseQty", latest.getQuantity());
            m.put("lastPurchaseInvoice", latest.getInvoiceNumber());
            // Use actual purchase cost as unitCost if product.unitCost is zero/null
            if (r.getProduct().getUnitCost() == null || r.getProduct().getUnitCost().compareTo(BigDecimal.ZERO) <= 0) {
                m.put("unitCost", latest.getUnitPurchaseCost());
            }
        }
        return m;
    }

    private String resolveStatus(InventoryRecord r) {
        int qty = r.getQuantityOnHand();
        int reorder = r.getProduct().getReorderPoint();
        if (qty == 0) return "critical";
        if (qty <= reorder) return "low";
        if (qty > reorder * 5) return "overstock";
        return "healthy";
    }

    @Transactional(readOnly = true)
    public List<Map<String, String>> getSuppliers() {
        Map<String, String> supplierContacts = new HashMap<>();
        List<InventoryPurchase> purchases = inventoryPurchaseRepository.findAll();
        purchases.sort(Comparator.comparing(InventoryPurchase::getPurchaseDate)); // oldest to newest
        for (InventoryPurchase p : purchases) {
            if (p.getSupplierName() != null && !p.getSupplierName().trim().isEmpty()) {
                String contact = p.getSupplierContact() != null ? p.getSupplierContact().trim() : "";
                if (!contact.isEmpty()) {
                    supplierContacts.put(p.getSupplierName().trim(), contact);
                } else {
                    supplierContacts.putIfAbsent(p.getSupplierName().trim(), "");
                }
            }
        }
        return supplierContacts.entrySet().stream()
                .map(e -> Map.of("name", e.getKey(), "contact", e.getValue()))
                .sorted(Comparator.comparing(m -> m.get("name")))
                .toList();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getBestTimeToBuy(String productId) {
        List<InventoryPurchase> purchases = inventoryPurchaseRepository
                .findByProductIdOrderByPurchaseDateDesc(productId);
        if (purchases.isEmpty()) {
            return Map.of("available", false);
        }
        Map<java.time.Month, List<BigDecimal>> byMonth = new EnumMap<>(java.time.Month.class);
        Map<java.time.Month, String> supplierByMonth = new EnumMap<>(java.time.Month.class);
        for (InventoryPurchase p : purchases) {
            java.time.Month m = p.getPurchaseDate().getMonth();
            byMonth.computeIfAbsent(m, k -> new ArrayList<>()).add(p.getUnitPurchaseCost());
            supplierByMonth.putIfAbsent(m, p.getSupplierName());
        }
        java.time.Month bestMonth = byMonth.entrySet().stream()
                .min(Comparator.comparingDouble(e -> e.getValue().stream()
                        .mapToDouble(BigDecimal::doubleValue).average().orElse(Double.MAX_VALUE)))
                .map(Map.Entry::getKey)
                .orElse(purchases.get(0).getPurchaseDate().getMonth());
        BigDecimal avgCost = byMonth.get(bestMonth).stream()
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(BigDecimal.valueOf(byMonth.get(bestMonth).size()), 2, RoundingMode.HALF_UP);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("available", true);
        result.put("bestMonth", bestMonth.getDisplayName(TextStyle.FULL, Locale.ENGLISH));
        result.put("avgUnitCost", avgCost);
        result.put("recommendedSupplier", supplierByMonth.get(bestMonth));
        return result;
    }
}
