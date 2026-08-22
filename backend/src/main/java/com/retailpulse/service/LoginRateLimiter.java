package com.retailpulse.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * In-memory brute-force protection for the login endpoint.
 * Locks an account's login attempts for 15 minutes after 5 consecutive failures.
 * Suitable for single-instance deployments.
 */
@Slf4j
@Component
public class LoginRateLimiter {

    private static final int MAX_ATTEMPTS = 5;
    private static final Duration FAILURE_WINDOW = Duration.ofMinutes(15);

    private final ConcurrentHashMap<String, Attempt> attemptsByLogin = new ConcurrentHashMap<>();

    public void checkAllowed(String login) {
        String key = normalize(login);
        Attempt attempt = attemptsByLogin.get(key);
        if (attempt == null) {
            return;
        }
        int failures = attempt.count.get();
        if (failures >= MAX_ATTEMPTS && Instant.now().isBefore(attempt.windowStart.plus(FAILURE_WINDOW))) {
            long minutesLeft = Math.max(1, Duration.between(Instant.now(),
                    attempt.windowStart.plus(FAILURE_WINDOW)).toMinutes());
            log.warn("Login blocked for {} - {} recent failed attempts", key, failures);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many failed login attempts. Please try again in " + minutesLeft + " minute(s).");
        }
    }

    public void recordFailure(String login) {
        String key = normalize(login);
        Instant now = Instant.now();
        attemptsByLogin.compute(key, (k, existing) -> {
            if (existing == null || now.isAfter(existing.windowStart.plus(FAILURE_WINDOW))) {
                return new Attempt(now, new AtomicInteger(1));
            }
            existing.count.incrementAndGet();
            return existing;
        });
    }

    public void recordSuccess(String login) {
        attemptsByLogin.remove(normalize(login));
    }

    private static String normalize(String login) {
        return login == null ? "" : login.trim().toLowerCase();
    }

    private static final class Attempt {
        private final Instant windowStart;
        private final AtomicInteger count;

        private Attempt(Instant windowStart, AtomicInteger count) {
            this.windowStart = windowStart;
            this.count = count;
        }
    }
}
