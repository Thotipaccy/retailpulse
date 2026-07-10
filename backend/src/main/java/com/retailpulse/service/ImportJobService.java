package com.retailpulse.service;

import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ImportJobService {

    private final ConcurrentHashMap<String, Map<String, Object>> jobs = new ConcurrentHashMap<>();

    public String createJob(String fileName, int totalRecords) {
        String jobId = "imp-" + UUID.randomUUID().toString().substring(0, 8);
        Map<String, Object> job = new LinkedHashMap<>();
        job.put("jobId", jobId);
        job.put("fileName", fileName);
        job.put("status", "STARTED");
        job.put("totalRecords", totalRecords);
        job.put("processedRecords", 0);
        job.put("currentBatch", 0);
        job.put("totalBatches", totalRecords == 0 ? 0 : (int) Math.ceil(totalRecords / 100.0));
        job.put("message", "Import started");
        job.put("startedAt", LocalDateTime.now().toString());
        jobs.put(jobId, job);
        return jobId;
    }

    public void updateProgress(String jobId, int processedRecords, int currentBatch, int totalBatches, String message) {
        Map<String, Object> job = jobs.get(jobId);
        if (job == null) return;
        job.put("status", "RUNNING");
        job.put("processedRecords", processedRecords);
        job.put("currentBatch", currentBatch);
        job.put("totalBatches", totalBatches);
        job.put("message", message);
    }

    public void setTotalRecords(String jobId, int totalRecords) {
        Map<String, Object> job = jobs.get(jobId);
        if (job == null) return;
        job.put("totalRecords", totalRecords);
        job.put("totalBatches", totalRecords == 0 ? 0 : (int) Math.ceil(totalRecords / 100.0));
    }

    public void complete(String jobId, Map<String, Object> result) {
        Map<String, Object> job = jobs.get(jobId);
        if (job == null) return;
        job.put("status", "COMPLETED");
        job.put("result", result);
        job.put("processedRecords", result.getOrDefault("recordsImported", job.get("totalRecords")));
        job.put("message", "Import completed");
        job.put("completedAt", LocalDateTime.now().toString());
    }

    public void failRow(String jobId, Map<String, String> row, String reason) {
        Map<String, Object> job = jobs.get(jobId);
        if (job == null) return;
        @SuppressWarnings("unchecked")
        java.util.List<Map<String, Object>> rejected = (java.util.List<Map<String, Object>>) job.computeIfAbsent("rejectedRows", k -> new java.util.ArrayList<>());
        Map<String, Object> rejectEntry = new LinkedHashMap<>();
        rejectEntry.put("reason", reason);
        rejectEntry.put("row", row);
        rejected.add(rejectEntry);
    }

    public void fail(String jobId, String error) {
        Map<String, Object> job = jobs.get(jobId);
        if (job == null) return;
        job.put("status", "FAILED");
        job.put("error", error);
        job.put("message", error);
        job.put("completedAt", LocalDateTime.now().toString());
    }

    public Map<String, Object> getStatus(String jobId) {
        Map<String, Object> job = jobs.get(jobId);
        if (job == null) {
            Map<String, Object> missing = new LinkedHashMap<>();
            missing.put("jobId", jobId);
            missing.put("status", "NOT_FOUND");
            missing.put("message", "Import job not found");
            return missing;
        }
        return new LinkedHashMap<>(job);
    }
}
