package com.retailpulse.service;

import com.retailpulse.model.Customer;
import com.retailpulse.repository.CustomerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class CustomerMonitorJob {

    private final CustomerService customerService;
    private final CustomerRepository customerRepository;
    private final AlertService alertService;

    /**
     * Runs periodically to scan top customers for churn risk.
     * Evaluates every 12 hours. For demonstration purposes, this could be run more frequently.
     */
    @Scheduled(fixedRateString = "${retailpulse.customer.monitor-interval:43200000}")
    public void scanTopCustomersForChurn() {
        log.info("Starting scheduled scan for at-risk VIP customers...");
        
        try {
            // Get top 50 active customers by lifetime value
            List<Customer> topCustomers = customerRepository.findTop20ByOrderByLifetimeValueDesc();
            
            for (Customer c : topCustomers) {
                if (!c.getIsActive()) continue;

                // Call the AI Service via the CustomerService to get real-time enriched churn risk
                // We use a helper from CustomerService to fetch the AI predictions
                
                // For simplicity, since getChurnRisks() returns all customers >= 0.3 risk, 
                // we'll just leverage that method and filter for VIPs.
            }
            
            // Let's actually use the existing getChurnRisks method which already calls the AI service
            List<java.util.Map<String, Object>> risks = customerService.getChurnRisks();
            
            for (java.util.Map<String, Object> riskMap : risks) {
                Boolean isActive = (Boolean) riskMap.getOrDefault("isActive", true);
                if (!isActive) continue;

                String rfmSegment = (String) riskMap.getOrDefault("rfmSegment", "");
                BigDecimal lifetimeValue = new BigDecimal(riskMap.getOrDefault("lifetimeValue", "0").toString());
                
                boolean isVIP = "Champions".equalsIgnoreCase(rfmSegment) || 
                                "Loyal".equalsIgnoreCase(rfmSegment) ||
                                lifetimeValue.compareTo(new BigDecimal("300000")) > 0;
                
                if (isVIP) {
                    // Check AI refined probability if available, otherwise fallback to DB churn risk
                    String churnProbStr = riskMap.containsKey("churnProbability") ? 
                            riskMap.get("churnProbability").toString() : 
                            riskMap.getOrDefault("churnRisk", "0").toString();
                            
                    double churnRisk = Double.parseDouble(churnProbStr);
                    
                    if (churnRisk > 0.60) {
                        String name = (String) riskMap.get("customerName");
                        String msg = String.format("URGENT: VIP Customer '%s' has a high churn risk of %.0f%%. Immediate outreach recommended.", 
                                name, churnRisk * 100);
                        
                        log.warn(msg);
                        alertService.createSystemAlert(
                                "High Churn Risk - VIP", 
                                msg, 
                                "CRITICAL"
                        );
                    }
                }
            }
            
            log.info("Finished scanning VIP customers.");
            
        } catch (Exception e) {
            log.error("Failed to execute customer churn monitor job", e);
        }
    }
}
