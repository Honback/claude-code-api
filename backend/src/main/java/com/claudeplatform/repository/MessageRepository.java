package com.claudeplatform.repository;

import com.claudeplatform.model.entity.Message;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface MessageRepository extends JpaRepository<Message, UUID> {
    List<Message> findByConversationIdOrderByCreatedAtAsc(UUID conversationId);

    List<Message> findByConversationIdAndCreatedAtAfterOrderByCreatedAtAsc(
            UUID conversationId, OffsetDateTime after);

    @Query("SELECT COALESCE(SUM(m.tokenCount), 0) FROM Message m WHERE m.conversationId = :id AND m.createdAt > :after")
    int sumTokenCountAfter(@Param("id") UUID conversationId, @Param("after") OffsetDateTime after);

    @Query("SELECT COALESCE(SUM(m.tokenCount), 0) FROM Message m WHERE m.conversationId = :id")
    int sumTokenCount(@Param("id") UUID conversationId);

    @Query("SELECT COUNT(m) FROM Message m WHERE m.conversationId = :id")
    long countByConversationId(@Param("id") UUID conversationId);
}
