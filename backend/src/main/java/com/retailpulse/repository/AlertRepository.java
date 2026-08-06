package com.retailpulse.repository;

import com.retailpulse.model.Alert;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AlertRepository extends JpaRepository<Alert, String> {
    List<Alert> findByUserUserIdOrderByCreatedAtDesc(String userId);
    List<Alert> findByUserUserIdAndIsReadFalseOrderByCreatedAtDesc(String userId);
    List<Alert> findByUserUserIdAndIsReadFalse(String userId);
    long countByUserUserIdAndIsReadFalse(String userId);
    long countByIsReadFalse();
    long countByUserUserId(String userId);
    List<Alert> findByCreatedAtAfter(java.time.LocalDateTime date);
}
