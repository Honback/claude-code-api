package com.claudeplatform.repository;

import com.claudeplatform.model.entity.ApiKey;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ApiKeyRepository extends JpaRepository<ApiKey, UUID> {
    List<ApiKey> findByUserIdAndIsActiveTrue(UUID userId);
    Optional<ApiKey> findByKeyHash(String keyHash);
    List<ApiKey> findByKeyPrefixAndIsActiveTrue(String keyPrefix);
}
