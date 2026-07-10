package com.retailpulse.service;

import com.retailpulse.dto.request.LoginRequest;
import com.retailpulse.dto.request.RefreshTokenRequest;
import com.retailpulse.dto.request.Verify2FARequest;
import com.retailpulse.dto.response.LoginResponse;
import com.retailpulse.dto.response.TokenResponse;
import com.retailpulse.exception.BadRequestException;
import com.retailpulse.model.User;
import com.retailpulse.repository.UserRepository;
import com.retailpulse.security.CustomUserDetailsService;
import com.retailpulse.security.JwtTokenProvider;
import com.retailpulse.security.TwoFactorAuthService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final CustomUserDetailsService userDetailsService;
    private final UserRepository userRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final TwoFactorAuthService twoFactorAuthService;
    private final EmailService emailService;
    private final PasswordEncoder passwordEncoder;
    private final TrustedDeviceService trustedDeviceService;
    private final AuditLogService auditLogService;

    @Transactional
    public LoginResponse login(LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword()));

        User user = userDetailsService.loadEntityByEmail(request.getEmail());
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            throw new BadRequestException("Account is deactivated");
        }

        if (Boolean.TRUE.equals(user.getMfaEnabled())) {
            if (request.isRememberMe()
                    && trustedDeviceService.isTrusted(user.getUserId(), request.getDeviceFingerprint())) {
                return completeLogin(user, true, request.getDeviceFingerprint());
            }
            String otpCode = twoFactorAuthService.generateCode(user.getUserId());
            emailService.sendOtpEmail(user.getEmail(), otpCode);
            String tempToken = jwtTokenProvider.generateTempToken(user.getUserId(), user.getEmail());
            return LoginResponse.builder()
                    .requires2FA(true)
                    .tempToken(tempToken)
                    .build();
        }

        return completeLogin(user, false, null);
    }

    @Transactional
    public LoginResponse verify2FA(Verify2FARequest request) {
        if (!jwtTokenProvider.validateToken(request.getTempToken())) {
            throw new BadRequestException("Session expired. Please login again.");
        }
        if (!"temp".equals(jwtTokenProvider.getTokenType(request.getTempToken()))) {
            throw new BadRequestException("Invalid session token");
        }

        String userId = jwtTokenProvider.getUserId(request.getTempToken());
        User user = userDetailsService.loadEntityById(userId);
        twoFactorAuthService.verifyCode(userId, request.getCode());

        if (request.isRememberDevice()) {
            trustedDeviceService.trustDevice(userId, request.getDeviceFingerprint(), 30);
        }

        return completeLogin(user, request.isRememberDevice(), request.getDeviceFingerprint());
    }

    public void logout(String userId) {
        twoFactorAuthService.invalidate(userId);
        auditLogService.log(userId, "USER_LOGOUT", "User logged out", "users", userId);
        log.info("User {} logged out", userId);
    }

    @Transactional
    public void changePassword(String userId, String currentPassword, String newPassword) {
        User user = userDetailsService.loadEntityById(userId);
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new BadRequestException("Current password is incorrect");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        auditLogService.log(userId, "PASSWORD_CHANGE", "Password changed", "users", userId);
    }

    public void send2FACode(String userId) {
        User user = userDetailsService.loadEntityById(userId);
        String otpCode = twoFactorAuthService.generateCode(userId);
        emailService.sendOtpEmail(user.getEmail(), otpCode);
    }

    @Transactional
    public void enable2FA(String userId, String code) {
        twoFactorAuthService.verifyCode(userId, code);
        User user = userDetailsService.loadEntityById(userId);
        user.setMfaEnabled(true);
        userRepository.save(user);
    }

    @Transactional
    public void disable2FA(String userId, String code, String currentPassword) {
        User user = userDetailsService.loadEntityById(userId);
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new BadRequestException("Current password is incorrect");
        }
        twoFactorAuthService.verifyCode(userId, code);
        user.setMfaEnabled(false);
        userRepository.save(user);
        auditLogService.log(userId, "MFA_DISABLE", "Two-factor authentication disabled", "users", userId);
    }

    @Transactional
    public TokenResponse refresh(RefreshTokenRequest request) {
        String token = request.getRefreshToken();
        if (!jwtTokenProvider.validateToken(token) || !"refresh".equals(jwtTokenProvider.getTokenType(token))) {
            throw new BadRequestException("Invalid refresh token");
        }

        String userId = jwtTokenProvider.getUserId(token);
        User user = userDetailsService.loadEntityById(userId);

        String tokenDevice = jwtTokenProvider.getDeviceFingerprint(token);
        String requestDevice = request.getDeviceFingerprint();
        if (tokenDevice != null && !tokenDevice.isBlank()) {
            if (requestDevice == null || !tokenDevice.equals(requestDevice)) {
                throw new BadRequestException("Device fingerprint mismatch");
            }
            if (!trustedDeviceService.isTrusted(userId, requestDevice)) {
                throw new BadRequestException("Trusted device expired. Please login again.");
            }
        }

        String refreshToken = tokenDevice != null && !tokenDevice.isBlank()
                ? jwtTokenProvider.generateRefreshToken(user.getUserId(), user.getEmail(), user.getRole(), tokenDevice)
                : jwtTokenProvider.generateRefreshToken(user.getUserId(), user.getEmail(), user.getRole());

        return TokenResponse.builder()
                .accessToken(jwtTokenProvider.generateAccessToken(user.getUserId(), user.getEmail(), user.getRole()))
                .refreshToken(refreshToken)
                .build();
    }

    private LoginResponse completeLogin(User user, boolean rememberDevice, String deviceFingerprint) {
        user.setLastLogin(LocalDateTime.now());
        userRepository.save(user);
        auditLogService.log(user.getUserId(), "USER_LOGIN", "User logged in: " + user.getEmail(), "users", user.getUserId());
        log.info("User {} logged in successfully", user.getEmail());

        String accessToken = jwtTokenProvider.generateAccessToken(user.getUserId(), user.getEmail(), user.getRole());
        String refreshToken = rememberDevice
                ? (deviceFingerprint != null && !deviceFingerprint.isBlank()
                    ? jwtTokenProvider.generateRefreshToken(user.getUserId(), user.getEmail(), user.getRole(), deviceFingerprint)
                    : jwtTokenProvider.generateRefreshToken(user.getUserId(), user.getEmail(), user.getRole()))
                : null;

        return LoginResponse.builder()
                .requires2FA(false)
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .user(toUserMap(user))
                .build();
    }

    public static Map<String, Object> toUserMap(User user) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("userId", user.getUserId());
        map.put("fullName", user.getFullName());
        map.put("email", user.getEmail());
        map.put("role", mapRole(user.getRole()));
        map.put("isActive", user.getIsActive());
        map.put("phone", user.getPhone() != null ? user.getPhone() : "");
        map.put("department", user.getDepartment() != null ? user.getDepartment() : "");
        map.put("twoFactorEnabled", Boolean.TRUE.equals(user.getMfaEnabled()));
        map.put("stores", storesForRole(user.getRole()));
        if (user.getCreatedAt() != null) {
            map.put("createdAt", user.getCreatedAt().toString());
        }
        if (user.getLastLogin() != null) {
            map.put("lastLogin", user.getLastLogin().toString());
        }
        return map;
    }

    private static List<String> storesForRole(com.retailpulse.model.enums.UserRole role) {
        return switch (role) {
            case ADMIN, MANAGER -> List.of("All Stores");
            case ANALYST -> List.of("Quincaillerie du Rwamagana", "Quincaillerie Kigali Central");
            case VIEWER -> List.of("Quincaillerie du Rwamagana");
        };
    }

    private static String mapRole(com.retailpulse.model.enums.UserRole role) {
        return switch (role) {
            case ADMIN -> "administrator";
            case MANAGER -> "manager";
            case ANALYST -> "analyst";
            case VIEWER -> "viewer";
        };
    }
}
