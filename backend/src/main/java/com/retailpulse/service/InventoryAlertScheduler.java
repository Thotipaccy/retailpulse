package com.retailpulse.service;

import com.retailpulse.model.InventoryRecord;
import com.retailpulse.model.User;
import com.retailpulse.model.enums.AlertSeverity;
import com.retailpulse.repository.AlertRepository;
import com.retailpulse.repository.InventoryRecordRepository;
import com.retailpulse.repository.UserRepository;
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

    // Runs 10s after startup, then every 15 minutes
    @Scheduled(fixedRate = 900_000, initialDelay = 10_000)
    @Transactional
    public void checkInventoryLevels() {
        List<InventoryRecord> records = inventoryRecordRepository.findAllWithDetails();
        List<User> admins = userRepository.findAll().stream()
                .filter(u -> com.retailpulse.model.enums.UserRole.ADMIN.equals(u.getRole()) || com.retailpulse.model.enums.UserRole.MANAGER.equals(u.getRole()))
                .toList();

        LocalDateTime since = LocalDateTime.now().minusHours(24);
        List<com.retailpulse.model.Alert> recentAlerts = alertRepository.findByCreatedAtAfter(since);

        for (User admin : admins) {
            Map<String, Object> prefs = preferenceService.getPreferences(admin.getUserId());
            int lowStockThreshold = ((Number) preferenceService.thresholds(prefs).get("lowStock")).intValue();

            List<String> criticalProducts = new java.util.ArrayList<>();
            List<String> lowStockProducts = new java.util.ArrayList<>();

            for (InventoryRecord record : records) {
                int qty = record.getQuantityOnHand();
                int reorderPoint = record.getProduct().getReorderPoint();
                BigDecimal stockoutRisk = record.getStockoutRisk();
                String productName = record.getProduct().getProductName();
                String productId = record.getProduct().getProductId();

                boolean isLowStock = qty < reorderPoint || qty <= lowStockThreshold;
                boolean isCritical = stockoutRisk.compareTo(new BigDecimal("0.7")) >= 0;

                if (isCritical) {
                    criticalProducts.add(productName + " (" + productId + ")");
                } else if (isLowStock) {
                    lowStockProducts.add(productName + " (" + productId + ")");
                }
            }

            if (!criticalProducts.isEmpty()) {
                String message = String.format("Inventory Summary: %d items are at critical stockout risk. (e.g. %s)", 
                        criticalProducts.size(), 
                        String.join(", ", criticalProducts.subList(0, Math.min(3, criticalProducts.size()))));
                if (!recentAlertExists(recentAlerts, admin.getUserId(), "CRITICAL_STOCKOUT_SUMMARY")) {
                    boolean delivered = deliveryService.deliverInAppOnly(
                            admin.getUserId(), "CRITICAL_STOCKOUT_SUMMARY", AlertSeverity.CRITICAL, message);
                    if (delivered) {
                        auditLogService.logSystem("INVENTORY_ALERT", message, "inventory_records", "CRITICAL_STOCKOUT");
                    }
                }
            }

            if (!lowStockProducts.isEmpty()) {
                String message = String.format("Inventory Summary: %d items have low stock. (e.g. %s)", 
                        lowStockProducts.size(), 
                        String.join(", ", lowStockProducts.subList(0, Math.min(3, lowStockProducts.size()))));
                if (!recentAlertExists(recentAlerts, admin.getUserId(), "LOW_STOCK_SUMMARY")) {
                    boolean delivered = deliveryService.deliverInAppOnly(
                            admin.getUserId(), "LOW_STOCK_SUMMARY", AlertSeverity.HIGH, message);
                    if (delivered) {
                        auditLogService.logSystem("INVENTORY_ALERT", message, "inventory_records", "LOW_STOCK");
                    }
                }
            }
        }
    }

    private boolean recentAlertExists(List<com.retailpulse.model.Alert> recentAlerts, String userId, String alertType) {
        return recentAlerts.stream()
                .anyMatch(a -> alertType.equals(a.getAlertType())
                        && a.getUser().getUserId().equals(userId));
    }
}
