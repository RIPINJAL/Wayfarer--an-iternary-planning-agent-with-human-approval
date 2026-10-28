import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('AI provider configuration', () => {
  it('defaults to Anthropic without changing its model configuration', async () => {
    vi.stubEnv('AI_PROVIDER', 'anthropic');
    vi.stubEnv('ANTHROPIC_MODEL', '');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { env } = await import('@/lib/env');

    expect(env.provider).toBe('anthropic');
    expect(env.model).toBe('claude-sonnet-5-5');
    expect(env.anthropicKey).toBe('test-key');
  });

  it('uses Ollama settings without requiring an Anthropic API key', async () => {
    vi.stubEnv('AI_PROVIDER', 'ollama');
    vi.stubEnv('OLLAMA_BASE_URL', 'http://localhost:11434/');
    vi.stubEnv('OLLAMA_MODEL', 'qwen3:8b');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const { env } = await import('@/lib/env');

    expect(env.provider).toBe('ollama');
    expect(env.model).toBe('qwen3:8b');
    expect(env.ollamaBaseUrl).toBe('http://localhost:11434');
    expect(env.anthropicKey).toBe('ollama');
  });

  it('supports the no-model India planner without an Anthropic API key', async () => {
    vi.stubEnv('AI_PROVIDER', 'india');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const { env } = await import('@/lib/env');

    expect(env.provider).toBe('india');
    expect(() => env.anthropicKey).toThrow('ANTHROPIC_API_KEY is not set');
  });

  it('rejects unsupported provider names', async () => {
    vi.stubEnv('AI_PROVIDER', 'unknown');

    await expect(import('@/lib/env')).rejects.toThrow('AI_PROVIDER must be "anthropic", "ollama", or "india".');
  });
});
