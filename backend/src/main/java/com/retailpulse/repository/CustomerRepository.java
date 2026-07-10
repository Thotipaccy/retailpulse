package com.retailpulse.repository;

import com.retailpulse.model.Customer;
import com.retailpulse.model.enums.CustomerType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface CustomerRepository extends JpaRepository<Customer, String> {

    Optional<Customer> findFirstByPhone(String phone);

    List<Customer> findByCustomerType(CustomerType type);
    List<Customer> findByChurnRiskScoreGreaterThan(BigDecimal threshold);
    List<Customer> findByChurnRiskScoreGreaterThanEqualOrderByChurnRiskScoreDesc(BigDecimal threshold);

    @Query("SELECT c.rfmSegment, COUNT(c) FROM Customer c GROUP BY c.rfmSegment")
    List<Object[]> countByRfmSegment();

    List<Customer> findTop20ByOrderByLifetimeValueDesc();
}
