package com.retailpulse.repository;

import com.retailpulse.model.Alert;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface AlertRepository extends JpaRepository<Alert, String> {
    List<Alert> findByUserUserIdOrderByCreatedAtDesc(String userId);
    List<Alert> findByUserUserIdAndIsReadFalseOrderByCreatedAtDesc(String userId);
    List<Alert> findByUserUserIdAndIsReadFalse(String userId);
    long countByUserUserIdAndIsReadFalse(String userId);
    long countByIsReadFalse();
    long countByUserUserId(String userId);
    List<Alert> findByCreatedAtAfter(LocalDateTime date);
    void deleteByUserUserId(String userId);

    boolean existsByUserUserIdAndAlertTypeAndCreatedAtAfter(String userId, String alertType, LocalDateTime after);

    @Modifying
    @Query("UPDATE Alert a SET a.isRead = true WHERE a.user.userId = :userId AND a.isRead = false")
    int markAllReadForUser(@Param("userId") String userId);
}
