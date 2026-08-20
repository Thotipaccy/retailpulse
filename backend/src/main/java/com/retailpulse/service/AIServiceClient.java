package com.retailpulse.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Component
public class AIServiceClient {

    private final RestTemplate restTemplate;
    private final String baseUrl;
    private final String healthUrl;
    private final boolean enabled;

    public AIServiceClient(
            RestTemplateBuilder builder,
            @Value("${retailpulse.ai-service.base-url:http://localhost:8000/ml}") String baseUrl,
            @Value("${retailpulse.ai-service.enabled:true}") boolean enabled) {
        this.restTemplate = builder
                .setConnectTimeout(Duration.ofSeconds(5))
                .setReadTimeout(Duration.ofSeconds(90))
                .build();
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.healthUrl = this.baseUrl.replace("/ml", "") + "/health";
        this.enabled = enabled;
    }

    public boolean isHealthy() {
        if (!enabled) return false;
        try {
            @SuppressWarnings("rawtypes")
            ResponseEntity<Map> response = restTemplate.getForEntity(healthUrl, Map.class);
            return response.getStatusCode().is2xxSuccessful()
                    && response.getBody() != null
                    && "ok".equalsIgnoreCase(String.valueOf(response.getBody().get("status")));
        } catch (RestClientException ex) {
            log.debug("AI service health check failed: {}", ex.getMessage());
            return false;
        }
    }

    public Map<String, Object> getHealthDetails() {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("url", healthUrl);
        details.put("enabled", enabled);
        if (!enabled) {
            details.put("status", "DISABLED");
            return details;
        }
        try {
            @SuppressWarnings("rawtypes")
            ResponseEntity<Map> response = restTemplate.getForEntity(healthUrl, Map.class);
            details.put("status", response.getStatusCode().is2xxSuccessful() ? "UP" : "DOWN");
            if (response.getBody() != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> body = response.getBody();
                details.putAll(body);
            }
        } catch (RestClientException ex) {
            details.put("status", "DOWN");
            details.put("error", ex.getMessage());
        }
        return details;
    }

    @SuppressWarnings("unchecked")
    public Optional<Map<String, Object>> forecastDemandFull(Map<String, Object> body) {
        if (!enabled) return Optional.empty();
        try {
            Map<String, Object> response = restTemplate.postForObject(baseUrl + "/forecast", body, Map.class);
            return Optional.ofNullable(response);
        } catch (RestClientException ex) {
            log.warn("AI forecast failed: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    public Optional<List<Map<String, Object>>> forecastDemand(String horizon) {
        return postForDataList("/forecast", Map.of("horizon", horizon != null ? horizon : "weekly"));
    }

    public Optional<List<Map<String, Object>>> predictChurn(List<Map<String, Object>> customers) {
        if (customers == null || customers.isEmpty()) {
            return postForDataList("/churn", Collections.emptyMap());
        }
        return postForDataList("/churn", Map.of("customers", customers));
    }

    public Optional<List<Map<String, Object>>> getRecommendations(String type, int limit) {
        return getRecommendations(type, limit, null);
    }

    public Optional<List<Map<String, Object>>> getRecommendations(String type, int limit, Map<String, Object> additionalPayload) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", type != null ? type : "cross_sell");
        body.put("limit", limit);
        if (additionalPayload != null) {
            body.putAll(additionalPayload);
        }
        return postForDataList("/recommend", body);
    }

    public Optional<List<Map<String, Object>>> assessStockout(List<Map<String, Object>> products) {
        if (products == null || products.isEmpty()) {
            return postForDataList("/stockout", Collections.emptyMap());
        }
        return postForDataList("/stockout", Map.of("products", products));
    }

    @SuppressWarnings("unchecked")
    public Optional<Map<String, Object>> retrain(Map<String, Object> body) {
        if (!enabled) return Optional.empty();
        try {
            Map<String, Object> response = restTemplate.postForObject(baseUrl + "/retrain", body, Map.class);
            return Optional.ofNullable(response);
        } catch (RestClientException ex) {
            log.warn("AI retrain failed: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    @SuppressWarnings("unchecked")
    public Optional<Map<String, Object>> getModelStatus() {
        if (!enabled) return Optional.empty();
        try {
            Map<String, Object> response = restTemplate.getForObject(
                    baseUrl.replace("/ml", "") + "/ml/models/status", Map.class);
            return Optional.ofNullable(response);
        } catch (RestClientException ex) {
            return Optional.empty();
        }
    }

    @SuppressWarnings("unchecked")
    public Optional<Map<String, Object>> getTrainingStatus() {
        if (!enabled) return Optional.empty();
        try {
            Map<String, Object> response = restTemplate.getForObject(
                    baseUrl.replace("/ml", "") + "/ml/training/status", Map.class);
            return Optional.ofNullable(response);
        } catch (RestClientException ex) {
            log.debug("Could not fetch training status: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    public void notifyNewRecord(int count) {
        if (!enabled) return;
        try {
            restTemplate.postForObject(
                    baseUrl.replace("/ml", "") + "/ml/training/notify",
                    Map.of("count", count),
                    Map.class);
        } catch (RestClientException ex) {
            log.debug("notifyNewRecord failed (non-critical): {}", ex.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private Optional<List<Map<String, Object>>> postForDataList(String path, Map<String, Object> body) {
        if (!enabled) return Optional.empty();
        try {
            Map<String, Object> response = restTemplate.postForObject(baseUrl + path, body, Map.class);
            if (response == null) return Optional.empty();
            if (response.containsKey("data")) {
                return Optional.of((List<Map<String, Object>>) response.get("data"));
            }
            if (response.containsKey("predictions")) {
                return Optional.of((List<Map<String, Object>>) response.get("predictions"));
            }
            if (response.containsKey("recommendations")) {
                return Optional.of((List<Map<String, Object>>) response.get("recommendations"));
            }
            if (response.containsKey("risks")) {
                return Optional.of((List<Map<String, Object>>) response.get("risks"));
            }
            if (response.containsKey("forecasts")) {
                return Optional.of((List<Map<String, Object>>) response.get("forecasts"));
            }
            return Optional.empty();
        } catch (RestClientException ex) {
            log.warn("AI service call {} failed: {}", path, ex.getMessage());
            return Optional.empty();
        }
    }
}
