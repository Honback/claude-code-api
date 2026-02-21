package com.claudeplatform.service;

import com.claudeplatform.model.dto.SettingsRequest;
import com.claudeplatform.model.dto.SettingsResponse;
import com.claudeplatform.model.entity.AppSetting;
import com.claudeplatform.repository.AppSettingRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class SettingsService {

    private static final String ANTHROPIC_API_KEY = "anthropic_api_key";

    private final AppSettingRepository appSettingRepository;
    private final ObjectMapper objectMapper;

    @Value("${app.claude-config-path:/claude-config}")
    private String claudeConfigPath;

    public SettingsResponse getSettings() {
        return appSettingRepository.findBySettingKey(ANTHROPIC_API_KEY)
                .map(setting -> SettingsResponse.builder()
                        .hasApiKey(setting.getSettingValue() != null && !setting.getSettingValue().isBlank())
                        .apiKeyMasked(maskApiKey(setting.getSettingValue()))
                        .updatedAt(setting.getUpdatedAt())
                        .build())
                .orElse(SettingsResponse.builder()
                        .hasApiKey(false)
                        .apiKeyMasked(null)
                        .updatedAt(null)
                        .build());
    }

    public SettingsResponse saveSettings(SettingsRequest request) {
        String apiKey = request.getAnthropicApiKey();

        // Upsert in DB
        AppSetting setting = appSettingRepository.findBySettingKey(ANTHROPIC_API_KEY)
                .orElse(AppSetting.builder()
                        .settingKey(ANTHROPIC_API_KEY)
                        .build());
        setting.setSettingValue(apiKey);
        appSettingRepository.save(setting);

        // Write config.json for claude-code-api CLI
        writeClaudeConfig(apiKey);

        return SettingsResponse.builder()
                .hasApiKey(true)
                .apiKeyMasked(maskApiKey(apiKey))
                .updatedAt(setting.getUpdatedAt())
                .build();
    }

    private void writeClaudeConfig(String apiKey) {
        try {
            Path configDir = Paths.get(claudeConfigPath);
            Files.createDirectories(configDir);

            Path configFile = configDir.resolve("config.json");

            Map<String, Object> config = new LinkedHashMap<>();
            config.put("apiKey", apiKey);
            config.put("autoUpdate", false);

            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(config);
            Files.writeString(configFile, json);

            log.info("Claude config.json written to {}", configFile);
        } catch (IOException e) {
            log.error("Failed to write claude config.json", e);
            throw new RuntimeException("Failed to write claude config file", e);
        }
    }

    private String maskApiKey(String apiKey) {
        if (apiKey == null || apiKey.length() < 12) {
            return null;
        }
        return apiKey.substring(0, 7) + "..." + apiKey.substring(apiKey.length() - 4);
    }
}
