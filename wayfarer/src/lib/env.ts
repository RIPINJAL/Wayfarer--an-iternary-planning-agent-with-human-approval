import 'server-only';

const provider = process.env.AI_PROVIDER ?? 'anthropic';

if (provider !== 'anthropic' && provider !== 'ollama') {
  throw new Error('AI_PROVIDER must be either "anthropic" or "ollama".');
}

function int(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

export const env = {
  provider,
  get anthropicKey(): string {
    if (provider === 'ollama') return 'ollama';
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set. Add it to your environment (see .env.example).');
    return key;
  },
  get model(): string {
    return provider === 'ollama'
      ? process.env.OLLAMA_MODEL || 'qwen3:8b'
      : process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
  },
  ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, ''),
  maxOutputTokens: int('MAX_OUTPUT_TOKENS', 24000),
  webSearch: (process.env.ENABLE_WEB_SEARCH ?? 'true') !== 'false',
  databasePath: process.env.DATABASE_PATH || './data/wayfarer.db',
  ratePerHour: int('RATE_LIMIT_PER_HOUR', 8),
  dailyCap: int('DAILY_PLAN_CAP', 300),
  contactEmail: process.env.CONTACT_EMAIL || 'contact@example.com',
};
