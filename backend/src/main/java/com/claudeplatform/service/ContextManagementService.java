package com.claudeplatform.service;

import com.claudeplatform.model.entity.ConversationSummary;
import com.claudeplatform.model.entity.Message;
import com.claudeplatform.repository.ConversationSummaryRepository;
import com.claudeplatform.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class ContextManagementService {

    private final ConversationSummaryRepository summaryRepository;
    private final MessageRepository messageRepository;
    private final WebClient claudeCodeApiClient;

    @Value("${app.context.enabled:true}")
    private boolean contextEnabled;

    @Value("${app.context.summarization-threshold-tokens:8000}")
    private int summarizationThreshold;

    @Value("${app.context.recent-messages-to-keep:6}")
    private int recentMessagesToKeep;

    private static final int MAX_MESSAGE_LENGTH_IN_CONTEXT = 2000;
    private static final int MAX_MESSAGE_LENGTH_IN_SUMMARY = 3000;

    /**
     * Build a context-enriched prompt combining summary + recent messages + current message.
     * Note: The current user message is already saved to DB before this method is called,
     * so we must exclude it from the "recent messages" to avoid duplication.
     */
    public String buildContextPrompt(UUID conversationId, String currentMessage) {
        if (!contextEnabled) {
            return currentMessage;
        }

        // Fetch all messages; the last one is the just-saved current user message
        List<Message> allMessages = messageRepository
                .findByConversationIdOrderByCreatedAtAsc(conversationId);

        // Exclude the last message (current user message) from history
        List<Message> previousMessages = allMessages.size() > 1
                ? allMessages.subList(0, allMessages.size() - 1)
                : Collections.emptyList();

        // For very short conversations (0-1 previous messages), return as-is
        if (previousMessages.size() <= 1) {
            return currentMessage;
        }

        Optional<ConversationSummary> latestSummary = summaryRepository
                .findTopByConversationIdAndStatusOrderBySummaryVersionDesc(conversationId, "COMPLETED");

        StringBuilder contextBuilder = new StringBuilder();

        if (latestSummary.isPresent()) {
            ConversationSummary summary = latestSummary.get();

            // Add summary section
            contextBuilder.append("[CONVERSATION CONTEXT]\n");
            contextBuilder.append("The following is a summary of our earlier conversation:\n");
            contextBuilder.append(summary.getSummaryText());
            contextBuilder.append("\n\n");

            // Get only messages after the summary coverage point
            Message coveredMessage = messageRepository.findById(summary.getCoveredUntilMessageId()).orElse(null);
            List<Message> recentMessages;
            if (coveredMessage != null && coveredMessage.getCreatedAt() != null) {
                recentMessages = previousMessages.stream()
                        .filter(m -> m.getCreatedAt().isAfter(coveredMessage.getCreatedAt()))
                        .toList();
            } else {
                recentMessages = limitMessages(previousMessages, recentMessagesToKeep);
            }

            if (!recentMessages.isEmpty()) {
                contextBuilder.append("[RECENT MESSAGES]\n");
                appendMessages(contextBuilder, limitMessages(recentMessages, recentMessagesToKeep));
                contextBuilder.append("\n");
            }
        } else {
            // No summary yet - include recent previous messages for context
            List<Message> recentMessages = limitMessages(previousMessages, recentMessagesToKeep);
            contextBuilder.append("[RECENT MESSAGES]\n");
            appendMessages(contextBuilder, recentMessages);
            contextBuilder.append("\n");
        }

        contextBuilder.append("[CURRENT MESSAGE]\n");
        contextBuilder.append(currentMessage);

        return contextBuilder.toString();
    }

    /**
     * Check if summarization should be triggered for this conversation.
     */
    public boolean shouldSummarize(UUID conversationId) {
        if (!contextEnabled) {
            return false;
        }

        // Don't start if already in progress
        if (summaryRepository.existsByConversationIdAndStatus(conversationId, "IN_PROGRESS")) {
            return false;
        }

        Optional<ConversationSummary> latestSummary = summaryRepository
                .findTopByConversationIdAndStatusOrderBySummaryVersionDesc(conversationId, "COMPLETED");

        int unsummarizedTokens;
        if (latestSummary.isPresent()) {
            Message coveredMessage = messageRepository
                    .findById(latestSummary.get().getCoveredUntilMessageId()).orElse(null);
            if (coveredMessage != null && coveredMessage.getCreatedAt() != null) {
                unsummarizedTokens = messageRepository
                        .sumTokenCountAfter(conversationId, coveredMessage.getCreatedAt());
            } else {
                unsummarizedTokens = messageRepository.sumTokenCount(conversationId);
            }
        } else {
            unsummarizedTokens = messageRepository.sumTokenCount(conversationId);
        }

        return unsummarizedTokens > summarizationThreshold;
    }

    /**
     * Trigger summarization asynchronously.
     */
    @Async
    public void triggerSummarizationAsync(UUID conversationId) {
        log.info("Starting summarization for conversation: {}", conversationId);

        // Get latest summary for version tracking
        Optional<ConversationSummary> latestSummary = summaryRepository
                .findTopByConversationIdAndStatusOrderBySummaryVersionDesc(conversationId, "COMPLETED");
        int nextVersion = latestSummary.map(s -> s.getSummaryVersion() + 1).orElse(1);

        // Get the last message to mark as covered
        List<Message> allMessages = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId);
        if (allMessages.isEmpty()) {
            return;
        }
        Message lastMessage = allMessages.get(allMessages.size() - 1);

        // Create IN_PROGRESS record
        ConversationSummary inProgress = ConversationSummary.builder()
                .conversationId(conversationId)
                .summaryText("")
                .coveredUntilMessageId(lastMessage.getId())
                .coveredMessageCount(allMessages.size())
                .coveredTokenCount(messageRepository.sumTokenCount(conversationId))
                .summaryVersion(nextVersion)
                .status("IN_PROGRESS")
                .build();
        inProgress = summaryRepository.save(inProgress);

        try {
            // Build summarization prompt
            String prompt = buildSummarizationPrompt(latestSummary.orElse(null), allMessages);

            // Call summarize endpoint
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("prompt", prompt);
            requestBody.put("max_tokens", 1024);
            requestBody.put("model", "claude-haiku-4-5-20251001");

            String summaryText = claudeCodeApiClient.post()
                    .uri("/v1/summarize")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(java.util.Map.class)
                    .map(response -> (String) response.get("summary"))
                    .block(java.time.Duration.ofSeconds(60));

            if (summaryText != null && !summaryText.isBlank()) {
                inProgress.setSummaryText(summaryText);
                inProgress.setStatus("COMPLETED");
                summaryRepository.save(inProgress);
                log.info("Summarization completed for conversation: {}, version: {}",
                        conversationId, nextVersion);
            } else {
                inProgress.setStatus("FAILED");
                summaryRepository.save(inProgress);
                log.warn("Summarization returned empty for conversation: {}", conversationId);
            }
        } catch (Exception e) {
            log.error("Summarization failed for conversation: {}", conversationId, e);
            inProgress.setStatus("FAILED");
            summaryRepository.save(inProgress);
        }
    }

    /**
     * Check if a conversation has a completed summary.
     */
    public boolean hasSummary(UUID conversationId) {
        return summaryRepository.findTopByConversationIdAndStatusOrderBySummaryVersionDesc(
                conversationId, "COMPLETED").isPresent();
    }

    private String buildSummarizationPrompt(ConversationSummary previousSummary, List<Message> messages) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("Summarize the following conversation concisely. ");
        prompt.append("Focus on key topics discussed, decisions made, and important context. ");
        prompt.append("Keep the summary under 500 words.\n\n");

        if (previousSummary != null && previousSummary.getSummaryText() != null
                && !previousSummary.getSummaryText().isBlank()) {
            prompt.append("Previous summary:\n");
            prompt.append(previousSummary.getSummaryText());
            prompt.append("\n\nNew messages since last summary:\n");

            // Only include messages after the previous summary's coverage
            Message coveredMessage = messageRepository
                    .findById(previousSummary.getCoveredUntilMessageId()).orElse(null);
            if (coveredMessage != null && coveredMessage.getCreatedAt() != null) {
                messages = messageRepository.findByConversationIdAndCreatedAtAfterOrderByCreatedAtAsc(
                        messages.get(0).getConversationId(), coveredMessage.getCreatedAt());
            }
        } else {
            prompt.append("Conversation:\n");
        }

        for (Message msg : messages) {
            String content = msg.getContent();
            if (content.length() > MAX_MESSAGE_LENGTH_IN_SUMMARY) {
                content = content.substring(0, MAX_MESSAGE_LENGTH_IN_SUMMARY) + "... [truncated]";
            }
            prompt.append(msg.getRole().toUpperCase()).append(": ").append(content).append("\n");
        }

        return prompt.toString();
    }

    private List<Message> limitMessages(List<Message> messages, int max) {
        if (messages.size() <= max) {
            return messages;
        }
        return messages.subList(messages.size() - max, messages.size());
    }

    private void appendMessages(StringBuilder sb, List<Message> messages) {
        for (Message msg : messages) {
            String content = msg.getContent();
            if (content.length() > MAX_MESSAGE_LENGTH_IN_CONTEXT) {
                content = content.substring(0, MAX_MESSAGE_LENGTH_IN_CONTEXT) + "... [truncated]";
            }
            sb.append(msg.getRole().toUpperCase()).append(": ").append(content).append("\n");
        }
    }
}
