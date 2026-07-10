package com.retailpulse.service;

import com.retailpulse.model.AuditLog;
import com.retailpulse.model.User;
import com.retailpulse.repository.AuditLogRepository;
import com.retailpulse.security.CustomUserDetailsService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuditLogService {

    private static final String SYSTEM_USER_ID = "u1";

    private final AuditLogRepository auditLogRepository;
    private final CustomUserDetailsService userDetailsService;

    @Transactional
    public void log(String userId, String actionType, String description, String affectedEntity, String affectedEntityId) {
        User user = userDetailsService.loadEntityById(userId != null ? userId : SYSTEM_USER_ID);
        auditLogRepository.save(AuditLog.builder()
                .logId("log-" + UUID.randomUUID().toString().substring(0, 8))
                .user(user)
                .actionType(actionType)
                .description(description)
                .affectedEntity(affectedEntity)
                .affectedEntityId(affectedEntityId)
                .ipAddress(resolveIpAddress())
                .createdAt(LocalDateTime.now())
                .build());
    }

    @Transactional
    public void logSystem(String actionType, String description, String affectedEntity, String affectedEntityId) {
        log(SYSTEM_USER_ID, actionType, description, affectedEntity, affectedEntityId);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getRecentLogs(int limit) {
        return auditLogRepository.findTop50ByOrderByCreatedAtDesc().stream()
                .limit(limit)
                .map(this::toMap)
                .toList();
    }

    private Map<String, Object> toMap(AuditLog log) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("logId", log.getLogId());
        User user = log.getUser();
        m.put("userId", user != null ? user.getUserId() : "system");
        m.put("userName", user != null ? user.getFullName() : "System");
        m.put("actionType", log.getActionType());
        m.put("description", log.getDescription());
        m.put("ipAddress", log.getIpAddress());
        m.put("createdAt", log.getCreatedAt().toString());
        return m;
    }

    private String resolveIpAddress() {
        try {
            ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs != null) {
                HttpServletRequest request = attrs.getRequest();
                String forwarded = request.getHeader("X-Forwarded-For");
                if (forwarded != null && !forwarded.isBlank()) {
                    return forwarded.split(",")[0].trim();
                }
                return request.getRemoteAddr();
            }
        } catch (Exception ignored) {
        }
        return "127.0.0.1";
    }
}
