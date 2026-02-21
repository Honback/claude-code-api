package com.claudeplatform.model.dto;

import lombok.*;

import java.time.OffsetDateTime;

@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class SettingsResponse {
    private boolean hasApiKey;
    private String apiKeyMasked;
    private OffsetDateTime updatedAt;
}
