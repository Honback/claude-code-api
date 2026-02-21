package com.claudeplatform.model.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "usage_logs")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class UsageLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "conversation_id")
    private UUID conversationId;

    @Column(nullable = false)
    private String model;

    @Column(name = "input_tokens")
    @Builder.Default
    private Integer inputTokens = 0;

    @Column(name = "output_tokens")
    @Builder.Default
    private Integer outputTokens = 0;

    @Column(name = "total_tokens")
    @Builder.Default
    private Integer totalTokens = 0;

    @Column(name = "response_time_ms")
    @Builder.Default
    private Long responseTimeMs = 0L;

    @Builder.Default
    private String status = "SUCCESS";

    @CreationTimestamp
    @Column(name = "created_at")
    private OffsetDateTime createdAt;
}
