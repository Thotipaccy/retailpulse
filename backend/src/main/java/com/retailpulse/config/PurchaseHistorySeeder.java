package com.retailpulse.config;

import com.retailpulse.model.*;
import com.retailpulse.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Seeds multi-supplier purchase history when missing so supplier comparison and
 * best-time-to-buy features show real data on existing databases.
 */
@Slf4j
@Component
@Order(2)
@RequiredArgsConstructor
public class PurchaseHistorySeeder implements CommandLineRunner {

    private static final String STORE_ID = "store-001";
    private static final String[][] SUPPLIERS = {
            {"Kigali Hardware Supplies", "+250 788 100 001"},
            {"Rwamagana Builders Depot", "+250 788 200 002"},
            {"East Africa Trading Co.", "+250 788 300 003"},
    };

    private final InventoryPurchaseRepository inventoryPurchaseRepository;
    private final InventoryRecordRepository inventoryRecordRepository;
    private final ProductRepository productRepository;
    private final StoreRepository storeRepository;
    private final UserRepository userRepository;

    @Value("${retailpulse.seed.admin-email:${RETAILPULSE_ADMIN_EMAIL:thotipaccy@gmail.com}}")
    private String adminEmail;

    @Override
    @Transactional
    public void run(String... args) {
        if (inventoryPurchaseRepository.count() >= 20) {
            return;
        }
        User admin = userRepository.findByEmailIgnoreCase(adminEmail)
                .or(() -> userRepository.findById("u1"))
                .orElse(null);
        if (admin == null) {
            log.warn("Cannot seed purchase history — admin user not found");
            return;
        }
        Store store = storeRepository.findById(STORE_ID).orElse(null);
        if (store == null) {
            log.warn("Cannot seed purchase history — store {} not found", STORE_ID);
            return;
        }

        List<Product> products = productRepository.findAll().stream()
                .filter(Product::getIsActive)
                .limit(12)
                .toList();
        if (products.isEmpty()) {
            return;
        }

        log.info("Seeding purchase history for {} products from {} suppliers", products.size(), SUPPLIERS.length);
        int monthsBack = 0;
        for (Product product : products) {
            BigDecimal baseCost = product.getUnitCost();
            for (int s = 0; s < SUPPLIERS.length; s++) {
                String[] supplier = SUPPLIERS[s];
                // Supplier 0 cheapest, supplier 2 most expensive
                BigDecimal unitCost = baseCost.multiply(BigDecimal.valueOf(0.92 + s * 0.06))
                        .setScale(2, java.math.RoundingMode.HALF_UP);
                int qty = 20 + (s * 10) + (products.indexOf(product) % 5) * 5;
                LocalDateTime purchaseDate = LocalDateTime.now()
                        .minusMonths(monthsBack % 6)
                        .minusDays(s * 14L + products.indexOf(product));
                monthsBack++;

                String purchaseId = "pur-seed-" + UUID.randomUUID().toString().substring(0, 8);
                BigDecimal totalCost = unitCost.multiply(BigDecimal.valueOf(qty));

                inventoryPurchaseRepository.save(InventoryPurchase.builder()
                        .purchaseId(purchaseId)
                        .product(product)
                        .store(store)
                        .user(admin)
                        .quantity(qty)
                        .unitPurchaseCost(unitCost)
                        .totalCost(totalCost)
                        .supplierName(supplier[0])
                        .supplierContact(supplier[1])
                        .invoiceNumber("INV-" + purchaseDate.getYear() + "-" + purchaseId.substring(9))
                        .purchaseDate(purchaseDate)
                        .createdAt(purchaseDate)
                        .build());

                inventoryRecordRepository
                        .findByProductProductIdAndStoreStoreId(product.getProductId(), STORE_ID)
                        .ifPresent(record -> {
                            record.setSupplierName(supplier[0]);
                            record.setSupplierContact(supplier[1]);
                            record.setUnitPurchaseCost(unitCost);
                            record.setLastPurchaseDate(purchaseDate);
                            inventoryRecordRepository.save(record);
                        });
            }
        }
        log.info("Purchase history seeding complete — {} records", inventoryPurchaseRepository.count());
    }
}
