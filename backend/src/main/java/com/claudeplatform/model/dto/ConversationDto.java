package com.claudeplatform.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class ConversationDto {
    private UUID id;
    private String title;
    private String model;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
    private List<MessageDto> messages;
    private Boolean hasSummary;
    private Integer totalTokens;

    @Data
    @Builder
    @AllArgsConstructor
    public static class MessageDto {
        private UUID id;
        private String role;
        private String content;
        private Integer tokenCount;
        private OffsetDateTime createdAt;
    }
}
