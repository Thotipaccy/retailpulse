package com.retailpulse.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "budget_allocations")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BudgetAllocation {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(nullable = false, length = 100)
    private String category;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal allocated;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal spent;
}
