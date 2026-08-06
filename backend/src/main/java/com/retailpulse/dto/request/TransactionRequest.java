package com.retailpulse.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Data
public class TransactionRequest {
    @NotEmpty
    @Valid
    private List<TransactionItemRequest> items;
    
    @NotBlank
    private String paymentMethod;
    
    private String paymentReference;
    
    private BigDecimal discountAmount = BigDecimal.ZERO;
    
    private String customerName;
    
    private String customerPhone;
    
    private LocalDate expectedPaymentDate;
    
    private String storeId;
}
