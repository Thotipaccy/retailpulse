package com.retailpulse.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "roi_investments")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RoiInvestment {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(nullable = false, length = 200)
    private String initiative;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal invested;

    @Column(nullable = false, precision = 8, scale = 2)
    private BigDecimal roi;

    @Column(nullable = false, length = 30)
    private String status;
}
