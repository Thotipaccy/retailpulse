package com.retailpulse.controller;

import com.retailpulse.dto.response.ApiResponse;
import com.retailpulse.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    @GetMapping("/summary")
    public ApiResponse<Map<String, Object>> getSummary() {
        return ApiResponse.ok(dashboardService.getSummary());
    }

    @GetMapping("/recent-transactions")
    public ApiResponse<?> getRecentTransactions() {
        return ApiResponse.ok(dashboardService.getRecentTransactions());
    }

    @GetMapping("/recent-alerts")
    public ApiResponse<?> getRecentAlerts(Authentication auth) {
        return ApiResponse.ok(dashboardService.getRecentAlerts(auth.getName()));
    }

    @GetMapping("/sales-trend")
    public ApiResponse<?> getSalesTrend() {
        return ApiResponse.ok(dashboardService.getSalesTrend());
    }

    @GetMapping("/inventory-by-category")
    public ApiResponse<?> getInventoryByCategory() {
        return ApiResponse.ok(dashboardService.getInventoryStatusByCategory());
    }

    @GetMapping("/top-demand-products")
    public ApiResponse<?> getTopDemandProducts(@RequestParam(defaultValue = "3") int limit) {
        return ApiResponse.ok(dashboardService.getTopDemandProducts(limit));
    }
}
