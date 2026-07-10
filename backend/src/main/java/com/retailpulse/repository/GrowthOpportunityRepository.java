package com.retailpulse.repository;

import com.retailpulse.model.GrowthOpportunity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GrowthOpportunityRepository extends JpaRepository<GrowthOpportunity, String> {
    List<GrowthOpportunity> findAllByOrderByEstimatedValueDesc();
}
