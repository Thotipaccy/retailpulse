package com.retailpulse.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "inventory_records", uniqueConstraints = @UniqueConstraint(columnNames = {"product_id", "store_id"}))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryRecord {

    @Id
    @Column(name = "record_id", length = 36)
    private String recordId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @Column(name = "quantity_on_hand", nullable = false)
    private Integer quantityOnHand;

    @Column(name = "quantity_reserved", nullable = false)
    private Integer quantityReserved;

    @Column(name = "stockout_risk", nullable = false, precision = 5, scale = 4)
    private BigDecimal stockoutRisk;

    @Column(name = "last_updated", nullable = false)
    private LocalDateTime lastUpdated;

    @Column(name = "supplier_name", length = 200)
    private String supplierName;

    @Column(name = "supplier_contact", length = 50)
    private String supplierContact;

    @Column(name = "invoice_number", length = 100)
    private String invoiceNumber;

    @Column(name = "unit_purchase_cost", precision = 15, scale = 2)
    private BigDecimal unitPurchaseCost;

    @Column(name = "last_purchase_date")
    private LocalDateTime lastPurchaseDate;
}
