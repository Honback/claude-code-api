package com.claudeplatform.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;
import java.util.UUID;

@Data
public class ChatRequest {
    @NotBlank(message = "Message is required")
    @Size(max = 100000, message = "Message too long")
    private String message;

    private UUID conversationId;
    private String model;
    private List<ChatMessage> messages;

    @Data
    public static class ChatMessage {
        private String role;
        private String content;
    }
}
