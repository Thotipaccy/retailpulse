package com.retailpulse.service;

import com.retailpulse.model.*;
import com.retailpulse.model.enums.ForecastHorizon;
import com.retailpulse.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class ForecastService {

    private static final long OPTIMAL_HISTORY_DAYS = 90;
    private static final long LOW_CONFIDENCE_THRESHOLD_DAYS = 30;

    private final DemandForecastRepository demandForecastRepository;
    private final TransactionItemRepository transactionItemRepository;
    private final TransactionRepository transactionRepository;
    private final InventoryRecordRepository inventoryRecordRepository;
    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final StoreRepository storeRepository;
    private final AIServiceClient aiServiceClient;
    private final AuditLogService auditLogService;

    @Transactional(readOnly = true)
    public Map<String, Object> getStatus() {
        long days = countHistoricalDays();
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("historicalDaysAvailable", days);
        status.put("dataSufficient", days >= OPTIMAL_HISTORY_DAYS);
        status.put("requiredDays", OPTIMAL_HISTORY_DAYS);
        status.put("dataLevel", dataLevel(days));
        status.put("aiServiceHealthy", aiServiceClient.isHealthy());
        status.put("modelsReady", aiServiceClient.isHealthy() || !demandForecastRepository.findAll().isEmpty());
        status.put("lastTrained", demandForecastRepository.findAll().stream()
                .map(DemandForecast::getGeneratedAt)
                .filter(Objects::nonNull)
                .max(LocalDateTime::compareTo)
                .map(dt -> dt.toLocalDate().toString())
                .orElse(null));
        status.put("mape", getAccuracy().get("mape"));
        status.put("categories", categoryRepository.findAll().stream().map(c -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", c.getCategoryId() != null ? c.getCategoryId() : "");
            row.put("name", c.getCategoryName() != null ? c.getCategoryName() : "Uncategorized");
            return row;
        }).toList());
        status.put("products", productRepository.findAllActiveWithCategoryOrdered().stream()
                .limit(50)
                .map(p -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", p.getProductId());
                    row.put("name", p.getProductName());
                    row.put("category", p.getCategory() != null ? p.getCategory().getCategoryName() : "Uncategorized");
                    return row;
                }).toList());
        return status;
    }

    public Map<String, Object> buildRecommendationHistoricalPayload(String horizon, String scope, String scopeId, long days) {
        String productId = "product".equalsIgnoreCase(scope) ? scopeId : null;
        String categoryId = "category".equalsIgnoreCase(scope) ? scopeId : null;

        List<Map<String, Object>> historicalData = buildHistoricalPayload(productId, categoryId);
        List<String> productIds = resolveProductIds(scope, scopeId);

        Map<String, Object> aiPayload = new LinkedHashMap<>();
        aiPayload.put("horizon", horizon != null ? horizon : "daily");
        aiPayload.put("product_ids", productIds);
        aiPayload.put("historical_data", historicalData);
        aiPayload.put("historical_days", days);
        aiPayload.put("scope", scope != null ? scope : "all");
        if (scopeId != null) {
            aiPayload.put("scope_id", scopeId);
        }
        Map<String, List<Map<String, Object>>> productHistories = new LinkedHashMap<>();
        for (String pid : productIds) {
            productHistories.put(pid, buildHistoricalPayload(pid, null));
        }
        aiPayload.put("product_histories", productHistories);

        Map<String, String> productNames = new LinkedHashMap<>();
        Map<String, String> productCategories = new LinkedHashMap<>();
        for (Product p : productRepository.findAll()) {
            String name = p.getProductName();
            if (name == null || name.trim().isEmpty()) {
                name = p.getSkuCode() != null ? p.getSkuCode() : "Unnamed Product";
            }
            String cat = (p.getCategory() != null && p.getCategory().getCategoryName() != null)
                    ? p.getCategory().getCategoryName() : "Hardware";
            if (cat.trim().isEmpty()) {
                cat = "Hardware";
            }
            productNames.put(p.getProductId(), name);
            productCategories.put(p.getProductId(), cat);
        }
        aiPayload.put("product_names", productNames);
        aiPayload.put("product_categories", productCategories);

        return aiPayload;
    }

    @Transactional
    public Map<String, Object> generateDemandForecast(String horizon, String scope, String scopeId) {
        long days = countHistoricalDays();
        if (days == 0) {
            return buildEmptyForecastResult(horizon, scope);
        }

        String warning = buildDataWarning(days);
        ForecastHorizon h = ForecastHorizon.fromParam(horizon);
        Map<String, Object> aiPayload = buildRecommendationHistoricalPayload(horizon, scope, scopeId, days);

        boolean aiPowered = false;
        boolean fallbackUsed = false;
        Map<String, Object> aiResponse = aiServiceClient.forecastDemandFull(aiPayload).orElse(null);

        List<Map<String, Object>> chart;
        List<Map<String, Object>> productForecasts;
        double mape;
        String insights;
        boolean lowConfidence;

        if (aiResponse != null) {
            aiPowered = true;
            chart = castList(aiResponse.get("chart"));
            if (chart.isEmpty()) {
                chart = castList(aiResponse.get("data"));
            }
            productForecasts = castList(aiResponse.get("forecasts"));
            mape = number(aiResponse.get("model_mape"), 8.5);
            insights = String.valueOf(aiResponse.getOrDefault("insights", "No insights generated."));
            lowConfidence = mape > 15 || Boolean.TRUE.equals(aiResponse.get("low_confidence"));
            if (aiResponse.get("warning") != null && warning == null) {
                warning = String.valueOf(aiResponse.get("warning"));
            }
        } else {
            throw new IllegalStateException("AI Service is currently offline or unreachable. Please ensure the Python service is running.");
        }


        if (days < LOW_CONFIDENCE_THRESHOLD_DAYS) {
            lowConfidence = true;
            mape = Math.max(mape, 20.0);
        }

        double intervalMultiplier = confidenceIntervalMultiplier(days);
        if (intervalMultiplier > 1.0) {
            widenConfidenceIntervals(chart, intervalMultiplier);
            widenProductForecastIntervals(productForecasts, intervalMultiplier);
        }

        persistForecasts(h, productForecasts, BigDecimal.valueOf(mape));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("chart", chart);
        result.put("mape", mape);
        result.put("aiPowered", aiPowered);
        result.put("fallbackUsed", fallbackUsed);
        result.put("lowConfidence", lowConfidence);
        result.put("productForecasts", enrichProductForecasts(productForecasts, days));
        result.put("insights", insights);
        result.put("historicalDays", days);
        result.put("horizon", horizon);
        result.put("scope", scope);
        if (warning != null) {
            result.put("warning", warning);
        }
        return result;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getProductForecast(String productId, String horizon) {
        ForecastHorizon h = ForecastHorizon.fromParam(horizon);
        List<DemandForecast> stored = demandForecastRepository.findByProductProductIdAndForecastHorizon(productId, h);
        if (!stored.isEmpty()) {
            return stored.stream().map(this::toChartPoint).toList();
        }
        Map<String, Object> generated = generateDemandForecast(horizon, "product", productId);
        return castList(generated.get("chart"));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getAccuracy() {
        Optional<Map<String, Object>> aiStatus = aiServiceClient.getModelStatus();
        double overall = 0;
        double weeklyPrecision = 0;
        double seasonalDetection = 0;
        double mape = 0;
        boolean aiPowered = aiServiceClient.isHealthy();

        if (aiStatus.isPresent()) {
            Map<String, Object> status = aiStatus.get();
            Object models = status.get("models");
            if (models instanceof Map<?, ?> modelMap && modelMap.get("demand_forecast") instanceof Map<?, ?> demand) {
                mape = number(demand.get("accuracy_mape"), 8.5);
                overall = Math.max(0, 100 - mape);
            }
            if (status.get("overall") != null) {
                overall = number(status.get("overall"), overall);
            }
            if (status.get("weeklyPrecision") != null) {
                weeklyPrecision = number(status.get("weeklyPrecision"), weeklyPrecision);
            }
            if (status.get("seasonalDetection") != null) {
                seasonalDetection = number(status.get("seasonalDetection"), seasonalDetection);
            }
        } else {
            // No fallback data.
            overall = 0;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("overall", round1(overall));
        result.put("weeklyPrecision", round1(weeklyPrecision));
        result.put("seasonalDetection", round1(seasonalDetection));
        result.put("mape", round1(mape));
        result.put("accuracy", round1(overall));
        result.put("aiPowered", aiPowered);
        result.put("modelsReady", aiPowered || !demandForecastRepository.findAll().isEmpty());
        return result;
    }

    private long countHistoricalDays() {
        try {
            // Distinct calendar dates with recorded transactions — the honest
            // measure of how much history actually feeds the models.
            long distinctDays = transactionRepository.countDistinctTransactionDates();
            return Math.max(distinctDays, 0L);
        } catch (Exception ex) {
            log.warn("Could not compute historical day count: {}", ex.getMessage());
            Object[] range = transactionRepository.findTransactionDateRange();
            if (range == null || range.length < 2 || range[0] == null || range[1] == null) {
                return 0L;
            }
            LocalDateTime min = toLocalDateTime(range[0]);
            LocalDateTime max = toLocalDateTime(range[1]);
            if (min == null || max == null) {
                return 0L;
            }
            return ChronoUnit.DAYS.between(min.toLocalDate(), max.toLocalDate()) + 1;
        }
    }

    private LocalDateTime toLocalDateTime(Object value) {
        if (value instanceof LocalDateTime dateTime) {
            return dateTime;
        }
        if (value instanceof java.sql.Timestamp timestamp) {
            return timestamp.toLocalDateTime();
        }
        if (value instanceof java.time.Instant instant) {
            return LocalDateTime.ofInstant(instant, java.time.ZoneId.systemDefault());
        }
        if (value instanceof java.util.Date date) {
            return LocalDateTime.ofInstant(date.toInstant(), java.time.ZoneId.systemDefault());
        }
        return null;
    }

    private List<Map<String, Object>> buildHistoricalPayload(String productId, String categoryId) {
        LocalDateTime since = LocalDateTime.now().minusYears(10);
        try {
            Object[] range = transactionRepository.findTransactionDateRange();
            if (range != null && range.length > 0 && range[0] != null) {
                LocalDateTime minDate = toLocalDateTime(range[0]);
                if (minDate != null) {
                    since = minDate.minusDays(1);
                }
            }
        } catch (Exception e) {
            log.warn("Error finding min transaction date: {}", e.getMessage());
        }
        return transactionItemRepository.sumDailyQuantitySince(since, productId, categoryId).stream()
                .map(row -> {
                    Map<String, Object> point = new LinkedHashMap<>();
                    point.put("date", formatQueryDate(row[0]));
                    point.put("quantity", ((Number) row[1]).intValue());
                    return point;
                }).toList();
    }

    private String formatQueryDate(Object value) {
        if (value instanceof LocalDate date) {
            return date.toString();
        }
        if (value instanceof java.sql.Date date) {
            return date.toLocalDate().toString();
        }
        if (value instanceof LocalDateTime dateTime) {
            return dateTime.toLocalDate().toString();
        }
        return String.valueOf(value);
    }

    private List<String> resolveProductIds(String scope, String scopeId) {
        if ("product".equalsIgnoreCase(scope) && scopeId != null) {
            return List.of(scopeId);
        }
        if ("category".equalsIgnoreCase(scope) && scopeId != null) {
            return productRepository.findByCategoryCategoryId(scopeId).stream()
                    .map(Product::getProductId).toList();
        }
        return productRepository.findAllActiveWithCategoryOrdered().stream()
                .map(Product::getProductId)
                .toList();
    }

    private void persistForecasts(ForecastHorizon horizon, List<Map<String, Object>> productForecasts, BigDecimal mape) {
        Store store = storeRepository.findAll().stream().findFirst().orElse(null);
        if (store == null || productForecasts.isEmpty()) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        int idx = 0;
        for (Map<String, Object> pf : productForecasts) {
            String productId = String.valueOf(pf.getOrDefault("product_id", pf.get("productId")));
            Product product = productRepository.findById(productId).orElse(null);
            if (product == null) {
                continue;
            }
            BigDecimal predicted = BigDecimal.valueOf(number(pf.get("predicted_demand"), 0));
            BigDecimal lower = BigDecimal.valueOf(number(pf.get("confidence_lower"), predicted.doubleValue() * 0.9));
            BigDecimal upper = BigDecimal.valueOf(number(pf.get("confidence_upper"), predicted.doubleValue() * 1.1));
            demandForecastRepository.save(DemandForecast.builder()
                    .forecastId("df-" + System.currentTimeMillis() + "-" + (idx++))
                    .store(store)
                    .product(product)
                    .forecastHorizon(horizon)
                    .forecastDate(LocalDate.now().plusDays(1))
                    .predictedDemand(predicted)
                    .confidenceLower(lower)
                    .confidenceUpper(upper)
                    .modelMape(mape)
                    .generatedAt(now)
                    .build());
        }
    }

    private Map<String, Object> buildEmptyForecastResult(String horizon, String scope) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("chart", List.of());
        result.put("mape", 0);
        result.put("aiPowered", false);
        result.put("fallbackUsed", false);
        result.put("lowConfidence", true);
        result.put("productForecasts", List.of());
        result.put("insights", "");
        result.put("historicalDays", 0);
        result.put("horizon", horizon);
        result.put("scope", scope);
        result.put("empty", true);
        result.put("message", "No historical data available. Upload data first.");
        return result;
    }

    private String buildDataWarning(long days) {
        if (days < LOW_CONFIDENCE_THRESHOLD_DAYS) {
            return "Very limited data: only " + days + " days available. Forecast accuracy will be low.";
        }
        if (days < OPTIMAL_HISTORY_DAYS) {
            return "Limited data: " + days + " days available. 90+ days recommended for optimal accuracy.";
        }
        return null;
    }

    private String dataLevel(long days) {
        if (days == 0) {
            return "none";
        }
        if (days < LOW_CONFIDENCE_THRESHOLD_DAYS) {
            return "low";
        }
        if (days < OPTIMAL_HISTORY_DAYS) {
            return "limited";
        }
        return "optimal";
    }

    private double confidenceIntervalMultiplier(long days) {
        if (days < LOW_CONFIDENCE_THRESHOLD_DAYS) {
            return 2.0;
        }
        if (days < OPTIMAL_HISTORY_DAYS) {
            return 1.5;
        }
        return 1.0;
    }

    private void widenConfidenceIntervals(List<Map<String, Object>> chart, double multiplier) {
        for (Map<String, Object> point : chart) {
            if (point.get("predicted") == null) {
                continue;
            }
            double predicted = number(point.get("predicted"), 0);
            double lower = number(point.get("lower"), predicted * 0.88);
            double upper = number(point.get("upper"), predicted * 1.12);
            double spread = Math.max(predicted - lower, upper - predicted);
            point.put("lower", Math.max(0, predicted - spread * multiplier));
            point.put("upper", predicted + spread * multiplier);
        }
    }

    private void widenProductForecastIntervals(List<Map<String, Object>> productForecasts, double multiplier) {
        for (Map<String, Object> pf : productForecasts) {
            double predicted = number(pf.get("predicted_demand"), 0);
            if (predicted <= 0) {
                continue;
            }
            double lower = number(pf.get("confidence_lower"), predicted * 0.88);
            double upper = number(pf.get("confidence_upper"), predicted * 1.12);
            double spread = Math.max(predicted - lower, upper - predicted);
            pf.put("confidence_lower", Math.max(0, predicted - spread * multiplier));
            pf.put("confidence_upper", predicted + spread * multiplier);
        }
    }

    private List<Map<String, Object>> enrichProductForecasts(List<Map<String, Object>> raw, long historicalDays) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> pf : raw) {
            String productId = String.valueOf(pf.getOrDefault("product_id", pf.get("productId")));
            Product product = productRepository.findById(productId).orElse(null);
            if (product == null) {
                continue;
            }
            int currentStock = inventoryRecordRepository.findAllWithDetails().stream()
                    .filter(ir -> productId.equals(ir.getProduct().getProductId()))
                    .mapToInt(InventoryRecord::getQuantityOnHand)
                    .findFirst()
                    .orElse(0);
            int predicted = (int) Math.round(number(pf.get("predicted_demand"), 0));
            int reorderPoint = product.getReorderPoint();
            int reorderDelta = Math.max(0, predicted - currentStock);
            double confidencePenalty = historicalDays < LOW_CONFIDENCE_THRESHOLD_DAYS ? 25
                    : historicalDays < OPTIMAL_HISTORY_DAYS ? 10 : 0;
            double confidence = Math.min(99, Math.max(30, 100 - number(pf.get("model_mape"), 8.5) - confidencePenalty));

            String name = product.getProductName();
            if (name == null || name.trim().isEmpty()) {
                name = product.getSkuCode() != null ? product.getSkuCode() : "Unnamed Product";
            }
            String category = (product.getCategory() != null && product.getCategory().getCategoryName() != null)
                    ? product.getCategory().getCategoryName() : "Hardware";
            if (category.trim().isEmpty()) {
                category = "Hardware";
            }

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("productId", productId);
            row.put("productName", name);
            row.put("category", category);
            row.put("currentStock", currentStock);
            row.put("predictedDemand", predicted);
            row.put("reorderDelta", reorderDelta > 0 ? reorderDelta : null);
            row.put("confidence", Math.round(confidence));
            row.put("status", forecastStatus(currentStock, predicted, reorderPoint));
            rows.add(row);
        }
        if (rows.isEmpty()) {
            throw new IllegalStateException("No active products available for forecasting.");
        }
        return rows;
    }

    private String forecastStatus(int currentStock, int predicted, int reorderPoint) {
        int delta = predicted - currentStock;
        if (delta <= 0) {
            return "adequate";
        }
        if (delta > reorderPoint || predicted > currentStock * 2) {
            return "urgent";
        }
        if (delta > reorderPoint * 0.4) {
            return "reorder";
        }
        return "monitor";
    }



    private Map<String, Object> toChartPoint(DemandForecast f) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("date", f.getForecastDate().toString());
        m.put("predicted", f.getPredictedDemand());
        m.put("lower", f.getConfidenceLower());
        m.put("upper", f.getConfidenceUpper());
        return m;
    }






    private List<Map<String, Object>> castList(Object value) {
        if (value instanceof List<?> list) {
            List<Map<String, Object>> out = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    Map<String, Object> copy = new LinkedHashMap<>();
                    map.forEach((k, v) -> copy.put(String.valueOf(k), v));
                    out.add(copy);
                }
            }
            return out;
        }
        return List.of();
    }

    private double number(Object value, double fallback) {
        if (value instanceof Number n) return n.doubleValue();
        try {
            return value != null ? Double.parseDouble(String.valueOf(value)) : fallback;
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private double round1(double value) {
        return BigDecimal.valueOf(value).setScale(1, RoundingMode.HALF_UP).doubleValue();
    }

    // ── Admin / IT methods (not exposed to regular users) ──────────────────

    /**
     * Manually trigger background retraining.
     * Returns immediately with the AI service's response.
     * Training happens in AI service daemon thread.
     */
    public Map<String, Object> triggerRetrain(String reason) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (!aiServiceClient.isHealthy()) {
            result.put("status", "unavailable");
            result.put("message", "AI service is not reachable");
            return result;
        }
        Optional<Map<String, Object>> response = aiServiceClient.retrain(
                Map.of("reason", reason != null ? reason : "manual", "min_records", 0));
        result = response.orElseGet(() -> Map.of("status", "no_response", "message", "AI service did not respond"));
        auditLogService.logSystem("AI_RETRAIN_MANUAL",
                "Manual retrain triggered via API (reason=" + reason + ")",
                "ai_models", reason);
        return result;
    }

    /**
     * Get current training pipeline state from the AI service.
     * Returns idle/training/completed/failed with metrics.
     */
    public Map<String, Object> getTrainingStatus() {
        return aiServiceClient.getTrainingStatus().orElseGet(() -> {
            Map<String, Object> fallback = new LinkedHashMap<>();
            fallback.put("status", "unknown");
            fallback.put("message", "AI service not reachable");
            fallback.put("aiServiceHealthy", false);
            return fallback;
        });
    }
}
