package com.retailpulse.service;

import com.retailpulse.exception.ResourceNotFoundException;
import com.retailpulse.model.Alert;
import com.retailpulse.model.User;
import com.retailpulse.model.enums.AlertSeverity;
import com.retailpulse.repository.AlertRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AlertService {

    private final AlertRepository alertRepository;
    private final AlertPreferenceService preferenceService;
    private final AlertDeliveryService deliveryService;
    private final com.retailpulse.repository.UserRepository userRepository;

    public List<Map<String, Object>> getAlerts(String userId, String filter) {
        Map<String, Object> prefs = preferenceService.getPreferences(userId);
        List<Alert> alerts = "unread".equalsIgnoreCase(filter)
                ? alertRepository.findByUserUserIdAndIsReadFalseOrderByCreatedAtDesc(userId)
                : alertRepository.findByUserUserIdOrderByCreatedAtDesc(userId);
        return alerts.stream()
                .filter(a -> preferenceService.isAlertTypeEnabled(
                        prefs, preferenceService.categorizeAlertType(a.getAlertType())))
                .map(this::toAlertMap)
                .toList();
    }

    @Transactional
    public Map<String, Object> markAsRead(String alertId) {
        Alert alert = alertRepository.findById(alertId)
                .orElseThrow(() -> new ResourceNotFoundException("Alert not found"));
        alert.setIsRead(true);
        alertRepository.save(alert);
        return Map.of("alertId", alertId, "isRead", true);
    }

    @Transactional
    public Map<String, Object> markAllRead(String userId) {
        List<Alert> alerts = alertRepository.findByUserUserIdAndIsReadFalseOrderByCreatedAtDesc(userId);
        alerts.forEach(a -> a.setIsRead(true));
        alertRepository.saveAll(alerts);
        return Map.of("markedRead", alerts.size());
    }

    @Transactional
    public Map<String, Object> deleteAlert(String alertId) {
        if (!alertRepository.existsById(alertId)) {
            throw new ResourceNotFoundException("Alert not found");
        }
        alertRepository.deleteById(alertId);
        return Map.of("alertId", alertId, "deleted", true);
    }

    @Transactional
    public Map<String, Object> clearAllAlerts(String userId) {
        long count = alertRepository.countByUserUserId(userId);
        alertRepository.deleteByUserUserId(userId);
        return Map.of("deleted", count);
    }

    public List<Map<String, Object>> getRules(String userId) {
        Map<String, Object> prefs = preferenceService.getPreferences(userId);
        Map<String, Object> thresholds = preferenceService.thresholds(prefs);

        boolean inventoryEnabled = preferenceService.isAlertTypeEnabled(prefs, "inventory");
        boolean customerEnabled = preferenceService.isAlertTypeEnabled(prefs, "customer");
        boolean systemEnabled = preferenceService.isAlertTypeEnabled(prefs, "system");

        return List.of(
                rule("low-stock", "Low Stock Alert", thresholds.get("lowStock").toString(), "HIGH", "inventory", inventoryEnabled),
                rule("churn-risk", "Churn Risk Alert", thresholds.get("churnRisk").toString(), "CRITICAL", "customer", customerEnabled),
                rule("forecast-update", "Forecast Update", thresholds.get("aiAccuracy").toString(), "MEDIUM", "system", systemEnabled)
        );
    }

    @Transactional
    @SuppressWarnings("unchecked")
    public Map<String, Object> updateRule(String userId, String ruleId, Map<String, Object> updates) {
        Map<String, Object> prefs = preferenceService.getPreferences(userId);
        
        // Map ruleId to corresponding preference keys
        String thresholdKey = null;
        String alertTypeKey = null;

        if ("low-stock".equals(ruleId)) {
            thresholdKey = "lowStock";
            alertTypeKey = "inventory";
        } else if ("churn-risk".equals(ruleId)) {
            thresholdKey = "churnRisk";
            alertTypeKey = "customer";
        } else if ("forecast-update".equals(ruleId)) {
            thresholdKey = "aiAccuracy";
            alertTypeKey = "system";
        } else if ("target-deviation".equals(ruleId)) {
            thresholdKey = "targetDeviation";
            alertTypeKey = "sales";
        } else {
            throw new IllegalArgumentException("Unknown rule ID: " + ruleId);
        }

        if (updates.containsKey("threshold")) {
            Object threshold = updates.get("threshold");
            // Thresholds are stored under 'thresholds'
            Map<String, Object> thresholds = (Map<String, Object>) prefs.get("thresholds");
            if (thresholds == null) thresholds = new java.util.LinkedHashMap<>();
            
            try {
                if ("lowStock".equals(thresholdKey) || "aiAccuracy".equals(thresholdKey)) {
                    thresholds.put(thresholdKey, Integer.parseInt(threshold.toString()));
                } else {
                    thresholds.put(thresholdKey, Double.parseDouble(threshold.toString()));
                }
            } catch (NumberFormatException e) {
                // Ignore invalid numbers
            }
            prefs.put("thresholds", thresholds);
        }

        if (updates.containsKey("isActive")) {
            boolean isActive = Boolean.parseBoolean(updates.get("isActive").toString());
            // Active state is stored under 'alertTypes'
            Map<String, Object> alertTypes = (Map<String, Object>) prefs.get("alertTypes");
            if (alertTypes == null) alertTypes = new java.util.LinkedHashMap<>();
            alertTypes.put(alertTypeKey, isActive);
            prefs.put("alertTypes", alertTypes);
        }

        preferenceService.savePreferences(userId, prefs);
        
        // Return updated rules so UI can refresh if needed
        return getRules(userId).stream().filter(r -> ruleId.equals(r.get("ruleId"))).findFirst().orElseThrow();
    }

    @Transactional
    public void createSystemAlert(String title, String message, String severity) {
        AlertSeverity sev = switch (severity != null ? severity.toLowerCase() : "medium") {
            case "critical" -> AlertSeverity.CRITICAL;
            case "high" -> AlertSeverity.HIGH;
            case "low" -> AlertSeverity.LOW;
            default -> AlertSeverity.MEDIUM;
        };

        List<User> admins = userRepository.findAll().stream()
                .filter(u -> com.retailpulse.model.enums.UserRole.ADMIN.equals(u.getRole()))
                .toList();

        for (User admin : admins) {
            deliveryService.deliver(admin.getUserId(), title, sev, message);
        }
    }

    public Map<String, Object> getPreferences(String userId) {
        return preferenceService.getPreferences(userId);
    }

    @Transactional
    public Map<String, Object> savePreferences(String userId, Map<String, Object> preferences) {
        return preferenceService.savePreferences(userId, preferences);
    }

    @Transactional
    public Map<String, Object> resetPreferences(String userId) {
        return preferenceService.resetPreferences(userId);
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

    private Map<String, Object> rule(String id, String name, String threshold, String severity, String category, boolean isActive) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ruleId", id);
        m.put("name", name);
        m.put("threshold", threshold);
        m.put("severity", severity.toLowerCase());
        m.put("enabled", isActive); // UI toggles use enabled/isActive interchangeably for system rules
        m.put("isActive", isActive);
        m.put("category", category);
        return m;
    }
}
