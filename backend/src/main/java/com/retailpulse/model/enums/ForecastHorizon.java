package com.retailpulse.model.enums;

public enum ForecastHorizon {
    DAILY,
    WEEKLY,
    MONTHLY;

    public static ForecastHorizon fromParam(String value) {
        if (value == null) return DAILY;
        return switch (value.toLowerCase()) {
            case "weekly" -> WEEKLY;
            case "monthly" -> MONTHLY;
            default -> DAILY;
        };
    }
}
