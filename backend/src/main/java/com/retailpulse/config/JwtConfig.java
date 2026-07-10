package com.retailpulse.config;

import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

@Configuration
@Getter
public class JwtConfig {

    @Value("${retailpulse.jwt.secret}")
    private String secret;

    @Value("${retailpulse.jwt.access-expiration-ms}")
    private long accessExpirationMs;

    @Value("${retailpulse.jwt.refresh-expiration-ms}")
    private long refreshExpirationMs;

    @Value("${retailpulse.jwt.temp-token-expiration-ms}")
    private long tempTokenExpirationMs;
}
