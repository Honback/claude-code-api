package com.claudeplatform.controller;

import com.claudeplatform.model.dto.SettingsRequest;
import com.claudeplatform.model.dto.SettingsResponse;
import com.claudeplatform.service.SettingsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/settings")
@RequiredArgsConstructor
public class SettingsController {

    private final SettingsService settingsService;
    private final WebClient claudeCodeApiClient;

    @GetMapping
    public ResponseEntity<SettingsResponse> getSettings() {
        return ResponseEntity.ok(settingsService.getSettings());
    }

    @PutMapping
    public ResponseEntity<SettingsResponse> saveSettings(@Valid @RequestBody SettingsRequest request) {
        return ResponseEntity.ok(settingsService.saveSettings(request));
    }

    @GetMapping("/test-connection")
    public ResponseEntity<Map<String, Object>> testConnection() {
        try {
            String result = claudeCodeApiClient.get()
                    .uri("/health")
                    .retrieve()
                    .bodyToMono(String.class)
                    .block(java.time.Duration.ofSeconds(10));

            return ResponseEntity.ok(Map.of(
                    "status", "connected",
                    "response", result != null ? result : "ok"
            ));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of(
                    "status", "error",
                    "message", e.getMessage() != null ? e.getMessage() : "Connection failed"
            ));
        }
    }

    @GetMapping("/auth/status")
    public ResponseEntity<String> authStatus() {
        try {
            String result = claudeCodeApiClient.get()
                    .uri("/auth/status")
                    .retrieve()
                    .bodyToMono(String.class)
                    .block(java.time.Duration.ofSeconds(10));
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.status(500).body("{\"error\":\"" + e.getMessage() + "\"}");
        }
    }

    @PostMapping("/auth/login/start")
    public ResponseEntity<String> authLoginStart(@RequestBody(required = false) Map<String, String> body) {
        try {
            var request = claudeCodeApiClient.post()
                    .uri("/auth/login/start");
            if (body != null && body.containsKey("serverUrl")) {
                request = request.bodyValue(Map.of("serverUrl", body.get("serverUrl")));
            }
            String result = request
                    .retrieve()
                    .bodyToMono(String.class)
                    .block(java.time.Duration.ofSeconds(60));
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.status(500).body("{\"error\":\"" + e.getMessage() + "\"}");
        }
    }

    @PostMapping("/auth/login/code")
    public ResponseEntity<String> authLoginCode(@RequestBody Map<String, String> body) {
        try {
            String result = claudeCodeApiClient.post()
                    .uri("/auth/login/code")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block(java.time.Duration.ofSeconds(30));
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.status(500).body("{\"error\":\"" + e.getMessage() + "\"}");
        }
    }

    /**
     * OAuth callback endpoint - receives the authorization code directly from browser redirect.
     * nginx routes /callback → this endpoint.
     * This eliminates the need for manual code copy-paste.
     */
    @GetMapping("/auth/callback")
    public ResponseEntity<String> authCallback(
            @RequestParam(value = "code", required = false) String code,
            @RequestParam(value = "state", required = false) String state,
            @RequestParam(value = "error", required = false) String error,
            @RequestParam(value = "error_description", required = false) String errorDescription) {

        if (error != null) {
            log.error("OAuth callback received error: {} - {}", error, errorDescription);
            return ResponseEntity.ok()
                    .contentType(MediaType.TEXT_HTML)
                    .body(callbackHtml(false, "OAuth error: " + error + (errorDescription != null ? " - " + errorDescription : "")));
        }

        if (code == null || code.isBlank()) {
            log.error("OAuth callback received no code");
            return ResponseEntity.ok()
                    .contentType(MediaType.TEXT_HTML)
                    .body(callbackHtml(false, "No authorization code received"));
        }

        log.info("OAuth callback received code (length={}), exchanging for tokens...", code.length());

        try {
            String result = claudeCodeApiClient.post()
                    .uri("/auth/login/code")
                    .bodyValue(Map.of("code", code))
                    .retrieve()
                    .bodyToMono(String.class)
                    .block(java.time.Duration.ofSeconds(30));

            log.info("Token exchange result: {}", result);

            // Check if the result indicates success
            boolean success = result != null && result.contains("\"success\":true");
            boolean failure = result != null && result.contains("\"success\":false");
            String message;
            if (success) {
                message = "OAuth 인증 성공! 이 탭을 닫고 Settings 페이지로 돌아가세요.";
            } else if (failure) {
                message = "인증 실패. Settings 페이지에서 다시 시도해주세요. (" + (result != null && result.length() > 200 ? result.substring(0, 200) + "..." : result) + ")";
            } else {
                message = "Token exchange completed. Check the Settings page.";
            }

            return ResponseEntity.ok()
                    .contentType(MediaType.TEXT_HTML)
                    .body(callbackHtml(success, message));
        } catch (Exception e) {
            log.error("Failed to exchange OAuth code", e);
            return ResponseEntity.ok()
                    .contentType(MediaType.TEXT_HTML)
                    .body(callbackHtml(false, "Token exchange failed: " + e.getMessage()));
        }
    }

    private String callbackHtml(boolean success, String message) {
        String color = success ? "#22c55e" : "#ef4444";
        String icon = success ? "&#10004;" : "&#10008;";
        return """
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>OAuth %s</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #1a1a2e; color: #e0e0e0;
                               display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
                        .card { background: #16213e; border-radius: 12px; padding: 40px; text-align: center; max-width: 400px;
                                box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
                        .icon { font-size: 48px; color: %s; margin-bottom: 16px; }
                        .msg { font-size: 16px; margin-bottom: 24px; line-height: 1.5; }
                        .hint { font-size: 13px; color: #888; }
                        a { color: #60a5fa; text-decoration: none; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="icon">%s</div>
                        <div class="msg">%s</div>
                        <div class="hint">
                            <a href="/settings">Settings 페이지로 돌아가기</a><br><br>
                            이 탭을 닫아도 됩니다.
                        </div>
                    </div>
                    <script>
                        // Notify the opener (Settings page) that auth is complete
                        if (window.opener) {
                            window.opener.postMessage({type: 'oauth-callback', success: %s}, '*');
                        }
                    </script>
                </body>
                </html>
                """.formatted(
                success ? "Success" : "Error",
                color, icon, message,
                success ? "true" : "false"
        );
    }
}
