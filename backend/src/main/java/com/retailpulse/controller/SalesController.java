package com.retailpulse.controller;

import com.retailpulse.dto.request.TransactionRequest;
import com.retailpulse.dto.response.ApiResponse;
import com.retailpulse.service.SalesService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
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

    @PostMapping("/record")
    public ApiResponse<?> recordSale(Authentication authentication, @Valid @RequestBody TransactionRequest request) {
        return ApiResponse.ok(salesService.recordSale(authentication.getName(), request));
    }

    @PostMapping("/{id}/pay")
    public ApiResponse<?> recordPayment(Authentication authentication, @PathVariable String id, @RequestBody java.util.Map<String, Object> payload) {
        java.math.BigDecimal amount = new java.math.BigDecimal(payload.get("amount").toString());
        String paymentMethod = payload.containsKey("paymentMethod") ? payload.get("paymentMethod").toString() : "CASH";
        return ApiResponse.ok(salesService.recordPayment(authentication.getName(), id, amount, paymentMethod));
    }

    @GetMapping("/outstanding")
    public ApiResponse<?> getOutstanding() {
        return ApiResponse.ok(salesService.getOutstandingCreditSales());
    }

    @GetMapping("/history")
    public ApiResponse<?> getHistory(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String paymentMethod,
            @RequestParam(required = false) String customerName) {
        return ApiResponse.ok(salesService.getTransactionHistory(startDate, endDate, paymentMethod, customerName));
    }
}

