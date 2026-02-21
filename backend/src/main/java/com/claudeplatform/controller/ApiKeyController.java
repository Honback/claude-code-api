package com.claudeplatform.controller;

import com.claudeplatform.config.DefaultUserConfig;
import com.claudeplatform.model.dto.ApiKeyRequest;
import com.claudeplatform.model.dto.ApiKeyResponse;
import com.claudeplatform.service.ApiKeyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/keys")
@RequiredArgsConstructor
public class ApiKeyController {

    private final ApiKeyService apiKeyService;

    private UUID userId() {
        return DefaultUserConfig.getDefaultUserId();
    }

    @GetMapping
    public ResponseEntity<List<ApiKeyResponse>> list() {
        return ResponseEntity.ok(apiKeyService.getUserApiKeys(userId()));
    }

    @PostMapping
    public ResponseEntity<ApiKeyResponse> create(@Valid @RequestBody ApiKeyRequest request) {
        return ResponseEntity.ok(apiKeyService.createApiKey(userId(), request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> revoke(@PathVariable UUID id) {
        apiKeyService.revokeApiKey(id, userId());
        return ResponseEntity.noContent().build();
    }
}
