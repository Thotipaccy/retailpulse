package com.retailpulse.controller;

import com.retailpulse.dto.response.ApiResponse;
import com.retailpulse.service.SalesService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sales")
@RequiredArgsConstructor
public class SalesController {

    private final SalesService salesService;

    @GetMapping("/overview")
    public ApiResponse<?> getOverview(
            @RequestParam(defaultValue = "daily") String period,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return ApiResponse.ok(salesService.getOverview(period, startDate, endDate));
    }

    @GetMapping("/by-category")
    public ApiResponse<?> getByCategory(
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return ApiResponse.ok(salesService.getByCategory(period, startDate, endDate));
    }

    @GetMapping("/by-payment-method")
    public ApiResponse<?> getByPaymentMethod(
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return ApiResponse.ok(salesService.getByPaymentMethod(period, startDate, endDate));
    }

    @GetMapping("/top-products")
    public ApiResponse<?> getTopProducts(
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return ApiResponse.ok(salesService.getTopProducts(limit, period, startDate, endDate));
    }

    @GetMapping("/heatmap")
    public ApiResponse<?> getHeatmap(
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return ApiResponse.ok(salesService.getHeatmap(period, startDate, endDate));
    }
}
