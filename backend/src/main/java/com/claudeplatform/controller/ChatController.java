package com.claudeplatform.controller;

import com.claudeplatform.config.DefaultUserConfig;
import com.claudeplatform.model.dto.ChatRequest;
import com.claudeplatform.service.ChatProxyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
public class ChatController {

    private final ChatProxyService chatProxyService;

    @PostMapping(value = "/completions", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> chatCompletions(@Valid @RequestBody ChatRequest request) {
        return chatProxyService.streamChat(request, DefaultUserConfig.getDefaultUserId());
    }
}
