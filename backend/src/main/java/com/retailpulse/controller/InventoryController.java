package com.retailpulse.controller;

import com.retailpulse.dto.response.ApiResponse;
import com.retailpulse.service.InventoryService;
import com.retailpulse.security.CustomUserDetailsService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/inventory")
@RequiredArgsConstructor
public class InventoryController {

    private final InventoryService inventoryService;
    private final CustomUserDetailsService userDetailsService;

    @GetMapping("/summary")
    public ApiResponse<?> getSummary() {
        return ApiResponse.ok(inventoryService.getSummary());
    }

    @GetMapping("/stock-levels")
    public ApiResponse<?> getStockLevels(Authentication auth) {
        boolean includeInactive = auth != null && userDetailsService.loadEntityById(auth.getName())
                .getRole() == com.retailpulse.model.enums.UserRole.ADMIN;
        return ApiResponse.ok(inventoryService.getStockLevels(includeInactive));
    }

    @GetMapping("/turnover")
    public ApiResponse<?> getTurnover() {
        return ApiResponse.ok(inventoryService.getTurnover());
    }

    @GetMapping("/stockout-risks")
    public ApiResponse<?> getStockoutRisks() {
        return ApiResponse.ok(inventoryService.getStockoutRisks());
    }

    @GetMapping("/reorder-recommendations")
    public ApiResponse<?> getReorderRecommendations() {
        return ApiResponse.ok(inventoryService.getReorderRecommendations());
    }

    @GetMapping("/velocity")
    public ApiResponse<?> getVelocity() {
        return ApiResponse.ok(inventoryService.getVelocity());
    }

    @PostMapping("/purchase-orders")
    public ApiResponse<?> submitPurchaseOrder(@RequestBody List<Map<String, Object>> items, Authentication auth) {
        return ApiResponse.ok(inventoryService.submitPurchaseOrder(auth.getName(), items), "Purchase order submitted");
    }

    @GetMapping("/purchase-orders/pending")
    public ApiResponse<?> getPendingPurchaseOrders(Authentication auth) {
        return ApiResponse.ok(inventoryService.getPendingPurchaseOrders(auth.getName()));
    }

    @PostMapping("/purchase-orders/{id}/receive")
    public ApiResponse<?> markPurchaseOrderReceived(@PathVariable String id, Authentication auth) {
        inventoryService.markPurchaseOrderReceived(auth.getName(), id);
        return ApiResponse.ok(null, "Purchase order marked as received");
    }

    @PostMapping("/auto-reorder")
    public ApiResponse<?> autoReorder(Authentication auth) {
        return ApiResponse.ok(inventoryService.autoCreatePurchaseOrders(auth.getName()), "Purchase orders created");
    }

    @PostMapping("/purchase")
    public ApiResponse<?> recordPurchase(@RequestBody Map<String, Object> body, Authentication auth) {
        return ApiResponse.ok(inventoryService.recordPurchase(auth.getName(), body), "Purchase recorded");
    }

    @PostMapping("/purchases/batch")
    public ApiResponse<?> recordPurchases(@RequestBody List<Map<String, Object>> items, Authentication auth) {
        return ApiResponse.ok(inventoryService.recordPurchases(auth.getName(), items), "Purchases recorded");
    }

    @GetMapping("/purchase-history")
    public ApiResponse<?> getPurchaseHistory(@RequestParam String productId) {
        return ApiResponse.ok(inventoryService.getPurchaseHistory(productId));
    }

    @GetMapping("/suppliers")
    public ApiResponse<?> getSuppliers() {
        return ApiResponse.ok(inventoryService.getSuppliers());
    }

    @GetMapping("/best-time-to-buy")
    public ApiResponse<?> getBestTimeToBuy(@RequestParam String productId) {
        return ApiResponse.ok(inventoryService.getBestTimeToBuy(productId));
    }
}
