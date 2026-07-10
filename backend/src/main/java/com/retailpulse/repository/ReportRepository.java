package com.retailpulse.repository;

import com.retailpulse.model.Report;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ReportRepository extends JpaRepository<Report, String> {
    List<Report> findByUserUserIdOrderByGeneratedAtDesc(String userId);
}
