package com.retailpulse.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.retailpulse.model.ScheduledReport;
import com.retailpulse.repository.ScheduledReportRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Executes due scheduled reports through the standard generation pipeline
 * (same filters, same formats, audited, listed in History), then notifies
 * recipients. Recipients download from Reports → History after logging in —
 * no unauthenticated file links are emailed.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReportSchedulerJob {

    private static final DateTimeFormatter HUMAN = DateTimeFormatter.ofPattern("MMM d, yyyy HH:mm");

    private final ScheduledReportRepository scheduledReportRepository;
    private final ReportService reportService;
    private final EmailService emailService;
    private final ObjectMapper objectMapper;

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
                Map<String, String> params = restoreFilters(schedule.getFiltersJson());
                params.put("reportType", schedule.getReportType());
                params.put("format", schedule.getFormat());

                Map<String, Object> generated = reportService.generateReport(
                        schedule.getUser().getUserId(), params);
                String reportId = String.valueOf(generated.get("reportId"));
                String fileName = String.valueOf(generated.getOrDefault("fileName", ""));

                String subject = "RetailPulse report ready: " + schedule.getName();
                String body = "Your scheduled report has been generated.\n\n"
                        + "Report: " + schedule.getName()
                        + " (" + schedule.getReportType() + ", " + schedule.getFormat() + ")\n"
                        + "Filters: " + generated.getOrDefault("filterSummary", "default period") + "\n"
                        + "Generated: " + HUMAN.format(now) + "\n\n"
                        + "Download it from RetailPulse → Reports → History.\n"
                        + "Reference: " + fileName + " (id " + reportId + ")\n\n"
                        + "Files are kept for 30 days after generation.\n\n"
                        + "— RetailPulse automated reporting";

                boolean sent = emailService.sendDigestEmail(schedule.getRecipients(), subject, body);
                if (sent) {
                    log.info("Scheduled report {} executed and emailed to {}", schedule.getId(), schedule.getRecipients());
                } else {
                    log.warn("Scheduled report {} executed but email delivery failed", schedule.getId());
                }

                schedule.setNextRun(reportService.calculateNextRun(schedule.getFrequency()));
                scheduledReportRepository.save(schedule);
            } catch (Exception e) {
                log.error("Failed to execute scheduled report {}", schedule.getId(), e);
                // Push next attempt forward so a persistent failure doesn't hot-loop every minute.
                schedule.setNextRun(reportService.calculateNextRun(schedule.getFrequency()));
                scheduledReportRepository.save(schedule);
            }
        }
    }

    private Map<String, String> restoreFilters(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, String>>() {
            });
        } catch (Exception e) {
            log.warn("Could not parse scheduled filters; using defaults", e);
            return new LinkedHashMap<>();
        }
    }
}
