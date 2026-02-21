package com.claudeplatform.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class ApiKeyResponse {
    private UUID id;
    private String name;
    private String keyPrefix;
    private String permissions;
    private Boolean isActive;
    private OffsetDateTime lastUsedAt;
    private OffsetDateTime createdAt;
    private String fullKey; // Only returned on creation
}
