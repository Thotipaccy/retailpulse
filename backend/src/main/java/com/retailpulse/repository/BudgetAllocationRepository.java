package com.retailpulse.repository;

import com.retailpulse.model.BudgetAllocation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BudgetAllocationRepository extends JpaRepository<BudgetAllocation, String> {
    List<BudgetAllocation> findAllByOrderByCategoryAsc();
}
