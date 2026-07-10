package com.retailpulse.exception;

import lombok.Getter;

@Getter
public class InsufficientDataException extends BadRequestException {

    private final long daysAvailable;
    private final long requiredDays;

    public InsufficientDataException(long daysAvailable, long requiredDays) {
        super("Insufficient historical data. Need at least " + requiredDays + " days. Currently: " + daysAvailable + " days.");
        this.daysAvailable = daysAvailable;
        this.requiredDays = requiredDays;
    }
}
