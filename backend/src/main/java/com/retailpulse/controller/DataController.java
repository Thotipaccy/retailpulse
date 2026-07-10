package com.retailpulse.controller;

import com.retailpulse.dto.request.CreateScheduledImportRequest;
import com.retailpulse.dto.request.DataSourceUpdateRequest;
import com.retailpulse.dto.request.ToggleDataSourceRequest;
import com.retailpulse.dto.response.ApiResponse;
import com.retailpulse.service.DataCollectionService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/data")
@RequiredArgsConstructor
public class DataController {

    private final DataCollectionService dataCollectionService;

    @GetMapping("/sources")
    public ApiResponse<?> getSources() {
        return ApiResponse.ok(dataCollectionService.getSources());
    }

    @GetMapping("/quality")
    public ApiResponse<?> getQualityMetrics() {
        return ApiResponse.ok(dataCollectionService.getQualityMetrics());
    }

    @PostMapping("/upload")
    public ApiResponse<?> upload(@RequestParam("file") MultipartFile file, Authentication auth) {
        return ApiResponse.ok(dataCollectionService.startUpload(file, auth.getName()), "Import started");
    }

    @GetMapping("/upload/status/{jobId}")
    public ApiResponse<?> uploadStatus(@PathVariable String jobId) {
        return ApiResponse.ok(dataCollectionService.getImportStatus(jobId));
    }

    @PostMapping("/import-90day-sample")
    public ApiResponse<?> import90DaySample(Authentication auth) {
        return ApiResponse.ok(dataCollectionService.importSample90Days(auth.getName()), "90-day sample imported");
    }

    @GetMapping("/scheduled-imports")
    public ApiResponse<?> getScheduledImports() {
        return ApiResponse.ok(dataCollectionService.getScheduledImports());
    }

    @PostMapping("/scheduled-imports")
    public ApiResponse<?> createScheduledImport(@RequestBody CreateScheduledImportRequest request) {
        return ApiResponse.ok(dataCollectionService.createScheduledImport(request), "Schedule created");
    }

    @PutMapping("/scheduled-imports/{id}")
    public ApiResponse<?> updateScheduledImport(@PathVariable String id, @RequestBody CreateScheduledImportRequest request) {
        return ApiResponse.ok(dataCollectionService.updateScheduledImport(id, request), "Schedule updated");
    }

    @DeleteMapping("/scheduled-imports/{id}")
    public ApiResponse<?> deleteScheduledImport(@PathVariable String id) {
        dataCollectionService.deleteScheduledImport(id);
        return ApiResponse.ok(null, "Schedule deleted");
    }

    @PutMapping("/sources/{id}")
    public ApiResponse<?> updateSource(@PathVariable String id, @RequestBody DataSourceUpdateRequest request) {
        return ApiResponse.ok(dataCollectionService.updateSource(id, request), "Source updated");
    }

    @PatchMapping("/sources/{id}/active")
    public ApiResponse<?> toggleSource(@PathVariable String id, @RequestBody ToggleDataSourceRequest request) {
        boolean active = request.getActive() != null && request.getActive();
        return ApiResponse.ok(dataCollectionService.toggleSource(id, active), active ? "Source activated" : "Source deactivated");
    }

    @PostMapping("/sources/{id}/test")
    public ApiResponse<?> testConnection(@PathVariable String id) {
        return ApiResponse.ok(dataCollectionService.testConnection(id));
    }

    @PostMapping("/sources/{id}/sync")
    public ApiResponse<?> syncSource(@PathVariable String id, Authentication auth) {
        return ApiResponse.ok(dataCollectionService.syncSource(id, auth.getName()), "Source synced");
    }
}
