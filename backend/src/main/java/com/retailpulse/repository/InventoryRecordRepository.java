package com.retailpulse.repository;

import com.retailpulse.model.InventoryRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface InventoryRecordRepository extends JpaRepository<InventoryRecord, String> {

    Optional<InventoryRecord> findByProductProductIdAndStoreStoreId(String productId, String storeId);
    List<InventoryRecord> findByQuantityOnHandLessThan(Integer threshold);
    long countByQuantityOnHandGreaterThan(Integer threshold);

    @Query("SELECT ir FROM InventoryRecord ir JOIN FETCH ir.product p JOIN FETCH p.category JOIN FETCH ir.store WHERE p.isActive = true")
    List<InventoryRecord> findAllActiveWithDetails();

    @Query("SELECT ir FROM InventoryRecord ir JOIN FETCH ir.product p JOIN FETCH p.category JOIN FETCH ir.store")
    List<InventoryRecord> findAllWithDetails();

    @Query("""
        SELECT ir FROM InventoryRecord ir
        JOIN FETCH ir.product p JOIN FETCH p.category
        JOIN FETCH ir.store
        WHERE ir.stockoutRisk >= :threshold
        ORDER BY ir.stockoutRisk DESC
        """)
    List<InventoryRecord> findByStockoutRiskGreaterThanEqualOrderByStockoutRiskDesc(@Param("threshold") BigDecimal threshold);

    @Query("""
        SELECT ir FROM InventoryRecord ir
        JOIN FETCH ir.product p JOIN FETCH p.category
        JOIN FETCH ir.store
        WHERE ir.quantityOnHand <= p.reorderPoint
        """)
    List<InventoryRecord> findBelowReorderPoint();
}
