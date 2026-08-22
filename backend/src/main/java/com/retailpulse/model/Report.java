package com.retailpulse.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "reports")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Report {

    @Id
    @Column(name = "report_id", length = 36)
    private String reportId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "report_type", nullable = false, length = 100)
    private String reportType;

    @Column(nullable = false, length = 20)
    private String format;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(name = "file_path", length = 500)
    private String filePath;

    /** Download-facing file name (e.g. sales_summary_2026-08-22_1445.pdf). */
    @Column(name = "file_name", length = 255)
    private String fileName;

    /** Serialized ReportFilter params the report was generated with. */
    @Column(name = "filters_json", columnDefinition = "TEXT")
    private String filtersJson;

    @Column(name = "generated_at", nullable = false)
    private LocalDateTime generatedAt;
}
