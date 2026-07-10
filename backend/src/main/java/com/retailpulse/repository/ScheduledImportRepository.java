package com.retailpulse.repository;

import com.retailpulse.model.ScheduledImport;
import com.retailpulse.model.enums.ScheduledImportStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface ScheduledImportRepository extends JpaRepository<ScheduledImport, String> {
    List<ScheduledImport> findAllByOrderByNextRunAsc();

    List<ScheduledImport> findByStatusAndNextRunLessThanEqual(ScheduledImportStatus status, LocalDateTime nextRun);
}
