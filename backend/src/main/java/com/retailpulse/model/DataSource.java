package com.retailpulse.model;

import com.retailpulse.model.enums.DataSourceStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "data_sources")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DataSource {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(nullable = false, length = 50)
    private String type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DataSourceStatus status;

    @Column(name = "last_sync")
    private LocalDateTime lastSync;

    @Column(length = 50)
    private String health;

    @Column(name = "connection_string", columnDefinition = "TEXT")
    private String connectionString;

    @Column(name = "sync_frequency", length = 50)
    private String syncFrequency;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive;

    @Column(name = "record_count")
    private Long recordCount;
}
