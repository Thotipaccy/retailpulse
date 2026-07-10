package com.retailpulse.repository;

import com.retailpulse.model.TransactionItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface TransactionItemRepository extends JpaRepository<TransactionItem, String> {

    @Query("""
        SELECT ti.product.productId, ti.product.productName, SUM(ti.quantity), SUM(ti.lineTotal),
               ti.product.category.categoryName, ti.product.unitCost
        FROM TransactionItem ti
        GROUP BY ti.product.productId, ti.product.productName,
                 ti.product.category.categoryName, ti.product.unitCost
        ORDER BY SUM(ti.lineTotal) DESC
        """)
    List<Object[]> findTopSellingProducts();

    @Query("""
        SELECT ti.product.productId, ti.product.productName, SUM(ti.quantity), SUM(ti.lineTotal),
               ti.product.category.categoryName, ti.product.unitCost
        FROM TransactionItem ti
        JOIN ti.transaction t
        WHERE t.transactionDate BETWEEN :start AND :end
        GROUP BY ti.product.productId, ti.product.productName,
                 ti.product.category.categoryName, ti.product.unitCost
        ORDER BY SUM(ti.lineTotal) DESC
        """)
    List<Object[]> findTopSellingProductsBetween(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query("""
        SELECT COALESCE(SUM(ti.quantity), 0)
        FROM TransactionItem ti
        JOIN ti.transaction t
        WHERE ti.product.productId = :productId
        AND t.transactionDate BETWEEN :start AND :end
        """)
    Long sumQuantityByProductIdBetween(@Param("productId") String productId, @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query("""
        SELECT ti FROM TransactionItem ti
        JOIN FETCH ti.transaction t
        JOIN FETCH ti.product p
        JOIN FETCH p.category
        WHERE t.transactionDate >= :since
        """)
    List<TransactionItem> findWithDetailsSince(@Param("since") LocalDateTime since);

    @Query("""
        SELECT CAST(t.transactionDate AS date), COALESCE(SUM(ti.quantity), 0)
        FROM TransactionItem ti
        JOIN ti.transaction t
        WHERE t.transactionDate >= :since
        AND (:productId IS NULL OR ti.product.productId = :productId)
        AND (:categoryId IS NULL OR ti.product.category.categoryId = :categoryId)
        GROUP BY CAST(t.transactionDate AS date)
        ORDER BY CAST(t.transactionDate AS date)
        """)
    List<Object[]> sumDailyQuantitySince(
            @Param("since") LocalDateTime since,
            @Param("productId") String productId,
            @Param("categoryId") String categoryId);

    @Query("""
        SELECT COUNT(ti) > 0 FROM TransactionItem ti
        JOIN ti.transaction t
        JOIN ti.product p
        LEFT JOIN t.customer c
        WHERE t.transactionDate >= :dayStart AND t.transactionDate < :dayEnd
        AND p.skuCode = :skuCode
        AND ti.quantity = :quantity
        AND (
            (:customerPhone = '' AND (c IS NULL OR c.phone IS NULL OR c.phone = ''))
            OR REPLACE(COALESCE(c.phone, ''), ' ', '') = :customerPhone
        )
        """)
    boolean existsExactDuplicateLine(
            @Param("dayStart") LocalDateTime dayStart,
            @Param("dayEnd") LocalDateTime dayEnd,
            @Param("skuCode") String skuCode,
            @Param("customerPhone") String customerPhone,
            @Param("quantity") int quantity);

    @Query("""
        SELECT COUNT(ti) > 0 FROM TransactionItem ti
        JOIN ti.transaction t
        JOIN ti.product p
        LEFT JOIN t.customer c
        WHERE t.transactionDate >= :dayStart AND t.transactionDate < :dayEnd
        AND p.skuCode = :skuCode
        AND ti.quantity <> :quantity
        AND (
            (:customerPhone = '' AND (c IS NULL OR c.phone IS NULL OR c.phone = ''))
            OR REPLACE(COALESCE(c.phone, ''), ' ', '') = :customerPhone
        )
        """)
    boolean existsPartialDuplicateLine(
            @Param("dayStart") LocalDateTime dayStart,
            @Param("dayEnd") LocalDateTime dayEnd,
            @Param("skuCode") String skuCode,
            @Param("customerPhone") String customerPhone,
            @Param("quantity") int quantity);

    @Query("""
        SELECT c.categoryName, COALESCE(SUM(ti.lineTotal), 0)
        FROM TransactionItem ti
        JOIN ti.product p
        JOIN p.category c
        JOIN ti.transaction t
        WHERE t.transactionDate >= :since
        GROUP BY c.categoryName
        ORDER BY SUM(ti.lineTotal) DESC
        """)
    List<Object[]> sumRevenueByCategorySince(@Param("since") LocalDateTime since);

    @Query("""
        SELECT p.category.categoryName, COALESCE(SUM(CAST(ti.quantity AS double) * p.unitCost), 0)
        FROM TransactionItem ti
        JOIN ti.product p
        JOIN ti.transaction t
        WHERE t.transactionDate >= :since
        GROUP BY p.category.categoryName
        ORDER BY SUM(CAST(ti.quantity AS double) * p.unitCost) DESC
        """)
    List<Object[]> sumCogsByCategorySince(@Param("since") LocalDateTime since);

    @Query("""
        SELECT c.categoryName, COALESCE(SUM(ti.lineTotal), 0)
        FROM TransactionItem ti
        JOIN ti.product p
        JOIN p.category c
        JOIN ti.transaction t
        WHERE t.transactionDate BETWEEN :start AND :end
        GROUP BY c.categoryName
        ORDER BY SUM(ti.lineTotal) DESC
        """)
    List<Object[]> sumRevenueByCategoryBetween(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query("""
        SELECT ti.product.productId, ti.product.productName, SUM(ti.quantity), ti.product.category.categoryName
        FROM TransactionItem ti
        JOIN ti.transaction t
        WHERE t.transactionDate >= :since
        GROUP BY ti.product.productId, ti.product.productName, ti.product.category.categoryName
        ORDER BY SUM(ti.quantity) DESC
        """)
    List<Object[]> sumQuantityByProductSince(@Param("since") LocalDateTime since);

    /**
     * Returns (productId, productName, categoryName, month, totalQuantity)
     * for all transaction items grouped by product + month of sale.
     * Uses native PostgreSQL EXTRACT for reliability.
     */
    @Query(value = """
        SELECT
            p.product_id,
            p.product_name,
            c.category_name,
            CAST(EXTRACT(MONTH FROM t.transaction_date) AS INTEGER) AS month_num,
            SUM(ti.quantity)                            AS total_qty
        FROM transaction_items ti
        JOIN products p  ON ti.product_id  = p.product_id
        JOIN categories c ON p.category_id = c.category_id
        JOIN transactions t ON ti.transaction_id = t.transaction_id
        WHERE t.transaction_date >= :since
        GROUP BY p.product_id, p.product_name, c.category_name, month_num
        ORDER BY month_num, total_qty DESC
        """, nativeQuery = true)
    List<Object[]> findTopProductsByMonth(@Param("since") LocalDateTime since);
}

