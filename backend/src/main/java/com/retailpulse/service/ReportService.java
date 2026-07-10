package com.retailpulse.service;

import com.retailpulse.exception.ResourceNotFoundException;
import com.retailpulse.model.Report;
import com.retailpulse.model.ScheduledReport;
import com.retailpulse.model.User;
import com.retailpulse.repository.ReportRepository;
import com.retailpulse.repository.ScheduledReportRepository;
import com.retailpulse.security.CustomUserDetailsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class ReportService {

    private final ReportRepository reportRepository;
    private final ScheduledReportRepository scheduledReportRepository;
    private final CustomUserDetailsService userDetailsService;
    private final AuditLogService auditLogService;
    private final ReportGeneratorService reportGeneratorService;

    public List<Map<String, Object>> getTemplates() {
        return List.of(
                template("sales-summary", "Sales Summary Report", "Monthly sales overview"),
                template("inventory-status", "Inventory Status", "Stock levels and reorder points"),
                template("customer-analytics", "Customer Analytics", "RFM segments and churn analysis"),
                template("forecast-report", "Demand Forecast", "AI prediction accuracy report")
        );
    }

    @Transactional
    public Map<String, Object> generateReport(String userId, Map<String, String> params) {
        User user = userDetailsService.loadEntityById(userId);
        String reportId = "rep-" + UUID.randomUUID().toString().substring(0, 8);
        String reportType = params.getOrDefault("reportType", "sales-summary");
        String format = params.getOrDefault("format", "pdf").toLowerCase();
        
        String filePath;
        if ("excel".equals(format) || "xlsx".equals(format)) {
            filePath = reportGeneratorService.generateExcelReport(reportId, reportType, params);
            format = "excel";
        } else if ("csv".equals(format)) {
            filePath = reportGeneratorService.generateCsvReport(reportId, reportType, params);
            format = "csv";
        } else {
            filePath = reportGeneratorService.generatePdfReport(reportId, reportType, params);
            format = "pdf";
        }

        Report report = Report.builder()
                .reportId(reportId)
                .user(user)
                .reportType(reportType)
                .format(format)
                .status("READY")
                .filePath(filePath)
                .generatedAt(LocalDateTime.now())
                .build();
        reportRepository.save(report);
        auditLogService.log(userId, "REPORT_GENERATE",
                "Generated " + report.getReportType() + " report",
                "reports", reportId);
        log.info("Report {} generated for user {}", reportId, userId);
        return toReportMap(report);
    }

    public List<Map<String, Object>> getHistory(String userId) {
        return reportRepository.findByUserUserIdOrderByGeneratedAtDesc(userId).stream()
                .map(this::toReportMap)
                .toList();
    }

    public Map<String, Object> download(String reportId) {
        Report report = reportRepository.findById(reportId)
                .orElseThrow(() -> new ResourceNotFoundException("Report not found"));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("reportId", report.getReportId());
        result.put("filePath", report.getFilePath());
        result.put("format", report.getFormat());
        result.put("downloadUrl", "/api/reports/download/" + reportId + "/file");
        return result;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getScheduled(String userId) {
        return scheduledReportRepository.findByUserUserIdOrderByCreatedAtDesc(userId).stream()
                .map(this::toScheduledMap)
                .toList();
    }

    @Transactional
    public Map<String, Object> createSchedule(String userId, Map<String, String> params) {
        User user = userDetailsService.loadEntityById(userId);
        String id = "sch-" + UUID.randomUUID().toString().substring(0, 8);
        String frequency = params.getOrDefault("frequency", "weekly");
        ScheduledReport schedule = ScheduledReport.builder()
                .id(id)
                .user(user)
                .name(params.getOrDefault("name", "Scheduled Report"))
                .reportType(params.getOrDefault("reportType", "sales-summary"))
                .format(params.getOrDefault("format", "pdf"))
                .frequency(frequency)
                .recipients(params.get("recipients"))
                .active(true)
                .nextRun(calculateNextRun(frequency))
                .createdAt(LocalDateTime.now())
                .build();
        scheduledReportRepository.save(schedule);
        log.info("Scheduled report {} created for user {}", id, userId);
        return toScheduledMap(schedule);
    }

    @Transactional
    public Map<String, Object> updateSchedule(String userId, String id, Map<String, String> params) {
        ScheduledReport schedule = scheduledReportRepository.findByIdAndUserUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Scheduled report not found"));
        if (params.containsKey("name")) schedule.setName(params.get("name"));
        if (params.containsKey("reportType")) schedule.setReportType(params.get("reportType"));
        if (params.containsKey("format")) schedule.setFormat(params.get("format"));
        if (params.containsKey("frequency")) {
            schedule.setFrequency(params.get("frequency"));
            schedule.setNextRun(calculateNextRun(params.get("frequency")));
        }
        if (params.containsKey("recipients")) schedule.setRecipients(params.get("recipients"));
        if (params.containsKey("active")) schedule.setActive(Boolean.parseBoolean(params.get("active")));
        scheduledReportRepository.save(schedule);
        return toScheduledMap(schedule);
    }

    @Transactional
    public void deleteSchedule(String userId, String id) {
        ScheduledReport schedule = scheduledReportRepository.findByIdAndUserUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Scheduled report not found"));
        scheduledReportRepository.delete(schedule);
    }

    public LocalDateTime calculateNextRun(String frequency) {
        if ("daily".equalsIgnoreCase(frequency)) {
            return LocalDateTime.now().plusDays(1).withHour(8).withMinute(0).withSecond(0);
        } else if ("monthly".equalsIgnoreCase(frequency)) {
            return LocalDateTime.now().plusMonths(1).withDayOfMonth(1).withHour(8).withMinute(0).withSecond(0);
        }
        // default weekly
        return LocalDateTime.now().plusWeeks(1).withHour(8).withMinute(0).withSecond(0);
    }

    private Map<String, Object> template(String id, String name, String description) {
        return Map.of("id", id, "name", name, "description", description,
                "formats", List.of("pdf", "excel", "csv", "pptx"));
    }

    private Map<String, Object> toReportMap(Report r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("reportId", r.getReportId());
        m.put("reportType", r.getReportType());
        m.put("format", r.getFormat());
        m.put("status", r.getStatus().toLowerCase());
        m.put("generatedAt", r.getGeneratedAt().toString());
        m.put("filePath", r.getFilePath());
        return m;
    }

    private Map<String, Object> toScheduledMap(ScheduledReport s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", s.getId());
        m.put("name", s.getName());
        m.put("reportType", s.getReportType());
        m.put("format", s.getFormat());
        m.put("frequency", s.getFrequency());
        m.put("recipients", s.getRecipients());
        m.put("active", s.getActive());
        m.put("nextRun", s.getNextRun() != null ? s.getNextRun().toString() : null);
        m.put("createdAt", s.getCreatedAt().toString());
        return m;
    }
}
