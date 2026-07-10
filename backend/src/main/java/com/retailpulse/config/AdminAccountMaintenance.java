package com.retailpulse.config;

import com.retailpulse.model.User;
import com.retailpulse.model.enums.UserRole;
import com.retailpulse.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ensures the primary admin account (thotipaccy@gmail.com) is configured on every startup,
 * including existing databases — no fresh DB required.
 */
@Slf4j
@Component
@Order(1)
@RequiredArgsConstructor
public class AdminAccountMaintenance implements CommandLineRunner {

    private final UserRepository userRepository;

    @Value("${retailpulse.seed.admin-email:${RETAILPULSE_ADMIN_EMAIL:thotipaccy@gmail.com}}")
    private String adminEmail;

    @Override
    @Transactional
    public void run(String... args) {
        User admin = userRepository.findByEmailIgnoreCase(adminEmail)
                .or(() -> userRepository.findById("u1"))
                .orElse(null);

        if (admin == null) {
            log.warn("Primary admin {} not found — skipping admin maintenance", adminEmail);
            return;
        }

        boolean changed = false;
        if (!adminEmail.equalsIgnoreCase(admin.getEmail())) {
            var existing = userRepository.findByEmailIgnoreCase(adminEmail);
            if (existing.isEmpty() || admin.getUserId().equals(existing.get().getUserId())) {
                admin.setEmail(adminEmail);
                changed = true;
            }
        }
        if (admin.getRole() != UserRole.ADMIN) {
            admin.setRole(UserRole.ADMIN);
            changed = true;
        }
        if (!Boolean.TRUE.equals(admin.getIsActive())) {
            admin.setIsActive(true);
            changed = true;
        }
        if (!Boolean.TRUE.equals(admin.getMfaEnabled())) {
            admin.setMfaEnabled(true);
            changed = true;
            log.info("Enabled 2FA for primary admin {}", adminEmail);
        }
        if (changed) {
            userRepository.save(admin);
            log.info("Primary admin account synced: {} ({})", admin.getFullName(), adminEmail);
        }
    }
}
