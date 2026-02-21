package com.claudeplatform.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;

@Configuration
public class WebClientConfig {

    @Value("${app.claude-code-api.url}")
    private String claudeCodeApiUrl;

    @Bean
    public WebClient claudeCodeApiClient() {
        return WebClient.builder()
                .baseUrl(claudeCodeApiUrl)
                .codecs(configurer -> configurer
                        .defaultCodecs()
                        .maxInMemorySize(10 * 1024 * 1024)) // 10MB
                .build();
    }
}
