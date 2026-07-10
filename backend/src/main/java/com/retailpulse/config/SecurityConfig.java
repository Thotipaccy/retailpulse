package com.retailpulse.config;

import com.retailpulse.security.JwtAuthenticationFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final CorsConfig corsConfig;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfig.corsConfigurationSource()))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/auth/login", "/api/auth/verify-2fa", "/api/auth/refresh").permitAll()
                        .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/api/auth/**").authenticated()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/inventory/purchase-orders")
                        .hasAnyRole("ADMIN", "MANAGER", "ANALYST")
                        .requestMatchers("/api/products/**").hasAnyRole("ADMIN", "MANAGER")
                        .requestMatchers("/api/data/**").hasAnyRole("ADMIN", "MANAGER", "ANALYST")
                        .requestMatchers("/api/planning/**").hasAnyRole("ADMIN", "MANAGER")
                        .requestMatchers("/api/forecast/**", "/api/recommendations/**")
                        .hasAnyRole("ADMIN", "MANAGER", "ANALYST")
                        .requestMatchers("/api/reports/**")
                        .hasAnyRole("ADMIN", "MANAGER", "ANALYST")
                        .requestMatchers("/api/alerts/**", "/api/sales/**", "/api/inventory/**", "/api/customers/**", "/api/stores/**")
                        .hasAnyRole("ADMIN", "MANAGER", "ANALYST", "VIEWER")
                        .requestMatchers("/api/dashboard/**", "/api/users/**")
                        .hasAnyRole("ADMIN", "MANAGER", "ANALYST", "VIEWER")
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
