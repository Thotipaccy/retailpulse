package com.retailpulse.controller;

import com.retailpulse.dto.response.ApiResponse;
import com.retailpulse.service.PlanningService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/planning")
@RequiredArgsConstructor
public class PlanningController {

    private final PlanningService planningService;

    @GetMapping("/goals")
    public ApiResponse<?> getGoals() {
        return ApiResponse.ok(planningService.getGoals());
    }

    @GetMapping("/opportunities")
    public ApiResponse<?> getOpportunities() {
        return ApiResponse.ok(planningService.getOpportunities());
    }

    @GetMapping("/budget")
    public ApiResponse<?> getBudget() {
        return ApiResponse.ok(planningService.getBudget());
    }

    @GetMapping("/roi")
    public ApiResponse<?> getRoi() {
        return ApiResponse.ok(planningService.getRoi());
    }
}
