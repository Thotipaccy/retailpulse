package com.retailpulse.dto.request;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Unified filter contract applied to every report type and every scheduled
 * report. Accepts both startDate/dateStart spellings so legacy callers keep
 * working; explicit date ranges always win over the relative period.
 */
public final class ReportFilter {

    public static final int MAX_ROWS = 10_000;

    private static final DateTimeFormatter PRETTY = DateTimeFormatter.ofPattern("MMM d, yyyy");

    private final String period;
    private final LocalDate start;
    private final LocalDate end;
    private final String category;

    private ReportFilter(String period, LocalDate start, LocalDate end, String category) {
        this.period = period;
        this.start = start;
        this.end = end;
        this.category = category;
    }

    public static ReportFilter from(Map<String, String> params) {
        Map<String, String> p = params != null ? params : Map.of();
        String period = firstNonBlank(p.get("period"), "monthly").toLowerCase();
        LocalDate start = parseDate(firstNonBlank(p.get("startDate"), p.get("dateStart")));
        LocalDate end = parseDate(firstNonBlank(p.get("endDate"), p.get("dateEnd")));
        if (start != null && end != null && end.isBefore(start)) {
            LocalDate tmp = start;
            start = end;
            end = tmp;
        }
        return new ReportFilter(period, start, end, blankToNull(p.get("category")));
    }

    /** Relative window used when no explicit range is supplied. */
    public LocalDateTime since() {
        if (start != null) {
            return start.atStartOfDay();
        }
        LocalDateTime now = LocalDateTime.now();
        return switch (period) {
            case "daily" -> now.minusDays(1);
            case "weekly" -> now.minusWeeks(1);
            case "yearly" -> now.minusYears(1);
            default -> now.minusMonths(1);
        };
    }

    public LocalDateTime until() {
        if (end != null) {
            return end.plusDays(1).atStartOfDay();
        }
        return start != null ? LocalDateTime.now() : null;
    }

    /** Human-readable summary embedded in generated documents and history rows. */
    public String describe() {
        String base;
        if (start != null && end != null) {
            base = PRETTY.format(start) + " – " + PRETTY.format(end);
        } else if (start != null) {
            base = "From " + PRETTY.format(start);
        } else if (end != null) {
            base = "Until " + PRETTY.format(end);
        } else {
            base = "Last " + period;
        }
        if (category != null) {
            base += " · Category: " + category;
        }
        return base;
    }

    public Map<String, String> asParams() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("period", period);
        if (start != null) m.put("startDate", start.toString());
        if (end != null) m.put("endDate", end.toString());
        if (category != null) m.put("category", category);
        return m;
    }

    public boolean hasExplicitRange() {
        return start != null || end != null;
    }

    public String period() {
        return period;
    }

    public String category() {
        return category;
    }

    private static LocalDate parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim(), DateTimeFormatter.ISO_LOCAL_DATE);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException(
                    "Invalid date '" + value + "' — expected ISO format yyyy-MM-dd");
        }
    }

    private static String firstNonBlank(String a, String b) {
        return (a != null && !a.isBlank()) ? a : b;
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}
