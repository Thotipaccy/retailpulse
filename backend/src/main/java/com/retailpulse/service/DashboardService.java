package com.retailpulse.service;

import com.retailpulse.model.Alert;
import com.retailpulse.model.InventoryRecord;
import com.retailpulse.model.Transaction;
import com.retailpulse.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DashboardService {

    private final TransactionRepository transactionRepository;
    private final TransactionItemRepository transactionItemRepository;
    private final CustomerRepository customerRepository;
    private final InventoryRecordRepository inventoryRecordRepository;
    private final AlertRepository alertRepository;
    private final ForecastService forecastService;

    public Map<String, Object> getSummary() {
        LocalDate today = LocalDate.now();
        LocalDateTime todayStart = today.atStartOfDay();
        LocalDateTime yesterdayStart = today.minusDays(1).atStartOfDay();
        LocalDateTime monthStart = today.withDayOfMonth(1).atStartOfDay();
        LocalDateTime prevMonthStart = today.minusMonths(1).withDayOfMonth(1).atStartOfDay();
        LocalDateTime prevMonthEnd = monthStart.minusSeconds(1);

        List<Transaction> todayTx = transactionRepository.findByDateRange(todayStart, LocalDateTime.now());
        BigDecimal todaySales = todayTx.stream().map(Transaction::getTotalAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

        List<Transaction> yesterdayTx = transactionRepository.findByDateRange(yesterdayStart, todayStart.minusSeconds(1));
        BigDecimal yesterdaySales = yesterdayTx.stream().map(Transaction::getTotalAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

        List<Transaction> monthTx = transactionRepository.findByDateRange(monthStart, LocalDateTime.now());
        BigDecimal monthRevenue = monthTx.stream().map(Transaction::getTotalAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

        List<Transaction> prevMonthTx = transactionRepository.findByDateRange(prevMonthStart, prevMonthEnd);
        BigDecimal prevMonthRevenue = prevMonthTx.stream().map(Transaction::getTotalAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

        long activeCustomers = monthTx.stream()
                .map(Transaction::getCustomer)
                .filter(Objects::nonNull)
                .map(c -> c.getCustomerId())
                .distinct()
                .count();

        long prevActiveCustomers = prevMonthTx.stream()
                .map(Transaction::getCustomer)
                .filter(Objects::nonNull)
                .map(c -> c.getCustomerId())
                .distinct()
                .count();

        long lowStock = inventoryRecordRepository.findBelowReorderPoint().size();
        long churnAlerts = customerRepository.findByChurnRiskScoreGreaterThanEqualOrderByChurnRiskScoreDesc(new BigDecimal("0.6")).size();

        double forecastOverall = 0.0;
        Object overallObj = forecastService.getAccuracy().get("overall");
        if (overallObj instanceof Number overallNum) {
            forecastOverall = overallNum.doubleValue();
        }

        List<Map<String, Object>> kpis = List.of(
                kpi("today-sales", "Today's Sales", formatRwf(todaySales), percentChange(todaySales, yesterdaySales), "vs yesterday", "TrendingUp"),
                kpi("monthly-revenue", "Monthly Revenue", formatRwf(monthRevenue), percentChange(monthRevenue, prevMonthRevenue), "vs last month", "Wallet"),
                kpi("active-customers", "Active Customers", String.valueOf(activeCustomers), percentChange(activeCustomers, prevActiveCustomers), "this month", "Users"),
                kpi("low-stock", "Low Stock Items", String.valueOf(lowStock), 0, "current count", "Package"),
                kpi("churn-alerts", "Churn Risk Alerts", String.valueOf(churnAlerts), 0, "high risk", "AlertTriangle"),
                kpi("forecast-accuracy", "Forecast Accuracy", String.format("%.1f%%", forecastOverall), 0, "MAPE score", "Target")
        );

        return Map.of("kpis", kpis);
    }

    public List<Map<String, Object>> getRecentTransactions() {
        return transactionRepository.findRecentWithCustomer(PageRequest.of(0, 10)).stream()
                .map(this::toTransactionMap)
                .toList();
    }

    public List<Map<String, Object>> getRecentAlerts(String userId) {
        return alertRepository.findByUserUserIdOrderByCreatedAtDesc(userId).stream()
                .limit(10)
                .map(this::toAlertMap)
                .toList();
    }

    public List<Map<String, Object>> getSalesTrend() {
        LocalDateTime weekAgo = LocalDate.now().minusDays(6).atStartOfDay();
        List<Transaction> tx = transactionRepository.findByDateRange(weekAgo, LocalDateTime.now());
        Map<LocalDate, BigDecimal> byDay = new TreeMap<>();
        for (int i = 0; i < 7; i++) {
            byDay.put(LocalDate.now().minusDays(6 - i), BigDecimal.ZERO);
        }
        tx.forEach(t -> {
            LocalDate d = t.getTransactionDate().toLocalDate();
            byDay.merge(d, t.getTotalAmount(), BigDecimal::add);
        });
        return byDay.entrySet().stream()
                .map(e -> Map.<String, Object>of("name", e.getKey().toString(), "value", e.getValue()))
                .toList();
    }

    public List<Map<String, Object>> getTopCategories() {
        LocalDateTime monthStart = LocalDate.now().withDayOfMonth(1).atStartOfDay();
        return transactionItemRepository.sumRevenueByCategorySince(monthStart).stream()
                .limit(5)
                .map(r -> Map.<String, Object>of("name", r[0], "value", r[1]))
                .toList();
    }

    public List<Map<String, Object>> getInventoryStatusByCategory() {
        return inventoryRecordRepository.findAllWithDetails().stream()
                .collect(java.util.stream.Collectors.groupingBy(
                        r -> r.getProduct().getCategory().getCategoryName(),
                        java.util.stream.Collectors.toList()))
                .entrySet().stream()
                .map(e -> {
                    int inStock = 0, lowStock = 0, outOfStock = 0;
                    for (InventoryRecord r : e.getValue()) {
                        int qty = r.getQuantityOnHand();
                        int reorder = r.getProduct().getReorderPoint();
                        if (qty == 0) outOfStock++;
                        else if (qty <= reorder) lowStock++;
                        else inStock++;
                    }
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("category", e.getKey());
                    row.put("inStock", inStock);
                    row.put("lowStock", lowStock);
                    row.put("outOfStock", outOfStock);
                    return row;
                })
                .sorted((a, b) -> String.valueOf(a.get("category")).compareTo(String.valueOf(b.get("category"))))
                .toList();
    }

    public List<Map<String, Object>> getTopDemandProducts(int limit) {
        try {
            Map<String, Object> forecast = forecastService.generateDemandForecast("weekly", "all", null);
            if (forecast != null && forecast.get("productForecasts") instanceof List<?> list) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> mapList = (List<Map<String, Object>>) (List<?>) list;
                return mapList.stream()
                        .sorted((a, b) -> Integer.compare(
                                (int) b.getOrDefault("predictedDemand", 0),
                                (int) a.getOrDefault("predictedDemand", 0)
                        ))
                        .limit(limit)
                        .map(pf -> {
                            Map<String, Object> m = new LinkedHashMap<>();
                            m.put("productId", pf.get("productId"));
                            m.put("productName", pf.get("productName"));
                            m.put("unitsSold", pf.get("predictedDemand"));
                            m.put("category", pf.get("category"));
                            m.put("confidence", pf.get("confidence"));
                            m.put("trend", "up");
                            m.put("status", pf.get("status"));
                            return m;
                        })
                        .toList();
            }
        } catch (Exception e) {
            // Fallback to empty if AI is offline
            return List.of();
        }
        return List.of();
    }

    private Map<String, Object> kpi(String id, String label, String value, double trend, String trendLabel, String icon) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("label", label);
        m.put("value", value);
        m.put("trend", trend);
        m.put("trendLabel", trendLabel);
        m.put("icon", icon);
        return m;
    }

    private String formatRwf(BigDecimal amount) {
        double millions = amount.divide(new BigDecimal("1000000"), 1, RoundingMode.HALF_UP).doubleValue();
        return "RWF " + millions + "M";
    }

    private double percentChange(BigDecimal current, BigDecimal previous) {
        if (previous == null || previous.compareTo(BigDecimal.ZERO) == 0) {
            return current.compareTo(BigDecimal.ZERO) > 0 ? 100.0 : 0.0;
        }
        return current.subtract(previous)
                .divide(previous, 4, RoundingMode.HALF_UP)
                .multiply(new BigDecimal("100"))
                .doubleValue();
    }

    private double percentChange(long current, long previous) {
        if (previous == 0) {
            return current > 0 ? 100.0 : 0.0;
        }
        return ((double) (current - previous) / previous) * 100.0;
    }

    private Map<String, Object> toTransactionMap(Transaction t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("transactionId", t.getTransactionId());
        m.put("customerName", t.getCustomer() != null ? t.getCustomer().getCustomerName() : "Walk-in");
        m.put("productSummary", "Order " + t.getTransactionId());
        m.put("totalAmount", t.getTotalAmount());
        m.put("paymentMethod", t.getPaymentMethod().toApiValue());
        m.put("transactionDate", t.getTransactionDate().toString());
        m.put("status", "completed");
        return m;
    }

    private Map<String, Object> toAlertMap(Alert a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("alertId", a.getAlertId());
        m.put("alertType", a.getAlertType());
        m.put("severity", a.getSeverity().toApiValue());
        m.put("message", a.getMessage());
        m.put("isRead", a.getIsRead());
        m.put("createdAt", a.getCreatedAt().toString());
        return m;
    }
}
