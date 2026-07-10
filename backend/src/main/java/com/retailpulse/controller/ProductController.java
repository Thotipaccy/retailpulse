package com.retailpulse.controller;

import com.retailpulse.dto.response.ApiResponse;
import com.retailpulse.service.ProductService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/products")
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;

    @GetMapping
    public ApiResponse<?> list() {
        return ApiResponse.ok(productService.list());
    }

    @PostMapping
    public ApiResponse<?> create(@RequestBody Map<String, Object> request) {
        return ApiResponse.ok(productService.create(request), "Product created");
    }

    @PutMapping("/{id}")
    public ApiResponse<?> update(@PathVariable String id, @RequestBody Map<String, Object> request) {
        return ApiResponse.ok(productService.update(id, request), "Product updated");
    }

    @DeleteMapping("/{id}")
    public ApiResponse<?> deactivate(@PathVariable String id) {
        productService.deactivate(id);
        return ApiResponse.ok(null, "Product deactivated");
    }
}
