package com.retailpulse.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.retailpulse.model.RolePermission;
import com.retailpulse.repository.RolePermissionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
@RequiredArgsConstructor
public class RolePermissionService {

    public static final List<String> ALL_PERMISSIONS = List.of(
            "view_dashboard",
            "manage_products",
            "manage_users",
            "view_analytics",
            "export_reports",
            "manage_system"
    );

    private static final Map<String, List<String>> DEFAULTS = Map.of(
            "administrator", List.of("view_dashboard", "manage_products", "manage_users", "view_analytics", "export_reports", "manage_system"),
            "manager", List.of("view_dashboard", "manage_products", "view_analytics", "export_reports"),
            "analyst", List.of("view_dashboard", "view_analytics", "export_reports"),
            "viewer", List.of("view_dashboard", "view_analytics")
    );

    private final RolePermissionRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Transactional(readOnly = true)
    public Map<String, List<String>> getAllRolePermissions() {
        Map<String, List<String>> result = new LinkedHashMap<>();
        for (String role : List.of("administrator", "manager", "analyst", "viewer")) {
            result.put(role, getPermissionsForRole(role));
        }
        return result;
    }

    @Transactional(readOnly = true)
    public List<String> getPermissionsForRole(String role) {
        return repository.findById(role)
                .map(rp -> parsePermissions(rp.getPermissionsJson()))
                .orElse(DEFAULTS.getOrDefault(role, List.of("view_dashboard")));
    }

    @Transactional
    public Map<String, List<String>> updateRolePermissions(String role, List<String> permissions) {
        List<String> sanitized = permissions.stream()
                .filter(ALL_PERMISSIONS::contains)
                .distinct()
                .toList();
        if (sanitized.isEmpty()) {
            sanitized = DEFAULTS.getOrDefault(role, List.of("view_dashboard"));
        }
        try {
            String json = objectMapper.writeValueAsString(sanitized);
            repository.save(RolePermission.builder().role(role).permissionsJson(json).build());
        } catch (Exception ex) {
            throw new com.retailpulse.exception.BadRequestException("Invalid permissions payload");
        }
        return Map.of(role, sanitized);
    }

    @Transactional
    public void ensureDefaults() {
        for (Map.Entry<String, List<String>> entry : DEFAULTS.entrySet()) {
            if (repository.findById(entry.getKey()).isEmpty()) {
                try {
                    String json = objectMapper.writeValueAsString(entry.getValue());
                    repository.save(RolePermission.builder().role(entry.getKey()).permissionsJson(json).build());
                } catch (Exception ignored) {
                    // skip seed failure
                }
            }
        }
    }

    private List<String> parsePermissions(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception ex) {
            return List.of("view_dashboard");
        }
    }
}
