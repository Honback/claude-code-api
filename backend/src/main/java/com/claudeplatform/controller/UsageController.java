package com.claudeplatform.controller;

import com.claudeplatform.config.DefaultUserConfig;
import com.claudeplatform.model.dto.UsageSummaryDto;
import com.claudeplatform.service.UsageTrackingService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/usage")
@RequiredArgsConstructor
@Validated
public class UsageController {

    private final UsageTrackingService usageTrackingService;

    @GetMapping("/summary")
    public ResponseEntity<UsageSummaryDto> summary(
            @RequestParam(defaultValue = "30") @Min(1) @Max(365) int days) {
        return ResponseEntity.ok(
                usageTrackingService.getUserUsageSummary(DefaultUserConfig.getDefaultUserId(), days));
    }
}
