package com.retailpulse.model.enums;

public enum UserRole {
    ADMIN,
    MANAGER,
    ANALYST,
    VIEWER;

    public String toApiValue() {
        return name().toLowerCase();
    }

    public static UserRole fromApiValue(String value) {
        if (value == null) return VIEWER;
        return switch (value.toLowerCase()) {
            case "administrator", "admin" -> ADMIN;
            case "manager" -> MANAGER;
            case "analyst" -> ANALYST;
            default -> VIEWER;
        };
    }
}
