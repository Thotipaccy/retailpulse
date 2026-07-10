package com.retailpulse.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardResponse {
    private List<Map<String, Object>> kpis;
    private List<Map<String, Object>> salesTrend;
    private List<Map<String, Object>> topCategories;
    private List<Map<String, Object>> recentTransactions;
    private List<Map<String, Object>> recentAlerts;
}
