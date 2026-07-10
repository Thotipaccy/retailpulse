package com.retailpulse.service;

import com.retailpulse.model.ScheduledImport;
import com.retailpulse.model.enums.ScheduledImportStatus;
import com.retailpulse.repository.DataSourceRepository;
import com.retailpulse.repository.ScheduledImportRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class ScheduledImportRunner {

    private static final String SYSTEM_USER_ID = "u1";

    private final ScheduledImportRepository scheduledImportRepository;
    private final DataSourceRepository dataSourceRepository;
    private final DataSourceService dataSourceService;
    private final AuditLogService auditLogService;
    private final AlertService alertService;

    // Disabled in development — automatic POS imports consume DB time and can overlap manual uploads
    // @Scheduled(fixedRate = 300_000)
    @Transactional
    public void runDueImports() {
        List<ScheduledImport> due = scheduledImportRepository.findByStatusAndNextRunLessThanEqual(
                ScheduledImportStatus.ACTIVE, LocalDateTime.now());
        for (ScheduledImport job : due) {
            executeImport(job);
        }
    }

    // @Scheduled(cron = "0 0 6 * * *")
    public void runDailyImports() {
        scheduledImportRepository.findAll().stream()
                .filter(j -> j.getStatus() == ScheduledImportStatus.ACTIVE)
                .filter(j -> j.getFrequency() != null && j.getFrequency().toLowerCase().contains("daily"))
                .forEach(this::executeImport);
    }

    // @Scheduled(cron = "0 0 */4 * * *")
    public void runFourHourImports() {
        scheduledImportRepository.findAll().stream()
                .filter(j -> j.getStatus() == ScheduledImportStatus.ACTIVE)
                .filter(j -> j.getFrequency() != null && j.getFrequency().toLowerCase().contains("4 hour"))
                .forEach(this::executeImport);
    }

    // @Scheduled(cron = "0 0 7 * * MON")
    public void runWeeklyImports() {
        scheduledImportRepository.findAll().stream()
                .filter(j -> j.getStatus() == ScheduledImportStatus.ACTIVE)
                .filter(j -> j.getFrequency() != null && j.getFrequency().toLowerCase().contains("weekly"))
                .forEach(this::executeImport);
    }

    private void executeImport(ScheduledImport job) {
        try {
            dataSourceRepository.findAll().stream()
                    .filter(ds -> ds.getName().equalsIgnoreCase(job.getSourceName()))
                    .findFirst()
                    .ifPresentOrElse(ds -> {
                        Map<String, Object> result = dataSourceService.syncSource(ds.getId(), SYSTEM_USER_ID);
                        job.setLastRun(LocalDateTime.now());
                        job.setRecordsImported(((Number) result.getOrDefault("recordsImported", 0)).longValue());
                        job.setNextRun(calculateNextRun(job.getFrequency()));
                        scheduledImportRepository.save(job);
                        auditLogService.logSystem("SCHEDULED_IMPORT",
                                "Executed " + job.getName() + ": " + result.getOrDefault("recordsImported", 0) + " records",
                                "scheduled_imports", job.getId());
                    }, () -> {
                        job.setLastRun(LocalDateTime.now());
                        job.setNextRun(calculateNextRun(job.getFrequency()));
                        scheduledImportRepository.save(job);
                        auditLogService.logSystem("SCHEDULED_IMPORT_SKIPPED",
                                "No data source found for " + job.getSourceName(),
                                "scheduled_imports", job.getId());
                    });
        } catch (Exception ex) {
            log.error("Scheduled import {} failed: {}", job.getName(), ex.getMessage());
            auditLogService.logSystem("SCHEDULED_IMPORT_FAILED",
                    job.getName() + " failed: " + ex.getMessage(),
                    "scheduled_imports", job.getId());
            alertService.createSystemAlert("Scheduled Import Failed",
                    job.getName() + " failed: " + ex.getMessage(), "high");
        }
    }

    private LocalDateTime calculateNextRun(String frequency) {
        if (frequency == null) return LocalDateTime.now().plusDays(1);
        String f = frequency.toLowerCase();
        if (f.contains("15 min")) return LocalDateTime.now().plusMinutes(15);
        if (f.contains("hour")) return LocalDateTime.now().plusHours(1);
        if (f.contains("4 hour")) return LocalDateTime.now().plusHours(4);
        if (f.contains("weekly")) return LocalDateTime.now().plusWeeks(1);
        return LocalDateTime.now().plusDays(1);
    }
}
