package com.retailpulse.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.retailpulse.dto.request.ReportFilter;
import com.retailpulse.exception.BadRequestException;
import com.retailpulse.exception.ResourceNotFoundException;
import com.retailpulse.model.Report;
import com.retailpulse.model.ScheduledReport;
import com.retailpulse.model.User;
import com.retailpulse.model.enums.UserRole;
import com.retailpulse.repository.ReportRepository;
import com.retailpulse.repository.ScheduledReportRepository;
import com.retailpulse.security.CustomUserDetailsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ReportService {

    private final ReportRepository reportRepository;
    private final ScheduledReportRepository scheduledReportRepository;
    private final CustomUserDetailsService userDetailsService;
    private final AuditLogService auditLogService;
    private final ReportGeneratorService reportGeneratorService;
    private final ObjectMapper objectMapper;

    public record FileDownload(Path path, String fileName, String contentType) {
    }

    public List<Map<String, Object>> getTemplates() {
        return List.of(
                template("sales-summary", "Sales Summary Report", "Revenue KPIs, trend and category breakdown", true),
                template("inventory-status", "Inventory Status", "Stock health plus item-level stock levels", false),
                template("customer-analytics", "Customer Analytics", "RFM segments and top customers", false),
                template("transaction-history", "Transaction History", "Row-level sales lines with date/category filters", true),
                template("forecast-report", "Demand Forecast", "AI model accuracy and health metrics", false),
                template("audit-trail", "Audit Trail", "System activity log (admin only)", false));
    }

    @Transactional
    public Map<String, Object> generateReport(String userId, Map<String, String> params) {
        User user = userDetailsService.loadEntityById(userId);
        String reportType = params.getOrDefault("reportType", "sales-summary");
        if ("audit-trail".equals(reportType) && user.getRole() != UserRole.ADMIN) {
            throw new AccessDeniedException("Only administrators can generate audit trail reports");
        }

        ReportFilter filter;
        try {
            filter = ReportFilter.from(params);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException(e.getMessage());
        }
        String requestedFormat = params.getOrDefault("format", "pdf");

        String reportId = "rep-" + UUID.randomUUID().toString().substring(0, 8);
        ReportGeneratorService.GeneratedReport generated =
                reportGeneratorService.generate(reportId, reportType, requestedFormat, filter, user.getFullName());

        Report report = Report.builder()
                .reportId(reportId)
                .user(user)
                .reportType(reportType)
                .format(formatLabel(requestedFormat))
                .status("READY")
                .filePath(generated.filePath().toString())
                .fileName(generated.fileName())
                .filtersJson(toJson(filter.asParams()))
                .generatedAt(LocalDateTime.now())
                .build();
        reportRepository.save(report);
        auditLogService.log(userId, "REPORT_GENERATE",
                "Generated " + reportType + " (" + report.getFormat() + ") · " + describeFilters(filter.asParams()),
                "reports", reportId);
        log.info("Report {} generated for user {}", reportId, userId);
        return toReportMap(report);
    }

    public List<Map<String, Object>> getHistory(String userId) {
        return reportRepository.findByUserUserIdOrderByGeneratedAtDesc(userId).stream()
                .map(this::toReportMap)
                .toList();
    }

    /** Metadata for a report — ownership enforced, server paths never exposed. */
    public Map<String, Object> download(String reportId) {
        Report report = reportRepository.findById(reportId)
                .orElseThrow(() -> new ResourceNotFoundException("Report not found"));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("reportId", report.getReportId());
        result.put("fileName", report.getFileName());
        result.put("format", report.getFormat());
        result.put("downloadUrl", "/api/reports/download/" + reportId + "/file");
        return result;
    }

    /**
     * Streams the artifact after enforcing ownership and auditing the export.
     */
    @Transactional
    public FileDownload prepareDownload(String reportId, String requesterId) {
        Report report = reportRepository.findById(reportId)
                .orElseThrow(() -> new ResourceNotFoundException("Report not found"));
        User requester = userDetailsService.loadEntityById(requesterId);
        boolean owner = report.getUser().getUserId().equals(requesterId);
        boolean admin = requester.getRole() == UserRole.ADMIN;
        if (!owner && !admin) {
            auditLogService.log(requesterId, "REPORT_ACCESS_DENIED",
                    "Attempted download of " + reportId, "reports", reportId);
            throw new AccessDeniedException("You do not have access to this report");
        }
        Path path = Path.of(report.getFilePath());
        if (!Files.exists(path)) {
            report.setStatus("EXPIRED");
            reportRepository.save(report);
            throw new ResourceNotFoundException("Report file has expired and is no longer available");
        }
        auditLogService.log(requesterId, "REPORT_EXPORT",
                "Downloaded " + report.getReportType() + " (" + report.getFileName() + ")",
                "reports", reportId);
        String contentType = ReportGeneratorService.contentType(
                ReportGeneratorService.parseFormat(report.getFormat()));
        return new FileDownload(path, report.getFileName(), contentType);
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
                .filtersJson(toJson(ReportFilter.from(params).asParams()))
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
        if (hasAny(params, "period", "startDate", "dateStart", "endDate", "dateEnd", "category")) {
            schedule.setFiltersJson(toJson(ReportFilter.from(params).asParams()));
        }
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

    /** Used by the scheduler: restores the persisted filter context. */
    public ReportFilter filterOf(ScheduledReport schedule) {
        Map<String, String> params = fromJson(schedule.getFiltersJson());
        params.put("period", schedule.getFrequency());
        return ReportFilter.from(params);
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private static boolean hasAny(Map<String, String> params, String... keys) {
        for (String k : keys) {
            String v = params.get(k);
            if (v != null && !v.isBlank()) {
                return true;
            }
        }
        return false;
    }

    private static String formatLabel(String requested) {
        return switch (ReportGeneratorService.parseFormat(requested)) {
            case EXCEL -> "excel";
            case CSV -> "csv";
            case PPTX -> "pptx";
            default -> "pdf";
        };
    }

    private String toJson(Map<String, String> params) {
        try {
            return objectMapper.writeValueAsString(params);
        } catch (Exception e) {
            log.warn("Could not serialize report filters", e);
            return "{}";
        }
    }

    private Map<String, String> fromJson(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, String>>() {
            });
        } catch (Exception e) {
            log.warn("Could not parse stored report filters", e);
            return new LinkedHashMap<>();
        }
    }

    /** Human summary of a stored filter map, mirroring ReportFilter.describe(). */
    private String describeFilters(Map<String, String> f) {
        if (f == null || f.isEmpty()) {
            return "Default period";
        }
        String start = firstNonBlank(f.get("startDate"), f.get("dateStart"));
        String end = firstNonBlank(f.get("endDate"), f.get("dateEnd"));
        StringBuilder sb = new StringBuilder();
        if (start != null && end != null) {
            sb.append(start).append(" to ").append(end);
        } else if (start != null) {
            sb.append("From ").append(start);
        } else {
            sb.append("Last ").append(f.getOrDefault("period", "month"));
        }
        String category = f.get("category");
        if (category != null && !category.isBlank()) {
            sb.append(" · Category: ").append(category);
        }
        return sb.toString();
    }

    private static String firstNonBlank(String a, String b) {
        return (a != null && !a.isBlank()) ? a : b;
    }

    private Map<String, Object> template(String id, String name, String description, boolean supportsDateRange) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("name", name);
        m.put("description", description);
        m.put("formats", List.of("pdf", "excel", "csv", "pptx"));
        m.put("supportsDateRange", supportsDateRange);
        return m;
    }

    private Map<String, Object> toReportMap(Report r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("reportId", r.getReportId());
        m.put("reportType", r.getReportType());
        m.put("format", r.getFormat());
        m.put("status", r.getStatus() != null ? r.getStatus().toLowerCase() : "ready");
        m.put("generatedAt", r.getGeneratedAt().toString());
        m.put("fileName", r.getFileName());
        m.put("filters", fromJson(r.getFiltersJson()));
        m.put("filterSummary", describeFilters(fromJson(r.getFiltersJson())));
        m.put("downloadUrl", "/api/reports/download/" + r.getReportId() + "/file");
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
        m.put("filters", fromJson(s.getFiltersJson()));
        m.put("active", s.getActive());
        m.put("nextRun", s.getNextRun() != null ? s.getNextRun().toString() : null);
        m.put("createdAt", s.getCreatedAt().toString());
        return m;
    }
}
