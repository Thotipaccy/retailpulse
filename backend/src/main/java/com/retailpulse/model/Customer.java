package com.retailpulse.model;

import com.retailpulse.model.enums.CustomerType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "customers")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Customer {

    @Id
    @Column(name = "customer_id", length = 36)
    private String customerId;

    @Column(name = "customer_name", nullable = false, length = 200)
    private String customerName;

    @Enumerated(EnumType.STRING)
    @Column(name = "customer_type", nullable = false, length = 20)
    private CustomerType customerType;

    @Column(length = 30)
    private String phone;

    private String email;

    @Column(name = "loyalty_member", nullable = false)
    private Boolean loyaltyMember;

    @Column(name = "lifetime_value", nullable = false, precision = 15, scale = 2)
    private BigDecimal lifetimeValue;

    @Column(name = "churn_risk_score", nullable = false, precision = 5, scale = 4)
    private BigDecimal churnRiskScore;

    @Column(name = "rfm_segment", length = 50)
    private String rfmSegment;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "is_active", nullable = false, columnDefinition = "boolean default true")
    @Builder.Default
    private Boolean isActive = true;
}
