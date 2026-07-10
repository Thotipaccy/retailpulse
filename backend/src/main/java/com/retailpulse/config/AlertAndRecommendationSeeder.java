package com.retailpulse.config;

import com.retailpulse.model.*;
import com.retailpulse.model.enums.AlertSeverity;
import com.retailpulse.model.enums.PaymentMethod;
import com.retailpulse.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Runs on every startup (all profiles, all environments).
 * 1. Seeds 12 alerts for EVERY user that has no alerts yet.
 * 2. Seeds cross-season transaction data when fewer than 4 distinct months
 *    of history exist, so the recommendation engine always has seasonal data.
 */
@Slf4j
@Component
@Order(2)
@RequiredArgsConstructor
public class AlertAndRecommendationSeeder implements CommandLineRunner {

    private final AlertRepository alertRepository;
    private final UserRepository userRepository;
    private final TransactionRepository transactionRepository;
    private final TransactionItemRepository transactionItemRepository;
    private final ProductRepository productRepository;
    private final CustomerRepository customerRepository;
    private final StoreRepository storeRepository;

    @Override
    @Transactional
    public void run(String... args) {
        seedAlertsForAllUsers();
        seedSeasonalTransactionData();
    }

    // ─── Alerts ───────────────────────────────────────────────────────────────

    private void seedAlertsForAllUsers() {
        List<User> allUsers = userRepository.findAll();
        if (allUsers.isEmpty()) {
            log.info("No users found — skipping alert seed");
            return;
        }

        int totalSaved = 0;
        for (User user : allUsers) {
            long existing = alertRepository.countByUserUserId(user.getUserId());
            if (existing > 0) {
                log.debug("User {} already has {} alerts — skipping", user.getUserId(), existing);
                continue;
            }
            totalSaved += seedAlertsForUser(user);
        }

        if (totalSaved > 0) {
            log.info("Alert seeder: {} alerts seeded across {} users", totalSaved, allUsers.size());
        }
    }

    private int seedAlertsForUser(User user) {
        // Each entry: alertType, severity, message, isRead, hoursAgo
        List<Object[]> defs = List.of(
            new Object[]{"LOW_STOCK",  AlertSeverity.HIGH,     "Paint (Sahara 20L) is below reorder point — 32 units remaining. Reorder immediately.",            false, 0},
            new Object[]{"CHURN_RISK", AlertSeverity.CRITICAL, "Claudine Nyirahabimana churn risk at 88%. Urgent retention action recommended.",                  false, 2},
            new Object[]{"LOW_STOCK",  AlertSeverity.HIGH,     "Water Tanks (1000L) critically low — only 12 units in stock (reorder point: 2).",                false, 4},
            new Object[]{"FORECAST",   AlertSeverity.MEDIUM,   "Weekly demand forecast updated. Cement demand expected +18% next week. Accuracy: 94.2%.",        false, 5},
            new Object[]{"SALES",      AlertSeverity.LOW,      "Daily sales target exceeded by 12% — RWF 2.4M revenue achieved vs RWF 2.1M target.",             false, 8},
            new Object[]{"INVENTORY",  AlertSeverity.HIGH,     "Iron Sheets (G32) stock at 85 units — approaching reorder point of 100.",                        false, 12},
            new Object[]{"CHURN_RISK", AlertSeverity.HIGH,     "Esperance Uwimana churn risk at 72%. Last purchase was 45 days ago.",                            false, 24},
            new Object[]{"SALES",      AlertSeverity.MEDIUM,   "Weekly revenue RWF 14.8M is 8% below target of RWF 16M. Review sales strategy.",                false, 36},
            new Object[]{"LOW_STOCK",  AlertSeverity.MEDIUM,   "Plywood (18mm) running low — 95 units remaining (reorder point: 60).",                          true,  48},
            new Object[]{"FORECAST",   AlertSeverity.LOW,      "Seasonal forecast: Roofing materials expected to surge 35% in Q3 (rainy season).",               true,  72},
            new Object[]{"SALES",      AlertSeverity.LOW,      "Monthly sales milestone reached: RWF 45M — highest revenue month in 2026.",                      true,  96},
            new Object[]{"INVENTORY",  AlertSeverity.MEDIUM,   "5 products are approaching reorder points. Review inventory dashboard for details.",              true,  120}
        );

        int saved = 0;
        for (int i = 0; i < defs.size(); i++) {
            Object[] d = defs.get(i);
            try {
                alertRepository.save(Alert.builder()
                    .alertId("alert-" + user.getUserId() + "-" + i)
                    .user(user)
                    .alertType((String) d[0])
                    .severity((AlertSeverity) d[1])
                    .message((String) d[2])
                    .isRead((Boolean) d[3])
                    .createdAt(LocalDateTime.now().minusHours((int) d[4]))
                    .build());
                saved++;
            } catch (Exception ex) {
                log.debug("Alert alert-{}-{} already exists, skipping", user.getUserId(), i);
            }
        }
        log.info("Seeded {} alerts for user {}", saved, user.getUserId());
        return saved;
    }

