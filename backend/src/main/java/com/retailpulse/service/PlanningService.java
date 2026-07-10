package com.retailpulse.service;

import com.retailpulse.model.*;
import com.retailpulse.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class PlanningService {

    private final StrategicGoalRepository strategicGoalRepository;
    private final GrowthOpportunityRepository growthOpportunityRepository;
    private final BudgetAllocationRepository budgetAllocationRepository;
    private final RoiInvestmentRepository roiInvestmentRepository;

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getGoals() {
        return strategicGoalRepository.findAllByOrderByDeadlineAsc().stream()
                .map(this::toGoalMap)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getOpportunities() {
        return growthOpportunityRepository.findAllByOrderByEstimatedValueDesc().stream()
                .map(this::toOpportunityMap)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getBudget() {
        return budgetAllocationRepository.findAllByOrderByCategoryAsc().stream()
                .map(this::toBudgetMap)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getRoi() {
        return roiInvestmentRepository.findAllByOrderByRoiDesc().stream()
                .map(this::toRoiMap)
                .toList();
    }

    private Map<String, Object> toGoalMap(StrategicGoal g) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", g.getId());
        m.put("goal", g.getGoal());
        m.put("progress", g.getProgress());
        m.put("deadline", g.getDeadline().toString());
        m.put("owner", g.getOwner());
        return m;
    }

    private Map<String, Object> toOpportunityMap(GrowthOpportunity o) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", o.getId());
        m.put("name", o.getName());
        m.put("impact", o.getImpact());
        m.put("confidence", o.getConfidence());
        m.put("estimatedValue", o.getEstimatedValue());
        return m;
    }

    private Map<String, Object> toBudgetMap(BudgetAllocation b) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", b.getId());
        m.put("category", b.getCategory());
        m.put("allocated", b.getAllocated());
        m.put("spent", b.getSpent());
        m.put("remaining", b.getAllocated().subtract(b.getSpent()));
        return m;
    }

    private Map<String, Object> toRoiMap(RoiInvestment r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("initiative", r.getInitiative());
        m.put("invested", r.getInvested());
        m.put("roi", r.getRoi());
        m.put("status", r.getStatus());
        return m;
    }
}
