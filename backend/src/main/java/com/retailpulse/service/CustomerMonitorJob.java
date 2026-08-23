package com.retailpulse.service;

import com.retailpulse.model.User;
import com.retailpulse.repository.AlertRepository;
import com.retailpulse.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class CustomerMonitorJob {

    private final CustomerService customerService;
    private final UserRepository userRepository;
    private final AlertRepository alertRepository;
    private final AlertService alertService;

    /**
     * Runs periodically to scan top customers for churn risk.
     * Evaluates every 12 hours; a summary alert is re-raised at most once per day
     * while the risk condition persists.
     */
    @Scheduled(fixedRateString = "${retailpulse.customer.monitor-interval:43200000}")
    public void scanTopCustomersForChurn() {
        log.info("Starting scheduled scan for at-risk VIP customers...");

        try {
            List<java.util.Map<String, Object>> risks = customerService.getChurnRisks();
            List<String> atRiskVIPs = new java.util.ArrayList<>();

            for (java.util.Map<String, Object> riskMap : risks) {
                Boolean isActive = (Boolean) riskMap.getOrDefault("isActive", true);
                if (!isActive) continue;

                String rfmSegment = (String) riskMap.getOrDefault("rfmSegment", "");
                BigDecimal lifetimeValue = new BigDecimal(riskMap.getOrDefault("lifetimeValue", "0").toString());
                
                boolean isVIP = "Champions".equalsIgnoreCase(rfmSegment) || 
                                "Loyal".equalsIgnoreCase(rfmSegment) ||
                                lifetimeValue.compareTo(new BigDecimal("300000")) > 0;
                
                if (isVIP) {
                    String churnProbStr = riskMap.containsKey("churnProbability") ? 
                            riskMap.get("churnProbability").toString() : 
                            riskMap.getOrDefault("churnRisk", "0").toString();
                            
                    double churnRisk = Double.parseDouble(churnProbStr);
                    
                    if (churnRisk > 0.60) {
                        String name = (String) riskMap.get("customerName");
                        atRiskVIPs.add(String.format("%s (%.0f%% risk)", name, churnRisk * 100));
                    }
                }
            }

            if (!atRiskVIPs.isEmpty()) {
                // De-duplicate: while the condition persists, notify at most once per day.
                List<User> admins = userRepository.findAll().stream()
                        .filter(u -> com.retailpulse.model.enums.UserRole.ADMIN.equals(u.getRole()))
                        .toList();
                LocalDateTime since = LocalDateTime.now().minusHours(24);
                String alertType = "High Churn Risk - VIP Summary";
                boolean alreadyNotified = admins.stream().anyMatch(admin ->
                        alertRepository.existsByUserUserIdAndAlertTypeAndCreatedAtAfter(
                                admin.getUserId(), alertType, since));
                if (alreadyNotified) {
                    log.debug("VIP churn summary alert suppressed — already sent within the last 24h");
                    return;
                }

                String msg = String.format("URGENT: %d VIP Customers have a high churn risk. Immediate outreach recommended. (e.g. %s)",
                        atRiskVIPs.size(),
                        String.join(", ", atRiskVIPs.subList(0, Math.min(3, atRiskVIPs.size()))));

                log.warn(msg);
                alertService.createSystemAlert(alertType, msg, "CRITICAL");
            }
            
            log.info("Finished scanning VIP customers.");
            
        } catch (Exception e) {
            log.error("Failed to execute customer churn monitor job", e);
        }
    }
}
