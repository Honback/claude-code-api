package com.claudeplatform.repository;

import com.claudeplatform.model.entity.ActiveSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ActiveSessionRepository extends JpaRepository<ActiveSession, UUID> {
    List<ActiveSession> findByUserId(UUID userId);
    Optional<ActiveSession> findBySessionId(String sessionId);
    void deleteBySessionId(String sessionId);
}
