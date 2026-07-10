package com.retailpulse.model.enums;

public enum CustomerType {
    RETAIL,
    CONTRACTOR,
    WHOLESALE;

    public String toApiValue() {
        return name().toLowerCase();
    }
}
