package com.retailpulse.repository;

import com.retailpulse.model.User;
import com.retailpulse.model.enums.UserRole;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, String> {
    Optional<User> findByEmailIgnoreCase(String email);
    Optional<User> findByEmail(String email);
    List<User> findByRole(UserRole role);
    long countByIsActiveTrue();
    boolean existsByEmailIgnoreCase(String email);
    Optional<User> findByRememberToken(String rememberToken);
}
