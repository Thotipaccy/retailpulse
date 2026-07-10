package com.retailpulse.controller;

import com.retailpulse.dto.response.ApiResponse;
import com.retailpulse.service.AIServiceClient;
import com.retailpulse.service.AuditLogService;
import com.retailpulse.service.BackupService;
import com.retailpulse.service.RolePermissionService;
import com.retailpulse.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final UserService userService;
    private final AuditLogService auditLogService;
    private final AIServiceClient aiServiceClient;
    private final BackupService backupService;
    private final RolePermissionService rolePermissionService;
    private final com.retailpulse.config.ApplicationUptime applicationUptime;

    @GetMapping("/users")
    public ApiResponse<?> getUsers() {
        return ApiResponse.ok(userService.getAllUsers());
    }

    @PostMapping("/users")
    public ApiResponse<?> createUser(@RequestBody Map<String, Object> request) {
        return ApiResponse.ok(userService.createUser(request), "User created");
    }

    @PutMapping("/users/{id}")
    public ApiResponse<?> updateUser(@PathVariable String id, @RequestBody Map<String, Object> request) {
        return ApiResponse.ok(userService.updateUser(id, request), "User updated");
    }

    @DeleteMapping("/users/{id}")
    public ApiResponse<?> deleteUser(@PathVariable String id) {
        userService.deleteUser(id);
        return ApiResponse.ok(null, "User deactivated");
    }

    @GetMapping("/audit-logs")
    public ApiResponse<?> getAuditLogs() {
        return ApiResponse.ok(auditLogService.getRecentLogs(50));
    }

    @GetMapping("/system-health")
    public ApiResponse<?> getSystemHealth() {
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("status", "UP");
        health.put("database", "CONNECTED");
        health.put("apiVersion", "1.0.0");
        health.put("uptime", applicationUptime.formattedUptime());
        var backups = backupService.listBackups();
        if (backups.isEmpty()) {
            health.put("lastBackup", null);
        } else {
            Object createdAt = backups.get(0).get("createdAt");
            health.put("lastBackup", createdAt != null ? createdAt.toString() : null);
        }
        health.put("activeUsers", userService.getAllUsers().stream()
                .filter(u -> Boolean.TRUE.equals(u.get("isActive"))).count());
        health.put("aiService", aiServiceClient.getHealthDetails());
        return ApiResponse.ok(health);
    }

    @PostMapping("/backup")
    public ApiResponse<?> triggerBackup(Authentication auth) {
        return ApiResponse.ok(backupService.triggerBackup(auth.getName()), "Backup completed");
    }

    @GetMapping("/backups")
    public ApiResponse<?> listBackups() {
        return ApiResponse.ok(backupService.listBackups());
    }

    @PostMapping("/restore")
    public ApiResponse<?> restore(@RequestBody Map<String, Object> body) {
        String backupId = String.valueOf(body.get("backupId"));
        boolean confirm = Boolean.TRUE.equals(body.get("confirm"));
        return ApiResponse.ok(backupService.restore(backupId, confirm), "Restore completed");
    }

    @GetMapping("/roles/permissions")
    public ApiResponse<?> getRolePermissions() {
        return ApiResponse.ok(rolePermissionService.getAllRolePermissions());
    }

    @PutMapping("/roles/{role}/permissions")
    public ApiResponse<?> updateRolePermissions(@PathVariable String role, @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<String> permissions = (List<String>) body.get("permissions");
        return ApiResponse.ok(rolePermissionService.updateRolePermissions(role, permissions != null ? permissions : List.of()));
    }
}
