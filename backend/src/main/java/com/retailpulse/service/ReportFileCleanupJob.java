package com.retailpulse.service;

import com.retailpulse.model.Report;
import com.retailpulse.repository.ReportRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.stream.Stream;

/**
 * Retention policy for generated report artifacts: files older than 30 days
 * are deleted and their Report rows marked EXPIRED so history stays honest
 * ("expired" instead of a dead download link). Runs daily at 03:30.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReportFileCleanupJob {

    static final int RETENTION_DAYS = 30;

    private final ReportRepository reportRepository;

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void purgeExpiredReports() {
        LocalDateTime cutoff = LocalDateTime.now().minus(RETENTION_DAYS, ChronoUnit.DAYS);

        List<Report> stale = reportRepository.findByGeneratedAtBeforeAndStatus(cutoff, "READY");
        int deleted = 0;
        for (Report report : stale) {
            try {
                Files.deleteIfExists(Path.of(report.getFilePath()));
                report.setStatus("EXPIRED");
                deleted++;
            } catch (IOException e) {
                log.warn("Could not delete expired report file {}", report.getFilePath(), e);
            }
        }
        if (deleted > 0) {
            log.info("Marked {} reports EXPIRED (older than {} days)", deleted, RETENTION_DAYS);
        }

        // Safety net: remove orphans in the reports dir not referenced by any READY row.
        cleanupOrphans();
    }

    private void cleanupOrphans() {
        try (Stream<Path> files = Files.list(ReportGeneratorService.REPORTS_DIR)) {
            List<String> referenced = reportRepository.findAll().stream()
                    .filter(r -> !"EXPIRED".equals(r.getStatus()) && r.getFilePath() != null)
                    .map(r -> Path.of(r.getFilePath()).getFileName().toString())
                    .toList();
            long removed = files
                    .filter(Files::isRegularFile)
                    .filter(p -> !referenced.contains(p.getFileName().toString()))
                    .peek(p -> {
                        try {
                            Files.deleteIfExists(p);
                        } catch (IOException ignored) {
                        }
                    })
                    .count();
            if (removed > 0) {
                log.info("Removed {} orphaned report artifacts", removed);
            }
        } catch (IOException e) {
            log.debug("Reports dir not present; nothing to clean", e);
        }
    }
}
