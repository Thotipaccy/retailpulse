package com.retailpulse.repository;

import com.retailpulse.model.AlertDigestQueue;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface AlertDigestQueueRepository extends JpaRepository<AlertDigestQueue, String> {

    List<AlertDigestQueue> findByUserUserIdAndSentAtIsNullOrderByCreatedAtDesc(String userId);

    List<AlertDigestQueue> findBySentAtIsNullAndCreatedAtBefore(LocalDateTime before);
}
