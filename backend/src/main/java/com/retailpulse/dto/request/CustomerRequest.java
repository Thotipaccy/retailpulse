package com.retailpulse.dto.request;

import com.retailpulse.model.enums.CustomerType;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CustomerRequest {

    @NotBlank(message = "Customer name is required")
    private String customerName;

    @NotNull(message = "Customer type is required")
    private CustomerType customerType;

    private String phone;

    @Email(message = "Invalid email format")
    private String email;
}
