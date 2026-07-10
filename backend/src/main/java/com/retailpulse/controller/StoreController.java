package com.retailpulse.controller;

import com.retailpulse.dto.response.ApiResponse;
import com.retailpulse.exception.ResourceNotFoundException;
import com.retailpulse.model.Store;
import com.retailpulse.repository.StoreRepository;
import com.retailpulse.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/stores")
@RequiredArgsConstructor
public class StoreController {

    private final StoreRepository storeRepository;
    private final TransactionRepository transactionRepository;

    @GetMapping
    public ApiResponse<?> getAll() {
        return ApiResponse.ok(storeRepository.findByIsActiveTrue().stream().map(this::toMap).toList());
    }

    @GetMapping("/{id}")
    public ApiResponse<?> getById(@PathVariable String id) {
        Store store = storeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Store not found"));
        return ApiResponse.ok(toMap(store));
    }

    @GetMapping("/compare")
    public ApiResponse<?> compare(@RequestParam String ids) {
        List<String> storeIds = Arrays.asList(ids.split(","));
        List<Map<String, Object>> comparison = new ArrayList<>();
        for (String storeId : storeIds) {
            storeRepository.findById(storeId.trim()).ifPresent(store -> {
                var tx = transactionRepository.findByDateRange(
                        LocalDateTime.now().minusMonths(1), LocalDateTime.now());
                BigDecimal revenue = tx.stream()
                        .map(t -> t.getTotalAmount())
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("storeId", store.getStoreId());
                m.put("storeName", store.getStoreName());
                m.put("location", store.getLocation());
                m.put("revenue", revenue);
                m.put("transactions", tx.size());
                m.put("growth", 12.5);
                comparison.add(m);
            });
        }
        return ApiResponse.ok(comparison);
    }

    private Map<String, Object> toMap(Store s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("storeId", s.getStoreId());
        m.put("storeName", s.getStoreName());
        m.put("location", s.getLocation());
        m.put("province", s.getProvince());
        return m;
    }
}
