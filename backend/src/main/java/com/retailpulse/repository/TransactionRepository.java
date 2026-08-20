package com.retailpulse.repository;

import com.retailpulse.model.Transaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public interface TransactionRepository extends JpaRepository<Transaction, String> {

    @Query("SELECT t FROM Transaction t LEFT JOIN FETCH t.customer ORDER BY t.transactionDate DESC")
    List<Transaction> findRecentWithCustomer(Pageable pageable);

    @Query("SELECT t FROM Transaction t LEFT JOIN FETCH t.customer WHERE t.transactionDate BETWEEN :start AND :end ORDER BY t.transactionDate")
    List<Transaction> findByDateRange(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    List<Transaction> findByTransactionDateBetween(LocalDateTime start, LocalDateTime end);
    long countByTransactionDateBetween(LocalDateTime start, LocalDateTime end);

    List<Transaction> findByPaymentStatusOrderByTransactionDateDesc(String paymentStatus);
    List<Transaction> findByPaymentStatusInOrderByTransactionDateDesc(List<String> paymentStatuses);

    @Query("SELECT MIN(t.transactionDate), MAX(t.transactionDate) FROM Transaction t")
    Object[] findTransactionDateRange();

    @Query("SELECT COALESCE(SUM(t.totalAmount), 0) FROM Transaction t WHERE t.transactionDate BETWEEN :start AND :end")
    BigDecimal sumTotalAmountByTransactionDateBetween(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query("SELECT t.paymentMethod, SUM(t.totalAmount) FROM Transaction t WHERE t.transactionDate >= :since GROUP BY t.paymentMethod")
    List<Object[]> sumByPaymentMethodSince(@Param("since") LocalDateTime since);

    @Query("SELECT t.paymentMethod, SUM(t.totalAmount) FROM Transaction t WHERE t.transactionDate BETWEEN :start AND :end GROUP BY t.paymentMethod")
    List<Object[]> sumByPaymentMethodBetween(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    long countByTransactionDateAfter(LocalDateTime since);

    long countByCustomer_CustomerId(String customerId);

    java.util.Optional<Transaction> findTopByCustomer_CustomerIdOrderByTransactionDateDesc(String customerId);

    @Query("SELECT t.customer.customerId, COUNT(t) FROM Transaction t WHERE t.customer IS NOT NULL GROUP BY t.customer.customerId")
    List<Object[]> countTransactionsByCustomer();

    @Query("SELECT t.customer.customerId, COUNT(t) FROM Transaction t WHERE t.customer IS NOT NULL AND t.transactionDate < :endDate GROUP BY t.customer.customerId")
    List<Object[]> countTransactionsByCustomerBefore(@Param("endDate") LocalDateTime endDate);

    @Query("SELECT MAX(t.transactionDate) FROM Transaction t WHERE t.customer.customerId = :customerId AND t.transactionDate < :endDate")
    java.util.Optional<LocalDateTime> findLatestTransactionDateByCustomerBefore(@Param("customerId") String customerId, @Param("endDate") LocalDateTime endDate);

    @Query("SELECT t FROM Transaction t LEFT JOIN FETCH t.customer " +
           "WHERE t.transactionDate >= :start AND t.transactionDate <= :end " +
           "ORDER BY t.transactionDate DESC")
    List<Transaction> findHistoryByDates(
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end
    );
}

