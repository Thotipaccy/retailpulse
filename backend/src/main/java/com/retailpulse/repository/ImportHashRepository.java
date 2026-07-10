package com.retailpulse.repository;

import com.retailpulse.model.ImportHash;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ImportHashRepository extends JpaRepository<ImportHash, String> {
}
