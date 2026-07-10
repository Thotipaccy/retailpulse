package com.retailpulse.repository;

import com.retailpulse.model.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLog, String> {
    List<AuditLog> findTop50ByOrderByCreatedAtDesc();
    List<AuditLog> findByUserUserIdOrderByCreatedAtDesc(String userId);
    List<AuditLog> findByActionType(String actionType);
}
