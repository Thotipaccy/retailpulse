package com.retailpulse.config;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

@Component
public class ApplicationUptime {

    private static final Instant STARTED = Instant.now();

    public String formattedUptime() {
        Duration d = Duration.between(STARTED, Instant.now());
        long days = d.toDays();
        long hours = d.toHoursPart();
        long minutes = d.toMinutesPart();
        if (days > 0) {
            return days + "d " + hours + "h " + minutes + "m";
        }
        if (hours > 0) {
            return hours + "h " + minutes + "m";
        }
        return Math.max(minutes, 1) + "m";
    }
}
