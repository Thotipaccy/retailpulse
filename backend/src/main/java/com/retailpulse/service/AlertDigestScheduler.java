package com.retailpulse.service;

import com.retailpulse.model.AlertDigestQueue;
import com.retailpulse.model.User;
import com.retailpulse.repository.AlertDigestQueueRepository;
import com.retailpulse.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Component
@RequiredArgsConstructor
public class AlertDigestScheduler {

    private final AlertDigestQueueRepository digestQueueRepository;
    private final AlertPreferenceService preferenceService;
    private final UserRepository userRepository;
    private final EmailService emailService;

    // Disabled in development — digest emails consume Gmail daily quota
    // @Scheduled(cron = "0 0 * * * *")
    @Transactional
    public void sendScheduledDigests() {
        sendDigestsForFrequency("hourly");
        sendDigestsForFrequency("daily");
        sendDigestsForFrequency("weekly");
    }

    private void sendDigestsForFrequency(String frequency) {
        for (User user : userRepository.findAll()) {
            Map<String, Object> prefs = preferenceService.getPreferences(user.getUserId());
            if (!frequency.equalsIgnoreCase(preferenceService.digestFrequency(prefs))) {
                continue;
            }
            if (!preferenceService.isChannelEnabled(prefs, "email")) {
                continue;
            }
            if (!isDigestDueNow(prefs, frequency)) {
                continue;
            }
            List<AlertDigestQueue> pending = digestQueueRepository
                    .findByUserUserIdAndSentAtIsNullOrderByCreatedAtDesc(user.getUserId());
            if (pending.isEmpty()) {
                continue;
            }
            emailService.sendDigestEmail(
                    user.getEmail(),
                    buildDigestSubject(frequency),
                    buildDigestBody(pending));
            LocalDateTime sentAt = LocalDateTime.now();
            pending.forEach(item -> item.setSentAt(sentAt));
            digestQueueRepository.saveAll(pending);
            log.info("Sent {} digest to {} ({} alerts)", frequency, user.getEmail(), pending.size());
        }
    }

    private boolean isDigestDueNow(Map<String, Object> prefs, String frequency) {
        if ("hourly".equalsIgnoreCase(frequency)) {
            return true;
        }
        Map<String, Object> digest;
        if (prefs.get("digest") instanceof Map<?, ?> raw) {
            digest = new LinkedHashMap<>();
            raw.forEach((k, v) -> digest.put(String.valueOf(k), v));
        } else {
            digest = Map.of("time", "08:00", "day", "Monday");
        }
        LocalTime configured = LocalTime.parse(String.valueOf(digest.getOrDefault("time", "08:00")));
        if (LocalTime.now().getHour() != configured.getHour()) {
            return false;
        }
        if ("weekly".equalsIgnoreCase(frequency)) {
            String day = String.valueOf(digest.getOrDefault("day", "Monday"));
            DayOfWeek expected = DayOfWeek.valueOf(day.toUpperCase(Locale.ROOT));
            return LocalDateTime.now().getDayOfWeek() == expected;
        }
        return "daily".equalsIgnoreCase(frequency);
    }

    private String buildDigestSubject(String frequency) {
        return switch (frequency.toLowerCase(Locale.ROOT)) {
            case "weekly" -> "RetailPulse — Weekly Alert Summary";
            case "hourly" -> "RetailPulse — Hourly Alert Summary";
            default -> "RetailPulse — Daily Alert Summary";
        };
    }

    private String buildDigestBody(List<AlertDigestQueue> pending) {
        long critical = pending.stream().filter(a -> "critical".equalsIgnoreCase(a.getSeverity())).count();
        long warning = pending.stream().filter(a -> "high".equalsIgnoreCase(a.getSeverity())).count();
        long info = pending.size() - critical - warning;
        String top = pending.stream()
                .limit(5)
                .map(a -> "- [" + a.getSeverity().toUpperCase(Locale.ROOT) + "] " + a.getAlertType() + ": " + a.getMessage())
                .collect(Collectors.joining("\n"));
        return """
                RetailPulse alert summary

                Total alerts: %d
                Critical: %d
                Warning: %d
                Info: %d

                Top alerts:
                %s

                View all alerts in RetailPulse: http://localhost:5173/alerts
                """.formatted(pending.size(), critical, warning, info, top);
    }
}
