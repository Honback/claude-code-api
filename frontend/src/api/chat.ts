let activeController: AbortController | null = null;

export function abortChat() {
  if (activeController) {
    activeController.abort();
    activeController = null;
  }
}

function extractErrorFromSSE(data: string): string | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // Not JSON or no error field
  }
  return null;
}

/** Extract the data payload from an SSE line, handling both "data: " and "data:" */
function parseSSEData(line: string): string | null {
  if (line.startsWith('data: ')) return line.slice(6);
  if (line.startsWith('data:')) return line.slice(5);
  return null;
}

export async function streamChat(
  message: string,
  conversationId: string | null,
  model: string,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: Error) => void
): Promise<void> {
  abortChat();
  activeController = new AbortController();

  try {
    const response = await fetch('/api/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        conversationId,
        model,
      }),
      signal: activeController.signal,
    });

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const text = await response.text();
        // Try SSE-formatted error
        for (const line of text.split('\n')) {
          const data = parseSSEData(line);
          if (data !== null) {
            const err = extractErrorFromSSE(data);
            if (err) { errorMsg = err; break; }
          }
        }
        // Try JSON error
        if (errorMsg === `HTTP ${response.status}`) {
          const json = JSON.parse(text);
          errorMsg = json.error?.message || json.detail || errorMsg;
        }
      } catch { /* use default */ }
      throw new Error(errorMsg);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const data = parseSSEData(line);
        if (data !== null) {
          if (data === '[DONE]') {
            onDone();
            activeController = null;
            return;
          }
          // Check for error in SSE payload
          const sseError = extractErrorFromSSE(data);
          if (sseError) {
            throw new Error(sseError);
          }
          onChunk(data);
        }
      }
    }

    // Process remaining buffer
    const remainingData = parseSSEData(buffer);
    if (remainingData !== null && remainingData !== '[DONE]') {
      const sseError = extractErrorFromSSE(remainingData);
      if (sseError) {
        throw new Error(sseError);
      }
      onChunk(remainingData);
    }

    activeController = null;
    onDone();
  } catch (error) {
    activeController = null;
    if ((error as Error).name === 'AbortError') {
      onDone();
      return;
    }
    onError(error as Error);
  }
}
