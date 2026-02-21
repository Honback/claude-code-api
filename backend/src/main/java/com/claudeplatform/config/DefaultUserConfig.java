package com.claudeplatform.config;

import com.claudeplatform.model.entity.User;
import com.claudeplatform.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.UUID;

@Configuration
@RequiredArgsConstructor
public class DefaultUserConfig {

    private static final String DEFAULT_EMAIL = "default@local";
    private static UUID cachedUserId;

    private final UserRepository userRepository;

    public static UUID getDefaultUserId() {
        return cachedUserId;
    }

    @Bean
    public ApplicationRunner initDefaultUser() {
        return args -> {
            User user = userRepository.findByEmail(DEFAULT_EMAIL).orElse(null);
            if (user == null) {
                user = User.builder()
                        .email(DEFAULT_EMAIL)
                        .passwordHash("none")
                        .name("Default User")
                        .role("ADMIN")
                        .build();
                user = userRepository.save(user);
            }
            cachedUserId = user.getId();
        };
    }
}
