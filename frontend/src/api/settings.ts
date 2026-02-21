import { apiFetch } from './client';

export interface SettingsResponse {
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  updatedAt: string | null;
}

export interface ConnectionTestResponse {
  status: 'connected' | 'error';
  response?: string;
  message?: string;
}

export async function getSettings(): Promise<SettingsResponse> {
  return apiFetch<SettingsResponse>('/settings');
}

export async function saveSettings(anthropicApiKey: string): Promise<SettingsResponse> {
  return apiFetch<SettingsResponse>('/settings', {
    method: 'PUT',
    body: JSON.stringify({ anthropicApiKey }),
  });
}

export async function testConnection(): Promise<ConnectionTestResponse> {
  return apiFetch<ConnectionTestResponse>('/settings/test-connection');
}

export interface AuthStatus {
  logged_in: boolean;
  auth_method: string;
  api_provider?: string;
}

export interface LoginStartResponse {
  url: string;
  message: string;
}

export interface LoginCodeResponse {
  success: boolean;
  message: string;
  auth_method?: string;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return apiFetch<AuthStatus>('/settings/auth/status');
}

export async function startOAuthLogin(): Promise<LoginStartResponse> {
  return apiFetch<LoginStartResponse>('/settings/auth/login/start', { method: 'POST' });
}

export async function submitOAuthCode(code: string): Promise<LoginCodeResponse> {
  return apiFetch<LoginCodeResponse>('/settings/auth/login/code', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}
