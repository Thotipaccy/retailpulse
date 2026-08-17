package com.retailpulse.repository;

import com.retailpulse.model.PaymentHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PaymentHistoryRepository extends JpaRepository<PaymentHistory, String> {
    List<PaymentHistory> findByTransactionTransactionIdOrderByPaymentDateDesc(String transactionId);
}
