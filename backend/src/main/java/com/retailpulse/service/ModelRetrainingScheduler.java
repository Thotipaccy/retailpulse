package com.retailpulse.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * ModelRetrainingScheduler
 * ========================
 * Triggers background AI model retraining automatically with no user interaction.
 *
 * Two mechanisms:
 *   1. Record threshold — fires after 30 new transaction records accumulate
 *      (via notifyNewRecord() called from SalesService and PosDataImportService)
 *   2. Daily schedule    — fires at 02:00 every day regardless of record count
 *
 * Both paths call the AI service's non-blocking POST /ml/retrain endpoint.
 * The heavy work runs in the AI service's daemon thread — Spring never blocks.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ModelRetrainingScheduler {

    private static final int RECORD_THRESHOLD = 30;

    private final AIServiceClient aiServiceClient;
    private final AuditLogService auditLogService;

    /** Counts new records since the last triggered retraining. */
    private final AtomicInteger newRecordCounter = new AtomicInteger(0);

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Called by SalesService after every recorded sale and by
     * AsyncImportService after every CSV/Excel import.
     *
     * Increments the counter. When the threshold is reached the counter resets
     * and retraining fires asynchronously in the AI service.
     *
     * @param count number of new transaction items saved
     */
    public void notifyNewRecord(int count) {
        if (count <= 0) return;
        int total = newRecordCounter.addAndGet(count);
        log.debug("New record counter: {}/{}", total, RECORD_THRESHOLD);
        if (total >= RECORD_THRESHOLD) {
            newRecordCounter.set(0);
            triggerRetrain("record_threshold_" + total);
        }
    }

    /**
     * Daily retraining at 02:00 (server local time).
     * Cron: second=0, minute=0, hour=2, any day/month/weekday.
     */
    @Scheduled(cron = "0 0 2 * * *")
    public void scheduledDailyRetrain() {
        log.info("[Scheduler] Daily retrain triggered at 02:00");
        triggerRetrain("daily_schedule");
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private void triggerRetrain(String reason) {
        if (!aiServiceClient.isHealthy()) {
            log.warn("[Retrain] AI service not reachable — skipping trigger (reason={})", reason);
            return;
        }
        try {
            Map<String, Object> body = Map.of("reason", reason, "min_records", 0);
            aiServiceClient.retrain(body).ifPresentOrElse(
                    result -> log.info("[Retrain] Triggered (reason={}) → AI response: {}", reason, result.get("status")),
                    ()     -> log.warn("[Retrain] AI service returned empty response (reason={})", reason)
            );
            auditLogService.logSystem(
                    "AI_RETRAIN_TRIGGERED",
                    "Model retraining triggered automatically (reason=" + reason + ")",
                    "ai_models",
                    reason
            );
        } catch (Exception ex) {
            log.error("[Retrain] Failed to trigger retraining (reason={}): {}", reason, ex.getMessage());
        }
    }
}
