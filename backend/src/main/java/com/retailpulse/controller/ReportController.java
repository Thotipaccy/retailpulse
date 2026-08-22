package com.retailpulse.controller;

import com.retailpulse.dto.response.ApiResponse;
import com.retailpulse.service.ReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.net.MalformedURLException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;

    @GetMapping("/templates")
    public ApiResponse<?> getTemplates() {
        return ApiResponse.ok(reportService.getTemplates());
    }

    @PostMapping("/generate")
    public ApiResponse<?> generate(@RequestBody Map<String, String> params, Authentication auth) {
        return ApiResponse.ok(reportService.generateReport(auth.getName(), params), "Report generated");
    }

    @GetMapping("/history")
    public ApiResponse<?> getHistory(Authentication auth) {
        return ApiResponse.ok(reportService.getHistory(auth.getName()));
    }

    @GetMapping("/download/{id}")
    public ApiResponse<?> download(@PathVariable String id, Authentication auth) {
        return ApiResponse.ok(reportService.download(id));
    }

    @GetMapping("/scheduled")
    public ApiResponse<?> getScheduled(Authentication auth) {
        return ApiResponse.ok(reportService.getScheduled(auth.getName()));
    }

    @PostMapping("/schedule")
    public ApiResponse<?> createSchedule(@RequestBody Map<String, String> params, Authentication auth) {
        return ApiResponse.ok(reportService.createSchedule(auth.getName(), params), "Schedule created");
    }

    @PutMapping("/schedule/{id}")
    public ApiResponse<?> updateSchedule(@PathVariable String id, @RequestBody Map<String, String> params, Authentication auth) {
        return ApiResponse.ok(reportService.updateSchedule(auth.getName(), id, params), "Schedule updated");
    }

    @DeleteMapping("/schedule/{id}")
    public ApiResponse<?> deleteSchedule(@PathVariable String id, Authentication auth) {
        reportService.deleteSchedule(auth.getName(), id);
        return ApiResponse.ok(null, "Schedule deleted");
    }

    /**
     * Streams the generated artifact. Ownership is verified and the export is
     * audited inside ReportService.prepareDownload; the stored (human-readable)
     * file name is sent via Content-Disposition.
     */
    @GetMapping("/download/{id}/file")
    public ResponseEntity<Resource> downloadFile(@PathVariable String id, Authentication auth) {
        ReportService.FileDownload dl = reportService.prepareDownload(id, auth.getName());
        try {
            Resource resource = new UrlResource(dl.path().toUri());
            String encoded = java.net.URLEncoder.encode(dl.fileName(), StandardCharsets.UTF_8)
                    .replace("+", "%20");
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + dl.fileName() + "\"; filename*=UTF-8''" + encoded)
                    .contentType(MediaType.parseMediaType(dl.contentType()))
                    .contentLength(dl.path().toFile().length())
                    .body(resource);
        } catch (MalformedURLException e) {
            throw new RuntimeException("Error accessing report file", e);
        }
    }
}
