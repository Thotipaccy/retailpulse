package com.retailpulse.controller;

import com.retailpulse.dto.response.ApiResponse;
import com.retailpulse.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping("/profile")
    public ApiResponse<?> getProfile(Authentication auth) {
        return ApiResponse.ok(userService.getProfile(auth.getName()));
    }

    @PutMapping("/profile")
    public ApiResponse<?> updateProfile(@RequestBody Map<String, String> updates, Authentication auth) {
        return ApiResponse.ok(userService.updateProfile(auth.getName(), updates), "Profile updated");
    }

    @PutMapping("/password")
    public ApiResponse<?> changePassword(@RequestBody Map<String, String> body, Authentication auth) {
        userService.changePassword(auth.getName(), body.get("currentPassword"), body.get("newPassword"));
        return ApiResponse.ok(null, "Password changed successfully");
    }

    @GetMapping("/activity")
    public ApiResponse<?> getActivity(Authentication auth) {
        return ApiResponse.ok(userService.getActivity(auth.getName()));
    }
}
