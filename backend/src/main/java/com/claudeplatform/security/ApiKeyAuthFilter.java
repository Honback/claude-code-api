package com.claudeplatform.security;

import com.claudeplatform.model.entity.ApiKey;
import com.claudeplatform.repository.ApiKeyRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Component
@RequiredArgsConstructor
@Slf4j
public class ApiKeyAuthFilter extends OncePerRequestFilter {

    private final ApiKeyRepository apiKeyRepository;
    private final AntPathMatcher pathMatcher = new AntPathMatcher();

    private static final List<String> PROTECTED_PATHS = List.of(
            "/api/chat/**"
    );

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String path = request.getRequestURI();
        boolean isProtected = PROTECTED_PATHS.stream()
                .anyMatch(pattern -> pathMatcher.match(pattern, path));

        if (!isProtected) {
            filterChain.doFilter(request, response);
            return;
        }

        String apiKey = extractApiKey(request);

        // No auth header -> allow through for internal web UI
        if (apiKey == null) {
            filterChain.doFilter(request, response);
            return;
        }

        // Auth header present -> must be valid
        if (!apiKey.startsWith("cpk_")) {
            sendUnauthorized(response, "Invalid API key format");
            return;
        }

        Optional<ApiKey> validated = validateKey(apiKey);
        if (validated.isEmpty()) {
            sendUnauthorized(response, "Invalid or revoked API key");
            return;
        }

        ApiKey key = validated.get();
        var auth = new UsernamePasswordAuthenticationToken(
                key.getUserId(), null,
                List.of(new SimpleGrantedAuthority("ROLE_API_USER"))
        );
        SecurityContextHolder.getContext().setAuthentication(auth);

        log.debug("API key authenticated: prefix={}", key.getKeyPrefix());
        filterChain.doFilter(request, response);
    }

    private Optional<ApiKey> validateKey(String rawKey) {
        if (rawKey.length() < 8) {
            return Optional.empty();
        }
        String prefix = rawKey.substring(0, 8);
        List<ApiKey> candidates = apiKeyRepository.findByKeyPrefixAndIsActiveTrue(prefix);

        // Lazy-load the password encoder to avoid circular dependency
        PasswordEncoder encoder = new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();

        for (ApiKey candidate : candidates) {
            if (encoder.matches(rawKey, candidate.getKeyHash())) {
                candidate.setLastUsedAt(OffsetDateTime.now());
                apiKeyRepository.save(candidate);
                return Optional.of(candidate);
            }
        }
        return Optional.empty();
    }

    private String extractApiKey(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (StringUtils.hasText(header) && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        String xApiKey = request.getHeader("X-API-Key");
        if (StringUtils.hasText(xApiKey)) {
            return xApiKey;
        }
        return null;
    }

    private void sendUnauthorized(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"" + message + "\"}");
    }
}
