package com.retailpulse.controller;

import com.retailpulse.dto.response.ApiResponse;
import com.retailpulse.service.RecommendationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/recommendations")
@RequiredArgsConstructor
public class RecommendationController {

    private final RecommendationService recommendationService;

    @GetMapping("/summary")
    public ApiResponse<?> getSummary() {
        return ApiResponse.ok(recommendationService.getSummary());
    }

    @GetMapping("/cross-sell")
    public ApiResponse<?> getCrossSell() {
        return ApiResponse.ok(recommendationService.getCrossSell());
    }

    @GetMapping("/seasonal")
    public ApiResponse<?> getSeasonal() {
        return ApiResponse.ok(recommendationService.getSeasonal());
    }

    @GetMapping("/performance")
    public ApiResponse<?> getPerformance() {
        return ApiResponse.ok(recommendationService.getPerformance());
    }

    @GetMapping("/fbt")
    public ApiResponse<?> getFbt() {
        return ApiResponse.ok(recommendationService.getFbt());
    }

    @GetMapping("/upsell")
    public ApiResponse<?> getUpsell() {
        return ApiResponse.ok(recommendationService.getUpsell());
    }

    @GetMapping("/personalized")
    public ApiResponse<?> getPersonalized() {
        return ApiResponse.ok(recommendationService.getPersonalized());
    }
}
