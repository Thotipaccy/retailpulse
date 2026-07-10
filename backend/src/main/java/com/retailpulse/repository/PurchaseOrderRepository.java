package com.retailpulse.repository;

import com.retailpulse.model.PurchaseOrder;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PurchaseOrderRepository extends JpaRepository<PurchaseOrder, String> {
    List<PurchaseOrder> findByUserUserIdOrderByCreatedAtDesc(String userId);
    List<PurchaseOrder> findByUserUserIdAndStatusOrderByCreatedAtDesc(String userId, String status);
}
