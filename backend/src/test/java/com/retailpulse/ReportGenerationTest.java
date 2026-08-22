package com.retailpulse;

import com.retailpulse.dto.request.ReportFilter;
import com.retailpulse.repository.AuditLogRepository;
import com.retailpulse.repository.TransactionItemRepository;
import com.retailpulse.service.AIServiceClient;
import com.retailpulse.service.CustomerService;
import com.retailpulse.service.DashboardService;
import com.retailpulse.service.InventoryService;
import com.retailpulse.service.ReportGeneratorService;
import com.retailpulse.service.SalesService;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Renders report types in every format against real POI / OpenPDF / XSLF
 * libraries so renderer regressions surface in CI without a database.
 */
class ReportGenerationTest {

    private ReportGeneratorService newService(SalesService sales) {
        return new ReportGeneratorService(
                mock(DashboardService.class),
                sales,
                mock(InventoryService.class),
                mock(CustomerService.class),
                mock(AIServiceClient.class),
                mock(TransactionItemRepository.class),
                mock(AuditLogRepository.class));
    }

    @Test
    void generatesSalesSummaryInAllFourFormats() throws Exception {
        SalesService sales = mock(SalesService.class);
        when(sales.getOverview(any(), any(), any())).thenReturn(Map.of(
                "periodRevenue", 1_540_000,
                "growthRate", 12.5,
                "totalUnits", 890,
                "averageOrderValue", 45_300,
                "trend", List.of(Map.of("name", "Mon", "value", 120_000))));
        when(sales.getByCategory(any(), any(), any()))
                .thenReturn(List.of(Map.of("name", "Cement", "value", 940_000)));
        ReportGeneratorService svc = newService(sales);

        ReportFilter filter = ReportFilter.from(Map.of("period", "monthly"));
        for (String format : List.of("pdf", "excel", "csv", "pptx")) {
            ReportGeneratorService.GeneratedReport r =
                    svc.generate("rep-t1", "sales-summary", format, filter, "Test User");
            assertTrue(Files.exists(r.filePath()), format + " file missing");
            assertTrue(Files.size(r.filePath()) > 200, format + " file suspiciously small");
            assertTrue(r.fileName().startsWith("sales_summary_"), "human filename: " + r.fileName());
        }
    }

    @Test
    void generatedBinariesHaveCorrectMagicBytes() throws Exception {
        SalesService sales = mock(SalesService.class);
        when(sales.getOverview(any(), any(), any())).thenReturn(Map.of("periodRevenue", 1));
        ReportGeneratorService svc = newService(sales);
        ReportFilter filter = ReportFilter.from(Map.of("period", "weekly"));

        var pdf = svc.generate("rep-t2", "sales-summary", "pdf", filter, "Tester");
        byte[] pdfHead = new byte[4];
        try (var in = Files.newInputStream(pdf.filePath())) {
            assertEquals(4, in.readNBytes(pdfHead, 0, 4));
        }
        assertEquals("%PDF", new String(pdfHead));

        var xlsx = svc.generate("rep-t3", "sales-summary", "excel", filter, "Tester");
        assertZip(xlsx.filePath());

        var pptx = svc.generate("rep-t4", "sales-summary", "pptx", filter, "Tester");
        assertZip(pptx.filePath());
    }

    @Test
    void transactionHistoryRendersRowLevelData() throws Exception {
        TransactionItemRepository items = mock(TransactionItemRepository.class);
        when(items.findLineItemsBetween(any(), any(), any())).thenReturn(List.of());
        SalesService sales = mock(SalesService.class);
        ReportGeneratorService svc = new ReportGeneratorService(
                mock(DashboardService.class), sales, mock(InventoryService.class),
                mock(CustomerService.class), mock(AIServiceClient.class),
                items, mock(AuditLogRepository.class));

        var csv = svc.generate("rep-t5", "transaction-history", "csv",
                ReportFilter.from(Map.of("startDate", "2026-08-01", "endDate", "2026-08-22")), "Tester");
        String text = Files.readString(csv.filePath());
        assertTrue(text.contains("Transaction History"));
        assertTrue(text.contains("Line Items"));
    }

    private void assertZip(Path p) throws Exception {
        byte[] head = new byte[2];
        try (var in = Files.newInputStream(p)) {
            assertEquals(2, in.readNBytes(head, 0, 2));
        }
        assertEquals('P', head[0]);
        assertEquals('K', head[1]);
    }
}
