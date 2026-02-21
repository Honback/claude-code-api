package com.claudeplatform.repository;

import com.claudeplatform.model.entity.ConversationSummary;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ConversationSummaryRepository extends JpaRepository<ConversationSummary, UUID> {

    Optional<ConversationSummary> findTopByConversationIdAndStatusOrderBySummaryVersionDesc(
            UUID conversationId, String status);

    boolean existsByConversationIdAndStatus(UUID conversationId, String status);
}
