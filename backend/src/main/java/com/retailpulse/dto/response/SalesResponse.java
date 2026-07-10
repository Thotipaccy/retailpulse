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
public class SalesResponse {
    private List<Map<String, Object>> trend;
    private List<Map<String, Object>> byCategory;
    private List<Map<String, Object>> byPaymentMethod;
    private List<Map<String, Object>> topProducts;
    private List<Map<String, Object>> heatmap;
    private Map<String, Object> summary;
}
