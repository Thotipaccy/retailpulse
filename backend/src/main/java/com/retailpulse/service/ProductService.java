package com.retailpulse.service;

import com.retailpulse.exception.BadRequestException;
import com.retailpulse.exception.ResourceNotFoundException;
import com.retailpulse.model.Category;
import com.retailpulse.model.InventoryRecord;
import com.retailpulse.model.Product;
import com.retailpulse.model.Store;
import com.retailpulse.repository.CategoryRepository;
import com.retailpulse.repository.InventoryRecordRepository;
import com.retailpulse.repository.ProductRepository;
import com.retailpulse.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final InventoryRecordRepository inventoryRecordRepository;
    private final StoreRepository storeRepository;

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list() {
        List<Product> products = productRepository.findAllWithCategory();
        Map<String, Integer> stockByProduct = inventoryRecordRepository.findAllWithDetails().stream()
                .collect(Collectors.groupingBy(
                        ir -> ir.getProduct().getProductId(),
                        Collectors.summingInt(InventoryRecord::getQuantityOnHand)));
        return products.stream()
                .map(p -> toProductMap(p, stockByProduct.getOrDefault(p.getProductId(), 0)))
                .toList();
    }

    @Transactional
    public Map<String, Object> create(Map<String, Object> request) {
        String sku = stringVal(request, "skuCode", "sku");
        if (sku == null || sku.isBlank()) {
            throw new BadRequestException("SKU code is required");
        }
        if (productRepository.findBySkuCode(sku).isPresent()) {
            throw new BadRequestException("SKU already exists");
        }
        String categoryId = stringVal(request, "categoryId", "category");
        Category category = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found"));

        String productId = "p" + UUID.randomUUID().toString().substring(0, 8);
        Product product = Product.builder()
                .productId(productId)
                .skuCode(sku)
                .productName(stringVal(request, "productName", "name"))
                .category(category)
                .unitCost(decimalVal(request, "unitCost", "costPrice", BigDecimal.ZERO))
                .unitPrice(decimalVal(request, "unitPrice", "sellingPrice", BigDecimal.ZERO))
                .reorderPoint(intVal(request, "reorderPoint", 50))
                .isActive(true)
                .build();
        productRepository.save(product);

        int initialStock = intVal(request, "stock", "quantityOnHand", 0);
        if (initialStock > 0) {
            Store store = storeRepository.findAll().stream().findFirst()
                    .orElseThrow(() -> new ResourceNotFoundException("No store configured"));
            inventoryRecordRepository.save(InventoryRecord.builder()
                    .recordId("inv-" + productId)
                    .product(product)
                    .store(store)
                    .quantityOnHand(initialStock)
                    .quantityReserved(0)
                    .stockoutRisk(BigDecimal.ZERO)
                    .lastUpdated(LocalDateTime.now())
                    .build());
        }
        return toProductMap(product, stockForProduct(product.getProductId()));
    }

    @Transactional
    public Map<String, Object> update(String id, Map<String, Object> request) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found"));
        if (request.containsKey("productName") || request.containsKey("name")) {
            product.setProductName(stringVal(request, "productName", "name"));
        }
        if (request.containsKey("skuCode") || request.containsKey("sku")) {
            product.setSkuCode(stringVal(request, "skuCode", "sku"));
        }
        if (request.containsKey("categoryId") || request.containsKey("category")) {
            String categoryId = stringVal(request, "categoryId", "category");
            product.setCategory(categoryRepository.findById(categoryId)
                    .orElseThrow(() -> new ResourceNotFoundException("Category not found")));
        }
        if (request.containsKey("unitCost") || request.containsKey("costPrice")) {
            product.setUnitCost(decimalVal(request, "unitCost", "costPrice", product.getUnitCost()));
        }
        if (request.containsKey("unitPrice") || request.containsKey("sellingPrice")) {
            product.setUnitPrice(decimalVal(request, "unitPrice", "sellingPrice", product.getUnitPrice()));
        }
        if (request.containsKey("reorderPoint")) {
            product.setReorderPoint(intVal(request, "reorderPoint", product.getReorderPoint()));
        }
        productRepository.save(product);
        return toProductMap(product, stockForProduct(product.getProductId()));
    }

    @Transactional
    public void deactivate(String id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found"));
        product.setIsActive(false);
        productRepository.save(product);
    }

    @Transactional
    public void reactivate(String id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found"));
        product.setIsActive(true);
        productRepository.save(product);
    }

    private int stockForProduct(String productId) {
        return inventoryRecordRepository.findAllWithDetails().stream()
                .filter(ir -> ir.getProduct().getProductId().equals(productId))
                .mapToInt(InventoryRecord::getQuantityOnHand)
                .sum();
    }

    private Map<String, Object> toProductMap(Product p, int stock) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("productId", p.getProductId());
        m.put("skuCode", p.getSkuCode());
        m.put("productName", p.getProductName());
        m.put("category", p.getCategory().getCategoryName());
        m.put("categoryId", p.getCategory().getCategoryId());
        m.put("unitCost", p.getUnitCost());
        m.put("unitPrice", p.getUnitPrice());
        m.put("reorderPoint", p.getReorderPoint());
        m.put("quantityOnHand", stock);
        m.put("isActive", p.getIsActive());
        return m;
    }

    private static String stringVal(Map<String, Object> m, String... keys) {
        for (String key : keys) {
            if (m.containsKey(key) && m.get(key) != null) {
                return String.valueOf(m.get(key));
            }
        }
        return null;
    }

    private static BigDecimal decimalVal(Map<String, Object> m, String k1, String k2, BigDecimal fallback) {
        Object v = m.containsKey(k1) ? m.get(k1) : m.get(k2);
        if (v == null) return fallback;
        return new BigDecimal(String.valueOf(v));
    }

    private static int intVal(Map<String, Object> m, String k1, int fallback) {
        Object v = m.get(k1);
        if (v == null) return fallback;
        return ((Number) v).intValue();
    }

    private static int intVal(Map<String, Object> m, String k1, String k2, int fallback) {
        Object v = m.containsKey(k1) ? m.get(k1) : m.get(k2);
        if (v == null) return fallback;
        return ((Number) v).intValue();
    }
}
