package com.retailpulse.service;

import com.retailpulse.exception.ResourceNotFoundException;
import com.retailpulse.model.Customer;
import com.retailpulse.model.Transaction;
import com.retailpulse.repository.CustomerRepository;
import com.retailpulse.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import com.retailpulse.dto.request.CustomerRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@RequiredArgsConstructor
public class CustomerService {

    private final CustomerRepository customerRepository;
    private final TransactionRepository transactionRepository;
    private final AIServiceClient aiServiceClient;

    public List<Customer> searchCustomers(String query) {
        List<Customer> customers = customerRepository.findAll();
        if (query == null || query.isBlank()) {
            return customers;
        }
        String lowerQuery = query.toLowerCase();
        return customers.stream()
            .filter(c -> c.getCustomerName().toLowerCase().contains(lowerQuery) || 
                         (c.getPhone() != null && c.getPhone().contains(lowerQuery)))
            .toList();
    }

    public Map<String, Object> getSummary() {
        List<Customer> customers = customerRepository.findAll();
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalCustomers", customers.size());
        summary.put("loyaltyMembers", customers.stream().filter(c -> Boolean.TRUE.equals(c.getLoyaltyMember())).count());
        summary.put("avgLifetimeValue", customers.stream()
                .map(Customer::getLifetimeValue)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(BigDecimal.valueOf(Math.max(customers.size(), 1)), 2, RoundingMode.HALF_UP));
        summary.put("highChurnRisk", customers.stream().filter(c -> c.getChurnRiskScore().compareTo(new BigDecimal("0.6")) >= 0).count());
        summary.put("aiPowered", aiServiceClient.isHealthy());

        // Calculate Customer Growth
        LocalDateTime startOfThisMonth = YearMonth.now().atDay(1).atStartOfDay();
        long customersThisMonth = customers.stream().filter(c -> c.getCreatedAt().compareTo(startOfThisMonth) >= 0).count();
        long customersBeforeThisMonth = customers.size() - customersThisMonth;
        double customerGrowth = customersBeforeThisMonth == 0 ? 0.0 : ((double) customersThisMonth / customersBeforeThisMonth) * 100;
        summary.put("customerGrowth", formatGrowth(customerGrowth));

        // Calculate LTV Growth
        List<Map<String, Object>> ltvTrend = getLtvTrend();
        if (ltvTrend.size() >= 2) {
            BigDecimal ltvThisMonth = (BigDecimal) ltvTrend.get(ltvTrend.size() - 1).get("ltv");
            BigDecimal ltvLastMonth = (BigDecimal) ltvTrend.get(ltvTrend.size() - 2).get("ltv");
            double ltvGrowth = ltvLastMonth.compareTo(BigDecimal.ZERO) == 0 ? 0.0 : 
                ((ltvThisMonth.doubleValue() - ltvLastMonth.doubleValue()) / ltvLastMonth.doubleValue()) * 100;
            summary.put("ltvGrowth", formatGrowth(ltvGrowth));
        } else {
            summary.put("ltvGrowth", "+0.0% from last month");
        }

        // Calculate Repeat Rate Growth
        double currentRepeatRate = calculateRepeatRateBefore(LocalDateTime.now());
        double lastMonthRepeatRate = calculateRepeatRateBefore(startOfThisMonth);
        double repeatRateGrowth = lastMonthRepeatRate == 0 ? 0.0 : ((currentRepeatRate - lastMonthRepeatRate) / lastMonthRepeatRate) * 100;
        summary.put("repeatRateGrowth", formatGrowth(repeatRateGrowth));

        // Calculate Churn Risk Growth
        long currentChurn = (Long) summary.get("highChurnRisk");
        long lastMonthChurn = calculateHighChurnBefore(startOfThisMonth);
        double churnRiskGrowth = lastMonthChurn == 0 ? 0.0 : ((double)(currentChurn - lastMonthChurn) / lastMonthChurn) * 100;
        summary.put("churnRiskGrowth", formatGrowth(churnRiskGrowth));

        return summary;
    }

    private double calculateRepeatRateBefore(LocalDateTime endDate) {
        List<Object[]> counts = transactionRepository.countTransactionsByCustomerBefore(endDate);
        if (counts.isEmpty()) return 0.0;
        long repeatCustomers = counts.stream().filter(row -> ((Long) row[1]) > 1).count();
        return ((double) repeatCustomers / counts.size()) * 100;
    }

    private long calculateHighChurnBefore(LocalDateTime date) {
        LocalDateTime threshold = date.minusDays(90);
        List<Customer> activeCustomersAtDate = customerRepository.findAll().stream()
            .filter(c -> c.getCreatedAt().isBefore(date))
            .toList();
        
        long highChurn = 0;
        for (Customer c : activeCustomersAtDate) {
            java.util.Optional<LocalDateTime> lastTx = transactionRepository.findLatestTransactionDateByCustomerBefore(c.getCustomerId(), date);
            if (lastTx.isPresent()) {
                if (lastTx.get().isBefore(threshold)) highChurn++;
            } else {
                if (c.getCreatedAt().isBefore(threshold)) highChurn++;
            }
        }
        return highChurn;
    }

