package com.retailpulse.model.enums;

public enum AlertSeverity {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL;

    public String toApiValue() {
        return name().toLowerCase();
    }
}
