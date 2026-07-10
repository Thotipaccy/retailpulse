package com.retailpulse.repository;

import com.retailpulse.model.RoiInvestment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RoiInvestmentRepository extends JpaRepository<RoiInvestment, String> {
    List<RoiInvestment> findAllByOrderByRoiDesc();
}