    private String formatGrowth(double growth) {
        if (growth > 0) return String.format("+%.1f%% from last month", growth);
        return String.format("%.1f%% from last month", growth);
    }

    public List<Map<String, Object>> getSegments() {
        List<Object[]> rows = customerRepository.countByRfmSegment();
        Map<String, String> fills = Map.of(
                "Champions", "#2D5A45", "Loyal", "#B87333",
                "At Risk", "#C2410C", "Dormant", "#6B705C", "Lost", "#8A8278"
        );
        if (rows.isEmpty()) {
            return List.of();
        }
        return rows.stream().map(r -> {
            String segment = (String) r[0];
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", segment != null ? segment : "Unknown");
            m.put("value", r[1]);
            m.put("fill", fills.getOrDefault(segment, "#8A8278"));
            return m;
        }).toList();
    }

    public List<Map<String, Object>> getTopCustomers(int limit) {
        Map<String, Long> orderCounts = orderCountsByCustomer();
        Map<String, String> lastPurchases = lastPurchaseDatesByCustomer();
        return customerRepository.findTop20ByOrderByLifetimeValueDesc().stream()
                .limit(limit)
                .map(c -> toCustomerMap(c, orderCounts, lastPurchases))
                .toList();
    }

    private Map<String, Long> orderCountsByCustomer() {
        Map<String, Long> counts = new HashMap<>();
        for (Object[] row : transactionRepository.countTransactionsByCustomer()) {
            counts.put((String) row[0], (Long) row[1]);
        }
        return counts;
    }

    private Map<String, String> lastPurchaseDatesByCustomer() {
        Map<String, String> dates = new HashMap<>();
        for (Transaction t : transactionRepository.findAll()) {
            if (t.getCustomer() == null) continue;
            String id = t.getCustomer().getCustomerId();
            String d = t.getTransactionDate().toLocalDate().toString();
            dates.merge(id, d, (a, b) -> a.compareTo(b) >= 0 ? a : b);
        }
        return dates;
    }

    public List<Map<String, Object>> getChurnRisks() {
        List<Customer> customers = customerRepository.findByChurnRiskScoreGreaterThanEqualOrderByChurnRiskScoreDesc(new BigDecimal("0.3"));

        List<Map<String, Object>> aiPayload = customers.stream().map(this::toAiCustomerPayload).toList();
        Optional<List<Map<String, Object>>> aiResults = aiServiceClient.predictChurn(aiPayload);

        if (aiResults.isPresent() && !aiResults.get().isEmpty()) {
            Map<String, Map<String, Object>> byId = new HashMap<>();
            for (Map<String, Object> prediction : aiResults.get()) {
                byId.put(String.valueOf(prediction.get("customer_id")), prediction);
            }
            return customers.stream().map(c -> {
                Map<String, Object> m = toCustomerMap(c);
                Map<String, Object> ai = byId.get(c.getCustomerId());
                if (ai != null) {
                    m.put("churnRiskScore", ai.get("churn_probability"));
                    m.put("rfmSegment", ai.get("rfm_segment"));
                    m.put("riskLevel", ai.get("risk_level"));
                    m.put("churnFactors", ai.get("factors"));
                    m.put("aiPowered", true);
                }
                return m;
            }).toList();
        }

        return customers.stream().map(this::toCustomerMap).toList();
    }

    @Transactional
    public Map<String, Object> createCustomer(CustomerRequest request) {
        Customer c = Customer.builder()
                .customerId("cust-" + System.currentTimeMillis())
                .customerName(request.getCustomerName())
                .customerType(request.getCustomerType())
                .phone(request.getPhone())
                .email(request.getEmail())
                .loyaltyMember(false)
                .lifetimeValue(BigDecimal.ZERO)
                .churnRiskScore(BigDecimal.ZERO)
                .rfmSegment("New")
                .createdAt(LocalDateTime.now())
                .isActive(true)
                .build();
        return toCustomerMap(customerRepository.save(c));
    }

    @Transactional
    public Map<String, Object> updateCustomer(String id, CustomerRequest request) {
        Customer c = customerRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Customer not found"));
        c.setCustomerName(request.getCustomerName());
        c.setCustomerType(request.getCustomerType());
        c.setPhone(request.getPhone());
        c.setEmail(request.getEmail());
        return toCustomerMap(customerRepository.save(c));
    }

    @Transactional
    public Map<String, Object> toggleCustomerStatus(String id, boolean active) {
        Customer c = customerRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Customer not found"));
        c.setIsActive(active);
        return toCustomerMap(customerRepository.save(c));
    }

