package com.retailpulse.repository;

import com.retailpulse.model.AlertPreference;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AlertPreferenceRepository extends JpaRepository<AlertPreference, String> {
}
