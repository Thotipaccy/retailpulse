package com.retailpulse.controller;

import com.retailpulse.dto.response.ApiResponse;
import com.retailpulse.service.ForecastService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;


@RestController
@RequestMapping("/api/forecast")
@RequiredArgsConstructor
public class ForecastController {

    private final ForecastService forecastService;

    @GetMapping("/status")
    public ApiResponse<?> getStatus() {
        return ApiResponse.ok(forecastService.getStatus());
    }

    @GetMapping("/demand")
    public ApiResponse<?> getDemand(
            @RequestParam(defaultValue = "daily") String horizon,
            @RequestParam(defaultValue = "all") String scope,
            @RequestParam(required = false) String id) {
        return ApiResponse.ok(forecastService.generateDemandForecast(horizon, scope, id), "Forecast generated");
    }

    @GetMapping("/product/{id}")
    public ApiResponse<?> getProductForecast(
            @PathVariable String id,
            @RequestParam(defaultValue = "weekly") String horizon) {
        return ApiResponse.ok(forecastService.getProductForecast(id, horizon));
    }

    @GetMapping("/accuracy")
    public ApiResponse<?> getAccuracy() {
        return ApiResponse.ok(forecastService.getAccuracy());
    }
}
