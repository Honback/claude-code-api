package com.claudeplatform.service;

import com.claudeplatform.model.dto.ModelUsageDto;
import com.claudeplatform.model.dto.UsageSummaryDto;
import com.claudeplatform.repository.UsageLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UsageTrackingService {

    private final UsageLogRepository usageLogRepository;

    public UsageSummaryDto getUserUsageSummary(UUID userId, int days) {
        OffsetDateTime since = OffsetDateTime.now().minusDays(days);

        return UsageSummaryDto.builder()
                .totalRequests(usageLogRepository.countByUserIdSince(userId, since))
                .totalInputTokens(usageLogRepository.sumInputTokensByUserIdSince(userId, since))
                .totalOutputTokens(usageLogRepository.sumOutputTokensByUserIdSince(userId, since))
                .totalTokens(usageLogRepository.sumTotalTokensByUserIdSince(userId, since))
                .avgResponseTimeMs(usageLogRepository.avgResponseTimeMsByUserIdSince(userId, since))
                .build();
    }

    public UsageSummaryDto getGlobalUsageSummary(int days) {
        OffsetDateTime since = OffsetDateTime.now().minusDays(days);

        return UsageSummaryDto.builder()
                .totalRequests(usageLogRepository.countAllSince(since))
                .totalTokens(usageLogRepository.sumAllTotalTokensSince(since))
                .build();
    }

    public List<ModelUsageDto> getUsageByModel(int days) {
        OffsetDateTime since = OffsetDateTime.now().minusDays(days);
        return usageLogRepository.findUsageGroupedByModel(since)
                .stream()
                .map(row -> ModelUsageDto.builder()
                        .model((String) row[0])
                        .requestCount((Long) row[1])
                        .inputTokens((Long) row[2])
                        .outputTokens((Long) row[3])
                        .totalTokens((Long) row[4])
                        .build())
                .toList();
    }
}
