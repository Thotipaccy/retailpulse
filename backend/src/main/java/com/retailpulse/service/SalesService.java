package com.retailpulse.service;

import com.retailpulse.dto.request.TransactionRequest;
import com.retailpulse.dto.request.TransactionItemRequest;
import com.retailpulse.exception.BadRequestException;
import com.retailpulse.exception.ResourceNotFoundException;
import com.retailpulse.model.*;
import com.retailpulse.model.enums.*;
import com.retailpulse.repository.*;
import com.retailpulse.security.CustomUserDetailsService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@RequiredArgsConstructor
public class SalesService {

    private final TransactionRepository transactionRepository;
    private final TransactionItemRepository transactionItemRepository;
    private final ProductRepository productRepository;
    private final StoreRepository storeRepository;
    private final CustomerRepository customerRepository;
    private final InventoryRecordRepository inventoryRecordRepository;
    private final PaymentHistoryRepository paymentHistoryRepository;
    private final CustomUserDetailsService userDetailsService;
    private final AuditLogService auditLogService;
    private final ModelRetrainingScheduler retrainingScheduler;

    private LocalDateTime parseDate(String dateStr, boolean endOfDay) {
        if (dateStr == null || dateStr.isBlank() || "undefined".equals(dateStr)) return null;
        try {
            if (dateStr.contains("T")) {
                return LocalDateTime.parse(dateStr, DateTimeFormatter.ISO_DATE_TIME);
            } else {
                LocalDate date = LocalDate.parse(dateStr, DateTimeFormatter.ISO_LOCAL_DATE);
                return endOfDay ? date.atTime(23, 59, 59) : date.atStartOfDay();
            }
        } catch (Exception e) {
            // A malformed date must not silently widen the query to all history.
            throw new BadRequestException("Invalid date value: '" + dateStr + "'. Expected format: YYYY-MM-DD");
        }
    }

    /**
     * Accepts common client spellings and returns the canonical enum.
     * Unknown values are rejected instead of being quietly recorded as CASH,
     * which previously corrupted payment-method analytics.
     */
    static PaymentMethod normalizePaymentMethod(String raw) {
        if (raw == null || raw.isBlank()) {
            return PaymentMethod.CASH;
        }
        switch (raw.trim().toUpperCase().replace('-', '_').replace(' ', '_')) {
            case "CASH": return PaymentMethod.CASH;
            case "MOMO":
            case "MOBILE_MONEY":
            case "MTN": return PaymentMethod.MOBILE_MONEY;
            case "AIRTEL":
            case "AIRTEL_MONEY": return PaymentMethod.AIRTEL_MONEY;
            case "BANK":
            case "BANK_TRANSFER":
            case "BANK_TRANSFERT": return PaymentMethod.BANK_TRANSFER;
            case "CREDIT":
            case "CREDIT_SALE": return PaymentMethod.CREDIT;
            default:
                throw new BadRequestException(
                        "Unknown payment method '" + raw + "'. Allowed: CASH, MOBILE_MONEY, AIRTEL_MONEY, BANK_TRANSFER, CREDIT");
        }
    }

