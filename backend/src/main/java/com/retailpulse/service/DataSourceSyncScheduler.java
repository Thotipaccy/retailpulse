package com.retailpulse.service;

import com.retailpulse.model.DataSource;
import com.retailpulse.repository.DataSourceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataSourceSyncScheduler {

    private static final String SYSTEM_USER_ID = "u1";

    private final DataSourceRepository dataSourceRepository;
    private final DataSourceService dataSourceService;

    // Disabled in development — automatic sync re-imports CSV files on a timer
    // @Scheduled(fixedRate = 1_800_000)
    public void syncActiveSources() {
        List<DataSource> active = dataSourceRepository.findAllByOrderByNameAsc().stream()
                .filter(ds -> Boolean.TRUE.equals(ds.getIsActive()))
                .filter(ds -> !"API".equalsIgnoreCase(ds.getType()) || ds.getConnectionString() != null && ds.getConnectionString().endsWith(".csv"))
                .toList();
        for (DataSource ds : active) {
            try {
                if ("POS".equalsIgnoreCase(ds.getType()) || "CSV".equalsIgnoreCase(ds.getType())
                        || "Inventory".equalsIgnoreCase(ds.getType())) {
                    dataSourceService.syncSource(ds.getId(), SYSTEM_USER_ID);
                }
            } catch (Exception ex) {
                log.warn("Scheduled sync failed for {}: {}", ds.getName(), ex.getMessage());
            }
        }
    }
}
