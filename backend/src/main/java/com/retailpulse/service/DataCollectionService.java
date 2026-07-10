package com.retailpulse.service;

import com.retailpulse.dto.request.CreateScheduledImportRequest;
import com.retailpulse.dto.request.DataSourceUpdateRequest;
import com.retailpulse.model.DataSource;
import com.retailpulse.model.ScheduledImport;
import com.retailpulse.model.enums.ScheduledImportStatus;
import com.retailpulse.repository.CustomerRepository;
import com.retailpulse.repository.DataSourceRepository;
import com.retailpulse.repository.InventoryRecordRepository;
import com.retailpulse.repository.ProductRepository;
import com.retailpulse.repository.ScheduledImportRepository;
import com.retailpulse.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class DataCollectionService {

    private final DataSourceRepository dataSourceRepository;
    private final ScheduledImportRepository scheduledImportRepository;
    private final TransactionRepository transactionRepository;
    private final ProductRepository productRepository;
    private final CustomerRepository customerRepository;
    private final InventoryRecordRepository inventoryRecordRepository;
    private final PosDataImportService posDataImportService;
    private final DataSourceService dataSourceService;
    private final AuditLogService auditLogService;
    private final AIServiceClient aiServiceClient;
    private final ForecastService forecastService;
    private final ImportJobService importJobService;
    private final AsyncImportService asyncImportService;
    private final com.retailpulse.repository.ImportHashRepository importHashRepository;

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getSources() {
        return dataSourceRepository.findAllByOrderByNameAsc().stream()
                .map(this::toSourceMap)
                .toList();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getQualityMetrics() {
        long products = productRepository.count();
        long withInventory = inventoryRecordRepository.count();
        long customers = customerRepository.count();

        int completeness = products == 0 ? 0
                : (int) Math.min(100, Math.round(withInventory * 100.0 / products));

        LocalDateTime thirtyDaysAgo = LocalDateTime.now().minusDays(30);
        LocalDateTime sevenDaysAgo = LocalDateTime.now().minusDays(7);
        long recentTx = transactionRepository.countByTransactionDateAfter(sevenDaysAgo);
        long monthTx = transactionRepository.countByTransactionDateAfter(thirtyDaysAgo);
        int timeliness = monthTx == 0 ? 0
                : (int) Math.min(100, Math.round(recentTx * 100.0 / monthTx));

        Object accuracyObj = forecastService.getAccuracy().get("overall");
        int accuracy = accuracyObj instanceof Number n ? (int) Math.round(n.doubleValue()) : 0;

        long customersWithPhone = customerRepository.findAll().stream()
                .filter(c -> c.getPhone() != null && !c.getPhone().isBlank())
                .count();
        int consistency = customers == 0 ? 0
                : (int) Math.min(100, Math.round(customersWithPhone * 100.0 / customers));

        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("completeness", completeness);
        metrics.put("accuracy", accuracy);
        metrics.put("consistency", consistency);
        metrics.put("timeliness", timeliness);
        return metrics;
    }

    @Transactional
    public Map<String, Object> startUpload(MultipartFile file, String userId) {
        if (file == null || file.isEmpty()) {
            throw new com.retailpulse.exception.BadRequestException("File is required");
        }
        try {
            // Compute File SHA-256 Hash
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(file.getBytes());
            StringBuilder sb = new StringBuilder();
            for (byte b : hashBytes) sb.append(String.format("%02x", b));
            String fileHash = sb.toString();

            if (importHashRepository.existsById(fileHash)) {
                throw new com.retailpulse.exception.BadRequestException("Duplicate Upload: This exact file has already been imported.");
            }

            String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "upload.csv";
            
            // Register hash to prevent future duplicates
            importHashRepository.save(new com.retailpulse.model.ImportHash(fileHash, originalName, LocalDateTime.now()));

            Path temp = Files.createTempFile("pos-import-", "-" + originalName.replaceAll("[^a-zA-Z0-9._-]", "_"));
            file.transferTo(temp);
            String jobId = importJobService.createJob(originalName, 0);
            asyncImportService.runImport(jobId, temp, userId, originalName);
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("jobId", jobId);
            response.put("status", "STARTED");
            response.put("message", "Import started");
            return response;
        } catch (com.retailpulse.exception.BadRequestException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new com.retailpulse.exception.BadRequestException("Could not start import: " + ex.getMessage());
        }
    }

    public Map<String, Object> getImportStatus(String jobId) {
        return importJobService.getStatus(jobId);
    }

    @Transactional
    public Map<String, Object> uploadFile(MultipartFile file, String userId) {
        return startUpload(file, userId);
    }

    @Transactional
    public Map<String, Object> importSample90Days(String userId) {
        long distinctDays = transactionRepository.findAll().stream()
                .map(t -> t.getTransactionDate().toLocalDate())
                .distinct()
                .count();
        if (distinctDays >= 90) {
            throw new com.retailpulse.exception.BadRequestException(
                    "90-day sample already imported (" + distinctDays + " days of history present)");
        }
        java.nio.file.Path path = java.nio.file.Path.of(
                System.getProperty("user.dir"),
                "src/main/resources/sample/retailpulse_90days_transactions.csv");
        if (!java.nio.file.Files.exists(path)) {
            throw new com.retailpulse.exception.BadRequestException(
                    "90-day sample file not found. Run generate_90days_data.py first.");
        }
        Map<String, Object> result = posDataImportService.importFromPath(path.toString(), userId);
        auditLogService.log(userId, "DATA_UPLOAD",
                "Imported 90-day sample: " + result.get("recordsImported") + " rows",
                "transactions", String.valueOf(result.get("transactions")));
        triggerRetrainAsync();
        return result;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getScheduledImports() {
        return scheduledImportRepository.findAllByOrderByNextRunAsc().stream()
                .map(this::toImportMap)
                .toList();
    }

    public Map<String, Object> updateSource(String id, DataSourceUpdateRequest request) {
        DataSource ds = dataSourceRepository.findById(id)
                .orElseThrow(() -> new com.retailpulse.exception.ResourceNotFoundException("Data source not found"));
        if (request.getConnectionString() != null) {
            ds.setConnectionString(request.getConnectionString());
        }
        if (request.getSyncFrequency() != null) {
            ds.setSyncFrequency(request.getSyncFrequency());
        }
        ds.setLastSync(LocalDateTime.now());
        return toSourceMap(dataSourceRepository.save(ds));
    }

    public Map<String, Object> toggleSource(String id, boolean active) {
        DataSource ds = dataSourceRepository.findById(id)
                .orElseThrow(() -> new com.retailpulse.exception.ResourceNotFoundException("Data source not found"));
        ds.setIsActive(active);
        return toSourceMap(dataSourceRepository.save(ds));
    }

    public Map<String, Object> testConnection(String id) {
        return dataSourceService.testConnection(id);
    }

    public Map<String, Object> syncSource(String id, String userId) {
        return dataSourceService.syncSource(id, userId);
    }

    public Map<String, Object> createScheduledImport(CreateScheduledImportRequest request) {
        if (request.getName() == null || request.getName().isBlank()) {
            throw new com.retailpulse.exception.BadRequestException("Import name is required");
        }
        if (request.getSourceName() == null || request.getSourceName().isBlank()) {
            throw new com.retailpulse.exception.BadRequestException("Source name is required");
        }
        String frequency = request.getFrequency() != null ? request.getFrequency() : "Daily";
        ScheduledImport created = scheduledImportRepository.save(ScheduledImport.builder()
                .id("si-" + UUID.randomUUID().toString().substring(0, 8))
                .name(request.getName())
                .sourceName(request.getSourceName())
                .frequency(frequency)
                .status(ScheduledImportStatus.ACTIVE)
                .nextRun(LocalDateTime.now().plusDays(1))
                .recordsImported(0L)
                .build());
        return toImportMap(created);
    }

    public Map<String, Object> updateScheduledImport(String id, CreateScheduledImportRequest request) {
        ScheduledImport si = scheduledImportRepository.findById(id)
                .orElseThrow(() -> new com.retailpulse.exception.ResourceNotFoundException("Scheduled import not found"));
        if (request.getName() != null && !request.getName().isBlank()) {
            si.setName(request.getName());
        }
        if (request.getSourceName() != null && !request.getSourceName().isBlank()) {
            si.setSourceName(request.getSourceName());
        }
        if (request.getFrequency() != null && !request.getFrequency().isBlank()) {
            si.setFrequency(request.getFrequency());
        }
        return toImportMap(scheduledImportRepository.save(si));
    }

    public void deleteScheduledImport(String id) {
        if (!scheduledImportRepository.existsById(id)) {
            throw new com.retailpulse.exception.ResourceNotFoundException("Scheduled import not found");
        }
        scheduledImportRepository.deleteById(id);
    }

    private void triggerRetrainAsync() {
        if (!aiServiceClient.isHealthy()) return;
        try {
            aiServiceClient.retrain(Collections.emptyMap());
        } catch (Exception ex) {
            log.warn("AI retrain trigger failed: {}", ex.getMessage());
        }
    }

    private Map<String, Object> toSourceMap(DataSource ds) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", ds.getId());
        m.put("name", ds.getName());
        m.put("type", ds.getType());
        m.put("status", ds.getStatus().name().toLowerCase());
        m.put("lastSync", ds.getLastSync() != null ? ds.getLastSync().toString() : null);
        m.put("health", ds.getHealth());
        m.put("syncFrequency", ds.getSyncFrequency());
        m.put("connectionString", ds.getConnectionString());
        m.put("isActive", ds.getIsActive());
        m.put("recordCount", ds.getRecordCount() != null ? ds.getRecordCount() : 0L);
        return m;
    }

    private Map<String, Object> toImportMap(ScheduledImport si) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", si.getId());
        m.put("name", si.getName());
        m.put("sourceName", si.getSourceName());
        m.put("frequency", si.getFrequency());
        m.put("lastRun", si.getLastRun() != null ? si.getLastRun().toString() : null);
        m.put("recordsImported", si.getRecordsImported() != null ? si.getRecordsImported() : 0L);
        m.put("nextRun", si.getNextRun() != null ? si.getNextRun().toString() : null);
        m.put("status", si.getStatus().name().toLowerCase());
        return m;
    }
}
