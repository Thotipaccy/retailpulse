package com.retailpulse.controller;

import com.retailpulse.dto.request.LoginRequest;
import com.retailpulse.dto.request.RefreshTokenRequest;
import com.retailpulse.dto.request.Verify2FARequest;
import com.retailpulse.dto.response.ApiResponse;
import com.retailpulse.dto.response.LoginResponse;
import com.retailpulse.dto.response.TokenResponse;
import com.retailpulse.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.ok(authService.login(request), "Login initiated");
    }

    @PostMapping("/verify-2fa")
    public ApiResponse<LoginResponse> verify2FA(@Valid @RequestBody Verify2FARequest request) {
        return ApiResponse.ok(authService.verify2FA(request), "Authentication successful");
    }

    @PostMapping("/refresh")
    public ApiResponse<TokenResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return ApiResponse.ok(authService.refresh(request), "Token refreshed");
    }

    @PostMapping("/logout")
    public ApiResponse<Void> logout(Authentication auth) {
        if (auth != null) {
            authService.logout(auth.getName());
        }
        return ApiResponse.ok(null, "Logged out successfully");
    }

    @PostMapping("/change-password")
    public ApiResponse<Void> changePassword(@RequestBody Map<String, String> body, Authentication auth) {
        authService.changePassword(auth.getName(), body.get("currentPassword"), body.get("newPassword"));
        return ApiResponse.ok(null, "Password changed successfully");
    }

    @PostMapping("/2fa/send-code")
    public ApiResponse<Void> send2FACode(Authentication auth) {
        authService.send2FACode(auth.getName());
        return ApiResponse.ok(null, "Verification code sent");
    }

    @PostMapping("/2fa/enable")
    public ApiResponse<Void> enable2FA(@RequestBody Map<String, String> body, Authentication auth) {
        authService.enable2FA(auth.getName(), body.get("code"));
        return ApiResponse.ok(null, "Two-factor authentication enabled");
    }

    @PostMapping("/2fa/disable")
    public ApiResponse<Void> disable2FA(@RequestBody Map<String, String> body, Authentication auth) {
        authService.disable2FA(auth.getName(), body.get("code"), body.get("currentPassword"));
        return ApiResponse.ok(null, "Two-factor authentication disabled");
    }
}
