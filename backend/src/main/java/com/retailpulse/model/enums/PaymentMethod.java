package com.retailpulse.model.enums;

public enum PaymentMethod {
    CASH,
    MOBILE_MONEY,
    BANK_TRANSFER,
    CREDIT;

    public String toApiValue() {
        return name().toLowerCase();
    }
}
