package com.retailpulse.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class Verify2FARequest {
    @NotBlank
    private String tempToken;
    @NotBlank
    @Pattern(regexp = "\\d{6}", message = "Code must be 6 digits")
    private String code;
    private boolean rememberDevice;
    private String deviceFingerprint;
}
