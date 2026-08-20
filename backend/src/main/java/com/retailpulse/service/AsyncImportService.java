package com.retailpulse.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;


@Slf4j
@Service
@RequiredArgsConstructor
public class AsyncImportService {

    private final PosDataImportService posDataImportService;
    private final ImportJobService importJobService;
    private final AuditLogService auditLogService;
    private final ModelRetrainingScheduler retrainingScheduler;

    @Async("importTaskExecutor")
    public void runImport(String jobId, Path tempFile, String userId, String fileName) {
        try {
            List<Map<String, String>> rows = posDataImportService.parseRowsFromPath(tempFile);
            Map<String, Object> result = posDataImportService.importRowsBatched(rows, userId, fileName, jobId, importJobService);
            int imported = result.get("recordsImported") instanceof Number n ? n.intValue() : 0;
            auditLogService.log(userId, "DATA_UPLOAD",
                    "Uploaded " + imported + " records from " + result.get("fileName"),
                    "transactions", String.valueOf(result.get("transactions")));

            // Notify retraining scheduler — same 30-record threshold as manual sales.
            if (imported > 0) {
                retrainingScheduler.notifyNewRecord(imported);
            }

            importJobService.complete(jobId, result);
        } catch (Exception ex) {
            log.error("Async import {} failed: {}", jobId, ex.getMessage(), ex);
            importJobService.fail(jobId, ex.getMessage() != null ? ex.getMessage() : "Import failed");
        } finally {
            try {
                Files.deleteIfExists(tempFile);
            } catch (Exception ex) {
                log.warn("Could not delete temp import file {}: {}", tempFile, ex.getMessage());
            }
        }
    }
}