    // ─── Seasonal Recommendation Data ─────────────────────────────────────────

    /**
     * Seeds synthetic transactions spanning Spring/Summer/Autumn/Winter when
     * fewer than 4 distinct calendar months of transaction data exist.
     */
    private void seedSeasonalTransactionData() {
        User admin = userRepository.findById("u1").orElse(null);
        Store store = storeRepository.findById("store-001").orElse(null);
        List<Product> products = productRepository.findAll();

        if (admin == null || store == null || products.isEmpty()) {
            log.info("Prerequisites not ready (admin/store/products) — skipping seasonal seed");
            return;
        }

        Customer customer = customerRepository.findAll().stream().findFirst().orElse(null);

        // Count distinct SEASONS (not months) we have transaction data for
        Map<Integer, String> monthToSeason = Map.ofEntries(
                Map.entry(12, "Winter"), Map.entry(1, "Winter"), Map.entry(2, "Winter"),
                Map.entry(3, "Spring"),  Map.entry(4, "Spring"),  Map.entry(5, "Spring"),
                Map.entry(6, "Summer"),  Map.entry(7, "Summer"),  Map.entry(8, "Summer"),
                Map.entry(9, "Autumn"),  Map.entry(10, "Autumn"), Map.entry(11, "Autumn")
        );
        long distinctSeasons = transactionRepository.findAll().stream()
                .map(t -> monthToSeason.getOrDefault(t.getTransactionDate().getMonthValue(), "Unknown"))
                .distinct().count();

        if (distinctSeasons >= 4) {
            log.info("Transaction data spans all 4 seasons — seasonal seed not needed");
            return;
        }

        log.info("Only {} distinct season(s) covered — seeding missing Autumn/Winter data", distinctSeasons);

        // One representative month per season, quantities increase by season index
        Object[][] seasonSeeds = {
            // {seasonName, monthNum, baseQty}
            new Object[]{"Spring",  4,  15},
            new Object[]{"Summer",  7,  20},
            new Object[]{"Autumn", 10,  18},
            new Object[]{"Winter",  1,  12}
        };

        int txCount = 0;
        int currentYear = LocalDateTime.now().getYear();

        for (Object[] seed : seasonSeeds) {
            String season  = (String) seed[0];
            int month      = (int) seed[1];
            int baseQty    = (int) seed[2];

            // Use last year if this month is still in the future this year
            int seedYear = (month > LocalDateTime.now().getMonthValue()) ? currentYear - 1 : currentYear;

            for (int pi = 0; pi < Math.min(5, products.size()); pi++) {
                Product product = products.get(pi);
                String txId   = "TXN-SEASON-" + season + "-" + seedYear + "-P" + pi;
                String itemId = "TI-SEASON-"  + season + "-" + seedYear + "-P" + pi;

                if (transactionRepository.existsById(txId)) continue;

                try {
                    LocalDateTime txDate = LocalDateTime.of(seedYear, month, 5 + pi, 9, 30, 0);
                    int qty = baseQty + pi * 5;

                    Transaction tx = transactionRepository.save(Transaction.builder()
                        .transactionId(txId)
                        .customer(customer)
                        .user(admin)
                        .store(store)
                        .transactionDate(txDate)
                        .totalAmount(product.getUnitPrice().multiply(BigDecimal.valueOf(qty)))
                        .paymentMethod(PaymentMethod.CASH)
                        .discountAmount(BigDecimal.ZERO)
                        .items(new ArrayList<>())
                        .build());

                    transactionItemRepository.save(TransactionItem.builder()
                        .itemId(itemId)
                        .transaction(tx)
                        .product(product)
                        .quantity(qty)
                        .unitPrice(product.getUnitPrice())
                        .lineTotal(product.getUnitPrice().multiply(BigDecimal.valueOf(qty)))
                        .build());

                    txCount++;
                } catch (Exception ex) {
                    log.debug("Seasonal tx {} skipped: {}", txId, ex.getMessage());
                }
            }
        }

        log.info("Seasonal seeder: {} transactions created", txCount);
    }
}
