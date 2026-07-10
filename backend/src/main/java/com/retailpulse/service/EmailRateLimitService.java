package com.retailpulse.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Service
public class EmailRateLimitService {

    @Value("${retailpulse.email.daily-limit:50}")
    private int dailyLimit;

    private LocalDate countDate = LocalDate.now();
    private final AtomicInteger sentToday = new AtomicInteger(0);

    public synchronized boolean canSend() {
        resetIfNewDay();
        return sentToday.get() < dailyLimit;
    }

    public synchronized void recordSent() {
        resetIfNewDay();
        int count = sentToday.incrementAndGet();
        if (count >= dailyLimit) {
            log.warn("Daily email limit reached ({}/{}). Further non-OTP emails will be logged only.", count, dailyLimit);
        }
    }

    public synchronized int remaining() {
        resetIfNewDay();
        return Math.max(0, dailyLimit - sentToday.get());
    }

    private void resetIfNewDay() {
        LocalDate today = LocalDate.now();
        if (!today.equals(countDate)) {
            countDate = today;
            sentToday.set(0);
            log.info("Email rate limit counter reset for {}", today);
        }
    }
}
