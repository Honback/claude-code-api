package com.claudeplatform.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ApiKeyRequest {
    @NotBlank
    private String name;
    private String permissions;
}
