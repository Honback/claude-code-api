package com.claudeplatform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class ClaudePlatformApplication {
    public static void main(String[] args) {
        SpringApplication.run(ClaudePlatformApplication.class, args);
    }
}
