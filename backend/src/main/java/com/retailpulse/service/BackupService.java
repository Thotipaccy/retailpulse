package com.retailpulse.service;

import com.retailpulse.exception.BadRequestException;
import com.retailpulse.exception.ResourceNotFoundException;
import com.retailpulse.model.BackupRecord;
import com.retailpulse.model.User;
import com.retailpulse.repository.BackupRecordRepository;
import com.retailpulse.security.CustomUserDetailsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class BackupService {

    private static final String JDBC_BACKUP_HEADER = "-- RetailPulse JDBC backup";

    private final BackupRecordRepository backupRecordRepository;
    private final CustomUserDetailsService userDetailsService;
    private final AuditLogService auditLogService;
    private final DataSource dataSource;

    @Value("${spring.datasource.url:jdbc:postgresql://localhost:5432/retailpulse_db}")
    private String datasourceUrl;

    @Value("${spring.datasource.username:postgres}")
    private String dbUsername;

    @Value("${spring.datasource.password:}")
    private String dbPassword;

    @Value("${retailpulse.backup.dir:backups}")
    private String backupDir;

    @Transactional
    public Map<String, Object> triggerBackup(String userId) {
        User user = userDetailsService.loadEntityById(userId);
        auditLogService.log(userId, "BACKUP_START", "Database backup started", "backup_records", null);

        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"));
        String fileName = "retailpulse-backup-" + timestamp + ".sql";
        Path dir = Path.of(backupDir).toAbsolutePath();
        Path filePath = dir.resolve(fileName);

        try {
            Files.createDirectories(dir);
            String dbName = extractDbName(datasourceUrl);
            String method = runBackup(filePath, dbName);
            long size = Files.size(filePath);
            BackupRecord record = BackupRecord.builder()
                    .id("bk-" + UUID.randomUUID().toString().substring(0, 8))
                    .fileName(fileName)
                    .sizeBytes(size)
                    .status("COMPLETED")
                    .createdAt(LocalDateTime.now())
                    .createdBy(user)
                    .build();
            backupRecordRepository.save(record);
            auditLogService.log(userId, "BACKUP_COMPLETE",
                    "Backup created (" + method + "): " + fileName + " (" + size + " bytes)",
                    "backup_records", record.getId());
            Map<String, Object> result = toBackupMap(record, filePath.toString());
            result.put("method", method);
            return result;
        } catch (BadRequestException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Backup failed", ex);
            auditLogService.log(userId, "BACKUP_FAILED", ex.getMessage(), "backup_records", null);
            throw new BadRequestException("Backup failed: " + ex.getMessage());
        }
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listBackups() {
        return backupRecordRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(r -> toBackupMap(r, Path.of(backupDir, r.getFileName()).toAbsolutePath().toString()))
                .toList();
    }

    @Transactional
    public Map<String, Object> restore(String backupId, boolean confirmed) {
        if (!confirmed) {
            throw new BadRequestException("Restore requires confirmation (confirm: true)");
        }
        BackupRecord record = backupRecordRepository.findById(backupId)
                .orElseThrow(() -> new ResourceNotFoundException("Backup not found"));
        Path filePath = Path.of(backupDir, record.getFileName()).toAbsolutePath();
        if (!Files.exists(filePath)) {
            throw new BadRequestException("Backup file not found on disk: " + filePath);
        }
        try {
            if (!isJdbcBackup(filePath)) {
                throw new BadRequestException(
                        "Only JDBC backups can be merged. Create a new backup from this system and restore that file.");
            }
            Map<String, Object> stats = jdbcMergeRestore(filePath);
            int inserted = ((Number) stats.get("rowsInserted")).intValue();
            int skipped = ((Number) stats.get("rowsSkipped")).intValue();
            auditLogService.logSystem("BACKUP_RESTORE",
                    "Merge restore from " + record.getFileName() + ": " + inserted + " added, " + skipped + " skipped",
                    "backup_records", record.getId());
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("backupId", record.getId());
            result.put("fileName", record.getFileName());
            result.put("method", "jdbc");
            result.put("mode", "merge");
            result.put("status", "RESTORED");
            result.put("restoredAt", LocalDateTime.now().toString());
            result.put("rowsInserted", inserted);
            result.put("rowsSkipped", skipped);
            result.put("message", buildMergeRestoreMessage(inserted, skipped));
            return result;
        } catch (BadRequestException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Restore failed for {}", record.getFileName(), ex);
            throw new BadRequestException("Could not restore from backup. Please try again or create a fresh backup.");
        }
    }

    private String buildMergeRestoreMessage(int inserted, int skipped) {
        if (inserted == 0) {
            return "Nothing new to restore — all backup records already exist in your database.";
        }
        if (skipped == 0) {
            return inserted + " missing record(s) recovered from backup.";
        }
        return inserted + " record(s) recovered. " + skipped + " already existed and were kept unchanged.";
    }

    private String runBackup(Path filePath, String dbName) throws IOException, InterruptedException, SQLException {
        try {
            runPgDump(filePath, dbName);
            return "pg_dump";
        } catch (IOException ex) {
            if (!isMissingPgTool(ex)) {
                throw ex;
            }
            log.warn("pg_dump not available, using JDBC logical backup");
            jdbcBackup(filePath);
            return "jdbc";
        }
    }

    private void runPgDump(Path filePath, String dbName) throws IOException, InterruptedException {
        String pgDump = resolvePgTool("pg_dump");
        ProcessBuilder pb = new ProcessBuilder(
                pgDump, "-h", "localhost", "-p", "5432", "-U", dbUsername, "-d", dbName, "-f", filePath.toString());
        pb.environment().put("PGPASSWORD", dbPassword);
        pb.redirectErrorStream(true);
        Process process = pb.start();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            reader.lines().forEach(line -> log.debug("pg_dump: {}", line));
        }
        int exit = process.waitFor();
        if (exit != 0) {
            throw new BadRequestException("pg_dump failed with exit code " + exit);
        }
    }

    @SuppressWarnings("unused")
    private void runPgRestore(Path filePath, String dbName) throws IOException, InterruptedException {
        try {
            String psql = resolvePgTool("psql");
            ProcessBuilder pb = new ProcessBuilder(
                    psql, "-h", "localhost", "-p", "5432", "-U", dbUsername, "-d", dbName, "-f", filePath.toString());
            pb.environment().put("PGPASSWORD", dbPassword);
            Process process = pb.start();
            int exit = process.waitFor();
            if (exit != 0) {
                throw new BadRequestException("psql restore failed with exit code " + exit);
            }
        } catch (IOException ex) {
            if (isMissingPgTool(ex)) {
                throw new BadRequestException("psql is not installed. Restore JDBC backups only.");
            }
            throw ex;
        }
    }

    private void jdbcBackup(Path filePath) throws SQLException, IOException {
        try (Connection conn = dataSource.getConnection();
             BufferedWriter writer = Files.newBufferedWriter(filePath, StandardCharsets.UTF_8)) {
            writer.write(JDBC_BACKUP_HEADER);
            writer.newLine();
            writer.write("-- Generated at " + LocalDateTime.now());
            writer.newLine();
            try (Statement tables = conn.createStatement();
                 ResultSet rs = tables.executeQuery(
                         "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")) {
                while (rs.next()) {
                    exportTable(conn, writer, rs.getString("tablename"));
                }
            }
        }
    }

    private void exportTable(Connection conn, BufferedWriter writer, String table) throws SQLException, IOException {
        writer.newLine();
        writer.write("-- Table: " + table);
        writer.newLine();
        try (Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT * FROM \"" + table + "\"")) {
            ResultSetMetaData meta = rs.getMetaData();
            int columnCount = meta.getColumnCount();
            List<String> columns = new ArrayList<>();
            for (int i = 1; i <= columnCount; i++) {
                columns.add("\"" + meta.getColumnName(i) + "\"");
            }
            String columnList = String.join(", ", columns);
            while (rs.next()) {
                StringBuilder values = new StringBuilder();
                for (int i = 1; i <= columnCount; i++) {
                    if (i > 1) {
                        values.append(", ");
                    }
                    values.append(quoteSqlValue(rs.getObject(i)));
                }
                writer.write("INSERT INTO \"" + table + "\" (" + columnList + ") VALUES (" + values + ");");
                writer.newLine();
            }
        }
    }

    private Map<String, Object> jdbcMergeRestore(Path filePath) throws IOException, SQLException {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            try (Statement stmt = conn.createStatement()) {
                int inserted = 0;
                int skipped = 0;
                try (BufferedReader reader = Files.newBufferedReader(filePath, StandardCharsets.UTF_8)) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        String trimmed = line.trim();
                        if (!trimmed.startsWith("INSERT INTO")) {
                            continue;
                        }
                        int count = stmt.executeUpdate(toMergeInsert(trimmed));
                        if (count > 0) {
                            inserted++;
                        } else {
                            skipped++;
                        }
                    }
                }
                conn.commit();
                log.info("JDBC merge restore: {} inserted, {} skipped", inserted, skipped);
                Map<String, Object> stats = new LinkedHashMap<>();
                stats.put("rowsInserted", inserted);
                stats.put("rowsSkipped", skipped);
                return stats;
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            }
        }
    }

    private String toMergeInsert(String insertSql) {
        String sql = insertSql.trim();
        if (sql.endsWith(";")) {
            sql = sql.substring(0, sql.length() - 1);
        }
        return sql + " ON CONFLICT DO NOTHING;";
    }

    private boolean isJdbcBackup(Path filePath) throws IOException {
        String firstLine = Files.lines(filePath).findFirst().orElse("");
        return firstLine.contains("RetailPulse JDBC backup");
    }

    private String quoteSqlValue(Object value) {
        if (value == null) {
            return "NULL";
        }
        if (value instanceof Number || value instanceof Boolean) {
            return value.toString();
        }
        if (value instanceof java.sql.Timestamp timestamp) {
            return "'" + timestamp.toLocalDateTime().toString().replace('T', ' ') + "'";
        }
        if (value instanceof java.sql.Date date) {
            return "'" + date.toLocalDate() + "'";
        }
        if (value instanceof java.util.UUID uuid) {
            return "'" + uuid + "'";
        }
        if (value instanceof byte[]) {
            return "NULL";
        }
        return "'" + value.toString().replace("'", "''") + "'";
    }

    private boolean isMissingPgTool(IOException ex) {
        String message = ex.getMessage();
        return message != null && (message.contains("error=2") || message.contains("cannot find the file"));
    }

    private String resolvePgTool(String toolName) {
        String envKey = toolName.toUpperCase().replace('-', '_') + "_PATH";
        String fromEnv = System.getenv(envKey);
        if (fromEnv != null && !fromEnv.isBlank() && Files.exists(Path.of(fromEnv))) {
            return fromEnv;
        }
        if (System.getProperty("os.name", "").toLowerCase().contains("win")) {
            for (int version = 17; version >= 12; version--) {
                Path candidate = Path.of("C:\\Program Files\\PostgreSQL\\" + version + "\\bin\\" + toolName + ".exe");
                if (Files.exists(candidate)) {
                    return candidate.toString();
                }
            }
        }
        return toolName;
    }

    private String extractDbName(String jdbcUrl) {
        String path = jdbcUrl.substring(jdbcUrl.lastIndexOf('/') + 1);
        int q = path.indexOf('?');
        return q > 0 ? path.substring(0, q) : path;
    }

    private Map<String, Object> toBackupMap(BackupRecord r, String filePath) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("fileName", r.getFileName());
        m.put("filePath", filePath);
        m.put("sizeBytes", r.getSizeBytes());
        m.put("sizeMb", Math.round(r.getSizeBytes() / 1_048_576.0 * 10) / 10.0);
        m.put("status", r.getStatus());
        m.put("createdAt", r.getCreatedAt().toString());
        m.put("createdBy", r.getCreatedBy().getFullName());
        m.put("method", detectBackupMethod(Path.of(filePath)));
        return m;
    }

    private String detectBackupMethod(Path filePath) {
        try {
            if (!Files.exists(filePath)) {
                return "missing";
            }
            return isJdbcBackup(filePath) ? "jdbc" : "pg_dump";
        } catch (IOException ex) {
            return "unknown";
        }
    }
}
