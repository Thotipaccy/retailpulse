package com.retailpulse.security;

import com.retailpulse.config.JwtConfig;
import com.retailpulse.model.enums.UserRole;
import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtTokenProvider {

    private final JwtConfig jwtConfig;

    public String generateAccessToken(String userId, String email, UserRole role) {
        return buildToken(userId, email, role, jwtConfig.getAccessExpirationMs(), "access", null);
    }

    public String generateRefreshToken(String userId, String email, UserRole role) {
        return buildToken(userId, email, role, jwtConfig.getRefreshExpirationMs(), "refresh", null);
    }

    public String generateRefreshToken(String userId, String email, UserRole role, String deviceFingerprint) {
        return buildToken(userId, email, role, jwtConfig.getRefreshExpirationMs(), "refresh", deviceFingerprint);
    }

    public String generateTempToken(String userId, String email) {
        return buildToken(userId, email, null, jwtConfig.getTempTokenExpirationMs(), "temp", null);
    }

    private String buildToken(String userId, String email, UserRole role, long expirationMs, String type, String deviceFingerprint) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + expirationMs);

        var builder = Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(userId)
                .claim("email", email)
                .claim("type", type)
                .issuedAt(now)
                .expiration(expiry);

        if (role != null) {
            builder.claim("role", role.name());
        }
        if (deviceFingerprint != null && !deviceFingerprint.isBlank()) {
            builder.claim("device", deviceFingerprint);
        }

        return builder.signWith(getSigningKey()).compact();
    }

    public boolean validateToken(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            log.warn("Invalid JWT: {}", e.getMessage());
            return false;
        }
    }

    public Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public String getUserId(String token) {
        return parseClaims(token).getSubject();
    }

    public String getTokenType(String token) {
        return parseClaims(token).get("type", String.class);
    }

    public UserRole getRole(String token) {
        String role = parseClaims(token).get("role", String.class);
        return role != null ? UserRole.valueOf(role) : null;
    }

    public String getDeviceFingerprint(String token) {
        return parseClaims(token).get("device", String.class);
    }

    private SecretKey getSigningKey() {
        byte[] keyBytes = jwtConfig.getSecret().getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            keyBytes = Decoders.BASE64.decode(
                    java.util.Base64.getEncoder().encodeToString(keyBytes));
        }
        return Keys.hmacShaKeyFor(keyBytes.length >= 32 ? keyBytes : padKey(keyBytes));
    }

    private byte[] padKey(byte[] key) {
        byte[] padded = new byte[32];
        System.arraycopy(key, 0, padded, 0, Math.min(key.length, 32));
        return padded;
    }
}
