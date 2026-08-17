package com.retailpulse.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Applies any incremental DDL migrations that Hibernate's ddl-auto=update
 * may miss (e.g. new NOT-NULL columns on populated tables).
 * Runs at @Order(0) — before every other CommandLineRunner.
 */
@Slf4j
@Component
@Order(0)
@Profile("!test")
@RequiredArgsConstructor
public class DatabaseMigrationRunner implements CommandLineRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(String... args) {
        applyMigrations();
    }

    private void applyMigrations() {
        // v1: add amount_paid to transactions (introduced with partial-payment feature)
        runIfMissing(
            "transactions", "amount_paid",
            "ALTER TABLE transactions ADD COLUMN amount_paid NUMERIC(15,2) DEFAULT 0"
        );

        // v1: create payment_history table (introduced with partial-payment feature)
        jdbc.execute(
            "CREATE TABLE IF NOT EXISTS payment_history (" +
            "  payment_id      VARCHAR(50)    PRIMARY KEY," +
            "  transaction_id  VARCHAR(50)    NOT NULL REFERENCES transactions(transaction_id)," +
            "  user_id         VARCHAR(255)   NOT NULL," +
            "  payment_date    TIMESTAMP      NOT NULL," +
            "  amount          NUMERIC(15,2)  NOT NULL," +
            "  payment_method  VARCHAR(20)," +
            "  notes           VARCHAR(255)" +
            ")"
        );
        log.info("DatabaseMigrationRunner: schema is up to date");
    }

    /**
     * Adds a column only when it does not already exist, avoiding errors on
     * repeated restarts.
     */
    private void runIfMissing(String table, String column, String ddl) {
        try {
            Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns " +
                "WHERE table_name = ? AND column_name = ?",
                Integer.class, table, column
            );
            if (count == null || count == 0) {
                log.info("DatabaseMigrationRunner: adding column {}.{}", table, column);
                jdbc.execute(ddl);
            }
        } catch (Exception e) {
            log.warn("DatabaseMigrationRunner: could not check/add column {}.{}: {}", table, column, e.getMessage());
        }
    }
}