    public Map<String, Object> getOverview(String period, String startDate, String endDate) {
        String p = period != null ? period.toLowerCase() : "daily";
        LocalDateTime parsedStart = parseDate(startDate, false);
        LocalDateTime parsedEnd = parseDate(endDate, true);

        LocalDateTime since = parsedStart != null ? parsedStart : resolveSince(p);
        LocalDateTime until = parsedEnd != null ? parsedEnd : LocalDateTime.now();

        List<String> labels = buildLabels(p, since, until);
        Map<String, BigDecimal> buckets = new LinkedHashMap<>();
        labels.forEach(label -> buckets.put(label, BigDecimal.ZERO));

        List<Transaction> transactions = transactionRepository.findByDateRange(since, until);

        for (Transaction t : transactions) {
            String key = formatPeriodKey(t.getTransactionDate(), p, since, until);
            if (buckets.containsKey(key)) {
                buckets.merge(key, t.getTotalAmount(), BigDecimal::add);
            }
        }

        List<Map<String, Object>> trend = buckets.entrySet().stream()
                .map(e -> Map.<String, Object>of("name", e.getKey(), "value", e.getValue()))
                .toList();

        BigDecimal total = transactions.stream()
                .map(Transaction::getTotalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Previous period calculation
        LocalDateTime prevSince;
        LocalDateTime prevUntil;
        if (parsedStart != null && parsedEnd != null) {
            long daysBetween = ChronoUnit.DAYS.between(parsedStart.toLocalDate(), parsedEnd.toLocalDate()) + 1;
            prevSince = parsedStart.minusDays(daysBetween);
            prevUntil = parsedStart.minusSeconds(1);
        } else {
            prevSince = resolvePreviousSince(p);
            prevUntil = since.minusSeconds(1);
        }

        List<Transaction> prevTransactions = transactionRepository.findByDateRange(prevSince, prevUntil);
        BigDecimal prevTotal = prevTransactions.stream()
                .map(Transaction::getTotalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        double growthRate = prevTotal.compareTo(BigDecimal.ZERO) == 0
                ? (total.compareTo(BigDecimal.ZERO) > 0 ? 100.0 : 0.0)
                : total.subtract(prevTotal)
                        .divide(prevTotal, 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100))
                        .doubleValue();

        // Calculate total units exactly within the date range
        long totalUnits = transactionItemRepository.findWithDetailsSince(since).stream()
                .filter(item -> !item.getTransaction().getTransactionDate().isAfter(until))
                .mapToLong(item -> item.getQuantity())
                .sum();

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("periodRevenue", total);
        summary.put("growthRate", Math.round(growthRate * 10.0) / 10.0);
        summary.put("totalUnits", totalUnits);
        summary.put("trend", trend);

        return summary;
    }

    public List<Map<String, Object>> getByCategory(String period, String startDate, String endDate) {
        LocalDateTime parsedStart = parseDate(startDate, false);
        LocalDateTime parsedEnd = parseDate(endDate, true);
        LocalDateTime since = parsedStart != null ? parsedStart : resolveSince(period != null ? period : "monthly");
        LocalDateTime until = parsedEnd != null ? parsedEnd : LocalDateTime.now();

        List<Object[]> rows = transactionItemRepository.sumRevenueByCategoryBetween(since, until);
        if (rows.isEmpty()) {
            return List.of();
        }
        BigDecimal total = rows.stream()
                .map(r -> (BigDecimal) r[1])
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (total.compareTo(BigDecimal.ZERO) == 0) {
            return List.of();
        }
        String[] colors = {"#B87333", "#9B4D32", "#5A7289", "#6B705C", "#C9952A", "#3D7A5C"};
        List<Map<String, Object>> result = new ArrayList<>();
        for (int i = 0; i < rows.size() && i < 6; i++) {
            Object[] row = rows.get(i);
            BigDecimal revenue = (BigDecimal) row[1];
            int share = revenue.multiply(BigDecimal.valueOf(100))
                    .divide(total, 0, RoundingMode.HALF_UP)
                    .intValue();
            result.add(Map.of(
                    "name", row[0],
                    "value", share,
                    "fill", colors[i % colors.length]
            ));
        }
        return result;
    }

    public List<Map<String, Object>> getByPaymentMethod(String period, String startDate, String endDate) {
        LocalDateTime parsedStart = parseDate(startDate, false);
        LocalDateTime parsedEnd = parseDate(endDate, true);
        LocalDateTime since = parsedStart != null ? parsedStart : resolveSince(period != null ? period : "monthly");
        LocalDateTime until = parsedEnd != null ? parsedEnd : LocalDateTime.now();

        List<Object[]> rows = transactionRepository.sumByPaymentMethodBetween(since, until);
        if (rows.isEmpty()) {
            return List.of();
        }
        return rows.stream().map(r -> Map.<String, Object>of(
                "name", ((Enum<?>) r[0]).name().toLowerCase(),
                "value", r[1]
        )).toList();
    }

    public List<Map<String, Object>> getTopProducts(int limit, String period, String startDate, String endDate) {
        LocalDateTime parsedStart = parseDate(startDate, false);
        LocalDateTime parsedEnd = parseDate(endDate, true);
        LocalDateTime since = parsedStart != null ? parsedStart : resolveSince(period != null ? period : "monthly");
        LocalDateTime until = parsedEnd != null ? parsedEnd : LocalDateTime.now();

        long durationDays = java.time.temporal.ChronoUnit.DAYS.between(since, until);
        if (durationDays <= 0) durationDays = 1;
        LocalDateTime previousSince = since.minusDays(durationDays);
        LocalDateTime previousUntil = since;

        return transactionItemRepository.findTopSellingProductsBetween(since, until).stream()
                .limit(limit)
                .map(r -> {
                    String productId = (String) r[0];
                    long currentUnits = ((Number) r[2]).longValue();
                    BigDecimal totalRevenue = (BigDecimal) r[3];
                    BigDecimal unitCost = (BigDecimal) r[5];
                    
                    double margin = 0;
                    if (currentUnits > 0 && totalRevenue.compareTo(BigDecimal.ZERO) > 0) {
                        BigDecimal avgUnitPrice = totalRevenue.divide(BigDecimal.valueOf(currentUnits), 4, RoundingMode.HALF_UP);
                        if (avgUnitPrice.compareTo(BigDecimal.ZERO) > 0) {
                            margin = avgUnitPrice.subtract(unitCost)
                                    .divide(avgUnitPrice, 4, RoundingMode.HALF_UP)
                                    .multiply(BigDecimal.valueOf(100))
                                    .doubleValue();
                        }
                    }

                    Long prevUnits = transactionItemRepository.sumQuantityByProductIdBetween(productId, previousSince, previousUntil);
                    double trend = 0;
                    if (prevUnits != null && prevUnits > 0) {
                        trend = ((double) (currentUnits - prevUnits) / prevUnits) * 100.0;
                    } else if (currentUnits > 0) {
                        trend = 100.0;
                    }

                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("productId", productId);
                    m.put("productName", r[1]);
                    m.put("unitsSold", currentUnits);
                    m.put("revenue", r[3]);
                    m.put("category", r[4]);
                    m.put("margin", Math.round(margin * 10.0) / 10.0);
                    m.put("trend", Math.round(trend * 10.0) / 10.0);
                    return m;
                })
                .toList();
    }

    public List<Map<String, Object>> getHeatmap(String period, String startDate, String endDate) {
        LocalDateTime parsedStart = parseDate(startDate, false);
        LocalDateTime parsedEnd = parseDate(endDate, true);
        LocalDateTime since = parsedStart != null ? parsedStart : resolveSince(period != null ? period : "monthly");
        LocalDateTime until = parsedEnd != null ? parsedEnd : LocalDateTime.now();

        List<Transaction> transactions = transactionRepository.findByDateRange(since, until);
        if (transactions.isEmpty()) {
            return List.of();
        }
        String[] days = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"};
        String[] hours = {"8am-10am", "10am-12pm", "12pm-2pm", "2pm-4pm", "4pm-6pm", "6pm+"};
        int[][] grid = new int[7][6];
        for (Transaction t : transactions) {
            int dayIdx = t.getTransactionDate().getDayOfWeek().getValue() - 1;
            int hour = t.getTransactionDate().getHour();
            int hourIdx = switch (hour) {
                case 8, 9 -> 0;
                case 10, 11 -> 1;
                case 12, 13 -> 2;
                case 14, 15 -> 3;
                case 16, 17 -> 4;
                default -> 5;
            };
            grid[dayIdx][hourIdx] += t.getTotalAmount().intValue();
        }
        List<Map<String, Object>> heatmap = new ArrayList<>();
        for (int d = 0; d < days.length; d++) {
            for (int h = 0; h < hours.length; h++) {
                heatmap.add(Map.of("day", days[d], "hour", hours[h], "value", grid[d][h]));
            }
        }
        return heatmap;
    }

    private LocalDateTime resolvePreviousSince(String period) {
        return switch (period) {
            case "today" -> resolveSince(period).minusDays(1);
            case "weekly" -> resolveSince(period).minusWeeks(4);
            case "monthly" -> resolveSince(period).minusMonths(8);
            case "yearly" -> resolveSince(period).minusYears(1);
            default -> resolveSince(period).minusDays(7);
        };
    }

    private List<String> buildLabels(String period, LocalDateTime since, LocalDateTime until) {
        if (period.equals("custom") || (period.equals("daily") && ChronoUnit.DAYS.between(since, until) > 7)) {
            long days = ChronoUnit.DAYS.between(since.toLocalDate(), until.toLocalDate()) + 1;
            if (days <= 31) {
                List<String> labels = new ArrayList<>();
                for (int i = 0; i < days; i++) {
                    labels.add(since.plusDays(i).toLocalDate().format(DateTimeFormatter.ofPattern("MMM dd")));
                }
                return labels;
            } else {
                List<String> labels = new ArrayList<>();
                long months = ChronoUnit.MONTHS.between(since.withDayOfMonth(1), until.withDayOfMonth(1)) + 1;
                for (int i = 0; i < months; i++) {
                    labels.add(since.plusMonths(i).toLocalDate().format(DateTimeFormatter.ofPattern("MMM yyyy")));
                }
                return labels;
            }
        }
        
        return switch (period) {
            case "today" -> {
                List<String> hoursList = new ArrayList<>();
                for (int i = 0; i < 24; i++) {
                    hoursList.add(java.time.LocalTime.of(i, 0).format(DateTimeFormatter.ofPattern("h a")));
                }
                yield hoursList;
            }
            case "weekly" -> List.of("Week 1", "Week 2", "Week 3", "Week 4");
            case "monthly" -> {
                List<String> months = new ArrayList<>();
                for (int i = 7; i >= 0; i--) {
                    months.add(LocalDate.now().minusMonths(i).getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH));
                }
                yield months;
            }
            case "yearly" -> List.of("Q1", "Q2", "Q3", "Q4");
            default -> {
                List<String> daysList = new ArrayList<>();
                for (int i = 6; i >= 0; i--) {
                    daysList.add(LocalDate.now().minusDays(i).getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.ENGLISH));
                }
                yield daysList;
            }
        };
    }

    private LocalDateTime resolveSince(String period) {
        return switch (period) {
            case "today" -> LocalDate.now().atStartOfDay();
            case "weekly" -> LocalDate.now().minusWeeks(4).atStartOfDay();
            case "monthly" -> LocalDate.now().minusMonths(8).withDayOfMonth(1).atStartOfDay();
            case "yearly" -> LocalDate.now().minusYears(1).withDayOfYear(1).atStartOfDay();
            default -> LocalDate.now().minusDays(6).atStartOfDay();
        };
    }

    private String formatPeriodKey(LocalDateTime dt, String period, LocalDateTime since, LocalDateTime until) {
        LocalDate date = dt.toLocalDate();
        if (period.equals("custom") || (period.equals("daily") && ChronoUnit.DAYS.between(since, until) > 7)) {
            long days = ChronoUnit.DAYS.between(since.toLocalDate(), until.toLocalDate()) + 1;
            if (days <= 31) {
                return date.format(DateTimeFormatter.ofPattern("MMM dd"));
            } else {
                return date.format(DateTimeFormatter.ofPattern("MMM yyyy"));
            }
        }

        return switch (period) {
            case "today" -> dt.toLocalTime().withMinute(0).withSecond(0).withNano(0).format(DateTimeFormatter.ofPattern("h a"));
            case "weekly" -> {
                long daysBetween = ChronoUnit.DAYS.between(since.toLocalDate(), date);
                int weekIndex = (int) Math.min(3, Math.max(0, daysBetween / 7));
                yield "Week " + (weekIndex + 1);
            }
            case "monthly" -> date.withDayOfMonth(1).getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH);
            case "yearly" -> "Q" + ((date.getMonthValue() - 1) / 3 + 1);
            default -> date.getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.ENGLISH);
        };
    }

    @org.springframework.transaction.annotation.Transactional
    public Map<String, Object> recordSale(String userId, TransactionRequest request) {
        if (request.getItems() == null || request.getItems().isEmpty()) {
            throw new BadRequestException("Sale must have at least one item");
        }

        User user = userDetailsService.loadEntityById(userId);
        Store store = storeRepository.findById(request.getStoreId() != null ? request.getStoreId() : "store-001")
                .orElseThrow(() -> new ResourceNotFoundException("Store not found"));

        Customer customer = null;
        if (request.getCustomerPhone() != null && !request.getCustomerPhone().isBlank()) {
            customer = customerRepository.findFirstByPhone(request.getCustomerPhone())
                    .orElseGet(() -> {
                        Customer newC = Customer.builder()
                                .customerId("cust-" + System.currentTimeMillis())
                                .customerName(request.getCustomerName() != null ? request.getCustomerName() : "Unknown")
                                .customerType(CustomerType.RETAIL)
                                .phone(request.getCustomerPhone())
                                .loyaltyMember(false)
                                .lifetimeValue(BigDecimal.ZERO)
                                .churnRiskScore(BigDecimal.ZERO)
                                .rfmSegment("New")
                                .createdAt(LocalDateTime.now())
                                .isActive(true)
                                .build();
                        return customerRepository.save(newC);
                    });
        }

        PaymentMethod paymentMethod = normalizePaymentMethod(request.getPaymentMethod());

        String paymentStatus = "PAID";
        if (paymentMethod == PaymentMethod.CREDIT) {
            paymentStatus = "UNPAID";
            if (customer == null) {
                throw new BadRequestException("Customer phone and name are required for credit sales");
            }
        }

        String transactionId = "tx-" + UUID.randomUUID().toString().substring(0, 8);
        LocalDateTime now = LocalDateTime.now();

        BigDecimal subtotal = BigDecimal.ZERO;
        List<TransactionItem> items = new ArrayList<>();

        for (TransactionItemRequest itemReq : request.getItems()) {
            Product product = productRepository.findById(itemReq.getProductId())
                    .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + itemReq.getProductId()));
            
            InventoryRecord inventory = inventoryRecordRepository.findByProductProductIdAndStoreStoreId(product.getProductId(), store.getStoreId())
                    .orElseThrow(() -> new ResourceNotFoundException("Inventory not found for product: " + product.getProductName()));

            if (inventory.getQuantityOnHand() < itemReq.getQuantity()) {
                throw new BadRequestException("Insufficient stock for " + product.getProductName() + ". Available: " + inventory.getQuantityOnHand());
            }

            inventory.setQuantityOnHand(inventory.getQuantityOnHand() - itemReq.getQuantity());
            inventory.setLastUpdated(now);
            inventoryRecordRepository.save(inventory);

            BigDecimal lineTotal = itemReq.getUnitPrice().multiply(BigDecimal.valueOf(itemReq.getQuantity()));
            subtotal = subtotal.add(lineTotal);

            TransactionItem ti = TransactionItem.builder()
                    .itemId("ti-" + UUID.randomUUID().toString().substring(0, 8))
                    .product(product)
                    .quantity(itemReq.getQuantity())
                    .unitPrice(itemReq.getUnitPrice())
                    .lineTotal(lineTotal)
                    .build();
            items.add(ti);
        }

        BigDecimal totalAmount = subtotal.subtract(request.getDiscountAmount() != null ? request.getDiscountAmount() : BigDecimal.ZERO);

        if (customer != null && paymentStatus.equals("PAID")) {
            customer.setLifetimeValue(customer.getLifetimeValue().add(totalAmount));
            customerRepository.save(customer);
        }

        Transaction transaction = Transaction.builder()
                .transactionId(transactionId)
                .customer(customer)
                .user(user)
                .store(store)
                .transactionDate(now)
                .totalAmount(totalAmount)
                .amountPaid(paymentStatus.equals("PAID") ? totalAmount : BigDecimal.ZERO)
                .paymentMethod(paymentMethod)
                .paymentStatus(paymentStatus)
                .paymentReference(request.getPaymentReference())
                .expectedPaymentDate(request.getExpectedPaymentDate())
                .discountAmount(request.getDiscountAmount() != null ? request.getDiscountAmount() : BigDecimal.ZERO)
                .build();

        for (TransactionItem ti : items) {
            ti.setTransaction(transaction);
        }
        transaction.setItems(items);

        transactionRepository.save(transaction);

        // Notify the retraining scheduler — increments counter toward 30-record threshold.
        // Fire-and-forget: never throws, never blocks the sale response.
        try {
            retrainingScheduler.notifyNewRecord(items.size());
        } catch (Exception ignored) { }

        auditLogService.log(userId, "SALE_RECORDED", "Recorded sale " + transactionId + ", Total: " + totalAmount, "transactions", transactionId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("transactionId", transactionId);
        result.put("totalAmount", totalAmount);
        result.put("paymentStatus", paymentStatus);
        result.put("transactionDate", now.toString());
        return result;
    }

    @org.springframework.transaction.annotation.Transactional
    public Map<String, Object> recordPayment(String userId, String transactionId, BigDecimal amount, String paymentMethodStr) {
        Transaction transaction = transactionRepository.findById(transactionId)
                .orElseThrow(() -> new ResourceNotFoundException("Transaction not found"));

        if ("PAID".equals(transaction.getPaymentStatus())) {
            throw new BadRequestException("Transaction is already marked as fully paid");
        }
        
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BadRequestException("Payment amount must be greater than zero");
        }
        
        BigDecimal currentPaid = transaction.getAmountPaid() != null ? transaction.getAmountPaid() : BigDecimal.ZERO;
        BigDecimal newAmountPaid = currentPaid.add(amount);
        
        if (newAmountPaid.compareTo(transaction.getTotalAmount()) > 0) {
            throw new BadRequestException("Payment amount exceeds the outstanding balance");
        }

        User user = userDetailsService.loadEntityById(userId);

        PaymentHistory payment = PaymentHistory.builder()
                .paymentId("pay-" + UUID.randomUUID().toString().substring(0, 8))
                .transaction(transaction)
                .user(user)
                .paymentDate(LocalDateTime.now())
                .amount(amount)
                .paymentMethod(normalizePaymentMethod(paymentMethodStr).name())
                .build();
                
        paymentHistoryRepository.save(payment);

        transaction.setAmountPaid(newAmountPaid);
        if (newAmountPaid.compareTo(transaction.getTotalAmount()) >= 0) {
            transaction.setPaymentStatus("PAID");
        } else {
            transaction.setPaymentStatus("PARTIALLY_PAID");
        }
        
        transactionRepository.save(transaction);

        if (transaction.getCustomer() != null) {
            Customer c = transaction.getCustomer();
            c.setLifetimeValue(c.getLifetimeValue().add(amount));
            customerRepository.save(c);
        }

        auditLogService.log(userId, "PAYMENT_RECORDED", "Recorded payment of " + amount + " for transaction " + transactionId, "transactions", transactionId);

        return Map.of(
            "transactionId", transactionId, 
            "paymentStatus", transaction.getPaymentStatus(),
            "amountPaid", transaction.getAmountPaid(),
            "balanceDue", transaction.getTotalAmount().subtract(transaction.getAmountPaid())
        );
    }

    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public List<Map<String, Object>> getOutstandingCreditSales() {
        List<Transaction> transactions = transactionRepository.findByPaymentStatusInOrderByTransactionDateDesc(List.of("UNPAID", "PARTIALLY_PAID"));
        return transactions.stream().map(t -> {
            Map<String, Object> m = new LinkedHashMap<>();
            BigDecimal amountPaid = t.getAmountPaid() != null ? t.getAmountPaid() : BigDecimal.ZERO;
            BigDecimal balanceDue = t.getTotalAmount().subtract(amountPaid);
            
            m.put("transactionId", t.getTransactionId());
            m.put("transactionDate", t.getTransactionDate().toString());
            m.put("totalAmount", t.getTotalAmount());
            m.put("amountPaid", amountPaid);
            m.put("balanceDue", balanceDue);
            m.put("paymentStatus", t.getPaymentStatus());
            m.put("customerName", t.getCustomer() != null ? t.getCustomer().getCustomerName() : "Unknown");
            m.put("customerPhone", t.getCustomer() != null ? t.getCustomer().getPhone() : "");
            m.put("expectedPaymentDate", t.getExpectedPaymentDate() != null ? t.getExpectedPaymentDate().toString() : null);
            return m;
        }).toList();
    }

    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public List<Map<String, Object>> getTransactionHistory(String startDate, String endDate, String paymentMethod, String customerName) {
        LocalDateTime start = parseDate(startDate, false);
        LocalDateTime end = parseDate(endDate, true);
        
        // Provide safe fallback dates to bypass Postgres null-inference bugs
        LocalDateTime safeStart = start != null ? start : LocalDateTime.of(2000, 1, 1, 0, 0);
        LocalDateTime safeEnd = end != null ? end : LocalDateTime.now().plusYears(100);

        PaymentMethod pm = null;
        if (paymentMethod != null && !paymentMethod.isBlank()) {
            pm = normalizePaymentMethod(paymentMethod);
        }
        String cn = (customerName != null && !customerName.isBlank()) ? customerName.toLowerCase() : null;

        // Only query DB with strict date ranges, no IS NULL checks
        List<Transaction> transactions = transactionRepository.findHistoryByDates(safeStart, safeEnd);
        
        // Filter payment method and customer name in Java
        final PaymentMethod filterPm = pm;
        final String filterCn = cn;
        
        if (filterPm != null || filterCn != null) {
            transactions = transactions.stream()
                    .filter(t -> filterPm == null || t.getPaymentMethod() == filterPm)
                    .filter(t -> filterCn == null || 
                                 (t.getCustomer() != null &&
                                  t.getCustomer().getCustomerName() != null &&
                                  t.getCustomer().getCustomerName().toLowerCase().contains(filterCn)))
                    .toList();
        }
        return transactions.stream().map(t -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("transactionId", t.getTransactionId());
            m.put("transactionDate", t.getTransactionDate().toString());
            m.put("totalAmount", t.getTotalAmount());
            m.put("discountAmount", t.getDiscountAmount() != null ? t.getDiscountAmount() : BigDecimal.ZERO);
            m.put("paymentMethod", t.getPaymentMethod() != null ? t.getPaymentMethod().name().toLowerCase() : "cash");
            m.put("paymentStatus", t.getPaymentStatus());
            m.put("paymentReference", t.getPaymentReference());
            m.put("customerName", t.getCustomer() != null ? t.getCustomer().getCustomerName() : null);
            m.put("customerPhone", t.getCustomer() != null ? t.getCustomer().getPhone() : null);
            m.put("expectedPaymentDate", t.getExpectedPaymentDate() != null ? t.getExpectedPaymentDate().toString() : null);
            m.put("cashierName", t.getUser() != null ? t.getUser().getFullName() : "Unknown");
            List<Map<String, Object>> items = t.getItems().stream().map(item -> {
                Map<String, Object> im = new LinkedHashMap<>();
                im.put("productId", item.getProduct() != null ? item.getProduct().getProductId() : "");
                im.put("productName", item.getProduct() != null ? item.getProduct().getProductName() : "Unknown");
                im.put("quantity", item.getQuantity());
                im.put("unitPrice", item.getUnitPrice());
                im.put("lineTotal", item.getLineTotal());
                return im;
            }).toList();
            m.put("items", items);
            return m;
        }).toList();
    }
}

