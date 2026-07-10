package com.retailpulse.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "scheduled_reports")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ScheduledReport {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(name = "report_type", nullable = false, length = 100)
    private String reportType;

    @Column(nullable = false, length = 20)
    private String format;

    @Column(nullable = false, length = 50)
    private String frequency;

    @Column(columnDefinition = "TEXT")
    private String recipients;

    @Column(nullable = false)
    private Boolean active;

    @Column(name = "next_run")
    private LocalDateTime nextRun;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
