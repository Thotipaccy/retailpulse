package com.retailpulse.service;

import com.retailpulse.model.Alert;
import com.retailpulse.model.AlertDigestQueue;
import com.retailpulse.model.User;
import com.retailpulse.model.enums.AlertSeverity;
import com.retailpulse.repository.AlertDigestQueueRepository;
import com.retailpulse.repository.AlertRepository;
import com.retailpulse.security.CustomUserDetailsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlertDeliveryService {

    private final AlertPreferenceService preferenceService;
    private final CustomUserDetailsService userDetailsService;
    private final AlertRepository alertRepository;
    private final AlertDigestQueueRepository digestQueueRepository;
    private final EmailService emailService;

    @Value("${retailpulse.email.auto-alerts-enabled:false}")
    private boolean autoAlertsEnabled;

    @Transactional
    public boolean deliver(String userId, String alertType, AlertSeverity severity, String message) {
        Map<String, Object> prefs = preferenceService.getPreferences(userId);
        String category = preferenceService.categorizeAlertType(alertType);
        if (!preferenceService.isAlertTypeEnabled(prefs, category)) {
            log.debug("Skipping alert {} â€” type {} disabled for user {}", alertType, category, userId);
            return false;
        }

        LocalDateTime now = LocalDateTime.now();
        boolean inDnd = preferenceService.isInDoNotDisturb(prefs, now);
        if (inDnd) {
            log.debug("Skipping alert {} for user {} â€” do not disturb active", alertType, userId);
            return false;
        }

        User user = userDetailsService.loadEntityById(userId);

        if (preferenceService.isChannelEnabled(prefs, "inApp")) {
            alertRepository.save(Alert.builder()
                    .alertId(UUID.randomUUID().toString())
                    .user(user)
                    .alertType(alertType)
                    .severity(severity)
                    .message(message)
                    .isRead(false)
                    .createdAt(now)
                    .build());
        }

        routeExternalNotifications(user, prefs, alertType, severity, message);
        return true;
    }

    /** Saves alert to database only â€” no email, SMS, or digest queue. */
    @Transactional
    public boolean deliverInAppOnly(String userId, String alertType, AlertSeverity severity, String message) {
        Map<String, Object> prefs = preferenceService.getPreferences(userId);
        String category = preferenceService.categorizeAlertType(alertType);
        if (!preferenceService.isAlertTypeEnabled(prefs, category)) {
            return false;
        }
        User user = userDetailsService.loadEntityById(userId);
        alertRepository.save(Alert.builder()
                .alertId(UUID.randomUUID().toString())
                .user(user)
                .alertType(alertType)
                .severity(severity)
                .message(message)
                .isRead(false)
                .createdAt(LocalDateTime.now())
                .build());
        log.info("In-app alert stored (no email): {} â€” {}", alertType, message);
        return true;
    }

    private void routeExternalNotifications(User user, Map<String, Object> prefs, String alertType,
                                          AlertSeverity severity, String message) {
        if (!autoAlertsEnabled) {
            log.debug("External alert notification skipped (auto-alerts disabled): {}", alertType);
            return;
        }
        String digest = preferenceService.digestFrequency(prefs);
        String subject = "RetailPulse Alert: " + alertType;

        if (preferenceService.isChannelEnabled(prefs, "email")) {
            if ("instant".equalsIgnoreCase(digest)) {
                emailService.sendAlertEmail(resolveEmail(user), subject, message);
            } else {
                queueDigest(user, alertType, severity, message);
            }
        }

        if (preferenceService.isChannelEnabled(prefs, "sms") && user.getPhone() != null && !user.getPhone().isBlank()) {
            log.info("SMS alert queued for {}: {}", user.getPhone(), message);
        }
    }

    private void queueDigest(User user, String alertType, AlertSeverity severity, String message) {
        digestQueueRepository.save(AlertDigestQueue.builder()
                .id("dq-" + UUID.randomUUID().toString().substring(0, 8))
                .user(user)
                .alertType(alertType)
                .severity(severity.toApiValue())
                .message(message)
                .createdAt(LocalDateTime.now())
                .build());
    }

    private String resolveEmail(User user) {
        return user.getEmail() != null && !user.getEmail().isBlank() ? user.getEmail() : user.getUserId();
    }
}
