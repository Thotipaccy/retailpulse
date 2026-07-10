package com.retailpulse.dto.request;

import lombok.Data;

@Data
public class CreateScheduledImportRequest {
    private String name;
    private String sourceName;
    private String frequency;
}
