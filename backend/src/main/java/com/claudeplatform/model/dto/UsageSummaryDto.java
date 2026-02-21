package com.claudeplatform.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
@AllArgsConstructor
public class UsageSummaryDto {
    private Long totalRequests;
    private Long totalInputTokens;
    private Long totalOutputTokens;
    private Long totalTokens;
    private Double avgResponseTimeMs;
}
