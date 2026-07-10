package com.retailpulse.model;

import com.retailpulse.model.enums.ScheduledImportStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "scheduled_imports")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ScheduledImport {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(name = "source_name", nullable = false, length = 200)
    private String sourceName;

    @Column(nullable = false, length = 50)
    private String frequency;

    @Column(name = "next_run")
    private LocalDateTime nextRun;

    @Column(name = "last_run")
    private LocalDateTime lastRun;

    @Column(name = "records_imported")
    private Long recordsImported;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ScheduledImportStatus status;
}
