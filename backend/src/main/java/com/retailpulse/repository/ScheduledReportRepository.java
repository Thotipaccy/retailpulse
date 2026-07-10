package com.retailpulse.repository;

import com.retailpulse.model.ScheduledReport;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ScheduledReportRepository extends JpaRepository<ScheduledReport, String> {
    List<ScheduledReport> findByUserUserIdOrderByCreatedAtDesc(String userId);
    Optional<ScheduledReport> findByIdAndUserUserId(String id, String userId);
}
