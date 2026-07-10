package com.retailpulse.repository;

import com.retailpulse.model.Category;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CategoryRepository extends JpaRepository<Category, String> {
    Optional<Category> findByCategoryNameIgnoreCase(String categoryName);
}
