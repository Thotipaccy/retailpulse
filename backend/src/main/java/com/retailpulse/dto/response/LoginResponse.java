package com.retailpulse.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoginResponse {
    private boolean requires2FA;
    private String tempToken;
    private String accessToken;
    private String refreshToken;
    private Map<String, Object> user;
}
