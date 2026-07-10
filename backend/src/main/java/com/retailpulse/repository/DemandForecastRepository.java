package com.retailpulse.repository;

import com.retailpulse.model.DemandForecast;
import com.retailpulse.model.enums.ForecastHorizon;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface DemandForecastRepository extends JpaRepository<DemandForecast, String> {
    List<DemandForecast> findByForecastHorizonOrderByForecastDateAsc(ForecastHorizon horizon);
    List<DemandForecast> findByProductProductIdOrderByForecastDateAsc(String productId);
    List<DemandForecast> findByProductProductIdAndForecastHorizon(String productId, ForecastHorizon horizon);
    List<DemandForecast> findByStoreStoreIdAndForecastDateBetween(String storeId, LocalDate start, LocalDate end);
}
