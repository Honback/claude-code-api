package com.claudeplatform.repository;

import com.claudeplatform.model.entity.UsageLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface UsageLogRepository extends JpaRepository<UsageLog, UUID> {
    List<UsageLog> findByUserIdOrderByCreatedAtDesc(UUID userId);

    @Query("SELECT COUNT(u) FROM UsageLog u WHERE u.userId = :userId AND u.createdAt >= :since")
    Long countByUserIdSince(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);

    @Query("SELECT COALESCE(SUM(u.inputTokens), 0) FROM UsageLog u WHERE u.userId = :userId AND u.createdAt >= :since")
    Long sumInputTokensByUserIdSince(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);

    @Query("SELECT COALESCE(SUM(u.outputTokens), 0) FROM UsageLog u WHERE u.userId = :userId AND u.createdAt >= :since")
    Long sumOutputTokensByUserIdSince(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);

    @Query("SELECT COALESCE(SUM(u.totalTokens), 0) FROM UsageLog u WHERE u.userId = :userId AND u.createdAt >= :since")
    Long sumTotalTokensByUserIdSince(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);

    @Query("SELECT COALESCE(AVG(u.responseTimeMs), 0) FROM UsageLog u WHERE u.userId = :userId AND u.createdAt >= :since")
    Double avgResponseTimeMsByUserIdSince(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);

    // Admin queries
    @Query("SELECT COUNT(u) FROM UsageLog u WHERE u.createdAt >= :since")
    Long countAllSince(@Param("since") OffsetDateTime since);

    @Query("SELECT COALESCE(SUM(u.totalTokens), 0) FROM UsageLog u WHERE u.createdAt >= :since")
    Long sumAllTotalTokensSince(@Param("since") OffsetDateTime since);

    @Query("SELECT u.model as model, COUNT(u) as requestCount, " +
           "COALESCE(SUM(u.inputTokens),0) as inputTokens, " +
           "COALESCE(SUM(u.outputTokens),0) as outputTokens, " +
           "COALESCE(SUM(u.totalTokens),0) as totalTokens " +
           "FROM UsageLog u WHERE u.createdAt >= :since " +
           "GROUP BY u.model ORDER BY totalTokens DESC")
    List<Object[]> findUsageGroupedByModel(@Param("since") OffsetDateTime since);
}
