package com.retailpulse.repository;

import com.retailpulse.model.Store;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StoreRepository extends JpaRepository<Store, String> {
    List<Store> findByIsActiveTrue();
}
