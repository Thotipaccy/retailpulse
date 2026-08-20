package com.retailpulse.repository;

import com.retailpulse.model.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, String> {
    Optional<Product> findBySkuCode(String skuCode);
    List<Product> findByCategoryCategoryId(String categoryId);
    List<Product> findByIsActiveTrue();
    List<Product> findTop10ByOrderByProductIdDesc();

    @Query("SELECT p FROM Product p JOIN FETCH p.category WHERE p.isActive = true")
    List<Product> findAllActiveWithCategory();

    @Query("SELECT p FROM Product p JOIN FETCH p.category WHERE p.isActive = true ORDER BY p.productName")
    List<Product> findAllActiveWithCategoryOrdered();
    @Query("SELECT p FROM Product p JOIN FETCH p.category")
    List<Product> findAllWithCategory();
}
