package com.retailpulse.repository;

import com.retailpulse.model.StrategicGoal;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StrategicGoalRepository extends JpaRepository<StrategicGoal, String> {
    List<StrategicGoal> findAllByOrderByDeadlineAsc();
}
