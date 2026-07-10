package com.retailpulse.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SalesOverviewResponse {
    private String period;
    private double totalSales;
    private long totalTransactions;
    private double avgTransaction;
    private double growth;
}
