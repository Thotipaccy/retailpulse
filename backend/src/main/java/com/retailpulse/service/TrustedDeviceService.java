package com.retailpulse.service;

import com.retailpulse.model.TrustedDevice;
import com.retailpulse.model.User;
import com.retailpulse.repository.TrustedDeviceRepository;
import com.retailpulse.security.CustomUserDetailsService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class TrustedDeviceService {

    private final TrustedDeviceRepository trustedDeviceRepository;
    private final CustomUserDetailsService userDetailsService;

    @Transactional
    public boolean isTrusted(String userId, String fingerprint) {
        if (fingerprint == null || fingerprint.isBlank()) {
            return false;
        }
        trustedDeviceRepository.deleteExpired(LocalDateTime.now());
        return trustedDeviceRepository.findByUserUserIdAndDeviceFingerprint(userId, fingerprint)
                .map(td -> td.getTrustedUntil().isAfter(LocalDateTime.now()))
                .orElse(false);
    }

    @Transactional
    public void trustDevice(String userId, String fingerprint, int days) {
        if (fingerprint == null || fingerprint.isBlank()) {
            return;
        }
        User user = userDetailsService.loadEntityById(userId);
        LocalDateTime now = LocalDateTime.now();
        Optional<TrustedDevice> existing = trustedDeviceRepository
                .findByUserUserIdAndDeviceFingerprint(userId, fingerprint);
        if (existing.isPresent()) {
            TrustedDevice device = existing.get();
            device.setTrustedUntil(now.plusDays(days));
            trustedDeviceRepository.save(device);
        } else {
            trustedDeviceRepository.save(TrustedDevice.builder()
                    .user(user)
                    .deviceFingerprint(fingerprint)
                    .trustedUntil(now.plusDays(days))
                    .createdAt(now)
                    .build());
        }
    }

    @Transactional
    public void cleanupExpired() {
        trustedDeviceRepository.deleteExpired(LocalDateTime.now());
    }
}
