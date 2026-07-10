package com.retailpulse.repository;

import com.retailpulse.model.TrustedDevice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface TrustedDeviceRepository extends JpaRepository<TrustedDevice, String> {

    Optional<TrustedDevice> findByUserUserIdAndDeviceFingerprint(String userId, String deviceFingerprint);

    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM TrustedDevice td WHERE td.trustedUntil < :now")
    int deleteExpired(@Param("now") LocalDateTime now);
}
