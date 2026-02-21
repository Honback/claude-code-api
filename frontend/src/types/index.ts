export interface User {
  email: string;
  name: string;
  role: string;
}

export interface AuthResponse {
  token: string;
  email: string;
  name: string;
  role: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
  hasSummary?: boolean;
  totalTokens?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tokenCount?: number;
  createdAt: string;
}

export interface ApiKeyData {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
  fullKey?: string;
}

export interface UsageSummary {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  avgResponseTimeMs: number;
}

export interface ModelInfo {
  id: string;
  name: string;
}

export interface ModelUsage {
  model: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface RateLimitEntry {
  limit: number;
  remaining: number | null;
  reset: string | null;
}

export interface RateLimitInfo {
  requests?: RateLimitEntry;
  input_tokens?: RateLimitEntry;
  output_tokens?: RateLimitEntry;
  tier?: string;
  cached_at?: string;
  error?: string;
  message?: string;
}
