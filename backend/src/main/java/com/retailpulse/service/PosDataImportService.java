package com.retailpulse.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.retailpulse.exception.BadRequestException;
import com.retailpulse.model.*;
import com.retailpulse.model.enums.CustomerType;
import com.retailpulse.model.enums.PaymentMethod;
import com.retailpulse.repository.*;
import com.retailpulse.security.CustomUserDetailsService;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;

@Slf4j
@Service
public class PosDataImportService {

    private static final String DEFAULT_STORE_ID = "store-001";
    private static final int BATCH_SIZE = 100;
    @SuppressWarnings("unused")
    private static final Set<String> EXPECTED_COLUMNS = Set.of(
            "sku_code", "product_name", "category", "unit_price", "quantity",
            "transaction_date", "customer_name", "customer_phone", "payment_method"
    );

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final CustomerRepository customerRepository;
    private final TransactionRepository transactionRepository;
    private final TransactionItemRepository transactionItemRepository;
    private final InventoryRecordRepository inventoryRecordRepository;
    private final StoreRepository storeRepository;
    private final CustomUserDetailsService userDetailsService;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;

    public PosDataImportService(ProductRepository productRepository,
                                CategoryRepository categoryRepository,
                                CustomerRepository customerRepository,
                                TransactionRepository transactionRepository,
                                TransactionItemRepository transactionItemRepository,
                                InventoryRecordRepository inventoryRecordRepository,
                                StoreRepository storeRepository,
                                CustomUserDetailsService userDetailsService,
                                ObjectMapper objectMapper,
                                PlatformTransactionManager transactionManager) {
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
        this.customerRepository = customerRepository;
        this.transactionRepository = transactionRepository;
        this.transactionItemRepository = transactionItemRepository;
        this.inventoryRecordRepository = inventoryRecordRepository;
        this.storeRepository = storeRepository;
        this.userDetailsService = userDetailsService;
        this.objectMapper = objectMapper;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    @Transactional
    public Map<String, Object> importFromFile(MultipartFile file, String userId) {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("File is required");
        }
        List<Map<String, String>> rows = parseFile(file);
        return importRows(rows, userId, file.getOriginalFilename());
    }

