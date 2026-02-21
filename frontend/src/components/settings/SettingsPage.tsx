import { useEffect, useState } from 'react';
import * as settingsApi from '../../api/settings';
import * as adminApi from '../../api/admin';
import type { SettingsResponse, ConnectionTestResponse, AuthStatus } from '../../api/settings';
import type { ApiKeyData } from '../../types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResponse | null>(null);

  const [platformKeys, setPlatformKeys] = useState<ApiKeyData[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // OAuth state
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [oauthCode, setOauthCode] = useState('');
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthMessage, setOauthMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
    loadPlatformKeys();
    loadAuthStatus();
  }, []);

  const loadAuthStatus = async () => {
    try {
      const status = await settingsApi.getAuthStatus();
      setAuthStatus(status);
    } catch (err) {
      console.error('Failed to load auth status:', err);
    }
  };

  const handleOAuthStart = async () => {
    setOauthLoading(true);
    setOauthMessage(null);
    setOauthUrl(null);
    setOauthCode('');
    try {
      const result = await settingsApi.startOAuthLogin();
      setOauthUrl(result.url);

      // Open OAuth URL in a new window
      const authWindow = window.open(result.url, '_blank', 'width=600,height=700');

      // Listen for postMessage from callback page
      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'oauth-callback') {
          window.removeEventListener('message', messageHandler);
          if (event.data.success) {
            setOauthMessage({ type: 'success', text: 'OAuth 인증 성공!' });
            setOauthUrl(null);
            loadAuthStatus();
          }
        }
      };
      window.addEventListener('message', messageHandler);

      // Also poll auth status as fallback (in case postMessage doesn't work)
      const pollInterval = setInterval(async () => {
        try {
          const status = await settingsApi.getAuthStatus();
          if (status.logged_in) {
            clearInterval(pollInterval);
            window.removeEventListener('message', messageHandler);
            setAuthStatus(status);
            setOauthUrl(null);
            setOauthMessage({ type: 'success', text: 'OAuth 인증 성공!' });
          }
        } catch { /* ignore polling errors */ }
      }, 3000);

      // Stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        window.removeEventListener('message', messageHandler);
      }, 300000);

    } catch (err) {
      setOauthMessage({ type: 'error', text: err instanceof Error ? err.message : 'OAuth 시작 실패' });
    } finally {
      setOauthLoading(false);
    }
  };

  const handleOAuthSubmitCode = async () => {
    if (!oauthCode.trim()) return;
    setOauthLoading(true);
    setOauthMessage(null);
    try {
      const result = await settingsApi.submitOAuthCode(oauthCode.trim()) as any;
      if (result.success) {
        setOauthMessage({ type: 'success', text: result.message });
        setOauthUrl(null);
        setOauthCode('');
        loadAuthStatus();
      } else {
        const debugInfo = result.debug ? `\n\ndebug: ${result.debug}` : '';
        const diagInfo = result.diagnostic ? `\n\n[진단] code_length=${result.diagnostic.code_length}, prefix=${result.diagnostic.code_prefix}, elapsed=${result.diagnostic.elapsed_seconds}s` : '';
        setOauthMessage({ type: 'error', text: result.message + debugInfo + diagInfo });
      }
    } catch (err) {
      setOauthMessage({ type: 'error', text: err instanceof Error ? err.message : '코드 제출 실패' });
    } finally {
      setOauthLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const data = await settingsApi.getSettings();
      setSettings(data);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const loadPlatformKeys = async () => {
    try {
      const keys = await adminApi.getApiKeys();
      setPlatformKeys(keys);
    } catch (err) {
      console.error('Failed to load platform keys:', err);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const data = await settingsApi.saveSettings(apiKey.trim());
      setSettings(data);
      setApiKey('');
      setSaveMessage({ type: 'success', text: 'API 키가 저장되었습니다.' });
    } catch (err) {
      setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : '저장에 실패했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setConnectionResult(null);
    try {
      const result = await settingsApi.testConnection();
      setConnectionResult(result);
    } catch (err) {
      setConnectionResult({ status: 'error', message: err instanceof Error ? err.message : '테스트 실패' });
    } finally {
      setTesting(false);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      const key = await adminApi.createApiKey(newKeyName);
      setCreatedKey(key.fullKey || null);
      setNewKeyName('');
      loadPlatformKeys();
    } catch (err) {
      console.error('Failed to create API key:', err);
    }
  };

  const handleRevokeKey = async (id: string) => {
    try {
      await adminApi.revokeApiKey(id);
      loadPlatformKeys();
    } catch (err) {
      console.error('Failed to revoke API key:', err);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const baseUrl = window.location.origin;

  return (
    <div className="p-6 overflow-y-auto h-full max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

      {/* Step 0: Auth Status */}
      <Section
        step={0}
        title="Claude 인증 상태"
        description="Claude Code CLI의 현재 인증 상태입니다."
      >
        {authStatus && (
          <div className="mb-4 p-3 rounded bg-gray-700">
            <div className="flex items-center gap-2">
              <StatusDot active={authStatus.logged_in} />
              <span className="text-sm">
                {authStatus.logged_in
                  ? `인증됨 (${authStatus.auth_method === 'oauth' ? 'OAuth / Claude Max' : authStatus.auth_method === 'api_key' ? 'API 키' : authStatus.auth_method})`
                  : '인증되지 않음'}
              </span>
            </div>
          </div>
        )}
      </Section>

      {/* Step 1: OAuth Login */}
      <Section
        step={1}
        title="OAuth 로그인 (API 키 불필요)"
        description="Claude Max/Pro 구독이 있으면 OAuth로 로그인할 수 있습니다. API 키 비용이 발생하지 않습니다."
      >
        {authStatus?.logged_in && authStatus.auth_method === 'oauth' ? (
          <div className="p-3 bg-green-900/30 border border-green-700 rounded">
            <div className="flex items-center gap-2">
              <StatusDot active={true} />
              <span className="text-sm font-medium text-green-300">OAuth 인증 완료</span>
            </div>
          </div>
        ) : (
          <>
            {!oauthUrl ? (
              <button
                onClick={handleOAuthStart}
                disabled={oauthLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
              >
                {oauthLoading ? 'OAuth 시작 중...' : 'OAuth 로그인 시작'}
              </button>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-blue-900/20 border border-blue-800 rounded">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                    <p className="text-sm text-blue-300 font-medium">브라우저에서 로그인 대기 중...</p>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">새 창이 열리지 않았다면 아래 링크를 클릭하세요:</p>
                  <a
                    href={oauthUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:text-blue-300 underline break-all"
                  >
                    Claude 로그인 페이지 열기
                  </a>
                  <p className="text-xs text-gray-500 mt-3">로그인하면 자동으로 인증이 완료됩니다. 이 페이지로 돌아올 때까지 잠시 기다려주세요.</p>
                </div>

                {/* Manual code fallback - hidden by default */}
                <details className="text-xs">
                  <summary className="text-gray-500 hover:text-gray-400 cursor-pointer">수동 입력 (자동 인증이 안 될 경우)</summary>
                  <div className="p-4 bg-gray-700 rounded mt-2">
                    <p className="text-sm text-gray-300 mb-2">로그인 후 표시되는 Authentication Code를 입력하세요:</p>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={oauthCode}
                        onChange={(e) => setOauthCode(e.target.value)}
                        placeholder="Authentication Code 붙여넣기"
                        className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
                        onKeyDown={(e) => e.key === 'Enter' && handleOAuthSubmitCode()}
                      />
                      <button
                        onClick={handleOAuthSubmitCode}
                        disabled={oauthLoading || !oauthCode.trim()}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
                      >
                        {oauthLoading ? '확인 중...' : '인증 완료'}
                      </button>
                    </div>
                  </div>
                </details>

                <button
                  onClick={() => { setOauthUrl(null); setOauthCode(''); }}
                  className="text-xs text-gray-400 hover:text-gray-300"
                >
                  취소
                </button>
              </div>
            )}

            {oauthMessage && (
              <p className={`mt-3 text-sm ${oauthMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {oauthMessage.text}
              </p>
            )}
          </>
        )}
      </Section>

      {/* Step 2: Anthropic API Key */}
      <Section
        step={2}
        title="Anthropic API 키 설정 (대안)"
        description="OAuth 대신 Anthropic API 키를 직접 입력할 수도 있습니다. console.anthropic.com 에서 발급받으세요. (종량제 과금)"
      >
        {settings && (
          <div className="mb-4 p-3 rounded bg-gray-700">
            <div className="flex items-center gap-2">
              <StatusDot active={settings.hasApiKey} />
              <span className="text-sm">
                {settings.hasApiKey
                  ? `설정됨: ${settings.apiKeyMasked}`
                  : '아직 설정되지 않았습니다'}
              </span>
            </div>
            {settings.updatedAt && (
              <p className="text-xs text-gray-500 mt-1 ml-4">
                마지막 수정: {new Date(settings.updatedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-api03-..."
            className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <button
            onClick={handleSave}
            disabled={saving || !apiKey.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>

        {saveMessage && (
          <p className={`mt-3 text-sm ${saveMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {saveMessage.text}
          </p>
        )}
      </Section>

      {/* Step 3: Connection Test */}
      <Section
        step={3}
        title="연결 테스트"
        description="Claude Code API 서비스가 정상적으로 실행 중인지 확인합니다."
      >
        <button
          onClick={handleTestConnection}
          disabled={testing}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
        >
          {testing ? '테스트 중...' : '연결 테스트'}
        </button>

        {connectionResult && (
          <div className={`mt-4 p-3 rounded ${connectionResult.status === 'connected' ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'}`}>
            <div className="flex items-center gap-2">
              <StatusDot active={connectionResult.status === 'connected'} error={connectionResult.status === 'error'} />
              <span className="text-sm font-medium">
                {connectionResult.status === 'connected' ? '연결 성공' : '연결 실패'}
              </span>
            </div>
            {connectionResult.message && (
              <p className="text-xs text-gray-400 mt-1 ml-4">{connectionResult.message}</p>
            )}
          </div>
        )}
      </Section>

      {/* Step 4: Platform API Keys */}
      <Section
        step={4}
        title="플랫폼 API 키 관리"
        description="외부 애플리케이션에서 Chat API를 호출하기 위한 인증 키입니다. cpk_ 접두사를 사용합니다."
      >
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="키 이름 (예: my-app, dev-server)"
            className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateKey()}
          />
          <button
            onClick={handleCreateKey}
            disabled={!newKeyName.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
          >
            키 생성
          </button>
        </div>

        {createdKey && (
          <div className="bg-green-900/30 border border-green-700 rounded p-4 mb-4">
            <p className="text-sm font-medium text-green-300 mb-2">
              새 API 키가 생성되었습니다. 지금 복사하세요. 이 키는 다시 표시되지 않습니다.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-900 px-3 py-2 rounded text-sm break-all text-green-200">{createdKey}</code>
              <button
                onClick={() => copyToClipboard(createdKey, 'created-key')}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-xs shrink-0"
              >
                {copiedSnippet === 'created-key' ? '복사됨!' : '복사'}
              </button>
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              className="text-xs mt-2 text-gray-400 hover:text-gray-300"
            >
              닫기
            </button>
          </div>
        )}

        <div className="space-y-2">
          {platformKeys.map((key) => (
            <div key={key.id} className="flex items-center justify-between bg-gray-700/50 rounded px-4 py-3">
              <div className="flex items-center gap-3">
                <StatusDot active={key.isActive} />
                <div>
                  <span className="font-medium text-sm">{key.name}</span>
                  <span className="text-gray-400 text-xs ml-3">{key.keyPrefix}...</span>
                  {key.lastUsedAt && (
                    <span className="text-gray-500 text-xs ml-3">
                      마지막 사용: {new Date(key.lastUsedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleRevokeKey(key.id)}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                폐기
              </button>
            </div>
          ))}
          {platformKeys.length === 0 && (
            <p className="text-gray-500 text-sm py-2">생성된 API 키가 없습니다. 위에서 새 키를 만들어 주세요.</p>
          )}
        </div>
      </Section>

      {/* Step 5: API Usage Guide */}
      <Section
        step={5}
        title="API 사용 가이드"
        description="플랫폼 API 키를 사용하여 외부 애플리케이션에서 Chat API를 호출하는 방법입니다."
      >
        {/* Quick Start */}
        <div className="mb-5 p-4 bg-blue-900/20 border border-blue-800 rounded">
          <h4 className="text-sm font-semibold text-blue-300 mb-2">빠른 시작 가이드</h4>
          <ol className="text-xs text-gray-300 space-y-1 list-decimal list-inside">
            <li><strong>1단계</strong>에서 Anthropic API 키를 입력하고 저장합니다.</li>
            <li><strong>2단계</strong>에서 연결 테스트를 통해 서비스 상태를 확인합니다.</li>
            <li><strong>3단계</strong>에서 플랫폼 API 키 (cpk_...)를 생성합니다.</li>
            <li>생성된 키를 아래 예제 코드에 넣어 외부 프로젝트에서 호출합니다.</li>
          </ol>
        </div>

        {/* Endpoint */}
        <div className="mb-5">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">API 엔드포인트</h4>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-green-700/40 text-green-300 rounded text-xs font-bold">POST</span>
            <code className="bg-gray-900 px-3 py-1.5 rounded text-sm flex-1">{baseUrl}/api/chat/completions</code>
            <button
              onClick={() => copyToClipboard(`${baseUrl}/api/chat/completions`, 'endpoint')}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs shrink-0"
            >
              {copiedSnippet === 'endpoint' ? '복사됨!' : '복사'}
            </button>
          </div>
        </div>

        {/* Auth Headers */}
        <div className="mb-5">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">인증 방법</h4>
          <p className="text-xs text-gray-400 mb-2">요청 헤더에 플랫폼 API 키를 포함합니다. 두 가지 형식 모두 지원됩니다:</p>
          <div className="space-y-2">
            <CodeLine label="방법 A" code='Authorization: Bearer cpk_your_api_key_here' />
            <CodeLine label="방법 B" code='X-API-Key: cpk_your_api_key_here' />
          </div>
        </div>

        {/* Request Body */}
        <div className="mb-5">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">요청 본문 (Request Body)</h4>
          <div className="text-xs text-gray-400 mb-2 space-y-1">
            <div className="grid grid-cols-[120px_50px_1fr] gap-x-2 gap-y-1.5">
              <code className="text-blue-300">message</code><span className="text-yellow-400">필수</span><span>사용자 메시지</span>
              <code className="text-blue-300">model</code><span className="text-gray-500">선택</span><span>claude-haiku-4-5-20251001 (기본값), claude-sonnet-4-20250514, claude-opus-4-6</span>
              <code className="text-blue-300">conversationId</code><span className="text-gray-500">선택</span><span>기존 대화를 이어가려면 UUID를 전달합니다</span>
              <code className="text-blue-300">messages</code><span className="text-gray-500">선택</span><span>이전 대화 기록 배열 (컨텍스트 유지용)</span>
            </div>
          </div>
        </div>

        {/* cURL Example */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-300">cURL 예제</h4>
            <button
              onClick={() => copyToClipboard(curlExample(baseUrl), 'curl')}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
            >
              {copiedSnippet === 'curl' ? '복사됨!' : '복사'}
            </button>
          </div>
          <pre className="bg-gray-900 rounded p-4 text-xs leading-relaxed overflow-x-auto">
            <code>{curlExample(baseUrl)}</code>
          </pre>
        </div>

        {/* JavaScript/TypeScript */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-300">JavaScript / TypeScript 예제</h4>
            <button
              onClick={() => copyToClipboard(jsExample(baseUrl), 'js')}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
            >
              {copiedSnippet === 'js' ? '복사됨!' : '복사'}
            </button>
          </div>
          <pre className="bg-gray-900 rounded p-4 text-xs leading-relaxed overflow-x-auto">
            <code>{jsExample(baseUrl)}</code>
          </pre>
        </div>

        {/* Python */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-300">Python 예제</h4>
            <button
              onClick={() => copyToClipboard(pythonExample(baseUrl), 'python')}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
            >
              {copiedSnippet === 'python' ? '복사됨!' : '복사'}
            </button>
          </div>
          <pre className="bg-gray-900 rounded p-4 text-xs leading-relaxed overflow-x-auto">
            <code>{pythonExample(baseUrl)}</code>
          </pre>
        </div>

        {/* Response Format */}
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">응답 형식</h4>
          <p className="text-xs text-gray-400 mb-2">
            API는 Server-Sent Events (SSE) 스트림으로 응답합니다. 각 이벤트는 OpenAI 호환 형식의 JSON 객체입니다:
          </p>
          <pre className="bg-gray-900 rounded p-4 text-xs leading-relaxed overflow-x-auto">
            <code>{responseExample}</code>
          </pre>
        </div>
      </Section>
    </div>
  );
}

function Section({ step, title, description, children }: {
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center gap-3 mb-1">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-xs font-bold shrink-0">{step}</span>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <p className="text-sm text-gray-400 mb-4 ml-9">{description}</p>
      <div className="ml-9">{children}</div>
    </div>
  );
}

function StatusDot({ active, error }: { active: boolean; error?: boolean }) {
  const color = error ? 'bg-red-400' : active ? 'bg-green-400' : 'bg-yellow-400';
  return <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />;
}

function CodeLine({ label, code }: { label: string; code: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-16 shrink-0">{label}</span>
      <code className="bg-gray-900 px-3 py-1.5 rounded text-xs flex-1">{code}</code>
    </div>
  );
}

function curlExample(baseUrl: string) {
  return `curl -X POST ${baseUrl}/api/chat/completions \\
  -H "Authorization: Bearer cpk_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "안녕하세요, Claude!",
    "model": "claude-haiku-4-5-20251001"
  }'`;
}

function jsExample(baseUrl: string) {
  return `const response = await fetch("${baseUrl}/api/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer cpk_your_api_key_here",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    message: "안녕하세요, Claude!",
    model: "claude-haiku-4-5-20251001",
  }),
});

// SSE 스트림 읽기
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  for (const line of chunk.split("\\n")) {
    if (line.startsWith("data: ") && !line.includes("[DONE]")) {
      const json = JSON.parse(line.slice(6));
      const content = json.choices?.[0]?.delta?.content;
      if (content) process.stdout.write(content);
    }
  }
}`;
}

function pythonExample(baseUrl: string) {
  return `import requests
import json

response = requests.post(
    "${baseUrl}/api/chat/completions",
    headers={
        "Authorization": "Bearer cpk_your_api_key_here",
        "Content-Type": "application/json",
    },
    json={
        "message": "안녕하세요, Claude!",
        "model": "claude-haiku-4-5-20251001",
    },
    stream=True,
)

# SSE 스트림 파싱
for line in response.iter_lines():
    if line:
        text = line.decode("utf-8")
        if text.startswith("data: ") and "[DONE]" not in text:
            data = json.loads(text[6:])
            content = data["choices"][0]["delta"].get("content", "")
            print(content, end="", flush=True)`;
}

const responseExample = `data: {"id":"chatcmpl-...","object":"chat.completion.chunk",
  "model":"claude-haiku-4-5-20251001",
  "choices":[{"index":0,"delta":{"content":"안녕"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk",
  "choices":[{"index":0,"delta":{"content":"하세요!"},"finish_reason":"stop"}]}

data: [DONE]`;
