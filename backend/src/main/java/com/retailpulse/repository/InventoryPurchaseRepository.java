package com.retailpulse.repository;

import com.retailpulse.model.InventoryPurchase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface InventoryPurchaseRepository extends JpaRepository<InventoryPurchase, String> {

    @Query("""
            SELECT p FROM InventoryPurchase p
            JOIN FETCH p.product
            JOIN FETCH p.store
            WHERE p.product.productId = :productId
            ORDER BY p.purchaseDate DESC
            """)
    List<InventoryPurchase> findByProductIdOrderByPurchaseDateDesc(@Param("productId") String productId);

    @Query("""
            SELECT p.supplierName, AVG(p.unitPurchaseCost), COUNT(p)
            FROM InventoryPurchase p
            WHERE p.product.productId = :productId
            GROUP BY p.supplierName
            ORDER BY AVG(p.unitPurchaseCost) ASC
            """)
    List<Object[]> averageCostBySupplierForProduct(@Param("productId") String productId);

    @Query("""
            SELECT p.supplierName
            FROM InventoryPurchase p
            WHERE p.product.productId = :productId
            ORDER BY p.purchaseDate DESC
            LIMIT 1
            """)
    List<String> findLatestSupplierForProduct(@Param("productId") String productId);
}
