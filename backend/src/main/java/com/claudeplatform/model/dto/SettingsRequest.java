package com.claudeplatform.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter @Setter
public class SettingsRequest {

    @NotBlank(message = "API key is required")
    private String anthropicApiKey;
}
