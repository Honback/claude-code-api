package com.claudeplatform.model.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "active_sessions")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class ActiveSession {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "session_id", nullable = false, unique = true)
    private String sessionId;

    private String model;

    @CreationTimestamp
    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    @Column(name = "last_activity_at")
    private OffsetDateTime lastActivityAt;
}
