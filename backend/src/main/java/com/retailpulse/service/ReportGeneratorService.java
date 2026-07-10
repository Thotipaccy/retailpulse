package com.retailpulse.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

import com.lowagie.text.Document;
import com.lowagie.text.Font;
import com.lowagie.text.Paragraph;
import com.lowagie.text.pdf.PdfWriter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

@Slf4j
@Service
@RequiredArgsConstructor
public class ReportGeneratorService {

    private final DashboardService dashboardService;
    private final SalesService salesService;
    private final InventoryService inventoryService;
    private final CustomerService customerService;

    public String generateCsvReport(String reportId, String reportType, Map<String, String> params) {
        try {
            Path reportsDir = Paths.get("reports");
            if (!Files.exists(reportsDir)) {
                Files.createDirectories(reportsDir);
            }

            String filename = reportId + ".csv";
            Path filePath = reportsDir.resolve(filename);

            StringBuilder csvBuilder = new StringBuilder();
            csvBuilder.append("RetailPulse Report: ").append(reportType).append("\n");
            csvBuilder.append("Generated At: ").append(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)).append("\n\n");

            if ("sales-summary".equals(reportType)) {
                buildSalesSummary(csvBuilder, params);
            } else if ("inventory-status".equals(reportType)) {
                buildInventoryStatus(csvBuilder);
            } else if ("customer-analytics".equals(reportType)) {
                buildCustomerAnalytics(csvBuilder);
            } else {
                buildDashboardSummary(csvBuilder);
            }

            Files.writeString(filePath, csvBuilder.toString());
            log.info("Successfully wrote report to {}", filePath.toAbsolutePath());
            return filePath.toString();
        } catch (IOException e) {
            log.error("Failed to generate CSV report", e);
            throw new RuntimeException("Failed to write report file", e);
        }
    }

    private void buildSalesSummary(StringBuilder csv, Map<String, String> params) {
        csv.append("Sales Summary\n");
        Map<String, Object> overview = salesService.getOverview(
                params.get("period"), params.get("dateStart"), params.get("dateEnd"));
        
        csv.append("Period Revenue,Growth Rate,Total Units,AOV\n");
        csv.append(String.format("%s,%s,%s,%s\n\n",
                overview.get("periodRevenue"), overview.get("growthRate"),
                overview.get("totalUnits"), overview.get("averageOrderValue")));
        
        csv.append("Trend Data\n");
        csv.append("Label,Value\n");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> trend = (List<Map<String, Object>>) overview.get("trend");
        if (trend != null) {
            for (Map<String, Object> data : trend) {
                csv.append(String.format("%s,%s\n", data.get("name"), data.get("value")));
            }
        }
    }

    private void buildInventoryStatus(StringBuilder csv) {
        csv.append("Inventory Summary\n");
        Map<String, Object> summary = inventoryService.getSummary();
        csv.append("Total Products,Healthy,Low,Critical,Overstock\n");
        csv.append(String.format("%s,%s,%s,%s,%s\n\n",
                summary.get("totalProducts"), summary.get("healthy"),
                summary.get("low"), summary.get("critical"), summary.get("overstock")));
    }

    private void buildCustomerAnalytics(StringBuilder csv) {
        csv.append("Customer Segments\n");
        List<Map<String, Object>> segments = customerService.getSegments();
        csv.append("Segment,Count,Avg LTV\n");
        for (Map<String, Object> seg : segments) {
            csv.append(String.format("%s,%s,%s\n",
                    seg.get("name"), seg.get("value"), seg.get("avgLtv")));
        }
    }

    private void buildDashboardSummary(StringBuilder csv) {
        csv.append("Dashboard KPIs\n");
        Map<String, Object> summary = dashboardService.getSummary();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> kpis = (List<Map<String, Object>>) summary.get("kpis");
        
        csv.append("Metric,Value,Change\n");
        if (kpis != null) {
            for (Map<String, Object> kpi : kpis) {
                csv.append(String.format("%s,%s,%s%%\n",
                        kpi.get("label"), kpi.get("value"), kpi.get("trendValue")));
            }
        }
    }

    public String generatePdfReport(String reportId, String reportType, Map<String, String> params) {
        try {
            Path reportsDir = Paths.get("reports");
            if (!Files.exists(reportsDir)) {
                Files.createDirectories(reportsDir);
            }

            String filename = reportId + ".pdf";
            Path filePath = reportsDir.resolve(filename);

            Document document = new Document();
            PdfWriter.getInstance(document, new java.io.FileOutputStream(filePath.toFile()));
            document.open();

            Font titleFont = new Font(Font.HELVETICA, 18, Font.BOLD);
            Font normalFont = new Font(Font.HELVETICA, 12, Font.NORMAL);

            document.add(new Paragraph("RetailPulse Report: " + reportType, titleFont));
            document.add(new Paragraph("Generated At: " + LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME), normalFont));
            document.add(new Paragraph(" "));

            if ("sales-summary".equals(reportType)) {
                Map<String, Object> overview = salesService.getOverview(
                        params.get("period"), params.get("dateStart"), params.get("dateEnd"));
                document.add(new Paragraph(String.format("Period Revenue: %s", overview.get("periodRevenue")), normalFont));
                document.add(new Paragraph(String.format("Growth Rate: %s", overview.get("growthRate")), normalFont));
                document.add(new Paragraph(String.format("Total Units: %s", overview.get("totalUnits")), normalFont));
                document.add(new Paragraph(String.format("Average Order Value: %s", overview.get("averageOrderValue")), normalFont));
            } else if ("inventory-status".equals(reportType)) {
                Map<String, Object> summary = inventoryService.getSummary();
                document.add(new Paragraph(String.format("Total Products: %s", summary.get("totalProducts")), normalFont));
                document.add(new Paragraph(String.format("Healthy Stock: %s", summary.get("healthy")), normalFont));
                document.add(new Paragraph(String.format("Low Stock: %s", summary.get("low")), normalFont));
                document.add(new Paragraph(String.format("Critical Stockout: %s", summary.get("critical")), normalFont));
                document.add(new Paragraph(String.format("Overstock: %s", summary.get("overstock")), normalFont));
            } else if ("customer-analytics".equals(reportType)) {
                List<Map<String, Object>> segments = customerService.getSegments();
                document.add(new Paragraph("Customer Segments:", normalFont));
                for (Map<String, Object> seg : segments) {
                    document.add(new Paragraph(String.format("- %s: %s customers (Avg LTV: %s)", seg.get("name"), seg.get("value"), seg.get("avgLtv")), normalFont));
                }
            } else {
                Map<String, Object> summary = dashboardService.getSummary();
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> kpis = (List<Map<String, Object>>) summary.get("kpis");
                document.add(new Paragraph("Dashboard KPIs:", normalFont));
                if (kpis != null) {
                    for (Map<String, Object> kpi : kpis) {
                        document.add(new Paragraph(String.format("- %s: %s (Change: %s%%)", kpi.get("label"), kpi.get("value"), kpi.get("trendValue")), normalFont));
                    }
                }
            }

            document.close();
            log.info("Successfully wrote PDF report to {}", filePath.toAbsolutePath());
            return filePath.toString();
        } catch (Exception e) {
            log.error("Failed to generate PDF report", e);
            throw new RuntimeException("Failed to write PDF report file", e);
        }
    }

    public String generateExcelReport(String reportId, String reportType, Map<String, String> params) {
        try {
            Path reportsDir = Paths.get("reports");
            if (!Files.exists(reportsDir)) {
                Files.createDirectories(reportsDir);
            }

            String filename = reportId + ".xlsx";
            Path filePath = reportsDir.resolve(filename);

            Workbook workbook = new XSSFWorkbook();
            Sheet sheet = workbook.createSheet("Report Data");

            Row headerRow = sheet.createRow(0);
            headerRow.createCell(0).setCellValue("RetailPulse Report: " + reportType);
            
            Row dateRow = sheet.createRow(1);
            dateRow.createCell(0).setCellValue("Generated At:");
            dateRow.createCell(1).setCellValue(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));

            if ("sales-summary".equals(reportType)) {
                Map<String, Object> overview = salesService.getOverview(
                        params.get("period"), params.get("dateStart"), params.get("dateEnd"));
                
                Row hRow = sheet.createRow(3);
                hRow.createCell(0).setCellValue("Metric");
                hRow.createCell(1).setCellValue("Value");

                Row r1 = sheet.createRow(4);
                r1.createCell(0).setCellValue("Period Revenue");
                r1.createCell(1).setCellValue(String.valueOf(overview.get("periodRevenue")));
                
                Row r2 = sheet.createRow(5);
                r2.createCell(0).setCellValue("Growth Rate");
                r2.createCell(1).setCellValue(String.valueOf(overview.get("growthRate")));
                
                Row r3 = sheet.createRow(6);
                r3.createCell(0).setCellValue("Total Units");
                r3.createCell(1).setCellValue(String.valueOf(overview.get("totalUnits")));
                
                Row r4 = sheet.createRow(7);
                r4.createCell(0).setCellValue("Average Order Value");
                r4.createCell(1).setCellValue(String.valueOf(overview.get("averageOrderValue")));
                
            } else if ("inventory-status".equals(reportType)) {
                Map<String, Object> summary = inventoryService.getSummary();
                Row hRow = sheet.createRow(3);
                hRow.createCell(0).setCellValue("Metric");
                hRow.createCell(1).setCellValue("Count");

                Row r1 = sheet.createRow(4);
                r1.createCell(0).setCellValue("Total Products");
                r1.createCell(1).setCellValue(String.valueOf(summary.get("totalProducts")));
                
                Row r2 = sheet.createRow(5);
                r2.createCell(0).setCellValue("Healthy");
                r2.createCell(1).setCellValue(String.valueOf(summary.get("healthy")));
                
                Row r3 = sheet.createRow(6);
                r3.createCell(0).setCellValue("Low");
                r3.createCell(1).setCellValue(String.valueOf(summary.get("low")));
                
                Row r4 = sheet.createRow(7);
                r4.createCell(0).setCellValue("Critical");
                r4.createCell(1).setCellValue(String.valueOf(summary.get("critical")));
                
                Row r5 = sheet.createRow(8);
                r5.createCell(0).setCellValue("Overstock");
                r5.createCell(1).setCellValue(String.valueOf(summary.get("overstock")));
                
            } else if ("customer-analytics".equals(reportType)) {
                List<Map<String, Object>> segments = customerService.getSegments();
                Row hRow = sheet.createRow(3);
                hRow.createCell(0).setCellValue("Segment");
                hRow.createCell(1).setCellValue("Customer Count");
                hRow.createCell(2).setCellValue("Avg LTV");

                int rowNum = 4;
                for (Map<String, Object> seg : segments) {
                    Row row = sheet.createRow(rowNum++);
                    row.createCell(0).setCellValue(String.valueOf(seg.get("name")));
                    row.createCell(1).setCellValue(String.valueOf(seg.get("value")));
                    row.createCell(2).setCellValue(String.valueOf(seg.get("avgLtv")));
                }
            } else {
                Map<String, Object> summary = dashboardService.getSummary();
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> kpis = (List<Map<String, Object>>) summary.get("kpis");
                
                Row hRow = sheet.createRow(3);
                hRow.createCell(0).setCellValue("KPI");
                hRow.createCell(1).setCellValue("Value");
                hRow.createCell(2).setCellValue("Trend");

                int rowNum = 4;
                if (kpis != null) {
                    for (Map<String, Object> kpi : kpis) {
                        Row row = sheet.createRow(rowNum++);
                        row.createCell(0).setCellValue(String.valueOf(kpi.get("label")));
                        row.createCell(1).setCellValue(String.valueOf(kpi.get("value")));
                        row.createCell(2).setCellValue(kpi.get("trendValue") + "%");
                    }
                }
            }

            try (java.io.FileOutputStream fos = new java.io.FileOutputStream(filePath.toFile())) {
                workbook.write(fos);
            }
            workbook.close();

            log.info("Successfully wrote Excel report to {}", filePath.toAbsolutePath());
            return filePath.toString();
        } catch (Exception e) {
            log.error("Failed to generate Excel report", e);
            throw new RuntimeException("Failed to write Excel report file", e);
        }
    }
}
