package com.claudeplatform.controller;

import com.claudeplatform.model.dto.ModelUsageDto;
import com.claudeplatform.model.dto.UsageSummaryDto;
import com.claudeplatform.model.entity.ActiveSession;
import com.claudeplatform.model.entity.User;
import com.claudeplatform.repository.ActiveSessionRepository;
import com.claudeplatform.repository.UserRepository;
import com.claudeplatform.service.UsageTrackingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final UserRepository userRepository;
    private final ActiveSessionRepository activeSessionRepository;
    private final UsageTrackingService usageTrackingService;
    private final WebClient claudeCodeApiClient;

    @GetMapping("/users")
    public ResponseEntity<List<User>> listUsers() {
        return ResponseEntity.ok(userRepository.findAll());
    }

    @PutMapping("/users/{id}")
    public ResponseEntity<User> updateUser(@PathVariable UUID id, @RequestBody Map<String, Object> updates) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (updates.containsKey("isActive")) {
            user.setIsActive((Boolean) updates.get("isActive"));
        }
        if (updates.containsKey("role")) {
            user.setRole((String) updates.get("role"));
        }

        return ResponseEntity.ok(userRepository.save(user));
    }

    @GetMapping("/usage/global")
    public ResponseEntity<UsageSummaryDto> globalUsage(@RequestParam(defaultValue = "30") int days) {
        return ResponseEntity.ok(usageTrackingService.getGlobalUsageSummary(days));
    }

    @GetMapping("/usage/by-model")
    public ResponseEntity<List<ModelUsageDto>> usageByModel(
            @RequestParam(defaultValue = "30") int days) {
        return ResponseEntity.ok(usageTrackingService.getUsageByModel(days));
    }

    @GetMapping(value = "/rate-limits", produces = "application/json")
    public ResponseEntity<String> rateLimits() {
        String body = claudeCodeApiClient.get()
                .uri("/v1/rate-limits")
                .retrieve()
                .bodyToMono(String.class)
                .block();
        return ResponseEntity.ok(body);
    }

    @GetMapping("/sessions")
    public ResponseEntity<List<ActiveSession>> activeSessions() {
        return ResponseEntity.ok(activeSessionRepository.findAll());
    }
}