    public Map<String, Object> getCustomerById(String id) {
        Customer c = customerRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Customer not found"));
        Map<String, Object> m = toCustomerMap(c);
        m.put("totalOrders", transactionRepository.countByCustomer_CustomerId(id));
        transactionRepository.findTopByCustomer_CustomerIdOrderByTransactionDateDesc(id)
                .ifPresentOrElse(
                        t -> m.put("lastPurchaseDate", t.getTransactionDate().toLocalDate().toString()),
                        () -> m.put("lastPurchaseDate", null));
        return m;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getFrequency() {
        List<Object[]> counts = transactionRepository.countTransactionsByCustomer();
        Map<String, Long> freqByCustomer = new HashMap<>();
        for (Object[] row : counts) {
            freqByCustomer.put((String) row[0], (Long) row[1]);
        }

        Map<String, Integer> buckets = new LinkedHashMap<>();
        buckets.put("1 purchase", 0);
        buckets.put("2-3 purchases", 0);
        buckets.put("4-6 purchases", 0);
        buckets.put("7+ purchases", 0);

        List<Customer> customers = customerRepository.findAll();
        for (Customer c : customers) {
            long freq = freqByCustomer.getOrDefault(c.getCustomerId(), 0L);
            if (freq <= 1) buckets.merge("1 purchase", 1, Integer::sum);
            else if (freq <= 3) buckets.merge("2-3 purchases", 1, Integer::sum);
            else if (freq <= 6) buckets.merge("4-6 purchases", 1, Integer::sum);
            else buckets.merge("7+ purchases", 1, Integer::sum);
        }

        return buckets.entrySet().stream()
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("name", e.getKey());
                    m.put("count", e.getValue());
                    return m;
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getLtvTrend() {
        List<Customer> customers = customerRepository.findAll();
        BigDecimal totalLtv = customers.stream()
                .map(Customer::getLifetimeValue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal avgLtv = totalLtv.divide(
                BigDecimal.valueOf(Math.max(customers.size(), 1)), 2, RoundingMode.HALF_UP);

        List<Transaction> recentTx = transactionRepository.findByTransactionDateBetween(
                LocalDateTime.now().minusMonths(7), LocalDateTime.now());
        Map<YearMonth, List<BigDecimal>> monthlyAmounts = new HashMap<>();
        for (Transaction t : recentTx) {
            if (t.getCustomer() == null) continue;
            YearMonth ym = YearMonth.from(t.getTransactionDate());
            monthlyAmounts.computeIfAbsent(ym, k -> new ArrayList<>()).add(t.getTotalAmount());
        }

        List<Map<String, Object>> trend = new ArrayList<>();
        for (int i = 6; i >= 0; i--) {
            YearMonth ym = YearMonth.now().minusMonths(i);
            String label = ym.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH);
            List<BigDecimal> amounts = monthlyAmounts.getOrDefault(ym, List.of());
            BigDecimal monthAvg = amounts.isEmpty()
                    ? avgLtv
                    : amounts.stream().reduce(BigDecimal.ZERO, BigDecimal::add)
                            .divide(BigDecimal.valueOf(amounts.size()), 2, RoundingMode.HALF_UP);
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("name", label);
            point.put("ltv", monthAvg);
            trend.add(point);
        }
        return trend;
    }

    private Map<String, Object> toAiCustomerPayload(Customer c) {
        long recencyDays = ChronoUnit.DAYS.between(c.getCreatedAt().toLocalDate(), LocalDate.now());
        int frequency = Math.max(1, c.getLifetimeValue().divide(BigDecimal.valueOf(200_000), 0, RoundingMode.UP).intValue());
        double avgTransaction = c.getLifetimeValue().doubleValue() / frequency;
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("customer_id", c.getCustomerId());
        payload.put("recency_days", recencyDays);
        payload.put("frequency", frequency);
        payload.put("monetary_total", c.getLifetimeValue().longValue());
        payload.put("avg_transaction", avgTransaction);
        payload.put("customer_type", c.getCustomerType().toApiValue());
        payload.put("loyalty_member", Boolean.TRUE.equals(c.getLoyaltyMember()));
        return payload;
    }

    private Map<String, Object> toCustomerMap(Customer c) {
        return toCustomerMap(c, null, null);
    }

    private Map<String, Object> toCustomerMap(Customer c, Map<String, Long> orderCounts, Map<String, String> lastPurchaseDates) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("customerId", c.getCustomerId());
        m.put("customerName", c.getCustomerName());
        m.put("customerType", c.getCustomerType().toApiValue());
        m.put("phone", c.getPhone());
        m.put("email", c.getEmail());
        m.put("lifetimeValue", c.getLifetimeValue());
        m.put("churnRiskScore", c.getChurnRiskScore());
        m.put("rfmSegment", c.getRfmSegment());
        long orders = orderCounts != null ? orderCounts.getOrDefault(c.getCustomerId(), 0L) : 0L;
        m.put("totalOrders", orders);
        String lastPurchase = lastPurchaseDates != null
                ? lastPurchaseDates.get(c.getCustomerId())
                : null;
        m.put("lastPurchaseDate", lastPurchase != null ? lastPurchase : c.getCreatedAt().toLocalDate().toString());
        m.put("isActive", c.getIsActive());
        return m;
    }
}
