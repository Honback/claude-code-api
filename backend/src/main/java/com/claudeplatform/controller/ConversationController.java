package com.claudeplatform.controller;

import com.claudeplatform.config.DefaultUserConfig;
import com.claudeplatform.model.dto.ConversationDto;
import com.claudeplatform.service.ConversationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/conversations")
@RequiredArgsConstructor
public class ConversationController {

    private final ConversationService conversationService;

    private UUID userId() {
        return DefaultUserConfig.getDefaultUserId();
    }

    @GetMapping
    public ResponseEntity<List<ConversationDto>> list() {
        return ResponseEntity.ok(conversationService.getUserConversations(userId()));
    }

    @PostMapping
    public ResponseEntity<ConversationDto> create(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(
                conversationService.createConversation(userId(), body.get("title"), body.get("model")));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ConversationDto> get(@PathVariable UUID id) {
        return ResponseEntity.ok(conversationService.getConversation(id, userId()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ConversationDto> update(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(
                conversationService.updateConversation(id, userId(), body.get("title")));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        conversationService.deleteConversation(id, userId());
        return ResponseEntity.noContent().build();
    }
}
