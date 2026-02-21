package com.claudeplatform.service;

import com.claudeplatform.exception.ForbiddenException;
import com.claudeplatform.exception.NotFoundException;
import com.claudeplatform.model.dto.ApiKeyRequest;
import com.claudeplatform.model.dto.ApiKeyResponse;
import com.claudeplatform.model.entity.ApiKey;
import com.claudeplatform.repository.ApiKeyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ApiKeyService {

    private final ApiKeyRepository apiKeyRepository;
    private final PasswordEncoder passwordEncoder;

    public ApiKeyResponse createApiKey(UUID userId, ApiKeyRequest request) {
        String rawKey = "cpk_" + UUID.randomUUID().toString().replace("-", "");
        String keyPrefix = rawKey.substring(0, 8);
        String keyHash = passwordEncoder.encode(rawKey);

        ApiKey apiKey = ApiKey.builder()
                .userId(userId)
                .name(request.getName())
                .keyHash(keyHash)
                .keyPrefix(keyPrefix)
                .permissions(request.getPermissions() != null ? request.getPermissions() : "READ_WRITE")
                .build();

        apiKey = apiKeyRepository.save(apiKey);

        return ApiKeyResponse.builder()
                .id(apiKey.getId())
                .name(apiKey.getName())
                .keyPrefix(apiKey.getKeyPrefix())
                .permissions(apiKey.getPermissions())
                .isActive(apiKey.getIsActive())
                .createdAt(apiKey.getCreatedAt())
                .fullKey(rawKey) // Only returned on creation
                .build();
    }

    public List<ApiKeyResponse> getUserApiKeys(UUID userId) {
        return apiKeyRepository.findByUserIdAndIsActiveTrue(userId)
                .stream()
                .map(k -> ApiKeyResponse.builder()
                        .id(k.getId())
                        .name(k.getName())
                        .keyPrefix(k.getKeyPrefix())
                        .permissions(k.getPermissions())
                        .isActive(k.getIsActive())
                        .lastUsedAt(k.getLastUsedAt())
                        .createdAt(k.getCreatedAt())
                        .build())
                .toList();
    }

    public Optional<ApiKey> validateApiKey(String rawKey) {
        if (rawKey == null || rawKey.length() < 8) {
            return Optional.empty();
        }
        String prefix = rawKey.substring(0, 8);
        List<ApiKey> candidates = apiKeyRepository.findByKeyPrefixAndIsActiveTrue(prefix);
        for (ApiKey candidate : candidates) {
            if (passwordEncoder.matches(rawKey, candidate.getKeyHash())) {
                candidate.setLastUsedAt(java.time.OffsetDateTime.now());
                apiKeyRepository.save(candidate);
                return Optional.of(candidate);
            }
        }
        return Optional.empty();
    }

    public void revokeApiKey(UUID keyId, UUID userId) {
        ApiKey apiKey = apiKeyRepository.findById(keyId)
                .orElseThrow(() -> new NotFoundException("API key not found"));

        if (!apiKey.getUserId().equals(userId)) {
            throw new ForbiddenException("Access denied");
        }

        apiKey.setIsActive(false);
        apiKeyRepository.save(apiKey);
    }
}
