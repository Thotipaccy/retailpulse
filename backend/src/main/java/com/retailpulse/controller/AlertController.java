package com.retailpulse.controller;

import com.retailpulse.dto.response.ApiResponse;
import com.retailpulse.service.AlertService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/alerts")
@RequiredArgsConstructor
public class AlertController {

    private final AlertService alertService;

    @GetMapping
    public ApiResponse<?> getAlerts(
            @RequestParam(defaultValue = "all") String filter,
            Authentication auth) {
        return ApiResponse.ok(alertService.getAlerts(resolveUserId(auth), filter));
    }

    @PutMapping("/{id}/read")
    public ApiResponse<?> markAsRead(@PathVariable String id, Authentication auth) {
        return ApiResponse.ok(alertService.markAsRead(resolveUserId(auth), id), "Alert marked as read");
    }

    @DeleteMapping("/{id}")
    public ApiResponse<?> deleteAlert(@PathVariable String id, Authentication auth) {
        return ApiResponse.ok(alertService.deleteAlert(resolveUserId(auth), id), "Alert deleted");
    }

    @DeleteMapping("/clear-all")
    public ApiResponse<?> clearAllAlerts(Authentication auth) {
        return ApiResponse.ok(alertService.clearAllAlerts(resolveUserId(auth)), "All alerts cleared");
    }

    @PutMapping("/read-all")
    public ApiResponse<?> markAllRead(Authentication auth) {
        return ApiResponse.ok(alertService.markAllRead(resolveUserId(auth)), "All alerts marked as read");
    }

    @GetMapping("/rules")
    public ApiResponse<?> getRules(Authentication auth) {
        return ApiResponse.ok(alertService.getRules(resolveUserId(auth)));
    }

    @PutMapping("/rules/{ruleId}")
    public ApiResponse<?> updateRule(@PathVariable String ruleId, @RequestBody Map<String, Object> body, Authentication auth) {
        return ApiResponse.ok(alertService.updateRule(resolveUserId(auth), ruleId, body), "Alert rule updated");
    }

    @GetMapping("/preferences")
    public ApiResponse<?> getPreferences(Authentication auth) {
        return ApiResponse.ok(alertService.getPreferences(resolveUserId(auth)));
    }

    @PutMapping("/preferences")
    public ApiResponse<?> savePreferences(@RequestBody Map<String, Object> body, Authentication auth) {
        return ApiResponse.ok(alertService.savePreferences(resolveUserId(auth), body), "Preferences saved");
    }

    @PostMapping("/preferences/reset")
    public ApiResponse<?> resetPreferences(Authentication auth) {
        return ApiResponse.ok(alertService.resetPreferences(resolveUserId(auth)), "Preferences reset to defaults");
    }

    /** Converts auth principal to the database userId */
    private String resolveUserId(Authentication auth) {
        // JwtAuthenticationFilter already sets the principal to the userId, not the email
        return auth.getName();
    }
}
