package com.retailpulse.service.support;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Format-agnostic report document. Data builders produce this; renderers
 * (PDF/XLSX/CSV/PPTX) turn it into the final artifact, so every format of a
 * given report type carries identical, complete content.
 */
public record ReportDocument(
        String title,
        String filterSummary,
        String generatedBy,
        LocalDateTime generatedAt,
        List<Kpi> kpis,
        List<Table> tables
) {

    public record Kpi(String label, String value, String change) {
    }

    /**
     * @param rows row values as strings/numbers; renderers decide formatting.
     *             Row counts are capped by ReportFilter.MAX_ROWS upstream.
     */
    public record Table(String title, List<String> headers, List<List<Object>> rows) {
    }
}
