package com.retailpulse.model;

import com.retailpulse.model.enums.ForecastHorizon;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "demand_forecasts")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DemandForecast {

    @Id
    @Column(name = "forecast_id", length = 36)
    private String forecastId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @Enumerated(EnumType.STRING)
    @Column(name = "forecast_horizon", nullable = false, length = 20)
    private ForecastHorizon forecastHorizon;

    @Column(name = "forecast_date", nullable = false)
    private LocalDate forecastDate;

    @Column(name = "predicted_demand", nullable = false, precision = 15, scale = 2)
    private BigDecimal predictedDemand;

    @Column(name = "confidence_lower", precision = 15, scale = 2)
    private BigDecimal confidenceLower;

    @Column(name = "confidence_upper", precision = 15, scale = 2)
    private BigDecimal confidenceUpper;

    @Column(name = "model_mape", precision = 6, scale = 2)
    private BigDecimal modelMape;

    @Column(name = "generated_at", nullable = false)
    private LocalDateTime generatedAt;
}
