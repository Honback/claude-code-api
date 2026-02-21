package com.claudeplatform.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
@AllArgsConstructor
public class ModelUsageDto {
    private String model;
    private Long requestCount;
    private Long inputTokens;
    private Long outputTokens;
    private Long totalTokens;
}
