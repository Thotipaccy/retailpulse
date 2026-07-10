package com.retailpulse.service;

import com.retailpulse.exception.BadRequestException;
import com.retailpulse.exception.ResourceNotFoundException;
import com.retailpulse.model.User;
import com.retailpulse.model.enums.UserRole;
import com.retailpulse.model.AuditLog;
import com.retailpulse.repository.AuditLogRepository;
import com.retailpulse.repository.UserRepository;
import com.retailpulse.security.CustomUserDetailsService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final AuditLogRepository auditLogRepository;
    private final AuditLogService auditLogService;
    private final CustomUserDetailsService userDetailsService;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;

    public Map<String, Object> getProfile(String userId) {
        return AuthService.toUserMap(userDetailsService.loadEntityById(userId));
    }

    @Transactional
    public Map<String, Object> updateProfile(String userId, Map<String, String> updates) {
        User user = userDetailsService.loadEntityById(userId);
        if (updates.containsKey("fullName")) user.setFullName(updates.get("fullName"));
        if (updates.containsKey("email")) {
            String email = updates.get("email");
            if (userRepository.existsByEmailIgnoreCase(email) && !email.equalsIgnoreCase(user.getEmail())) {
                throw new BadRequestException("Email already in use");
            }
            user.setEmail(email);
        }
        if (updates.containsKey("phone")) user.setPhone(updates.get("phone"));
        if (updates.containsKey("department")) user.setDepartment(updates.get("department"));
        userRepository.save(user);
        return AuthService.toUserMap(user);
    }

    public List<Map<String, Object>> getActivity(String userId) {
        return auditLogRepository.findByUserUserIdOrderByCreatedAtDesc(userId).stream()
                .map(this::toActivityEntry)
                .toList();
    }

    private Map<String, Object> toActivityEntry(AuditLog log) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("id", log.getLogId());
        entry.put("action", log.getActionType());
        entry.put("description", log.getDescription());
        entry.put("timestamp", log.getCreatedAt().toString());
        return entry;
    }

    @Transactional
    public void changePassword(String userId, String currentPassword, String newPassword) {
        User user = userDetailsService.loadEntityById(userId);
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new BadRequestException("Current password is incorrect");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        auditLogService.log(userId, "PASSWORD_CHANGE", "Password changed via profile", "users", userId);
    }

    public List<Map<String, Object>> getAllUsers() {
        return userRepository.findAll().stream().map(AuthService::toUserMap).toList();
    }

    @Transactional
    public Map<String, Object> createUser(Map<String, Object> request) {
        String email = (String) request.get("email");
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new BadRequestException("Email already exists");
        }
        String tempPassword = request.containsKey("password")
                ? String.valueOf(request.get("password"))
                : "Rp@" + UUID.randomUUID().toString().substring(0, 8);
        UserRole role = UserRole.fromApiValue((String) request.get("role"));
        User user = User.builder()
                .userId("u" + UUID.randomUUID().toString().substring(0, 8))
                .fullName((String) request.get("fullName"))
                .email(email)
                .passwordHash(passwordEncoder.encode(tempPassword))
                .role(role)
                .isActive(true)
                .mfaEnabled(true)
                .createdAt(LocalDateTime.now())
                .build();
        User saved = userRepository.save(user);
        boolean welcomeEmailSent = emailService.sendWelcomeEmail(
                saved.getEmail(), saved.getFullName(), role.name().toLowerCase(), tempPassword);
        auditLogService.log(saved.getUserId(), "USER_CREATE", "Created user " + saved.getEmail(), "users", saved.getUserId());
        Map<String, Object> result = new LinkedHashMap<>(AuthService.toUserMap(saved));
        result.put("temporaryPassword", tempPassword);
        result.put("welcomeEmailSent", welcomeEmailSent);
        return result;
    }

    @Transactional
    public Map<String, Object> updateUser(String id, Map<String, Object> request) {
        User user = userRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("User not found"));
        if (request.containsKey("fullName")) user.setFullName((String) request.get("fullName"));
        if (request.containsKey("role")) user.setRole(UserRole.fromApiValue((String) request.get("role")));
        if (request.containsKey("isActive")) user.setIsActive((Boolean) request.get("isActive"));
        if (request.containsKey("password")) {
            user.setPasswordHash(passwordEncoder.encode((String) request.get("password")));
        }
        User saved = userRepository.save(user);
        auditLogService.log(id, "USER_UPDATE", "Updated user " + saved.getEmail(), "users", id);
        return AuthService.toUserMap(saved);
    }

    @Transactional
    public void deleteUser(String id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        user.setIsActive(false);
        userRepository.save(user);
        auditLogService.log(id, "USER_DEACTIVATE", "Deactivated user " + user.getEmail(), "users", id);
    }
}
