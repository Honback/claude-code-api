const API_BASE = '/api';

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let errorMsg = `HTTP ${response.status}`;
    try {
      const json = JSON.parse(text);
      errorMsg = json.error || json.detail || json.message || errorMsg;
    } catch {
      if (text.length > 0 && text.length < 200) errorMsg += `: ${text}`;
    }
    throw new Error(errorMsg);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}
