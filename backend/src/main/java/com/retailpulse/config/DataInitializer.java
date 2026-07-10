package com.retailpulse.config;

import com.retailpulse.model.*;
import com.retailpulse.model.enums.*;
import com.retailpulse.repository.*;
import com.retailpulse.service.PosDataImportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Component
@Profile("dev")
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final StoreRepository storeRepository;
    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final CustomerRepository customerRepository;
    private final InventoryRecordRepository inventoryRecordRepository;
    private final TransactionRepository transactionRepository;
    private final TransactionItemRepository transactionItemRepository;
    private final DemandForecastRepository demandForecastRepository;
    private final AuditLogRepository auditLogRepository;
    private final AlertRepository alertRepository;
    private final DataSourceRepository dataSourceRepository;
    private final ScheduledImportRepository scheduledImportRepository;
    private final ScheduledReportRepository scheduledReportRepository;
    private final StrategicGoalRepository strategicGoalRepository;
    private final GrowthOpportunityRepository growthOpportunityRepository;
    private final BudgetAllocationRepository budgetAllocationRepository;
    private final RoiInvestmentRepository roiInvestmentRepository;
    private final PasswordEncoder passwordEncoder;
    private final PosDataImportService posDataImportService;

    @Value("${retailpulse.seed.admin-password:admin123}")
    private String adminPassword;

    @Value("${retailpulse.alerts.recipient:thotipaccy@gmail.com}")
    private String alertRecipient;

    @Value("${retailpulse.seed.import-90day-sample:true}")
    private boolean import90DaySample;

    private String samplePosPath() {
        return Path.of(System.getProperty("user.dir"), "src/main/resources/sample/pos_upload_sample.csv").toString();
    }

    private String sample90DayPath() {
        return Path.of(System.getProperty("user.dir"), "src/main/resources/sample/retailpulse_90days_transactions.csv").toString();
    }

    @Override
    @Transactional
    public void run(String... args) {
        if (productRepository.count() == 0) {
            log.info("Dev profile — seeding RetailPulse demo data...");
            seedStores();
            seedCategories();
            seedProducts();
            seedCustomers();
            seedInventory();
            seedTransactions();
            seedTransactionItems();
            seedDemandForecasts();
            seedAuditLogs();
            seedAlerts();
            log.info("Dev demo data seeding complete");
        } else {
            log.info("Dev profile — demo products already present, skipping core seed");
        }
        syncAdminEmail();
        seedDataSources();
        seedScheduledImports();
        seedScheduledReports();
        seedStrategicGoals();
        seedGrowthOpportunities();
        seedBudgetAllocations();
        seedRoiInvestments();
        import90DaySampleData();
    }

    private void import90DaySampleData() {
        if (!import90DaySample) {
            return;
        }
        java.io.File file = new java.io.File(sample90DayPath());
        if (!file.exists()) {
            log.info("90-day sample CSV not found at {} — run generate_90days_data.py first", file.getAbsolutePath());
            return;
        }
        long distinctDays = countDistinctTransactionDays();
        if (distinctDays >= 90) {
            log.info("Skipping 90-day sample import — {} days of transaction history already present", distinctDays);
            return;
        }
        try {
            Map<String, Object> result = posDataImportService.importFromPath(file.getAbsolutePath(), "u1");
            log.info("Imported 90-day sample data: {} rows, {} transactions, {} new products, {} new customers",
                    result.get("recordsImported"), result.get("transactions"),
                    result.get("newProducts"), result.get("newCustomers"));
        } catch (Exception ex) {
            log.warn("90-day sample import failed: {}", ex.getMessage());
        }
    }

    private long countDistinctTransactionDays() {
        return transactionRepository.findAll().stream()
                .map(t -> t.getTransactionDate().toLocalDate())
                .distinct()
                .count();
    }

    private void syncAdminEmail() {
        userRepository.findById("u1").ifPresent(admin -> {
            if (alertRecipient.equalsIgnoreCase(admin.getEmail())) {
                return;
            }
            Optional<User> existing = userRepository.findByEmailIgnoreCase(alertRecipient);
            if (existing.isPresent() && !"u1".equals(existing.get().getUserId())) {
                log.info("Alert/login email {} already used by user {}; alerts will use ALERT_EMAIL config",
                        alertRecipient, existing.get().getUserId());
                return;
            }
            admin.setEmail(alertRecipient);
            userRepository.save(admin);
            log.info("Synced admin alert/login email to {}", alertRecipient);
        });
    }

    @SuppressWarnings("unused")
    private void seedUsers() {
        LocalDateTime memberSince = LocalDateTime.of(2024, 1, 15, 8, 0);
        userRepository.save(User.builder().userId("u1").fullName("Admin User").email(alertRecipient)
                .passwordHash(passwordEncoder.encode(adminPassword))
                .role(UserRole.ADMIN).phone("+250 788 000 001").department("Administration")
                .isActive(true).mfaEnabled(true).createdAt(memberSince).build());
        userRepository.save(User.builder().userId("u2").fullName("Manager User").email("manager@retailpulse.rw")
                .passwordHash(passwordEncoder.encode("manager123"))
                .role(UserRole.MANAGER).phone("+250 788 000 002").department("Operations")
                .isActive(true).mfaEnabled(true).createdAt(memberSince.plusDays(1)).build());
        userRepository.save(User.builder().userId("u3").fullName("Analyst User").email("analyst@retailpulse.rw")
                .passwordHash(passwordEncoder.encode("analyst123"))
                .role(UserRole.ANALYST).phone("+250 788 000 003").department("Analytics")
                .isActive(true).mfaEnabled(true).createdAt(memberSince.plusDays(2)).build());
        userRepository.save(User.builder().userId("u4").fullName("Viewer User").email("viewer@retailpulse.rw")
                .passwordHash(passwordEncoder.encode("viewer123"))
                .role(UserRole.VIEWER).phone("+250 788 000 004").department("Sales")
                .isActive(true).mfaEnabled(true).createdAt(memberSince.plusDays(3)).build());
    }

    private void seedStores() {
        storeRepository.save(Store.builder().storeId("store-001").storeName("Quincaillerie du Rwamagana")
                .location("Rwamagana").province("Eastern Province").isActive(true).createdAt(LocalDateTime.now()).build());
        storeRepository.save(Store.builder().storeId("store-002").storeName("Quincaillerie Kigali Central")
                .location("Kigali").province("Kigali City").isActive(true).createdAt(LocalDateTime.now()).build());
        storeRepository.save(Store.builder().storeId("store-003").storeName("Quincaillerie Huye")
                .location("Huye").province("Southern Province").isActive(true).createdAt(LocalDateTime.now()).build());
    }

    private void seedCategories() {
        String[][] cats = {
                {"cat-1", "Construction", "Building materials"},
                {"cat-2", "Roofing", "Roofing supplies"},
                {"cat-3", "Paints", "Paints and coatings"},
                {"cat-4", "Electrical", "Electrical supplies"},
                {"cat-5", "Plumbing", "Plumbing materials"},
                {"cat-6", "Hardware", "Hardware and locks"},
                {"cat-7", "Flooring", "Tiles and flooring"},
                {"cat-8", "Timber", "Wood and plywood"},
        };
        for (String[] c : cats) {
            categoryRepository.save(Category.builder().categoryId(c[0]).categoryName(c[1]).description(c[2]).build());
        }
    }

    private void seedProducts() {
        Object[][] products = {
                {"p1", "CEM-CIM-50", "Cement (Cimerwa 50kg)", "cat-1", 10000, 12500, 200},
                {"p2", "STL-G32", "Iron Sheets (G32)", "cat-2", 22000, 28500, 100},
                {"p3", "PNT-SAH-20", "Paint (Sahara 20L)", "cat-3", 35000, 42000, 40},
                {"p4", "ELC-W25", "Electrical Wire (2.5mm²)", "cat-4", 6500, 8500, 300},
                {"p5", "PLM-PVC-4", "PVC Pipes (4-inch)", "cat-5", 11000, 15000, 80},
                {"p6", "LCK-UNI", "Door Locks (Union)", "cat-6", 14000, 18500, 50},
                {"p7", "NAIL-RF-5", "Roofing Nails (5kg pack)", "cat-2", 5000, 6500, 100},
                {"p8", "TNK-1000L", "Water Tanks (1000L)", "cat-5", 150000, 185000, 15},
                {"p9", "TIL-CER-40", "Tiles (Ceramic 40x40cm)", "cat-7", 2500, 3200, 200},
                {"p10", "PLY-18MM", "Plywood (18mm)", "cat-8", 38000, 45000, 60},
        };
        for (Object[] p : products) {
            productRepository.save(Product.builder()
                    .productId((String) p[0]).skuCode((String) p[1]).productName((String) p[2])
                    .category(categoryRepository.getReferenceById((String) p[3]))
                    .unitCost(BigDecimal.valueOf((Integer) p[4]))
                    .unitPrice(BigDecimal.valueOf((Integer) p[5]))
                    .reorderPoint((Integer) p[6]).isActive(true).build());
        }
    }

    private void seedCustomers() {
        customerRepository.save(buildCustomer("c1", "Jean de Dieu Habimana", CustomerType.CONTRACTOR, "+250 788 123 456", "jean.habimana@email.rw", true, 4850000, 0.15, "Champions"));
        customerRepository.save(buildCustomer("c2", "Consolee Mukamana", CustomerType.RETAIL, "+250 722 234 567", "consolee.m@email.rw", true, 1250000, 0.22, "Loyal"));
        customerRepository.save(buildCustomer("c3", "Patrick Nshimiyimana", CustomerType.WHOLESALE, "+250 733 345 678", "patrick.n@email.rw", true, 8200000, 0.08, "Champions"));
        customerRepository.save(buildCustomer("c4", "Esperance Uwimana", CustomerType.RETAIL, "+250 784 456 789", "esperance.u@email.rw", false, 680000, 0.72, "At Risk"));
        customerRepository.save(buildCustomer("c5", "Emmanuel Tuyishime", CustomerType.CONTRACTOR, "+250 791 567 890", "emmanuel.t@email.rw", true, 3200000, 0.35, "Loyal"));
        customerRepository.save(buildCustomer("c6", "Claudine Nyirahabimana", CustomerType.RETAIL, "+250 728 678 901", "claudine.n@email.rw", false, 420000, 0.88, "Lost"));
        customerRepository.save(buildCustomer("c7", "Fabrice Ndayisaba", CustomerType.CONTRACTOR, "+250 783 789 012", "fabrice.n@email.rw", true, 2100000, 0.45, "At Risk"));
        customerRepository.save(buildCustomer("c8", "Alice Uwase", CustomerType.RETAIL, "+250 726 890 123", "alice.u@email.rw", false, 950000, 0.55, "Dormant"));
    }

    private Customer buildCustomer(String id, String name, CustomerType type, String phone, String email,
                                   boolean loyalty, int ltv, double churn, String segment) {
        return Customer.builder().customerId(id).customerName(name).customerType(type).phone(phone).email(email)
                .loyaltyMember(loyalty).lifetimeValue(BigDecimal.valueOf(ltv))
                .churnRiskScore(BigDecimal.valueOf(churn)).rfmSegment(segment).createdAt(LocalDateTime.now()).build();
    }

    private void seedInventory() {
        Object[][] inv = {
                {"inv-1", "p1", 450, 20, 0.05}, {"inv-2", "p2", 85, 5, 0.35},
                {"inv-3", "p3", 32, 0, 0.72}, {"inv-4", "p4", 1200, 50, 0.02},
                {"inv-5", "p5", 180, 10, 0.10}, {"inv-6", "p6", 65, 3, 0.15},
                {"inv-7", "p7", 220, 8, 0.08}, {"inv-8", "p8", 12, 2, 0.55},
                {"inv-9", "p9", 850, 0, 0.01}, {"inv-10", "p10", 95, 5, 0.12},
        };
        for (Object[] row : inv) {
            inventoryRecordRepository.save(InventoryRecord.builder()
                    .recordId((String) row[0])
                    .product(productRepository.getReferenceById((String) row[1]))
                    .store(storeRepository.getReferenceById("store-001"))
                    .quantityOnHand((Integer) row[2]).quantityReserved((Integer) row[3])
                    .stockoutRisk(BigDecimal.valueOf((Double) row[4]))
                    .lastUpdated(LocalDateTime.now()).build());
        }
    }

    private void seedTransactions() {
        Object[][] tx = {
                {"TXN-20260605-001", "c3", "u1", "2026-06-05T09:15:00", 625000, PaymentMethod.BANK_TRANSFER},
                {"TXN-20260605-002", "c1", "u2", "2026-06-05T10:30:00", 570000, PaymentMethod.MOBILE_MONEY},
                {"TXN-20260605-003", "c2", "u2", "2026-06-05T11:45:00", 84000, PaymentMethod.CASH},
                {"TXN-20260604-004", "c5", "u2", "2026-06-04T14:20:00", 225000, PaymentMethod.MOBILE_MONEY},
                {"TXN-20260604-005", "c7", "u2", "2026-06-04T16:00:00", 850000, PaymentMethod.BANK_TRANSFER},
                {"TXN-20260604-006", "c8", "u2", "2026-06-04T08:30:00", 55500, PaymentMethod.CASH},
                {"TXN-20260603-007", "c4", "u2", "2026-06-03T13:15:00", 160000, PaymentMethod.MOBILE_MONEY},
                {"TXN-20260603-008", "c3", "u2", "2026-06-03T15:45:00", 370000, PaymentMethod.BANK_TRANSFER},
                {"TXN-20260602-009", "c1", "u2", "2026-06-02T10:00:00", 65000, PaymentMethod.CASH},
                {"TXN-20260602-010", "c2", "u2", "2026-06-02T11:30:00", 225000, PaymentMethod.MOBILE_MONEY},
        };
        for (Object[] row : tx) {
            String customerId = (String) row[1];
            transactionRepository.save(Transaction.builder()
                    .transactionId((String) row[0])
                    .customer(customerRepository.getReferenceById(customerId))
                    .user(userRepository.getReferenceById((String) row[2]))
                    .store(storeRepository.getReferenceById("store-001"))
                    .transactionDate(LocalDateTime.parse((String) row[3]))
                    .totalAmount(BigDecimal.valueOf((Integer) row[4]))
                    .paymentMethod((PaymentMethod) row[5])
                    .discountAmount(BigDecimal.ZERO)
                    .items(new ArrayList<>())
                    .build());
        }
    }

    private void seedTransactionItems() {
        Object[][] items = {
                {"ti-1", "TXN-20260605-001", "p1", 40, 12500},
                {"ti-2", "TXN-20260605-001", "p2", 10, 28500},
                {"ti-3", "TXN-20260605-002", "p3", 5, 42000},
                {"ti-4", "TXN-20260605-002", "p4", 20, 8500},
                {"ti-5", "TXN-20260605-003", "p7", 8, 6500},
                {"ti-6", "TXN-20260604-004", "p5", 12, 15000},
                {"ti-7", "TXN-20260604-005", "p8", 3, 185000},
                {"ti-8", "TXN-20260604-006", "p9", 15, 3200},
                {"ti-9", "TXN-20260603-007", "p6", 6, 18500},
                {"ti-10", "TXN-20260603-008", "p10", 8, 45000},
                {"ti-11", "TXN-20260602-009", "p1", 4, 12500},
                {"ti-12", "TXN-20260602-010", "p2", 6, 28500},
        };
        for (Object[] row : items) {
            int qty = (Integer) row[3];
            int price = (Integer) row[4];
            Transaction tx = transactionRepository.getReferenceById((String) row[1]);
            TransactionItem item = TransactionItem.builder()
                    .itemId((String) row[0])
                    .transaction(tx)
                    .product(productRepository.getReferenceById((String) row[2]))
                    .quantity(qty)
                    .unitPrice(BigDecimal.valueOf(price))
                    .lineTotal(BigDecimal.valueOf((long) qty * price))
                    .build();
            transactionItemRepository.save(item);
        }
    }

    private void seedDemandForecasts() {
        Store store = storeRepository.getReferenceById("store-001");
        Product cement = productRepository.getReferenceById("p1");
        for (int i = 0; i < 14; i++) {
            BigDecimal predicted = BigDecimal.valueOf(180 + i * 12);
            demandForecastRepository.save(DemandForecast.builder()
                    .forecastId("df-" + i)
                    .store(store)
                    .product(cement)
                    .forecastHorizon(ForecastHorizon.DAILY)
                    .forecastDate(LocalDate.now().plusDays(i))
                    .predictedDemand(predicted)
                    .confidenceLower(predicted.multiply(BigDecimal.valueOf(0.9)))
                    .confidenceUpper(predicted.multiply(BigDecimal.valueOf(1.1)))
                    .modelMape(BigDecimal.valueOf(5.8))
                    .generatedAt(LocalDateTime.now())
                    .build());
        }
    }

    private void seedAuditLogs() {
        User admin = userRepository.getReferenceById("u1");
        User manager = userRepository.getReferenceById("u2");
        List<Object[]> logs = List.of(
                new Object[]{"al-1", admin, "LOGIN", "Successful login from Rwamagana, Rwanda", "User", "u1", "127.0.0.1", LocalDateTime.now().minusHours(1)},
                new Object[]{"al-2", admin, "PROFILE_UPDATE", "Updated profile information", "User", "u1", "127.0.0.1", LocalDateTime.now().minusHours(3)},
                new Object[]{"al-3", manager, "REPORT_EXPORT", "Exported monthly sales report", "Report", "rpt-001", "192.168.1.10", LocalDateTime.now().minusDays(1)},
                new Object[]{"al-4", admin, "PASSWORD_CHANGE", "Password changed successfully", "User", "u1", "127.0.0.1", LocalDateTime.now().minusDays(2)},
                new Object[]{"al-5", manager, "LOGIN", "Successful login from Kigali, Rwanda", "User", "u2", "192.168.1.10", LocalDateTime.now().minusDays(3)}
        );
        for (Object[] row : logs) {
            auditLogRepository.save(AuditLog.builder()
                    .logId((String) row[0])
                    .user((User) row[1])
                    .actionType((String) row[2])
                    .description((String) row[3])
                    .affectedEntity((String) row[4])
                    .affectedEntityId((String) row[5])
                    .ipAddress((String) row[6])
                    .createdAt((LocalDateTime) row[7])
                    .build());
        }
    }

    private void seedAlerts() {
        User admin = userRepository.getReferenceById("u1");
        alertRepository.save(Alert.builder().alertId("a1").user(admin).alertType("LOW_STOCK")
                .severity(AlertSeverity.HIGH).message("Paint (Sahara 20L) below reorder point — 32 units remaining")
                .isRead(false).createdAt(LocalDateTime.now()).build());
        alertRepository.save(Alert.builder().alertId("a2").user(admin).alertType("CHURN_RISK")
                .severity(AlertSeverity.CRITICAL).message("Claudine Nyirahabimana churn risk at 88%")
                .isRead(false).createdAt(LocalDateTime.now().minusHours(2)).build());
        alertRepository.save(Alert.builder().alertId("a3").user(admin).alertType("FORECAST")
                .severity(AlertSeverity.MEDIUM).message("Weekly demand forecast updated with 94.2% accuracy")
                .isRead(false).createdAt(LocalDateTime.now().minusHours(5)).build());
        alertRepository.save(Alert.builder().alertId("a4").user(admin).alertType("INVENTORY")
                .severity(AlertSeverity.LOW).message("Water Tanks (1000L) stock critically low")
                .isRead(true).createdAt(LocalDateTime.now().minusDays(1)).build());
        alertRepository.save(Alert.builder().alertId("a5").user(admin).alertType("SALES")
                .severity(AlertSeverity.LOW).message("Daily sales target exceeded by 12%")
                .isRead(true).createdAt(LocalDateTime.now().minusDays(2)).build());
    }

    private void seedDataSources() {
        String sampleCsv = samplePosPath();
        upsertDataSource(DataSource.builder()
                .id("ds-1").name("Main POS System").type("POS")
                .status(DataSourceStatus.CONNECTED).lastSync(LocalDateTime.now().minusMinutes(12))
                .health("98%").connectionString(sampleCsv)
                .syncFrequency("Every hour").isActive(true).recordCount(18_420L).build());
        upsertDataSource(DataSource.builder()
                .id("ds-2").name("Inventory Management").type("Inventory")
                .status(DataSourceStatus.SYNCING).lastSync(LocalDateTime.now().minusMinutes(5))
                .health("92%").connectionString(sampleCsv)
                .syncFrequency("Every 15 minutes").isActive(true).recordCount(9_856L).build());
        upsertDataSource(DataSource.builder()
                .id("ds-3").name("Customer Database").type("CRM")
                .status(DataSourceStatus.CONNECTED).lastSync(LocalDateTime.now().minusMinutes(45))
                .health("97%").connectionString("https://api.retailpulse.rw/crm")
                .syncFrequency("Every 4 hours").isActive(true).recordCount(6_240L).build());
        upsertDataSource(DataSource.builder()
                .id("ds-4").name("Branch 1 POS").type("POS")
                .status(DataSourceStatus.CONNECTED).lastSync(LocalDateTime.now().minusMinutes(28))
                .health("95%").connectionString(sampleCsv)
                .syncFrequency("Every hour").isActive(true).recordCount(4_112L).build());
        upsertDataSource(DataSource.builder()
                .id("ds-5").name("Supplier Data").type("API")
                .status(DataSourceStatus.ERROR).lastSync(LocalDateTime.now().minusDays(2))
                .health("0%").connectionString("https://api.cimerwa.rw/supplier")
                .syncFrequency("Daily").isActive(false).recordCount(0L).build());
    }

    private void upsertDataSource(DataSource source) {
        dataSourceRepository.findById(source.getId()).ifPresentOrElse(existing -> {
            existing.setName(source.getName());
            existing.setType(source.getType());
            existing.setStatus(source.getStatus());
            existing.setLastSync(source.getLastSync());
            existing.setHealth(source.getHealth());
            existing.setConnectionString(source.getConnectionString());
            existing.setSyncFrequency(source.getSyncFrequency());
            existing.setIsActive(source.getIsActive());
            existing.setRecordCount(source.getRecordCount());
            dataSourceRepository.save(existing);
        }, () -> dataSourceRepository.save(source));
    }

    private void seedScheduledImports() {
        if (scheduledImportRepository.count() > 0) {
            scheduledImportRepository.findAll().forEach(si -> {
                if (si.getLastRun() == null) {
                    si.setLastRun(LocalDateTime.now().minusHours(6));
                }
                if (si.getRecordsImported() == null) {
                    si.setRecordsImported(1_240L);
                }
                scheduledImportRepository.save(si);
            });
            return;
        }
        scheduledImportRepository.save(ScheduledImport.builder().id("si-1").name("Daily Sales Import")
                .sourceName("Main POS System").frequency("Daily")
                .lastRun(LocalDateTime.now().minusHours(6)).recordsImported(18_420L)
                .nextRun(LocalDateTime.now().plusHours(6)).status(ScheduledImportStatus.ACTIVE).build());
        scheduledImportRepository.save(ScheduledImport.builder().id("si-2").name("Inventory Sync")
                .sourceName("Inventory Management").frequency("Every 4 hours")
                .lastRun(LocalDateTime.now().minusHours(4)).recordsImported(9_856L)
                .nextRun(LocalDateTime.now().plusHours(2)).status(ScheduledImportStatus.ACTIVE).build());
        scheduledImportRepository.save(ScheduledImport.builder().id("si-3").name("Customer CRM Sync")
                .sourceName("Customer Database").frequency("Daily")
                .lastRun(LocalDateTime.now().minusHours(12)).recordsImported(6_240L)
                .nextRun(LocalDateTime.now().plusHours(12)).status(ScheduledImportStatus.PAUSED).build());
        scheduledImportRepository.save(ScheduledImport.builder().id("si-4").name("Supplier Price Sync")
                .sourceName("Supplier Data").frequency("Weekly")
                .lastRun(LocalDateTime.now().minusDays(2)).recordsImported(0L)
                .nextRun(LocalDateTime.now().plusDays(5)).status(ScheduledImportStatus.PAUSED).build());
    }

    private void seedScheduledReports() {
        if (scheduledReportRepository.count() > 0) return;
        User admin = userRepository.getReferenceById("u1");
        User manager = userRepository.getReferenceById("u2");
        scheduledReportRepository.save(ScheduledReport.builder().id("sr-1").user(admin)
                .name("Weekly Sales Summary").reportType("sales-summary").format("pdf")
                .frequency("Weekly").recipients("thotipaccy@gmail.com,manager@retailpulse.rw")
                .active(true).nextRun(LocalDateTime.now().plusDays(3))
                .createdAt(LocalDateTime.now().minusDays(10)).build());
        scheduledReportRepository.save(ScheduledReport.builder().id("sr-2").user(manager)
                .name("Monthly Inventory Status").reportType("inventory-status").format("excel")
                .frequency("Monthly").recipients("manager@retailpulse.rw")
                .active(true).nextRun(LocalDateTime.now().plusDays(15))
                .createdAt(LocalDateTime.now().minusDays(5)).build());
        scheduledReportRepository.save(ScheduledReport.builder().id("sr-3").user(admin)
                .name("Customer Churn Analysis").reportType("customer-analytics").format("pdf")
                .frequency("Monthly").recipients("thotipaccy@gmail.com")
                .active(false).nextRun(null)
                .createdAt(LocalDateTime.now().minusDays(20)).build());
    }

    private void seedStrategicGoals() {
        if (strategicGoalRepository.count() > 0) return;
        strategicGoalRepository.save(StrategicGoal.builder().id("sg-1")
                .goal("Increase annual revenue by 25%").progress(BigDecimal.valueOf(62))
                .deadline(LocalDate.of(2026, 12, 31)).owner("Manager User").build());
        strategicGoalRepository.save(StrategicGoal.builder().id("sg-2")
                .goal("Expand to 2 new store locations").progress(BigDecimal.valueOf(35))
                .deadline(LocalDate.of(2026, 9, 30)).owner("Admin User").build());
        strategicGoalRepository.save(StrategicGoal.builder().id("sg-3")
                .goal("Reduce stockout incidents by 50%").progress(BigDecimal.valueOf(78))
                .deadline(LocalDate.of(2026, 8, 31)).owner("Analyst User").build());
        strategicGoalRepository.save(StrategicGoal.builder().id("sg-4")
                .goal("Achieve 90% customer retention rate").progress(BigDecimal.valueOf(55))
                .deadline(LocalDate.of(2026, 12, 31)).owner("Manager User").build());
    }

    private void seedGrowthOpportunities() {
        if (growthOpportunityRepository.count() > 0) return;
        growthOpportunityRepository.save(GrowthOpportunity.builder().id("go-1")
                .name("Roofing materials bundle for rainy season").impact("HIGH")
                .confidence(BigDecimal.valueOf(0.91)).estimatedValue(BigDecimal.valueOf(4_500_000)).build());
        growthOpportunityRepository.save(GrowthOpportunity.builder().id("go-2")
                .name("Contractor loyalty program expansion").impact("HIGH")
                .confidence(BigDecimal.valueOf(0.85)).estimatedValue(BigDecimal.valueOf(3_200_000)).build());
        growthOpportunityRepository.save(GrowthOpportunity.builder().id("go-3")
                .name("Kigali Central store launch").impact("MEDIUM")
                .confidence(BigDecimal.valueOf(0.72)).estimatedValue(BigDecimal.valueOf(8_000_000)).build());
        growthOpportunityRepository.save(GrowthOpportunity.builder().id("go-4")
                .name("Online ordering channel").impact("MEDIUM")
                .confidence(BigDecimal.valueOf(0.68)).estimatedValue(BigDecimal.valueOf(2_100_000)).build());
    }

    private void seedBudgetAllocations() {
        if (budgetAllocationRepository.count() > 0) return;
        budgetAllocationRepository.save(BudgetAllocation.builder().id("ba-1").category("Inventory Procurement")
                .allocated(BigDecimal.valueOf(50_000_000)).spent(BigDecimal.valueOf(32_500_000)).build());
        budgetAllocationRepository.save(BudgetAllocation.builder().id("ba-2").category("Marketing & Promotions")
                .allocated(BigDecimal.valueOf(8_000_000)).spent(BigDecimal.valueOf(4_200_000)).build());
        budgetAllocationRepository.save(BudgetAllocation.builder().id("ba-3").category("Store Operations")
                .allocated(BigDecimal.valueOf(15_000_000)).spent(BigDecimal.valueOf(11_800_000)).build());
        budgetAllocationRepository.save(BudgetAllocation.builder().id("ba-4").category("Technology & AI")
                .allocated(BigDecimal.valueOf(5_000_000)).spent(BigDecimal.valueOf(2_100_000)).build());
        budgetAllocationRepository.save(BudgetAllocation.builder().id("ba-5").category("Staff Training")
                .allocated(BigDecimal.valueOf(3_000_000)).spent(BigDecimal.valueOf(1_500_000)).build());
    }

    private void seedRoiInvestments() {
        if (roiInvestmentRepository.count() > 0) return;
        roiInvestmentRepository.save(RoiInvestment.builder().id("ri-1").initiative("AI Demand Forecasting")
                .invested(BigDecimal.valueOf(2_500_000)).roi(BigDecimal.valueOf(185)).status("ACTIVE").build());
        roiInvestmentRepository.save(RoiInvestment.builder().id("ri-2").initiative("Loyalty Program")
                .invested(BigDecimal.valueOf(1_800_000)).roi(BigDecimal.valueOf(142)).status("ACTIVE").build());
        roiInvestmentRepository.save(RoiInvestment.builder().id("ri-3").initiative("Store Renovation — Rwamagana")
                .invested(BigDecimal.valueOf(12_000_000)).roi(BigDecimal.valueOf(78)).status("COMPLETED").build());
        roiInvestmentRepository.save(RoiInvestment.builder().id("ri-4").initiative("Mobile POS Terminals")
                .invested(BigDecimal.valueOf(3_500_000)).roi(BigDecimal.valueOf(95)).status("ACTIVE").build());
    }
}
