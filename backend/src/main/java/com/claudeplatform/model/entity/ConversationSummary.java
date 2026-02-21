package com.claudeplatform.model.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "conversation_summaries")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class ConversationSummary {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "conversation_id", nullable = false)
    private UUID conversationId;

    @Column(name = "summary_text", nullable = false, columnDefinition = "TEXT")
    private String summaryText;

    @Column(name = "covered_until_message_id", nullable = false)
    private UUID coveredUntilMessageId;

    @Column(name = "covered_message_count", nullable = false)
    @Builder.Default
    private Integer coveredMessageCount = 0;

    @Column(name = "covered_token_count", nullable = false)
    @Builder.Default
    private Integer coveredTokenCount = 0;

    @Column(name = "summary_version", nullable = false)
    @Builder.Default
    private Integer summaryVersion = 1;

    @Column(nullable = false)
    @Builder.Default
    private String status = "COMPLETED";

    @CreationTimestamp
    @Column(name = "created_at")
    private OffsetDateTime createdAt;
}
