package com.claudeplatform.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/models")
public class ModelController {

    @GetMapping
    public ResponseEntity<List<Map<String, String>>> listModels() {
        return ResponseEntity.ok(List.of(
                Map.of("id", "claude-haiku-4-5-20251001", "name", "Claude Haiku 4.5"),
                Map.of("id", "claude-sonnet-4-20250514", "name", "Claude Sonnet 4"),
                Map.of("id", "claude-opus-4-6", "name", "Claude Opus 4.6")
        ));
    }
}
