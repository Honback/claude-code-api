import { apiFetch } from './client';
import type { UsageSummary, ApiKeyData, ModelUsage, RateLimitInfo } from '../types';

export async function getUsageSummary(days = 30): Promise<UsageSummary> {
  return apiFetch<UsageSummary>(`/usage/summary?days=${days}`);
}

export async function getGlobalUsage(days = 30): Promise<UsageSummary> {
  return apiFetch<UsageSummary>(`/admin/usage/global?days=${days}`);
}

export async function getUsageByModel(days = 30): Promise<ModelUsage[]> {
  return apiFetch<ModelUsage[]>(`/admin/usage/by-model?days=${days}`);
}

export async function getRateLimits(): Promise<RateLimitInfo> {
  return apiFetch<RateLimitInfo>('/admin/rate-limits');
}

export async function getApiKeys(): Promise<ApiKeyData[]> {
  return apiFetch<ApiKeyData[]>('/keys');
}

export async function createApiKey(name: string): Promise<ApiKeyData> {
  return apiFetch<ApiKeyData>('/keys', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function revokeApiKey(id: string): Promise<void> {
  return apiFetch<void>(`/keys/${id}`, {
    method: 'DELETE',
  });
}
