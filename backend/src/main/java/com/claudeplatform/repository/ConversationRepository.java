package com.claudeplatform.repository;

import com.claudeplatform.model.entity.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {
    List<Conversation> findByUserIdOrderByUpdatedAtDesc(UUID userId);
}
