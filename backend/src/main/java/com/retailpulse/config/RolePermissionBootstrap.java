package com.retailpulse.config;

import com.retailpulse.service.RolePermissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Component
@Order(2)
@RequiredArgsConstructor
public class RolePermissionBootstrap implements ApplicationRunner {

    private final RolePermissionService rolePermissionService;

    @Override
    public void run(ApplicationArguments args) {
        rolePermissionService.ensureDefaults();
    }
}
