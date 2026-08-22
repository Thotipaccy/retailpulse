package com.retailpulse.service;

import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.ColumnText;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfWriter;
import com.retailpulse.dto.request.ReportFilter;
import com.retailpulse.repository.AuditLogRepository;
import com.retailpulse.repository.TransactionItemRepository;
import com.retailpulse.service.support.ReportDocument;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextBox;
import org.apache.poi.xslf.usermodel.XSLFTextParagraph;
import org.apache.poi.xslf.usermodel.XSLFTextRun;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.awt.Rectangle;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Enterprise report generation pipeline.
 *
 * A {@link ReportDocument} (title + filters + KPIs + tables) is assembled once
 * per report type and rendered identically to PDF, Excel, CSV and PPTX, so all
 * formats of the same report carry the same complete, filtered content.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportGeneratorService {

    public static final Path REPORTS_DIR = Path.of("reports");

    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd_HHmm");
    private static final DateTimeFormatter HUMAN = DateTimeFormatter.ofPattern("MMM d, yyyy HH:mm");

    private static final Color BRAND_DARK = new Color(38, 50, 56);
    private static final Color ZEBRA = new Color(245, 246, 247);

    private final DashboardService dashboardService;
    private final SalesService salesService;
    private final InventoryService inventoryService;
    private final CustomerService customerService;
    private final AIServiceClient aiServiceClient;
    private final TransactionItemRepository transactionItemRepository;
    private final AuditLogRepository auditLogRepository;

    public enum OutputFormat {PDF, EXCEL, CSV, PPTX}

    public record GeneratedReport(Path filePath, String fileName, String contentType) {
    }

    // â”€â”€ Entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    public GeneratedReport generate(String reportId, String reportType, String requestedFormat,
                                    ReportFilter filter, String generatedBy) {
        OutputFormat format = parseFormat(requestedFormat);
        ReportFilter safeFilter = filter != null ? filter : ReportFilter.from(Map.of());
        ReportDocument doc = buildDocument(reportType, safeFilter, generatedBy);

        String fileName = slug(reportType) + "_" + STAMP.format(doc.generatedAt()) + "." + extension(format);
        try {
            Files.createDirectories(REPORTS_DIR);
            Path target = REPORTS_DIR.resolve(reportId + "__" + fileName);
            switch (format) {
                case CSV -> renderCsv(doc, target);
                case EXCEL -> renderExcel(doc, target);
                case PPTX -> renderPptx(doc, target);
                default -> renderPdf(doc, target);
            }
            log.info("Generated {} report {} -> {}", format, reportType, target);
            return new GeneratedReport(target, fileName, contentType(format));
        } catch (IOException e) {
            log.error("Failed to write {} report", format, e);
            throw new RuntimeException("Failed to write report file", e);
        }
    }

    public static OutputFormat parseFormat(String requested) {
        String f = requested == null ? "" : requested.toLowerCase(Locale.ROOT);
        return switch (f) {
            case "excel", "xlsx" -> OutputFormat.EXCEL;
            case "csv" -> OutputFormat.CSV;
            case "pptx", "ppt" -> OutputFormat.PPTX;
            default -> OutputFormat.PDF;
        };
    }

    public static String contentType(OutputFormat format) {
        return switch (format) {
            case PDF -> "application/pdf";
            case EXCEL -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case CSV -> "text/csv;charset=UTF-8";
            case PPTX -> "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        };
    }

    private static String extension(OutputFormat format) {
        return switch (format) {
            case PDF -> "pdf";
            case EXCEL -> "xlsx";
            case CSV -> "csv";
            case PPTX -> "pptx";
        };
    }

    private static String slug(String reportType) {
        return (reportType == null ? "report" : reportType)
                .toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "_");
    }

    // â”€â”€ Data builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    public ReportDocument buildDocument(String reportType, ReportFilter filter, String generatedBy) {
        LocalDateTime now = LocalDateTime.now();
        return switch (reportType == null ? "" : reportType) {
            case "sales-summary" -> salesSummary(filter, generatedBy, now);
            case "inventory-status" -> inventoryStatus(filter, generatedBy, now);
            case "customer-analytics" -> customerAnalytics(generatedBy, now);
            case "transaction-history" -> transactionHistory(filter, generatedBy, now);
            case "audit-trail" -> auditTrail(filter, generatedBy, now);
            case "forecast-report" -> forecastReport(generatedBy, now);
            default -> dashboardSummary(generatedBy, now);
        };
    }

    private ReportDocument salesSummary(ReportFilter filter, String by, LocalDateTime now) {
        Map<String, Object> overview = salesService.getOverview(
                filter.period(),
                filter.hasExplicitRange() ? paramDateStart(filter) : null,
                filter.hasExplicitRange() ? paramDateEnd(filter) : null);

        List<ReportDocument.Kpi> kpis = List.of(
                new ReportDocument.Kpi("Revenue", str(overview.get("periodRevenue")), pct(overview.get("growthRate"))),
                new ReportDocument.Kpi("Units Sold", str(overview.get("totalUnits")), ""),
                new ReportDocument.Kpi("Avg Order Value", str(overview.get("averageOrderValue")), ""));

        List<ReportDocument.Table> tables = new ArrayList<>();
        tables.add(tableFromMaps("Sales Trend",
                listOfMaps(overview.get("trend"))));
        tables.add(tableFromMaps("Revenue by Category",
                salesService.getByCategory(
                        filter.period(),
                        filter.hasExplicitRange() ? paramDateStart(filter) : null,
                        filter.hasExplicitRange() ? paramDateEnd(filter) : null)));
        return new ReportDocument("Sales Summary", filter.describe(), by, now, kpis, tables);
    }

    private ReportDocument inventoryStatus(ReportFilter filter, String by, LocalDateTime now) {
        Map<String, Object> summary = inventoryService.getSummary();
        List<ReportDocument.Kpi> kpis = List.of(
                new ReportDocument.Kpi("Total Products", str(summary.get("totalProducts")), ""),
                new ReportDocument.Kpi("Healthy", str(summary.get("healthy")), ""),
                new ReportDocument.Kpi("Low Stock", str(summary.get("low")), ""),
                new ReportDocument.Kpi("Critical", str(summary.get("critical")), ""),
                new ReportDocument.Kpi("Overstock", str(summary.get("overstock")), ""));

        List<Map<String, Object>> levels = inventoryService.getStockLevels(true);
        if (filter.category() != null) {
            levels = levels.stream()
                    .filter(r -> filter.category().equalsIgnoreCase(str(r.get("category"))))
                    .toList();
        }
        List<ReportDocument.Table> tables = new ArrayList<>();
        tables.add(cappedTable("Stock Levels (" + levels.size() + " items)", levels,
                List.of("skuCode", "productName", "category", "quantityOnHand",
                        "reorderPoint", "stockStatus", "unitPrice"),
                List.of("SKU", "Product", "Category", "On Hand", "Reorder Pt", "Status", "Unit Price")));
        return new ReportDocument("Inventory Status", filter.describe(), by, now, kpis, tables);
    }

    private ReportDocument customerAnalytics(String by, LocalDateTime now) {
        Map<String, Object> summary = customerService.getSummary();
        List<ReportDocument.Kpi> kpis = List.of(
                new ReportDocument.Kpi("Total Customers", str(summary.get("totalCustomers")), summary.get("customerGrowth") != null ? str(summary.get("customerGrowth")) : ""),
                new ReportDocument.Kpi("Loyalty Members", str(summary.get("loyaltyMembers")), ""),
                new ReportDocument.Kpi("Avg Lifetime Value", str(summary.get("avgLifetimeValue")), ""),
                new ReportDocument.Kpi("High Churn Risk", str(summary.get("highChurnRisk")), ""));

        List<ReportDocument.Table> tables = new ArrayList<>();
        tables.add(tableFromMaps("RFM Segments", customerService.getSegments()));
        tables.add(cappedTable("Top Customers", customerService.getTopCustomers(25),
                List.of("name", "totalOrders", "lifetimeValue", "rfmSegment"),
                List.of("Customer", "Orders", "Lifetime Value", "Segment")));
        return new ReportDocument("Customer Analytics", "All time", by, now, kpis, tables);
    }

    private ReportDocument transactionHistory(ReportFilter filter, String by, LocalDateTime now) {
        var items = transactionItemRepository.findLineItemsBetween(
                filter.since(), filter.until() != null ? filter.until() : now, filter.category());

        List<List<Object>> rows = new ArrayList<>();
        int skippedPayment = 0;
        for (var ti : items) {
            if (rows.size() >= ReportFilter.MAX_ROWS) {
                break;
            }
            var t = ti.getTransaction();
            var p = ti.getProduct();
            rows.add(List.of(
                    t.getTransactionDate().toLocalDate() + " " + t.getTransactionDate().toLocalTime().withNano(0),
                    t.getTransactionId(),
                    t.getCustomer() != null ? t.getCustomer().getCustomerName() : "Walk-in",
                    p.getSkuCode(),
                    p.getProductName(),
                    p.getCategory() != null ? p.getCategory().getCategoryName() : "",
                    ti.getQuantity(),
                    ti.getUnitPrice(),
                    ti.getLineTotal(),
                    String.valueOf(t.getPaymentMethod()),
                    t.getPaymentStatus()));
        }
        if (skippedPayment > 0) {
            log.debug("Skipped {} rows by payment filter", skippedPayment);
        }

        List<ReportDocument.Kpi> kpis = List.of(
                new ReportDocument.Kpi("Line Items", String.valueOf(items.size()), ""),
                new ReportDocument.Kpi("Exported Rows", String.valueOf(Math.min(rows.size(), ReportFilter.MAX_ROWS)), ""));
        ReportDocument.Table table = new ReportDocument.Table(
                rows.size() >= ReportFilter.MAX_ROWS
                        ? "Transactions (first " + ReportFilter.MAX_ROWS + ", newest first)"
                        : "Transactions",
                List.of("Date", "Invoice", "Customer", "SKU", "Product", "Category",
                        "Qty", "Unit Price", "Line Total", "Payment", "Status"),
                rows);
        return new ReportDocument("Transaction History", filter.describe(), by, now, kpis, List.of(table));
    }

    private ReportDocument auditTrail(ReportFilter filter, String by, LocalDateTime now) {
        List<com.retailpulse.model.AuditLog> logs = auditLogRepository.findTop1000ByOrderByCreatedAtDesc();
        List<List<Object>> rows = new ArrayList<>();
        for (var entry : logs) {
            if (!filter.hasExplicitRange()) {
                if (entry.getCreatedAt().isBefore(filter.since())) {
                    continue;
                }
            } else {
                if (filter.until() != null && !entry.getCreatedAt().isBefore(filter.until())) {
                    continue;
                }
                if (entry.getCreatedAt().isBefore(filter.since())) {
                    continue;
                }
            }
            if (rows.size() >= ReportFilter.MAX_ROWS) {
                break;
            }
            rows.add(List.of(
                    entry.getCreatedAt().withNano(0).toString(),
                    entry.getUser() != null ? entry.getUser().getEmail() : "system",
                    entry.getActionType(),
                    nz(entry.getDescription()),
                    nz(entry.getAffectedEntity()),
                    nz(entry.getAffectedEntityId()),
                    nz(entry.getIpAddress())));
        }
        ReportDocument.Table table = new ReportDocument.Table(
                rows.size() >= ReportFilter.MAX_ROWS
                        ? "Audit Entries (first " + ReportFilter.MAX_ROWS + ")"
                        : "Audit Entries",
                List.of("Timestamp", "User", "Action", "Description", "Entity", "Entity ID", "IP Address"),
                rows);
        return new ReportDocument("Audit Trail", filter.describe(), by, now, List.of(), List.of(table));
    }

    private ReportDocument forecastReport(String by, LocalDateTime now) {
        List<ReportDocument.Kpi> kpis = new ArrayList<>();
        List<ReportDocument.Table> tables = new ArrayList<>();
        var statusOpt = aiServiceClient.getModelStatus();
        if (statusOpt.isPresent()) {
            Map<String, Object> s = statusOpt.get();
            @SuppressWarnings("unchecked")
            Map<String, Object> demand = (Map<String, Object>) s.getOrDefault("demand", s);
            kpis.add(new ReportDocument.Kpi("Forecast Accuracy (weekly)", pct(demand.get("accuracy")), ""));
            kpis.add(new ReportDocument.Kpi("7-Day Precision", pct(demand.get("weekly_precision")), ""));
            kpis.add(new ReportDocument.Kpi("Seasonality Score", pct(demand.get("seasonal_score")), ""));
            tables.add(new ReportDocument.Table("Model Details",
                    List.of("Metric", "Value"),
                    List.of(
                            List.of("Data days in training window", str(demand.get("data_days"))),
                            List.of("Seasonality reliable", str(demand.get("seasonal_reliable"))),
                            List.of("Stockout model accuracy", pct(s.get("stockout_accuracy"))),
                            List.of("Generated", HUMAN.format(now)))));
        } else {
            tables.add(new ReportDocument.Table("Model Status",
                    List.of("Metric", "Value"),
                    List.of(List.of("AI service", "unreachable â€” metrics unavailable"))));
        }
        return new ReportDocument("Demand Forecast Report", "Current models", by, now, kpis, tables);
    }

    private ReportDocument dashboardSummary(String by, LocalDateTime now) {
        Map<String, Object> summary = dashboardService.getSummary();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> kpiMaps = (List<Map<String, Object>>) summary.get("kpis");
        List<ReportDocument.Kpi> kpis = new ArrayList<>();
        if (kpiMaps != null) {
            for (Map<String, Object> k : kpiMaps) {
                kpis.add(new ReportDocument.Kpi(str(k.get("label")), str(k.get("value")), pct(k.get("trendValue"))));
            }
        }
        return new ReportDocument("Dashboard Summary", "Current snapshot", by, now, kpis, List.of());
    }

    // â”€â”€ Table helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /** Generic converter: renders service maps using their natural key order. */
    private ReportDocument.Table tableFromMaps(String title, List<Map<String, Object>> maps) {
        if (maps == null || maps.isEmpty()) {
            return new ReportDocument.Table(title, List.of("No data"), List.of());
        }
        List<String> headers = new ArrayList<>(maps.get(0).keySet());
        List<List<Object>> rows = maps.stream()
                .map(m -> headers.stream().map(h -> (Object) nz(str(m.get(h)))).toList())
                .toList();
        return new ReportDocument.Table(title, headers, rows);
    }

    /** Explicit-column converter with friendly header labels and row cap. */
    private ReportDocument.Table cappedTable(String title, List<Map<String, Object>> maps,
                                             List<String> keys, List<String> labels) {
        List<List<Object>> rows = new ArrayList<>();
        if (maps != null) {
            for (Map<String, Object> m : maps) {
                if (rows.size() >= ReportFilter.MAX_ROWS) {
                    break;
                }
                rows.add(keys.stream().map(k -> (Object) nz(str(m.get(k)))).toList());
            }
        }
        if (maps != null && maps.size() > rows.size()) {
            title += " (first " + rows.size() + ")";
        }
        return new ReportDocument.Table(title, labels, rows);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> listOfMaps(Object o) {
        return o instanceof List ? (List<Map<String, Object>>) o : List.of();
    }

    private static String paramDateStart(ReportFilter f) {
        return f.asParams().get("startDate");
    }

    private static String paramDateEnd(ReportFilter f) {
        return f.asParams().get("endDate");
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private static String nz(String s) {
        return s == null || s.isBlank() ? "â€”" : s;
    }

    private static String pct(Object o) {
        return o == null ? "" : o + "%";
    }

    // â”€â”€ Renderers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private void renderCsv(ReportDocument doc, Path target) throws IOException {
        StringBuilder sb = new StringBuilder("\uFEFF");
        sb.append(escape("RetailPulse â€” ")).append(escape(doc.title())).append('\n');
        sb.append("# Filter,").append(escape(doc.filterSummary())).append('\n');
        sb.append("# Generated,").append(HUMAN.format(doc.generatedAt())).append('\n');
        sb.append("# Generated by,").append(escape(doc.generatedBy())).append("\n\n");

        if (!doc.kpis().isEmpty()) {
            sb.append("Key Metrics\nMetric,Value,Change\n");
            for (var k : doc.kpis()) {
                sb.append(escape(k.label())).append(',').append(escape(k.value())).append(',')
                        .append(escape(k.change())).append('\n');
            }
            sb.append('\n');
        }
        for (var table : doc.tables()) {
            sb.append(escape(table.title())).append('\n');
            sb.append(table.headers().stream().map(this::escape).collect(Collectors.joining(","))).append('\n');
            for (var row : table.rows()) {
                sb.append(row.stream().map(v -> escape(str(v))).collect(Collectors.joining(","))).append('\n');
            }
            sb.append('\n');
        }
        Files.writeString(target, sb.toString());
    }

    private String escape(String v) {
        String s = v == null ? "" : v.replace("\"", "\"\"");
        if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.startsWith("=")) {
            return '"' + s + '"';
        }
        return s;
    }

    private void renderExcel(ReportDocument doc, Path target) throws IOException {
        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet(safeSheetName(doc.title()));

            org.apache.poi.ss.usermodel.Font titleFont = wb.createFont();
            titleFont.setBold(true);
            titleFont.setFontHeightInPoints((short) 15);
            CellStyle titleStyle = wb.createCellStyle();
            titleStyle.setFont(titleFont);

            org.apache.poi.ss.usermodel.Font headFont = wb.createFont();
            headFont.setBold(true);
            CellStyle headStyle = wb.createCellStyle();
            headStyle.setFont(headFont);
            headStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            headStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            CellStyle metaStyle = wb.createCellStyle();
            org.apache.poi.ss.usermodel.Font metaFont = wb.createFont();
            metaFont.setColor(IndexedColors.GREY_50_PERCENT.getIndex());
            metaStyle.setFont(metaFont);

            int r = 0;
            Row titleRow = sheet.createRow(r++);
            Cell tc = titleRow.createCell(0);
            tc.setCellValue("RetailPulse â€” " + doc.title());
            tc.setCellStyle(titleStyle);

            for (String meta : List.of("Filter: " + doc.filterSummary(),
                    "Generated: " + HUMAN.format(doc.generatedAt()),
                    "By: " + doc.generatedBy())) {
                Row mrow = sheet.createRow(r++);
                Cell mc = mrow.createCell(0);
                mc.setCellValue(meta);
                mc.setCellStyle(metaStyle);
            }

            if (!doc.kpis().isEmpty()) {
                r++;
                Row h = sheet.createRow(r++);
                h.createCell(0).setCellValue("Key Metric");
                h.createCell(1).setCellValue("Value");
                h.createCell(2).setCellValue("Change");
                styleHeader(h, headStyle, 3);
                for (var k : doc.kpis()) {
                    Row row = sheet.createRow(r++);
                    row.createCell(0).setCellValue(k.label());
                    writeTyped(row.createCell(1), k.value());
                    row.createCell(2).setCellValue(k.change());
                }
            }

            for (var table : doc.tables()) {
                r++;
                Row sec = sheet.createRow(r++);
                Cell sc = sec.createCell(0);
                sc.setCellValue(table.title());
                sc.setCellStyle(titleStyle);

                Row h = sheet.createRow(r++);
                for (int c = 0; c < table.headers().size(); c++) {
                    h.createCell(c).setCellValue(table.headers().get(c));
                }
                styleHeader(h, headStyle, table.headers().size());

                for (var rowVals : table.rows()) {
                    Row row = sheet.createRow(r++);
                    for (int c = 0; c < rowVals.size(); c++) {
                        writeTyped(row.createCell(c), str(rowVals.get(c)));
                    }
                }
            }

            for (int c = 0; c < 12; c++) {
                sheet.autoSizeColumn(c);
            }
            try (var fos = Files.newOutputStream(target)) {
                wb.write(fos);
            }
        }
    }

    private void styleHeader(Row h, CellStyle style, int cols) {
        for (int c = 0; c < cols; c++) {
            h.getCell(c).setCellStyle(style);
        }
    }

    /** Numeric-looking strings become real numbers so Excel can aggregate them. */
    private void writeTyped(Cell cell, String value) {
        if (value == null || value.isBlank()) {
            cell.setCellValue("");
            return;
        }
        try {
            cell.setCellValue(new BigDecimal(value.trim()).doubleValue());
        } catch (NumberFormatException e) {
            cell.setCellValue(value);
        }
    }

    private String safeSheetName(String title) {
        String name = title.replaceAll("[\\\\/*?:\\[\\]]", "").trim();
        return name.length() > 28 ? name.substring(0, 28) : name;
    }

    private void renderPdf(ReportDocument doc, Path target) throws IOException {
        Document document = new Document(PageSize.A4, 40, 40, 44, 52);
        try {
            PdfWriter writer = PdfWriter.getInstance(document, Files.newOutputStream(target));
            writer.setPageEvent(new FooterEvent());
            document.open();

            Font brandFont = new Font(Font.HELVETICA, 9, Font.NORMAL, Color.GRAY);
            Font titleFont = new Font(Font.HELVETICA, 17, Font.BOLD, Color.WHITE);
            Font subFont = new Font(Font.HELVETICA, 9, Font.NORMAL, new Color(70, 80, 90));
            Font headFont = new Font(Font.HELVETICA, 9, Font.BOLD, Color.WHITE);
            Font bodyFont = new Font(Font.HELVETICA, 8.5f, Font.NORMAL, Color.BLACK);
            Font kpiLabel = new Font(Font.HELVETICA, 8, Font.NORMAL, new Color(110, 120, 130));
            Font kpiValue = new Font(Font.HELVETICA, 13, Font.BOLD, BRAND_DARK);

            Paragraph brand = new Paragraph("RETAILPULSE  Â·  INTELLIGENT RETAIL ANALYTICS", brandFont);
            brand.setSpacingAfter(6);
            document.add(brand);

            PdfPTable banner = new PdfPTable(1);
            banner.setWidthPercentage(100);
            PdfPCell bannerCell = new PdfPCell(new Phrase(doc.title(), titleFont));
            bannerCell.setBackgroundColor(BRAND_DARK);
            bannerCell.setPaddingTop(10);
            bannerCell.setPaddingBottom(10);
            bannerCell.setPaddingLeft(12);
            bannerCell.setBorder(PdfPCell.NO_BORDER);
            banner.addCell(bannerCell);
            document.add(banner);

            Paragraph meta = new Paragraph("Filter: " + doc.filterSummary()
                    + "     Generated: " + HUMAN.format(doc.generatedAt())
                    + "     By: " + doc.generatedBy(), subFont);
            meta.setSpacingBefore(6);
            meta.setSpacingAfter(12);
            document.add(meta);

            if (!doc.kpis().isEmpty()) {
                PdfPTable kpiTable = new PdfPTable(Math.min(4, Math.max(2, doc.kpis().size())));
                kpiTable.setWidthPercentage(100);
                kpiTable.setSpacingAfter(14);
                for (var k : doc.kpis()) {
                    PdfPCell cell = new PdfPCell();
                    cell.addElement(new Phrase(k.value() != null && !k.value().isBlank() ? k.value() : "â€”", kpiValue));
                    cell.addElement(new Phrase(k.label() + (k.change() != null && !k.change().isBlank() ? "   " + k.change() : ""), kpiLabel));
                    cell.setBackgroundColor(ZEBRA);
                    cell.setBorder(PdfPCell.NO_BORDER);
                    cell.setPadding(8);
                    kpiTable.addCell(cell);
                }
                document.add(kpiTable);
            }

            for (var table : doc.tables()) {
                Paragraph section = new Paragraph(table.title(),
                        new Font(Font.HELVETICA, 11, Font.BOLD, BRAND_DARK));
                section.setSpacingBefore(10);
                section.setSpacingAfter(6);
                document.add(section);

                if (table.rows().isEmpty()) {
                    document.add(new Paragraph("No data for the selected filters.", bodyFont));
                    continue;
                }

                PdfPTable t = new PdfPTable(table.headers().size());
                t.setWidthPercentage(100);
                t.setSpacingAfter(10);
                t.setHeaderRows(1);
                for (String h : table.headers()) {
                    PdfPCell hc = new PdfPCell(new Phrase(h, headFont));
                    hc.setBackgroundColor(BRAND_DARK);
                    hc.setPadding(5);
                    hc.setBorderColor(Color.LIGHT_GRAY);
                    t.addCell(hc);
                }
                int i = 0;
                for (var row : table.rows()) {
                    for (Object v : row) {
                        PdfPCell dc = new PdfPCell(new Phrase(str(v), bodyFont));
                        dc.setPadding(4);
                        dc.setBorderColor(Color.LIGHT_GRAY);
                        if (i % 2 == 1) {
                            dc.setBackgroundColor(ZEBRA);
                        }
                        t.addCell(dc);
                    }
                    i++;
                }
                document.add(t);
            }
            document.close();
        } catch (Exception e) {
            throw new IOException("PDF rendering failed", e);
        }
    }

    private static class FooterEvent extends PdfPageEventHelper {
        private final Font footerFont = new Font(Font.HELVETICA, 7.5f, Font.NORMAL, Color.GRAY);

        @Override
        public void onEndPage(PdfWriter writer, Document d) {
            PdfContentByte cb = writer.getDirectContent();
            ColumnText.showTextAligned(cb, Element.ALIGN_LEFT,
                    new Phrase("RetailPulse â€” confidential business report", footerFont),
                    d.left(), d.bottom() - 20, 0);
            ColumnText.showTextAligned(cb, Element.ALIGN_RIGHT,
                    new Phrase("Page " + writer.getPageNumber(), footerFont),
                    d.right(), d.bottom() - 20, 0);
        }
    }

    private void renderPptx(ReportDocument doc, Path target) throws IOException {
        try (XMLSlideShow ppt = new XMLSlideShow()) {
            ppt.setPageSize(new java.awt.Dimension(960, 540));

            XSLFSlide cover = ppt.createSlide();
            addTextBox(ppt, cover, "RetailPulse â€” " + doc.title(), 36, true, 30, 150, 900, 70);
            addTextBox(ppt, cover, doc.filterSummary(), 18, false, 30, 230, 900, 40);
            addTextBox(ppt, cover,
                    "Generated " + HUMAN.format(doc.generatedAt()) + " Â· by " + doc.generatedBy(),
                    12, false, 30, 280, 900, 30);

            if (!doc.kpis().isEmpty()) {
                XSLFSlide kpiSlide = ppt.createSlide();
                addTextBox(ppt, kpiSlide, "Key Metrics", 26, true, 30, 20, 900, 50);
                StringBuilder bullets = new StringBuilder();
                for (var k : doc.kpis()) {
                    bullets.append(k.label()).append(": ").append(k.value());
                    if (k.change() != null && !k.change().isBlank()) {
                        bullets.append("  (").append(k.change()).append(')');
                    }
                    bullets.append('\n');
                }
                addTextBox(ppt, kpiSlide, bullets.toString().trim(), 16, false, 40, 80, 880, 420);
            }

            for (var table : doc.tables()) {
                XSLFSlide slide = ppt.createSlide();
                addTextBox(ppt, slide, table.title(), 22, true, 30, 20, 900, 45);
                int shown = Math.min(12, table.rows().size());
                StringBuilder b = new StringBuilder();
                for (int i = 0; i < shown; i++) {
                    var row = table.rows().get(i);
                    List<String> parts = new ArrayList<>();
                    for (int c = 0; c < Math.min(4, row.size()); c++) {
                        parts.add(table.headers().size() > c ? table.headers().get(c) + ": " + str(row.get(c)) : str(row.get(c)));
                    }
                    b.append("â€¢ ").append(String.join("   ", parts)).append('\n');
                }
                if (table.rows().size() > shown) {
                    b.append("+ ").append(table.rows().size() - shown)
                            .append(" more rows â€” see the Excel/PDF export");
                }
                addTextBox(ppt, slide, b.toString(), 13, false, 40, 75, 880, 430);
            }

            try (var out = Files.newOutputStream(target)) {
                ppt.write(out);
            }
        }
    }

    private void addTextBox(XMLSlideShow ppt, XSLFSlide slide, String text,
                            double fontSize, boolean bold, int x, int y, int w, int h) {
        XSLFTextBox box = slide.createTextBox();
        box.setAnchor(new Rectangle(x, y, w, h));
        XSLFTextParagraph para = box.addNewTextParagraph();
        XSLFTextRun run = para.addNewTextRun();
        run.setText(text);
        run.setFontSize(fontSize);
        run.setBold(bold);
        run.setFontColor(java.awt.Color.darkGray);
    }
}
