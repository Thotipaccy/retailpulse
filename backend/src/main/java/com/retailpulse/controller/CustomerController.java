package com.retailpulse.controller;

import com.retailpulse.dto.response.ApiResponse;
import com.retailpulse.service.CustomerService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/customers")
@RequiredArgsConstructor
public class CustomerController {

    private final CustomerService customerService;

    @GetMapping("/summary")
    public ApiResponse<?> getSummary() {
        return ApiResponse.ok(customerService.getSummary());
    }

    @GetMapping("/segments")
    public ApiResponse<?> getSegments() {
        return ApiResponse.ok(customerService.getSegments());
    }

    @GetMapping("/top")
    public ApiResponse<?> getTop(@RequestParam(defaultValue = "20") int limit) {
        return ApiResponse.ok(customerService.getTopCustomers(limit));
    }

    @GetMapping("/churn-risks")
    public ApiResponse<?> getChurnRisks() {
        return ApiResponse.ok(customerService.getChurnRisks());
    }

    @GetMapping("/frequency")
    public ApiResponse<?> getFrequency() {
        return ApiResponse.ok(customerService.getFrequency());
    }

    @GetMapping("/ltv-trend")
    public ApiResponse<?> getLtvTrend() {
        return ApiResponse.ok(customerService.getLtvTrend());
    }

    @GetMapping("/{id}")
    public ApiResponse<?> getById(@PathVariable String id) {
        return ApiResponse.ok(customerService.getCustomerById(id));
    }

    @PostMapping
    public ApiResponse<?> create(@RequestBody com.retailpulse.dto.request.CustomerRequest request) {
        return ApiResponse.ok(customerService.createCustomer(request));
    }

    @PutMapping("/{id}")
    public ApiResponse<?> update(@PathVariable String id, @RequestBody com.retailpulse.dto.request.CustomerRequest request) {
        return ApiResponse.ok(customerService.updateCustomer(id, request));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<?> deactivate(@PathVariable String id) {
        return ApiResponse.ok(customerService.toggleCustomerStatus(id, false));
    }
    
    @PutMapping("/{id}/reactivate")
    public ApiResponse<?> reactivate(@PathVariable String id) {
        return ApiResponse.ok(customerService.toggleCustomerStatus(id, true));
    }
}
