package com.retailpulse.service;

import com.retailpulse.model.InventoryRecord;
import com.retailpulse.model.User;
import com.retailpulse.model.enums.AlertSeverity;
import com.retailpulse.repository.AlertRepository;
import com.retailpulse.repository.InventoryRecordRepository;
import com.retailpulse.repository.UserRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class InventoryAlertScheduler {

    private final InventoryRecordRepository inventoryRecordRepository;
    private final AlertRepository alertRepository;
    private final UserRepository userRepository;
    private final AlertDeliveryService deliveryService;
    private final AlertPreferenceService preferenceService;
    private final AuditLogService auditLogService;

    /** Run once on startup so alerts appear immediately without waiting 15 min */
    @PostConstruct
    public void runOnStartup() {
        try {
            log.info("Running initial inventory alert check on startup...");
            checkInventoryLevels();
        } catch (Exception e) {
            log.warn("Startup inventory alert check failed: {}", e.getMessage());
        }
    }

    // Runs every 15 minutes
    @Scheduled(fixedRate = 900_000)
    @Transactional
    public void checkInventoryLevels() {
        List<InventoryRecord> records = inventoryRecordRepository.findAllWithDetails();
        List<User> admins = userRepository.findAll().stream()
                .filter(u -> com.retailpulse.model.enums.UserRole.ADMIN.equals(u.getRole()) || com.retailpulse.model.enums.UserRole.MANAGER.equals(u.getRole()))
                .toList();
        
        for (User admin : admins) {
            Map<String, Object> prefs = preferenceService.getPreferences(admin.getUserId());
            int lowStockThreshold = ((Number) preferenceService.thresholds(prefs).get("lowStock")).intValue();

        for (InventoryRecord record : records) {
            int qty = record.getQuantityOnHand();
            int reorderPoint = record.getProduct().getReorderPoint();
            BigDecimal stockoutRisk = record.getStockoutRisk();
            String productName = record.getProduct().getProductName();
            String productId = record.getProduct().getProductId();

            if (qty < reorderPoint || qty <= lowStockThreshold) {
                String message = "Low stock: " + productName + " (" + productId + ") has " + qty
                        + " units (reorder point: " + reorderPoint + ", threshold: " + lowStockThreshold + ")";
                if (!recentAlertExists(admin.getUserId(), "LOW_STOCK", productId)) {
                    boolean delivered = deliveryService.deliverInAppOnly(
                            admin.getUserId(), "LOW_STOCK", AlertSeverity.HIGH, message);
                    if (delivered) {
                        auditLogService.logSystem("INVENTORY_ALERT", message, "inventory_records", "LOW_STOCK");
                    }
                }
            }

            if (stockoutRisk.compareTo(new BigDecimal("0.7")) >= 0) {
                String message = "Critical stockout risk: " + productName + " (risk " + stockoutRisk + ")";
                if (!recentAlertExists(admin.getUserId(), "CRITICAL_STOCKOUT", productId)) {
                    boolean delivered = deliveryService.deliverInAppOnly(
                            admin.getUserId(), "CRITICAL_STOCKOUT", AlertSeverity.CRITICAL, message);
                    if (delivered) {
                        auditLogService.logSystem("INVENTORY_ALERT", message, "inventory_records", "CRITICAL_STOCKOUT");
                    }
                }
            }
        }
        }
    }
    private boolean recentAlertExists(String userId, String alertType, String productId) {
        LocalDateTime since = LocalDateTime.now().minusHours(24);
        return alertRepository.findAll().stream()
                .anyMatch(a -> alertType.equals(a.getAlertType())
                        && a.getUser().getUserId().equals(userId)
                        && a.getMessage() != null && a.getMessage().contains(productId)
                        && a.getCreatedAt().isAfter(since));
    }
}
