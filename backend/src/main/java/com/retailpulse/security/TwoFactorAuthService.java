package com.retailpulse.security;

import com.retailpulse.exception.BadRequestException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class TwoFactorAuthService {

    private static final int MAX_FAILED_ATTEMPTS = 3;

    private final SecureRandom random = new SecureRandom();
    private final Map<String, Pending2FA> pendingCodes = new ConcurrentHashMap<>();

    @Value("${retailpulse.two-factor.expiration-minutes:10}")
    private int expirationMinutes;

    @Value("${retailpulse.two-factor.code-length:6}")
    private int codeLength;

    public String generateCode(String userId) {
        String code = generateRandomCode();
        pendingCodes.put(userId, new Pending2FA(
                code,
                Instant.now().plusSeconds(expirationMinutes * 60L),
                0
        ));
        log.info("OTP generated for user {}", userId);
        return code;
    }

    public void verifyCode(String userId, String code) {
        Pending2FA pending = pendingCodes.get(userId);
        if (pending == null || Instant.now().isAfter(pending.expiresAt())) {
            pendingCodes.remove(userId);
            throw new BadRequestException("Invalid or expired code");
        }
        if (!pending.code().equals(code)) {
            int attempts = pending.failedAttempts() + 1;
            if (attempts >= MAX_FAILED_ATTEMPTS) {
                pendingCodes.remove(userId);
                throw new BadRequestException("Too many failed attempts. Please login again.");
            }
            pendingCodes.put(userId, new Pending2FA(pending.code(), pending.expiresAt(), attempts));
            throw new BadRequestException("Invalid or expired code");
        }
        pendingCodes.remove(userId);
    }

    public void invalidate(String userId) {
        pendingCodes.remove(userId);
    }

    private String generateRandomCode() {
        StringBuilder code = new StringBuilder(codeLength);
        for (int i = 0; i < codeLength; i++) {
            code.append(random.nextInt(10));
        }
        return code.toString();
    }

    private record Pending2FA(String code, Instant expiresAt, int failedAttempts) {}
}
