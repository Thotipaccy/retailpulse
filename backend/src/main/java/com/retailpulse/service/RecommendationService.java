package com.retailpulse.service;

import com.retailpulse.model.Product;
import com.retailpulse.model.TransactionItem;
import com.retailpulse.repository.ProductRepository;
import com.retailpulse.repository.TransactionItemRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class RecommendationService {

    private final AIServiceClient aiServiceClient;
    private final TransactionItemRepository transactionItemRepository;
    private final ProductRepository productRepository;
    @org.springframework.context.annotation.Lazy
    private final ForecastService forecastService;

    public Map<String, Object> getSummary() {
        List<Map<String, Object>> recommendations = getFbt();
        boolean aiUp = aiServiceClient.isHealthy();
        double avgConfidence = recommendations.stream()
                .mapToDouble(r -> ((Number) r.getOrDefault("confidenceScore", 0)).doubleValue())
                .average()
                .orElse(0.0);
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalRecommendations", recommendations.size());
        summary.put("avgConfidence", Math.round(avgConfidence * 100.0) / 100.0);
        summary.put("conversionRate", 0.0);
        summary.put("revenueImpact", 0);
        summary.put("aiPowered", aiUp);
        return summary;
    }

    public List<Map<String, Object>> getCrossSell() {
        Optional<List<Map<String, Object>>> aiRecs = aiServiceClient.getRecommendations("cross_sell", 10);
        if (aiRecs.isPresent() && !aiRecs.get().isEmpty()) {
            return aiRecs.get().stream().map(this::mapAiRecommendation).toList();
        }
        return getFbt();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getSeasonal() {
        if (aiServiceClient.isHealthy()) {
            try {
                Map<String, Object> aiPayload = forecastService.buildRecommendationHistoricalPayload("seasonal", "all", null, 365);
                // Request 40 = up to 10 products per each of the 4 seasons
                Optional<List<Map<String, Object>>> aiRecs = aiServiceClient.getRecommendations("seasonal", 40, aiPayload);
                if (aiRecs.isPresent() && !aiRecs.get().isEmpty()) {
                    return aiRecs.get().stream().map(r -> {
                        Map<String, Object> mapped = mapAiRecommendation(r);
                        mapped.put("aiPowered", true);
                        return mapped;
                    }).toList();
                }
            } catch (Exception e) {
                // Fallback to local DB
            }
        }

        List<Map<String, Object>> recs = buildLocalSeasonalRecommendations();
        recs.forEach(r -> r.put("aiPowered", false));
        return recs;
    }

    /**
     * Maps calendar months to the standard 4-season labels.
     */
    private static final Map<Integer, String> MONTH_TO_SEASON = Map.ofEntries(
            Map.entry(12, "Winter"), Map.entry(1, "Winter"), Map.entry(2, "Winter"),
            Map.entry(3, "Spring"),  Map.entry(4, "Spring"),  Map.entry(5, "Spring"),
            Map.entry(6, "Summer"),  Map.entry(7, "Summer"),  Map.entry(8, "Summer"),
            Map.entry(9, "Autumn"),  Map.entry(10, "Autumn"), Map.entry(11, "Autumn")
    );

    @Transactional(readOnly = true)
    private List<Map<String, Object>> buildLocalSeasonalRecommendations() {
        // Query: (productId, productName, categoryName, month, totalQuantity)
        List<Object[]> rows = transactionItemRepository.findTopProductsByMonth(
                LocalDateTime.now().minusYears(2));

        // Aggregate quantity per product per season
        // seasonProductQty: season -> productName -> totalQty
        Map<String, Map<String, long[]>> seasonProductQty = new LinkedHashMap<>();
        for (String s : List.of("Spring", "Summer", "Autumn", "Winter")) {
            seasonProductQty.put(s, new LinkedHashMap<>());
        }
        Map<String, String> productCategory = new LinkedHashMap<>();

        for (Object[] row : rows) {
            String productName = row[1] != null ? row[1].toString() : "Unknown";
            String categoryName = row[2] != null ? row[2].toString() : "";
            int monthNum = row[3] instanceof Number ? ((Number) row[3]).intValue() : 0;
            long qty = row[4] instanceof Number ? ((Number) row[4]).longValue() : 0L;
            String season = MONTH_TO_SEASON.getOrDefault(monthNum, "Summer");
            productCategory.put(productName, categoryName);
            seasonProductQty.get(season)
                    .merge(productName, new long[]{qty}, (a, b) -> new long[]{a[0] + b[0]});
        }

        boolean hasData = seasonProductQty.values().stream()
                .anyMatch(m -> !m.isEmpty());
        if (!hasData) {
            List<Object[]> topProducts = transactionItemRepository.findTopSellingProducts();
            if (topProducts.isEmpty()) {
                List<Product> allProducts = productRepository.findAll();
                if (allProducts.isEmpty()) {
                    return List.of();
                }
                List<Map<String, Object>> baseline = new ArrayList<>();
                String[] seasons = {"Spring", "Summer", "Autumn", "Winter"};
                for (int i = 0; i < Math.min(16, allProducts.size()); i++) {
                    Product p = allProducts.get(i);
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("season", seasons[i % 4]);
                    m.put("recommendedProduct", p.getProductName());
                    m.put("category", p.getCategory() != null ? p.getCategory().getCategoryName() : "General");
                    m.put("confidenceScore", 0.85 - ((i / 4) * 0.05));
                    baseline.add(m);
                }
                return baseline;
            }
            int curMonth = java.time.LocalDate.now().getMonthValue();
            String curSeason = MONTH_TO_SEASON.getOrDefault(curMonth, "Summer");
            List<Map<String, Object>> fallback = new ArrayList<>();
            for (int i = 0; i < Math.min(4, topProducts.size()); i++) {
                Object[] row = topProducts.get(i);
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("season", curSeason);
                m.put("recommendedProduct", row[1]);
                m.put("category", row[4]);
                m.put("confidenceScore", 0.75 - i * 0.05);
                fallback.add(m);
            }
            return fallback;
        }

        // Build one entry per top product per season (up to 5 per season)
        List<Map<String, Object>> results = new ArrayList<>();
        for (Map.Entry<String, Map<String, long[]>> entry : seasonProductQty.entrySet()) {
            String season = entry.getKey();
            List<Map.Entry<String, long[]>> sorted = new ArrayList<>(entry.getValue().entrySet());
            sorted.sort((a, b) -> Long.compare(b.getValue()[0], a.getValue()[0]));
            long maxQty = sorted.isEmpty() ? 1L : Math.max(1L, sorted.get(0).getValue()[0]);
            for (int i = 0; i < Math.min(5, sorted.size()); i++) {
                Map.Entry<String, long[]> e = sorted.get(i);
                double confidence = Math.min(0.95, 0.50 + (double) e.getValue()[0] / maxQty * 0.45);
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("season", season);
                m.put("recommendedProduct", e.getKey());
                m.put("category", productCategory.getOrDefault(e.getKey(), ""));
                m.put("confidenceScore", Math.round(confidence * 100.0) / 100.0);
                m.put("totalQuantity", e.getValue()[0]);
                results.add(m);
            }
        }
        return results;
    }

    public Map<String, Object> getPerformance() {
        List<Map<String, Object>> recommendations = getFbt();
        Map<String, Object> perf = new LinkedHashMap<>();
        perf.put("accepted", 0);
        perf.put("rejected", 0);
        perf.put("pending", recommendations.size());
        perf.put("revenueGenerated", 0);
        perf.put("topCategory", recommendations.stream()
                .map(r -> String.valueOf(r.getOrDefault("category", "")))
                .filter(c -> !c.isBlank())
                .findFirst()
                .orElse("—"));
        perf.put("aiPowered", aiServiceClient.isHealthy());
        return perf;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getFbt() {
        List<TransactionItem> items = transactionItemRepository.findWithDetailsSince(
                LocalDateTime.now().minusMonths(6));
        Map<String, Set<String>> txProducts = new HashMap<>();
        Map<String, String> productNames = new HashMap<>();
        for (TransactionItem ti : items) {
            String txId = ti.getTransaction().getTransactionId();
            String pid = ti.getProduct().getProductId();
            productNames.put(pid, ti.getProduct().getProductName());
            txProducts.computeIfAbsent(txId, k -> new HashSet<>()).add(pid);
        }
        Map<String, Integer> pairCounts = new HashMap<>();
        for (Set<String> pids : txProducts.values()) {
            List<String> list = new ArrayList<>(pids);
            for (int i = 0; i < list.size(); i++) {
                for (int j = i + 1; j < list.size(); j++) {
                    String key = list.get(i) + "|" + list.get(j);
                    pairCounts.merge(key, 1, Integer::sum);
                }
            }
        }
        return pairCounts.entrySet().stream()
                .sorted((a, b) -> Integer.compare(b.getValue(), a.getValue()))
                .limit(10)
                .map(e -> {
                    String[] parts = e.getKey().split("\\|");
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("recommendationId", "fbt-" + parts[0] + "-" + parts[1]);
                    m.put("sourceProduct", productNames.getOrDefault(parts[0], parts[0]));
                    m.put("recommendedProduct", productNames.getOrDefault(parts[1], parts[1]));
                    m.put("confidenceScore", Math.min(0.95, 0.5 + e.getValue() * 0.1));
                    m.put("coOccurrences", e.getValue());
                    return m;
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getUpsell() {
        List<Product> products = productRepository.findAllActiveWithCategoryOrdered();
        Map<String, List<Product>> byCategory = new HashMap<>();
        for (Product p : products) {
            byCategory.computeIfAbsent(p.getCategory().getCategoryId(), k -> new ArrayList<>()).add(p);
        }
        List<Map<String, Object>> results = new ArrayList<>();
        int idx = 0;
        for (List<Product> catProducts : byCategory.values()) {
            catProducts.sort(Comparator.comparing(Product::getUnitPrice));
            for (int i = 0; i < catProducts.size() - 1; i++) {
                Product source = catProducts.get(i);
                Product upsell = catProducts.get(i + 1);
                if (upsell.getUnitPrice().compareTo(source.getUnitPrice()) <= 0) continue;
                double confidence = 0.6 + Math.min(0.35, upsell.getUnitPrice()
                        .subtract(source.getUnitPrice())
                        .divide(source.getUnitPrice(), 4, java.math.RoundingMode.HALF_UP)
                        .doubleValue());
                results.add(rec("up-" + idx++, source.getProductName(), upsell.getProductName(),
                        source.getCategory().getCategoryName(), confidence));
            }
        }
        return results.stream().limit(10).toList();
    }

    public List<Map<String, Object>> getPersonalized() {
        Optional<List<Map<String, Object>>> aiRecs = aiServiceClient.getRecommendations("personalized", 10);
        if (aiRecs.isPresent() && !aiRecs.get().isEmpty()) {
            return aiRecs.get().stream().map(this::mapAiRecommendation).toList();
        }
        aiRecs = aiServiceClient.getRecommendations("cross_sell", 10);
        if (aiRecs.isPresent() && !aiRecs.get().isEmpty()) {
            return aiRecs.get().stream().map(this::mapAiRecommendation).toList();
        }
        return getCrossSell();
    }

    private Map<String, Object> mapAiRecommendation(Map<String, Object> ai) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("recommendationId", "ai-" + ai.get("product_id"));
        m.put("sourceProduct", "AI Forecast");
        m.put("recommendedProduct", ai.getOrDefault("product_name", ai.get("product_id")));
        m.put("season", ai.getOrDefault("season", MONTH_TO_SEASON.getOrDefault(
                java.time.LocalDate.now().getMonthValue(), "Summer")));
        m.put("category", ai.getOrDefault("category", "General"));
        m.put("confidenceScore", ai.getOrDefault("confidence", 0.0));
        m.put("predictedDemand", ai.getOrDefault("predicted_demand", 0));
        m.put("aiPowered", true);
        return m;
    }

    private Map<String, Object> rec(String id, String source, String recommended, String category, double confidence) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("recommendationId", id);
        m.put("sourceProduct", source);
        m.put("recommendedProduct", recommended);
        m.put("category", category);
        m.put("confidenceScore", confidence);
        return m;
    }
}
