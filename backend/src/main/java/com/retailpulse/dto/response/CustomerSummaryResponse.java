package com.retailpulse.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CustomerSummaryResponse {
    private long totalCustomers;
    private double avgLTV;
    private double repeatRate;
    private long churnRiskCount;
}
