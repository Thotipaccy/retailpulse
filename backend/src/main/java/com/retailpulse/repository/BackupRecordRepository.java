package com.retailpulse.repository;

import com.retailpulse.model.BackupRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface BackupRecordRepository extends JpaRepository<BackupRecord, String> {

    @Query("SELECT b FROM BackupRecord b JOIN FETCH b.createdBy ORDER BY b.createdAt DESC")
    List<BackupRecord> findAllByOrderByCreatedAtDesc();
}