    @Transactional
    public Map<String, Object> importFromPath(String filePath, String userId) {
        java.io.File file = new java.io.File(filePath);
        if (!file.exists() || !file.isFile()) {
            throw new BadRequestException("File not found: " + filePath);
        }
        try (InputStream in = new java.io.FileInputStream(file)) {
            String name = file.getName().toLowerCase();
            List<Map<String, String>> rows;
            if (name.endsWith(".csv")) {
                rows = parseCsv(in);
            } else if (name.endsWith(".json")) {
                rows = parseJson(in);
            } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
                rows = parseExcel(in);
            } else {
                throw new BadRequestException("Unsupported file type for sync: " + name);
            }
            return importRows(rows, userId, file.getName());
        } catch (BadRequestException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BadRequestException("Failed to read file: " + ex.getMessage());
        }
    }

    private Map<String, Object> importRows(List<Map<String, String>> rows, String userId, String fileName) {
        if (rows.isEmpty()) {
            throw new BadRequestException("No data rows found in file");
        }

        User user = userDetailsService.loadEntityById(userId);
        Store store = ensureDefaultStore();

        int[] newProducts = {0};
        int[] newCustomers = {0};
        int transactionsCreated = 0;
        int duplicatesSkipped = 0;

        List<Map<String, String>> importableRows = new ArrayList<>();
        for (Map<String, String> row : rows) {
            switch (classifyRow(row)) {
                case EXACT_DUPLICATE -> duplicatesSkipped++;
                case PARTIAL_DUPLICATE -> {
                    log.warn("Partial duplicate skipped: date={}, sku={}, phone={}, qty={}",
                            row.get("transaction_date"), row.get("sku_code"),
                            row.get("customer_phone"), row.get("quantity"));
                    duplicatesSkipped++;
                }
                case NEW -> importableRows.add(row);
            }
        }

        Map<String, List<Map<String, String>>> grouped = new LinkedHashMap<>();
        for (Map<String, String> row : importableRows) {
            String key = groupKey(row);
            grouped.computeIfAbsent(key, k -> new ArrayList<>()).add(row);
        }

        for (List<Map<String, String>> group : grouped.values()) {
            Map<String, String> first = group.get(0);
            Customer customer = resolveCustomer(first, newCustomers);
            PaymentMethod paymentMethod = parsePaymentMethod(first.get("payment_method"));
            LocalDateTime transactionDate = parseDateTime(first.get("transaction_date"));

            BigDecimal totalAmount = BigDecimal.ZERO;
            List<TransactionItem> items = new ArrayList<>();

            for (Map<String, String> row : group) {
                Product product = resolveProduct(row, newProducts);
                int quantity = parseInt(row.get("quantity"), 1);
                BigDecimal unitPrice = parseDecimal(row.get("unit_price"), product.getUnitPrice());
                BigDecimal lineTotal = unitPrice.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP);
                totalAmount = totalAmount.add(lineTotal);

                TransactionItem item = TransactionItem.builder()
                        .itemId("ti-" + UUID.randomUUID().toString().substring(0, 8))
                        .product(product)
                        .quantity(quantity)
                        .unitPrice(unitPrice)
                        .lineTotal(lineTotal)
                        .build();
                items.add(item);
                decreaseInventory(product, store, quantity);
            }

            String transactionId = "TXN-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                    + "-" + UUID.randomUUID().toString().substring(0, 6);
            Transaction transaction = Transaction.builder()
                    .transactionId(transactionId)
                    .customer(customer)
                    .user(user)
                    .store(store)
                    .transactionDate(transactionDate)
                    .totalAmount(totalAmount.setScale(2, RoundingMode.HALF_UP))
                    .paymentMethod(paymentMethod)
                    .paymentStatus(paymentMethod == PaymentMethod.CREDIT ? "UNPAID" : "PAID")
                    .discountAmount(BigDecimal.ZERO)
                    .items(new ArrayList<>())
                    .build();

            for (TransactionItem item : items) {
                item.setTransaction(transaction);
                transaction.getItems().add(item);
            }
            transactionRepository.save(transaction);
            transactionItemRepository.saveAll(items);
            transactionsCreated++;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("fileName", fileName);
        result.put("recordsImported", importableRows.size());
        result.put("rowsImported", importableRows.size());
        result.put("duplicatesSkipped", duplicatesSkipped);
        result.put("newProducts", newProducts[0]);
        result.put("newCustomers", newCustomers[0]);
        result.put("transactions", transactionsCreated);
        result.put("status", "SUCCESS");
        result.put("importedAt", LocalDateTime.now().toString());
        log.info("POS import: {} rows, {} skipped duplicates, {} transactions, {} new products, {} new customers",
                rows.size(), duplicatesSkipped, transactionsCreated, newProducts[0], newCustomers[0]);
        return result;
    }

    public List<Map<String, String>> parseRowsFromPath(Path path) {
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        try (InputStream in = Files.newInputStream(path)) {
            if (name.endsWith(".csv")) {
                return parseCsv(in);
            }
            if (name.endsWith(".json")) {
                return parseJson(in);
            }
            if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
                return parseExcel(in);
            }
            throw new BadRequestException("Supported formats: .csv, .xlsx, .xls, .json");
        } catch (BadRequestException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BadRequestException("Failed to parse file: " + ex.getMessage());
        }
    }

    public Map<String, Object> importRowsBatched(List<Map<String, String>> rows, String userId, String fileName,
                                                 String jobId, ImportJobService importJobService) {
        if (rows.isEmpty()) {
            throw new BadRequestException("No data rows found in file");
        }
        importJobService.setTotalRecords(jobId, rows.size());

        User user = userDetailsService.loadEntityById(userId);
        Store store = ensureDefaultStore();

        int[] newProducts = {0};
        int[] newCustomers = {0};
        int transactionsCreated = 0;
        int duplicatesSkipped = 0;

        List<Map<String, String>> importableRows = new ArrayList<>();
        for (Map<String, String> row : rows) {
            switch (classifyRow(row)) {
                case EXACT_DUPLICATE -> {
                    duplicatesSkipped++;
                    importJobService.failRow(jobId, row, "Duplicate: This exact transaction was already imported.");
                }
                case PARTIAL_DUPLICATE -> {
                    duplicatesSkipped++;
                    importJobService.failRow(jobId, row, "Partial Duplicate: A similar transaction exists in the system.");
                }
                case NEW -> importableRows.add(row);
            }
        }

        int totalBatches = importableRows.isEmpty() ? 0 : (int) Math.ceil(importableRows.size() / (double) BATCH_SIZE);
        for (int batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            int from = batchIndex * BATCH_SIZE;
            int to = Math.min(from + BATCH_SIZE, importableRows.size());
            List<Map<String, String>> batchRows = importableRows.subList(from, to);

            int[] batchTx = {0};
            transactionTemplate.executeWithoutResult(status -> {
                Map<String, List<Map<String, String>>> grouped = new LinkedHashMap<>();
                for (Map<String, String> row : batchRows) {
                    grouped.computeIfAbsent(groupKey(row), k -> new ArrayList<>()).add(row);
                }
            batchTx[0] = processTransactionGroups(grouped, user, store, newProducts, newCustomers, jobId, importJobService);
            });

            transactionsCreated += batchTx[0];
            importJobService.updateProgress(jobId, to, batchIndex + 1, totalBatches,
                    "Processing batch " + (batchIndex + 1) + " of " + totalBatches
                            + " (" + to + " of " + importableRows.size() + " records)");
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("fileName", fileName);
        result.put("recordsImported", importableRows.size());
        result.put("rowsImported", importableRows.size());
        result.put("duplicatesSkipped", duplicatesSkipped);
        result.put("newProducts", newProducts[0]);
        result.put("newCustomers", newCustomers[0]);
        result.put("transactions", transactionsCreated);
        result.put("status", "SUCCESS");
        result.put("importedAt", LocalDateTime.now().toString());
        log.info("Batched POS import: {} rows, {} skipped, {} transactions", rows.size(), duplicatesSkipped, transactionsCreated);
        return result;
    }

    private int processTransactionGroups(Map<String, List<Map<String, String>>> grouped, User user, Store store,
                                         int[] newProducts, int[] newCustomers, String jobId, ImportJobService importJobService) {
        int transactionsCreated = 0;
        List<TransactionItem> itemsToSave = new ArrayList<>();

        for (List<Map<String, String>> group : grouped.values()) {
            try {
                Map<String, String> first = group.get(0);
                Customer customer = resolveCustomer(first, newCustomers);
                PaymentMethod paymentMethod = parsePaymentMethod(first.get("payment_method"));
                LocalDateTime transactionDate = parseDateTime(first.get("transaction_date"));

                BigDecimal totalAmount = BigDecimal.ZERO;
                List<TransactionItem> items = new ArrayList<>();
                boolean skipGroup = false;

                for (Map<String, String> row : group) {
                    try {
                        Product product = resolveProduct(row, newProducts);
                        int quantity = parseInt(row.get("quantity"), 1);
                        BigDecimal unitPrice = parseDecimal(row.get("unit_price"), product.getUnitPrice());
                        BigDecimal lineTotal = unitPrice.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP);
                        totalAmount = totalAmount.add(lineTotal);

                        TransactionItem item = TransactionItem.builder()
                                .itemId("ti-" + UUID.randomUUID().toString().substring(0, 8))
                                .product(product)
                                .quantity(quantity)
                                .unitPrice(unitPrice)
                                .lineTotal(lineTotal)
                                .build();
                        items.add(item);
                        decreaseInventory(product, store, quantity);
                    } catch (BadRequestException ex) {
                        importJobService.failRow(jobId, row, ex.getMessage());
                        skipGroup = true; // Skip the entire transaction if one line item is invalid
                    }
                }

                if (skipGroup || items.isEmpty()) continue;


            String transactionId = "TXN-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                    + "-" + UUID.randomUUID().toString().substring(0, 6);
            Transaction transaction = Transaction.builder()
                    .transactionId(transactionId)
                    .customer(customer)
                    .user(user)
                    .store(store)
                    .transactionDate(transactionDate)
                    .totalAmount(totalAmount.setScale(2, RoundingMode.HALF_UP))
                    .paymentMethod(paymentMethod)
                    .paymentStatus(paymentMethod == PaymentMethod.CREDIT ? "UNPAID" : "PAID")
                    .discountAmount(BigDecimal.ZERO)
                    .items(new ArrayList<>())
                    .build();

            for (TransactionItem item : items) {
                item.setTransaction(transaction);
                transaction.getItems().add(item);
            }
            transactionRepository.save(transaction);
            itemsToSave.addAll(items);
            transactionsCreated++;
            } catch (Exception ex) {
                importJobService.failRow(jobId, group.get(0), "Transaction error: " + ex.getMessage());
            }
        }

        if (!itemsToSave.isEmpty()) {
            transactionItemRepository.saveAll(itemsToSave);
        }
        return transactionsCreated;
    }

    private enum RowDedupStatus { NEW, EXACT_DUPLICATE, PARTIAL_DUPLICATE }

    private RowDedupStatus classifyRow(Map<String, String> row) {
        String skuCode = row.getOrDefault("sku_code", "").trim();
        if (skuCode.isBlank() || productRepository.findBySkuCode(skuCode).isEmpty()) {
            return RowDedupStatus.NEW;
        }
        LocalDateTime transactionDate = parseDateTime(row.get("transaction_date"));
        LocalDateTime dayStart = transactionDate.toLocalDate().atStartOfDay();
        LocalDateTime dayEnd = dayStart.plusDays(1);
        String phone = normalizePhone(row.get("customer_phone"));
        int quantity = parseInt(row.get("quantity"), 1);

        if (transactionItemRepository.existsExactDuplicateLine(dayStart, dayEnd, skuCode, phone, quantity)) {
            return RowDedupStatus.EXACT_DUPLICATE;
        }
        if (transactionItemRepository.existsPartialDuplicateLine(dayStart, dayEnd, skuCode, phone, quantity)) {
            return RowDedupStatus.PARTIAL_DUPLICATE;
        }
        return RowDedupStatus.NEW;
    }

    private Store ensureDefaultStore() {
        return storeRepository.findById(DEFAULT_STORE_ID).orElseGet(() -> storeRepository.save(Store.builder()
                .storeId(DEFAULT_STORE_ID)
                .storeName("Quincaillerie du Rwamagana")
                .location("Rwamagana")
                .province("Eastern Province")
                .isActive(true)
                .createdAt(LocalDateTime.now())
                .build()));
    }

    private List<Map<String, String>> parseFile(MultipartFile file) {
        String name = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";
        try {
            if (name.endsWith(".csv")) {
                return parseCsv(file.getInputStream());
            }
            if (name.endsWith(".json")) {
                return parseJson(file.getInputStream());
            }
            if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
                return parseExcel(file.getInputStream());
            }
            throw new BadRequestException("Supported formats: .csv, .xlsx, .xls, .json");
        } catch (BadRequestException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BadRequestException("Failed to parse file: " + ex.getMessage());
        }
    }

    private List<Map<String, String>> parseCsv(InputStream in) throws Exception {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String headerLine = reader.readLine();
            if (headerLine == null) return List.of();
            List<String> headers = splitCsvLine(headerLine).stream().map(this::normalizeHeader).toList();
            List<Map<String, String>> rows = new ArrayList<>();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;
                // Skip rows where every cell is empty (e.g. trailing ,,,,,,,,,)
                List<String> values = splitCsvLine(line);
                boolean allEmpty = values.stream().allMatch(v -> v == null || v.isBlank());
                if (allEmpty) continue;
                rows.add(mapRow(headers, values));
            }
            return rows;
        }
    }

    private List<Map<String, String>> parseJson(InputStream in) throws Exception {
        List<Map<String, Object>> raw = objectMapper.readValue(in, new TypeReference<>() {});
        List<Map<String, String>> rows = new ArrayList<>();
        for (Map<String, Object> obj : raw) {
            Map<String, String> row = new LinkedHashMap<>();
            for (Map.Entry<String, Object> e : obj.entrySet()) {
                row.put(normalizeHeader(e.getKey()), e.getValue() != null ? String.valueOf(e.getValue()) : "");
            }
            rows.add(row);
        }
        return rows;
    }

    private List<Map<String, String>> parseExcel(InputStream in) throws Exception {
        try (Workbook workbook = WorkbookFactory.create(in)) {
            Sheet sheet = workbook.getSheetAt(0);
            Iterator<Row> iterator = sheet.iterator();
            if (!iterator.hasNext()) return List.of();
            Row headerRow = iterator.next();
            List<String> headers = new ArrayList<>();
            for (Cell cell : headerRow) {
                headers.add(normalizeHeader(getCellString(cell)));
            }
            List<Map<String, String>> rows = new ArrayList<>();
            while (iterator.hasNext()) {
                Row row = iterator.next();
                if (isEmptyRow(row)) continue;
                List<String> values = new ArrayList<>();
                for (int i = 0; i < headers.size(); i++) {
                    values.add(getCellString(row.getCell(i, Row.MissingCellPolicy.CREATE_NULL_AS_BLANK)));
                }
                rows.add(mapRow(headers, values));
            }
            return rows;
        }
    }

    private boolean isEmptyRow(Row row) {
        for (Cell cell : row) {
            if (cell != null && cell.getCellType() != CellType.BLANK
                    && !getCellString(cell).isBlank()) {
                return false;
            }
        }
        return true;
    }

    private String getCellString(Cell cell) {
        if (cell == null) return "";
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue().trim();
            case NUMERIC -> DateUtil.isCellDateFormatted(cell)
                    ? cell.getLocalDateTimeCellValue().toString()
                    : BigDecimal.valueOf(cell.getNumericCellValue()).stripTrailingZeros().toPlainString();
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            default -> "";
        };
    }

    private List<String> splitCsvLine(String line) {
        List<String> result = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                inQuotes = !inQuotes;
            } else if (c == ',' && !inQuotes) {
                result.add(current.toString().trim());
                current.setLength(0);
            } else {
                current.append(c);
            }
        }
        result.add(current.toString().trim());
        return result;
    }

    private Map<String, String> mapRow(List<String> headers, List<String> values) {
        Map<String, String> row = new LinkedHashMap<>();
        for (int i = 0; i < headers.size(); i++) {
            String key = headers.get(i);
            if (key.isBlank()) continue;
            String value = i < values.size() ? values.get(i) : "";
            row.put(key, value);
        }
        return normalizeRowAliases(row);
    }

    private Map<String, String> normalizeRowAliases(Map<String, String> row) {
        Map<String, String> normalized = new LinkedHashMap<>(row);
        alias(normalized, "sku", "sku_code");
        alias(normalized, "product", "product_name");
        alias(normalized, "category_name", "category");
        alias(normalized, "price", "unit_price");
        alias(normalized, "qty", "quantity");
        alias(normalized, "date", "transaction_date");
        alias(normalized, "customer", "customer_name");
        alias(normalized, "phone", "customer_phone");
        alias(normalized, "payment", "payment_method");
        return normalized;
    }

    private void alias(Map<String, String> row, String from, String to) {
        if (row.containsKey(from) && !row.get(from).isBlank()) {
            row.putIfAbsent(to, row.get(from));
        }
    }

    private String normalizeHeader(String header) {
        return header.trim().toLowerCase(Locale.ROOT).replace(' ', '_');
    }

    private String groupKey(Map<String, String> row) {
        return row.getOrDefault("transaction_date", "") + "|"
                + row.getOrDefault("customer_phone", "") + "|"
                + row.getOrDefault("payment_method", "");
    }

    private Product resolveProduct(Map<String, String> row, int[] newProducts) {
        String skuCode = row.getOrDefault("sku_code", "").trim();
        if (skuCode.isBlank()) {
            throw new BadRequestException("Validation Error: sku_code is required on every row");
        }
        Optional<Product> existing = productRepository.findBySkuCode(skuCode);
        if (existing.isPresent()) {
            return existing.get();
        }
        newProducts[0]++;
        String rawProductName = row.get("product_name");
        final String productName = (rawProductName == null || rawProductName.trim().isEmpty()) ? skuCode : rawProductName.trim();
        String rawCategory = row.get("category");
        final String categoryName = (rawCategory == null || rawCategory.trim().isEmpty()) ? "Hardware" : rawCategory.trim();
        Category category = categoryRepository.findByCategoryNameIgnoreCase(categoryName)
                .orElseGet(() -> categoryRepository.save(Category.builder()
                        .categoryId("cat-" + UUID.randomUUID().toString().substring(0, 8))
                        .categoryName(categoryName)
                        .description("Imported category")
                        .build()));
        
        BigDecimal unitPrice = parseDecimal(row.get("unit_price"), BigDecimal.valueOf(1000));
        if (unitPrice.compareTo(BigDecimal.ZERO) < 0) {
            throw new BadRequestException("Validation Error: unit_price cannot be negative for SKU " + skuCode);
        }

        BigDecimal unitCost = unitPrice.multiply(BigDecimal.valueOf(0.7)).setScale(2, RoundingMode.HALF_UP);
        Product product = Product.builder()
                .productId("p-" + UUID.randomUUID().toString().substring(0, 8))
                .skuCode(skuCode)
                .productName(productName)
                .category(category)
                .unitCost(unitCost)
                .unitPrice(unitPrice)
                .reorderPoint(20)
                .isActive(true)
                .build();
        product = productRepository.save(product);
        Store store = storeRepository.getReferenceById(DEFAULT_STORE_ID);
        inventoryRecordRepository.save(InventoryRecord.builder()
                .recordId("inv-" + UUID.randomUUID().toString().substring(0, 8))
                .product(product)
                .store(store)
                .quantityOnHand(500)
                .quantityReserved(0)
                .stockoutRisk(BigDecimal.valueOf(0.05))
                .lastUpdated(LocalDateTime.now())
                .build());
        return product;
    }

    private Customer resolveCustomer(Map<String, String> row, int[] newCustomers) {
        String phone = normalizePhone(row.get("customer_phone"));
        String name = row.getOrDefault("customer_name", "Walk-in Customer").trim();
        if (!phone.isBlank()) {
            Optional<Customer> byPhone = customerRepository.findFirstByPhone(phone);
            if (byPhone.isPresent()) {
                return byPhone.get();
            }
            for (Customer c : customerRepository.findAll()) {
                if (phone.equals(normalizePhone(c.getPhone()))) {
                    return c;
                }
            }
        }
        newCustomers[0]++;
        Customer customer = Customer.builder()
                .customerId("c-" + UUID.randomUUID().toString().substring(0, 8))
                .customerName(name.isBlank() ? "Walk-in Customer" : name)
                .customerType(CustomerType.RETAIL)
                .phone(phone.isBlank() ? null : phone)
                .email(null)
                .loyaltyMember(false)
                .lifetimeValue(BigDecimal.ZERO)
                .churnRiskScore(BigDecimal.valueOf(0.25))
                .rfmSegment("New")
                .createdAt(LocalDateTime.now())
                .build();
        return customerRepository.save(customer);
    }

    private void decreaseInventory(Product product, Store store, int quantity) {
        InventoryRecord record = inventoryRecordRepository
                .findByProductProductIdAndStoreStoreId(product.getProductId(), store.getStoreId())
                .orElseGet(() -> InventoryRecord.builder()
                        .recordId("inv-" + UUID.randomUUID().toString().substring(0, 8))
                        .product(product)
                        .store(store)
                        .quantityOnHand(0)
                        .quantityReserved(0)
                        .stockoutRisk(BigDecimal.valueOf(0.1))
                        .lastUpdated(LocalDateTime.now())
                        .build());
                        
        if (record.getQuantityOnHand() < quantity) {
            throw new BadRequestException("Insufficient stock for " + product.getProductName() + ". Available: " + record.getQuantityOnHand() + ", Requested: " + quantity);
        }
        
        record.setQuantityOnHand(record.getQuantityOnHand() - quantity);
        record.setLastUpdated(LocalDateTime.now());
        if (record.getQuantityOnHand() <= product.getReorderPoint()) {
            record.setStockoutRisk(BigDecimal.valueOf(0.75));
        }
        inventoryRecordRepository.save(record);
    }

    private String normalizePhone(String phone) {
        if (phone == null) return "";
        return phone.replaceAll("\\s+", "");
    }

    private PaymentMethod parsePaymentMethod(String raw) {
        if (raw == null || raw.isBlank()) return PaymentMethod.CASH;
        String v = raw.trim().toUpperCase(Locale.ROOT).replace(' ', '_').replace('-', '_');
        if (v.contains("MOBILE")) return PaymentMethod.MOBILE_MONEY;
        if (v.contains("BANK") || v.contains("TRANSFER")) return PaymentMethod.BANK_TRANSFER;
        if (v.contains("CREDIT")) return PaymentMethod.CREDIT;
        try {
            return PaymentMethod.valueOf(v);
        } catch (IllegalArgumentException ex) {
            return PaymentMethod.CASH;
        }
    }

    private LocalDateTime parseDateTime(String raw) {
        if (raw == null || raw.isBlank()) return LocalDateTime.of(2000, 1, 1, 0, 0); // Deterministic fallback
        String value = raw.trim();
        try {
            // ISO datetime: 2026-06-21T09:15:00 or with space
            if (value.length() >= 19 && value.contains("T") || value.matches(".*\\d{2}:\\d{2}:\\d{2}.*")) {
                try {
                    return LocalDateTime.parse(value.substring(0, 19).replace(' ', 'T'));
                } catch (DateTimeParseException ignored) {}
            }
            // Textual formats like "30 june 2026" or "30-Jun-2026"
            if (value.matches("(?i).*\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\\b.*")) {
                try {
                    DateTimeFormatter fmt1 = new java.time.format.DateTimeFormatterBuilder()
                            .parseCaseInsensitive()
                            .appendPattern("d MMMM yyyy")
                            .toFormatter(Locale.ENGLISH);
                    return LocalDate.parse(value.replaceAll("(?i)(st|nd|rd|th)", ""), fmt1).atStartOfDay();
                } catch (Exception ignored) {}
                try {
                    DateTimeFormatter fmt2 = new java.time.format.DateTimeFormatterBuilder()
                            .parseCaseInsensitive()
                            .appendPattern("d-MMM-yyyy")
                            .toFormatter(Locale.ENGLISH);
                    return LocalDate.parse(value, fmt2).atStartOfDay();
                } catch (Exception ignored) {}
            }
            // ISO date: 2026-06-21
            if (value.length() >= 10 && value.charAt(4) == '-') {
                return LocalDate.parse(value.substring(0, 10)).atStartOfDay();
            }
            // DD/MM/YYYY or MM/DD/YYYY formats (padded or unpadded)
            if (value.contains("/")) {
                try {
                    // Try d/M/yyyy (or dd/MM/yyyy)
                    return LocalDate.parse(value, DateTimeFormatter.ofPattern("d/M/yyyy")).atStartOfDay();
                } catch (DateTimeParseException ex) {
                    try {
                        // Fallback to M/d/yyyy
                        return LocalDate.parse(value, DateTimeFormatter.ofPattern("M/d/yyyy")).atStartOfDay();
                    } catch (DateTimeParseException ignored2) {}
                }
            }
            // Excel raw numeric date (e.g. 45840 for July 2, 2026) if format was lost
            if (value.matches("^\\d{5}(\\.\\d+)?$")) {
                try {
                    double excelDate = Double.parseDouble(value);
                    if (excelDate >= 30000 && excelDate <= 60000) {
                        return LocalDateTime.of(1899, 12, 30, 0, 0).plusDays((long) excelDate);
                    }
                } catch (Exception ignored) {}
            }
        } catch (DateTimeParseException ignored) {
        }
        return LocalDateTime.of(2000, 1, 1, 0, 0); // Deterministic fallback to prevent duplicate leaks
    }

    private int parseInt(String raw, int defaultValue) {
        if (raw == null || raw.isBlank()) return defaultValue;
        try {
            return (int) Double.parseDouble(raw.trim());
        } catch (NumberFormatException ex) {
            return defaultValue;
        }
    }

    private BigDecimal parseDecimal(String raw, BigDecimal defaultValue) {
        if (raw == null || raw.isBlank()) return defaultValue;
        try {
            return new BigDecimal(raw.trim().replace(",", "")).setScale(2, RoundingMode.HALF_UP);
        } catch (NumberFormatException ex) {
            return defaultValue;
        }
    }
}
