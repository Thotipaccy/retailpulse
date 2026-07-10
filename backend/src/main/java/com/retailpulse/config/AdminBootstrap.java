package com.retailpulse.config;

import com.retailpulse.model.Store;
import com.retailpulse.model.User;
import com.retailpulse.model.enums.UserRole;
import com.retailpulse.repository.StoreRepository;
import com.retailpulse.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * Always runs: creates the default admin (and minimal store) when the database has no users.
 * Full demo seed data is handled separately by {@link DataInitializer} (dev profile only).
 */
@Slf4j
@Component
@Order(0)
@RequiredArgsConstructor
public class AdminBootstrap implements CommandLineRunner {

    private static final String DEFAULT_STORE_ID = "store-001";

    private final UserRepository userRepository;
    private final StoreRepository storeRepository;
    private final PasswordEncoder passwordEncoder;
    private final com.retailpulse.repository.ProductRepository productRepository;
    private final com.retailpulse.repository.CategoryRepository categoryRepository;

    @Value("${retailpulse.seed.admin-email:${RETAILPULSE_ADMIN_EMAIL:thotipaccy@gmail.com}}")
    private String adminEmail;

    @Value("${retailpulse.seed.admin-password:${RETAILPULSE_ADMIN_PASSWORD:admin123}}")
    private String adminPassword;

    @Override
    @Transactional
    public void run(String... args) {
        cleanupBlankProducts();
        if (userRepository.count() > 0) {
            return;
        }
        log.info("Empty database detected — creating default admin user");
        ensureDefaultStore();
        userRepository.save(User.builder()
                .userId("u1")
                .fullName("Admin User")
                .email(adminEmail)
                .passwordHash(passwordEncoder.encode(adminPassword))
                .role(UserRole.ADMIN)
                .phone("+250 788 000 001")
                .department("Administration")
                .isActive(true)
                .mfaEnabled(true)
                .createdAt(LocalDateTime.now())
                .build());
        log.info("Admin user created: {}", adminEmail);
    }

    private void cleanupBlankProducts() {
        try {
            java.util.List<com.retailpulse.model.Product> products = productRepository.findAll();
            int fixedCount = 0;
            for (com.retailpulse.model.Product p : products) {
                boolean modified = false;
                if (p.getProductName() == null || p.getProductName().trim().isEmpty()) {
                    p.setProductName(p.getSkuCode() != null ? p.getSkuCode() : "Unnamed Product");
                    modified = true;
                }
                if (p.getCategory() != null && (p.getCategory().getCategoryName() == null || p.getCategory().getCategoryName().trim().isEmpty())) {
                    p.getCategory().setCategoryName("Hardware");
                    categoryRepository.save(p.getCategory());
                }
                if (modified) {
                    productRepository.save(p);
                    fixedCount++;
                }
            }
            if (fixedCount > 0) {
                log.info("Cleaned up {} database products with empty names/categories.", fixedCount);
            }
        } catch (Exception e) {
            log.warn("Database startup cleanup warning: {}", e.getMessage());
        }
    }

    private void ensureDefaultStore() {
        if (storeRepository.existsById(DEFAULT_STORE_ID)) {
            return;
        }
        storeRepository.save(Store.builder()
                .storeId(DEFAULT_STORE_ID)
                .storeName("Quincaillerie du Rwamagana")
                .location("Rwamagana")
                .province("Eastern Province")
                .isActive(true)
                .createdAt(LocalDateTime.now())
                .build());
        log.info("Default store {} created", DEFAULT_STORE_ID);
    }
}
