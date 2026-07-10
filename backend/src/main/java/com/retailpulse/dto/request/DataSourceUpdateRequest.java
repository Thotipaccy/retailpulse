package com.retailpulse.dto.request;

import lombok.Data;

@Data
public class DataSourceUpdateRequest {
    private String connectionString;
    private String syncFrequency;
}
