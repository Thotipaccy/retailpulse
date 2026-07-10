package com.retailpulse.repository;

import com.retailpulse.model.DataSource;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DataSourceRepository extends JpaRepository<DataSource, String> {
    List<DataSource> findByIsActiveTrueOrderByNameAsc();

    List<DataSource> findAllByOrderByNameAsc();
}
