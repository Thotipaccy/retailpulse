package com.retailpulse.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.retailpulse.model.AlertPreference;
import com.retailpulse.model.User;
import com.retailpulse.repository.AlertPreferenceRepository;
import com.retailpulse.security.CustomUserDetailsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlertPreferenceService {

    private final AlertPreferenceRepository preferenceRepository;
    private final CustomUserDetailsService userDetailsService;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public Map<String, Object> getPreferences(String userId) {
        return preferenceRepository.findById(userId)
                .map(p -> fromJson(p.getPreferencesJson()))
                .orElseGet(AlertPreferenceService::defaultPreferences);
    }

    @Transactional
    public Map<String, Object> savePreferences(String userId, Map<String, Object> preferences) {
        User user = userDetailsService.loadEntityById(userId);
        Map<String, Object> merged = mergeWithDefaults(preferences);
        String json = toJson(merged);
        AlertPreference entity = preferenceRepository.findById(userId).orElse(null);
        if (entity == null) {
            entity = AlertPreference.builder()
                    .user(user)
                    .preferencesJson(json)
                    .updatedAt(LocalDateTime.now())
                    .build();
        } else {
            entity.setPreferencesJson(json);
            entity.setUpdatedAt(LocalDateTime.now());
        }
        preferenceRepository.save(entity);
        return merged;
    }

    @Transactional
    public Map<String, Object> resetPreferences(String userId) {
        return savePreferences(userId, defaultPreferences());
    }

    public boolean isAlertTypeEnabled(Map<String, Object> prefs, String category) {
        Map<?, ?> types = map(prefs.get("alertTypes"));
        if (types.isEmpty()) {
            return true;
        }
        Object value = types.get(category);
        return value == null || Boolean.TRUE.equals(value);
    }

    public boolean isChannelEnabled(Map<String, Object> prefs, String channel) {
        Map<?, ?> channels = map(prefs.get("channels"));
        Object value = channels.get(channel);
        return value == null || Boolean.TRUE.equals(value);
    }

    public boolean isSoundEnabled(Map<String, Object> prefs) {
        return Boolean.TRUE.equals(prefs.get("soundEnabled"));
    }

    public boolean isInDoNotDisturb(Map<String, Object> prefs, LocalDateTime at) {
        Map<String, Object> dnd = map(prefs.get("doNotDisturb"));
        if (!Boolean.TRUE.equals(dnd.get("enabled"))) {
            return false;
        }
        List<?> days = list(dnd.get("days"));
        if (!days.isEmpty() && !days.contains(shortDay(at.getDayOfWeek()))) {
            return false;
        }
        LocalTime start = LocalTime.parse(String.valueOf(dnd.getOrDefault("startTime", "22:00")));
        LocalTime end = LocalTime.parse(String.valueOf(dnd.getOrDefault("endTime", "07:00")));
        LocalTime current = at.toLocalTime();
        if (start.isAfter(end)) {
            return !current.isBefore(start) || current.isBefore(end);
        }
        return !current.isBefore(start) && current.isBefore(end);
    }

    public String digestFrequency(Map<String, Object> prefs) {
        Map<String, Object> digest = map(prefs.get("digest"));
        return String.valueOf(digest.getOrDefault("frequency", "instant"));
    }

    public Map<String, Object> thresholds(Map<String, Object> prefs) {
        Map<String, Object> t = new LinkedHashMap<>();
        Map<?, ?> raw = map(prefs.get("thresholds"));
        t.put("lowStock", number(raw.get("lowStock"), 10));
        t.put("targetDeviation", number(raw.get("targetDeviation"), 15));
        t.put("churnRisk", number(raw.get("churnRisk"), 0.6));
        t.put("aiAccuracy", number(raw.get("aiAccuracy"), 80));
        return t;
    }

    public String categorizeAlertType(String alertType) {
        if (alertType == null) {
            return "system";
        }
        String t = alertType.toUpperCase(Locale.ROOT);
        if (t.contains("STOCK") || t.contains("INVENTORY") || t.contains("STOCKOUT")) {
            return "inventory";
        }
        if (t.contains("CHURN") || t.contains("CUSTOMER") || t.contains("VIP")) {
            return "customer";
        }
        if (t.contains("LOGIN") || t.contains("PASSWORD") || t.contains("SECURITY")
                || t.contains("AUTH") || t.contains("USER") || t.contains("DEACTIVAT")) {
            return "security";
        }
        if (t.contains("SALES") || t.contains("TARGET") || t.contains("REVENUE")) {
            return "sales";
        }
        return "system";
    }

    public static Map<String, Object> defaultPreferences() {
        Map<String, Object> prefs = new LinkedHashMap<>();
        prefs.put("channels", Map.of(
                "inApp", true,
                "email", true,
                "sms", false
        ));
        prefs.put("soundEnabled", true);
        prefs.put("doNotDisturb", new LinkedHashMap<>(Map.of(
                "enabled", false,
                "startTime", "22:00",
                "endTime", "07:00",
                "days", List.of("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
        )));
        prefs.put("digest", new LinkedHashMap<>(Map.of(
                "frequency", "instant",
                "time", "08:00",
                "day", "Monday"
        )));
        prefs.put("alertTypes", Map.of(
                "inventory", true,
                "sales", true,
                "customer", true,
                "system", true,
                "security", true
        ));
        prefs.put("thresholds", Map.of(
                "lowStock", 10,
                "targetDeviation", 15,
                "churnRisk", 0.6,
                "aiAccuracy", 80
        ));
        return prefs;
    }

    private Map<String, Object> mergeWithDefaults(Map<String, Object> incoming) {
        Map<String, Object> defaults = defaultPreferences();
        Map<String, Object> merged = deepCopy(defaults);
        if (incoming != null) {
            mergeSection(merged, incoming, "channels");
            merged.put("soundEnabled", incoming.getOrDefault("soundEnabled", defaults.get("soundEnabled")));
            mergeSection(merged, incoming, "doNotDisturb");
            mergeSection(merged, incoming, "digest");
            mergeSection(merged, incoming, "alertTypes");
            mergeSection(merged, incoming, "thresholds");
        }
        return merged;
    }

    private void mergeSection(Map<String, Object> target, Map<String, Object> incoming, String key) {
        if (incoming.get(key) instanceof Map<?, ?> section) {
            Map<String, Object> base = new LinkedHashMap<>(map(target.get(key)));
            section.forEach((k, v) -> base.put(String.valueOf(k), v));
            target.put(key, base);
        }
    }

    private Map<String, Object> deepCopy(Map<String, Object> source) {
        return fromJson(toJson(source));
    }

    private Map<String, Object> fromJson(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException ex) {
            log.warn("Invalid preferences JSON, using defaults");
            return defaultPreferences();
        }
    }

    private String toJson(Map<String, Object> prefs) {
        try {
            return objectMapper.writeValueAsString(prefs);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Could not serialize alert preferences", ex);
        }
    }

    private Map<String, Object> map(Object value) {
        if (value instanceof Map<?, ?> m) {
            Map<String, Object> copy = new LinkedHashMap<>();
            m.forEach((k, v) -> copy.put(String.valueOf(k), v));
            return copy;
        }
        return new LinkedHashMap<>();
    }

    private List<?> list(Object value) {
        if (value instanceof List<?> l) {
            return l;
        }
        return List.of();
    }

    private double number(Object value, double fallback) {
        if (value instanceof Number n) {
            return n.doubleValue();
        }
        try {
            return value != null ? Double.parseDouble(String.valueOf(value)) : fallback;
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private String shortDay(DayOfWeek day) {
        return switch (day) {
            case MONDAY -> "Mon";
            case TUESDAY -> "Tue";
            case WEDNESDAY -> "Wed";
            case THURSDAY -> "Thu";
            case FRIDAY -> "Fri";
            case SATURDAY -> "Sat";
            case SUNDAY -> "Sun";
        };
    }
}
