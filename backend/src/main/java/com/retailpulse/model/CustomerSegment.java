package com.retailpulse.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

@Entity
@Table(name = "customer_segments")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CustomerSegment {

    @Id
    @Column(name = "segment_id", length = 36)
    private String segmentId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id", nullable = false)
    private Customer customer;

    @Column(name = "segment_name", nullable = false, length = 100)
    private String segmentName;

    @Column(name = "rfm_score", length = 20)
    private String rfmScore;

    @Column(name = "assigned_date", nullable = false)
    private LocalDate assignedDate;
}
