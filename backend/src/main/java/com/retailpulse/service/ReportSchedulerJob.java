package com.retailpulse.service;

import com.retailpulse.model.ScheduledReport;
import com.retailpulse.repository.ScheduledReportRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class ReportSchedulerJob {

    private final ScheduledReportRepository scheduledReportRepository;
    private final ReportGeneratorService reportGeneratorService;
    private final EmailService emailService;
    private final ReportService reportService;

    // Run every minute to check for due reports (for easier local testing)
    // In production, you might use @Scheduled(cron = "0 0 * * * *")
    @Scheduled(fixedRate = 60000)
    public void executeDueReports() {
        LocalDateTime now = LocalDateTime.now();
        List<ScheduledReport> dueReports = scheduledReportRepository.findAll().stream()
                .filter(ScheduledReport::getActive)
                .filter(r -> r.getNextRun() != null && !now.isBefore(r.getNextRun()))
                .toList();

        if (dueReports.isEmpty()) {
            return;
        }

        log.info("Found {} scheduled reports due for execution", dueReports.size());

        for (ScheduledReport schedule : dueReports) {
            try {
                String tempReportId = "sch-" + schedule.getId().substring(0, 4) + "-" + UUID.randomUUID().toString().substring(0, 4);
                
                log.info("Executing scheduled report: {} (Type: {})", schedule.getName(), schedule.getReportType());
                
                String filePath = reportGeneratorService.generateCsvReport(
                        tempReportId, 
                        schedule.getReportType(), 
                        Map.of("period", schedule.getFrequency())
                );
                
                // Send email
                String subject = "RetailPulse: " + schedule.getName();
                String body = "Your scheduled report is ready.\n\n" +
                              "Report Name: " + schedule.getName() + "\n" +
                              "Frequency: " + schedule.getFrequency() + "\n" +
                              "Generated: " + now + "\n\n" +
                              "Since this is a local environment, the file has been saved to: " + filePath + "\n\n" +
                              "Best,\nRetailPulse System";
                              
                boolean emailSent = emailService.sendDigestEmail(schedule.getRecipients(), subject, body);
                
                if (emailSent) {
                    log.info("Successfully emailed report to {}", schedule.getRecipients());
                } else {
                    log.warn("Failed to email report or emails are disabled. File generated at {}", filePath);
                }

                // Update next run
                schedule.setNextRun(reportService.calculateNextRun(schedule.getFrequency()));
                scheduledReportRepository.save(schedule);
                
            } catch (Exception e) {
                log.error("Failed to execute scheduled report {}", schedule.getId(), e);
            }
        }
    }
}
