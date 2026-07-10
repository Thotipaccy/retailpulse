package com.retailpulse.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "strategic_goals")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StrategicGoal {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(nullable = false, length = 500)
    private String goal;

    @Column(nullable = false, precision = 5, scale = 2)
    private BigDecimal progress;

    @Column(nullable = false)
    private LocalDate deadline;

    @Column(nullable = false, length = 150)
    private String owner;
}
