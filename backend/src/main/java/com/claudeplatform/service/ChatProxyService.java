package com.claudeplatform.service;

import com.claudeplatform.model.dto.ChatRequest;
import com.claudeplatform.model.entity.Conversation;
import com.claudeplatform.model.entity.UsageLog;
import com.claudeplatform.repository.ConversationRepository;
import com.claudeplatform.repository.UsageLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChatProxyService {

    private final WebClient claudeCodeApiClient;
    private final ConversationService conversationService;
    private final ConversationRepository conversationRepository;
    private final UsageLogRepository usageLogRepository;
    private final ContextManagementService contextManagementService;

    public Flux<String> streamChat(ChatRequest request, UUID userId) {
        UUID conversationId = request.getConversationId();
        String model = request.getModel() != null ? request.getModel() : "claude-haiku-4-5-20251001";

        if (conversationId == null) {
            var conversation = conversationService.createConversation(userId, null, model);
            conversationId = conversation.getId();
        }

        conversationService.saveMessage(conversationId, "user", request.getMessage());

        Map<String, Object> body = new HashMap<>();
        body.put("model", model);
        body.put("stream", true);

        List<Map<String, String>> messages = new ArrayList<>();
        if (request.getMessages() != null) {
            for (var msg : request.getMessages()) {
                messages.add(Map.of("role", msg.getRole(), "content", msg.getContent()));
            }
        }
        final UUID finalConversationId = conversationId;

        String contextPrompt = contextManagementService.buildContextPrompt(
                finalConversationId, request.getMessage());
        messages.add(Map.of("role", "user", "content", contextPrompt));
        body.put("messages", messages);
        final long startTime = System.currentTimeMillis();
        StringBuffer responseAccumulator = new StringBuffer();

        // Send conversationId as first SSE event so frontend can track it
        // Raw JSON only - Spring SSE serializer adds "data: " prefix and "\n\n" automatically
        Flux<String> metadataFlux = Flux.just(
                "{\"metadata\":{\"conversationId\":\"" + finalConversationId + "\"}}");

        Flux<String> chatFlux = claudeCodeApiClient.post()
                .uri("/v1/chat/completions")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .exchangeToFlux(response -> {
                    if (response.statusCode().is2xxSuccessful()) {
                        return response.bodyToFlux(String.class);
                    }
                    // Non-2xx: read body and return as SSE error
                    return response.bodyToMono(String.class)
                            .defaultIfEmpty("{\"error\":\"Unknown error\"}")
                            .flatMapMany(errorBody -> {
                                log.error("Claude API error: HTTP {} - {}", response.statusCode(), errorBody);
                                // Try to extract the actual error message from JSON
                                String errorMsg = "API error (HTTP " + response.statusCode().value() + ")";
                                String errorType = "api_error";
                                try {
                                    ObjectMapper mapper = new ObjectMapper();
                                    JsonNode root = mapper.readTree(errorBody);
                                    JsonNode detail = root.path("detail");
                                    if (detail.isObject() && detail.has("error")) {
                                        JsonNode err = detail.path("error");
                                        if (err.has("message")) errorMsg = err.path("message").asText();
                                        if (err.has("type")) errorType = err.path("type").asText();
                                    } else if (root.has("error")) {
                                        JsonNode err = root.path("error");
                                        if (err.isObject() && err.has("message")) {
                                            errorMsg = err.path("message").asText();
                                            if (err.has("type")) errorType = err.path("type").asText();
                                        } else if (err.isTextual()) {
                                            errorMsg = err.asText();
                                        }
                                    } else if (root.has("detail") && detail.isTextual()) {
                                        errorMsg = detail.asText();
                                    }
                                } catch (Exception e) {
                                    log.warn("Failed to parse error body", e);
                                }
                                String safeMsg = errorMsg
                                        .replace("\\", "\\\\")
                                        .replace("\"", "\\\"")
                                        .replace("\n", " ");
                                String sseError = "data: {\"error\":{\"message\":\"" + safeMsg +
                                        "\",\"type\":\"" + errorType + "\"}}\n\n" +
                                        "data: [DONE]\n\n";
                                return Flux.just(sseError);
                            });
                })
                .timeout(Duration.ofMinutes(5))
                .doOnNext(chunk -> {
                    // WebClient strips the "data:" SSE prefix, so chunk is raw JSON
                    // Extract delta.content from OpenAI-compatible SSE chunks
                    String trimmed = chunk.trim();
                    if (trimmed.isEmpty() || "[DONE]".equals(trimmed)) return;
                    try {
                        ObjectMapper mapper = new ObjectMapper();
                        JsonNode root = mapper.readTree(trimmed);
                        JsonNode delta = root.path("choices").path(0).path("delta");
                        String content = delta.path("content").asText(null);
                        if (content != null) {
                            responseAccumulator.append(content);
                        }
                    } catch (Exception e) {
                        // Not a valid SSE chunk, skip
                    }
                })
                .doOnComplete(() -> {
                    Mono.fromRunnable(() -> {
                        String fullResponse = responseAccumulator.toString();
                        long elapsed = System.currentTimeMillis() - startTime;

                        conversationService.saveMessage(finalConversationId, "assistant", fullResponse);

                        Conversation conv = conversationRepository.findById(finalConversationId).orElse(null);
                        if (conv != null && "New Conversation".equals(conv.getTitle())) {
                            String title = request.getMessage();
                            if (title.length() > 50) {
                                title = title.substring(0, 50) + "...";
                            }
                            conv.setTitle(title);
                            conversationRepository.save(conv);
                        }

                        // Trigger async summarization if threshold exceeded
                        if (contextManagementService.shouldSummarize(finalConversationId)) {
                            contextManagementService.triggerSummarizationAsync(finalConversationId);
                        }

                        int inputTokens = estimateTokens(request.getMessage());
                        int outputTokens = estimateTokens(fullResponse);
                        UsageLog usageLog = UsageLog.builder()
                                .userId(userId)
                                .conversationId(finalConversationId)
                                .model(model)
                                .inputTokens(inputTokens)
                                .outputTokens(outputTokens)
                                .totalTokens(inputTokens + outputTokens)
                                .responseTimeMs(elapsed)
                                .status("SUCCESS")
                                .build();
                        usageLogRepository.save(usageLog);
                    }).subscribeOn(Schedulers.boundedElastic()).subscribe();
                })
                .doOnError(error -> {
                    log.error("Chat streaming error", error);
                    Mono.fromRunnable(() -> {
                        long elapsed = System.currentTimeMillis() - startTime;
                        UsageLog usageLog = UsageLog.builder()
                                .userId(userId)
                                .conversationId(finalConversationId)
                                .model(model)
                                .responseTimeMs(elapsed)
                                .status("ERROR")
                                .build();
                        usageLogRepository.save(usageLog);
                    }).subscribeOn(Schedulers.boundedElastic()).subscribe();
                })
                .onErrorResume(error -> {
                    log.error("Chat error, returning SSE error", error);
                    String msg = error.getMessage() != null ? error.getMessage() : "Connection error";
                    String safeMsg = msg.replace("\"", "'").replace("\n", " ");
                    if (safeMsg.length() > 300) {
                        safeMsg = safeMsg.substring(0, 300);
                    }
                    return Flux.just(
                            "data: {\"error\":{\"message\":\"" + safeMsg + "\",\"type\":\"stream_error\"}}\n\ndata: [DONE]\n\n"
                    );
                });

        return Flux.concat(metadataFlux, chatFlux);
    }

    private int estimateTokens(String text) {
        return text != null ? text.length() / 4 : 0;
    }
}
