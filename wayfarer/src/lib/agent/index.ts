import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env';
import { checkItineraryAgainstBrief, ItinerarySchema, type AgentEvent, type Brief, type Itinerary } from '../schemas';
import { newTripPrompt, refinePrompt, SYSTEM_PROMPT } from './prompts';
import {
  CLIENT_TOOLS, findClientTool, jsonSchemaOf, submitInputSchema, SUBMIT_DESCRIPTION, SUBMIT_TOOL_NAME, type ToolContext,
} from './tools';

const MAX_STEPS = 16;
const MAX_RESULT_CHARS = 9000;

type Emit = (e: AgentEvent) => void;

export interface RunOptions {
  brief: Brief;
  /** When present, the agent revises this itinerary instead of planning from scratch. */
  current?: Itinerary;
  instruction?: string;
  signal?: AbortSignal;
  emit: Emit;
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  return (_client ??= new Anthropic({
    apiKey: env.anthropicKey,
    ...(env.provider === 'ollama' ? { baseURL: env.ollamaBaseUrl } : {}),
    maxRetries: 3,
    timeout: 10 * 60_000,
  }));
}

function buildTools(): Anthropic.Messages.ToolUnion[] {
  const tools: Anthropic.Messages.ToolUnion[] = CLIENT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: jsonSchemaOf(t.schema) as Anthropic.Messages.Tool.InputSchema,
  }));
  tools.push({
    name: SUBMIT_TOOL_NAME,
    description: SUBMIT_DESCRIPTION,
    input_schema: submitInputSchema as Anthropic.Messages.Tool.InputSchema,
  });
  if (env.provider === 'anthropic' && env.webSearch) {
    tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 6 });
  }
  return tools;
}

const FRIENDLY: Record<string, string> = {
  geocode_place: 'Locating destination',
  locate_places: 'Pinning places on the map',
  get_weather: 'Checking the weather',
  convert_currency: 'Converting currency',
  estimate_travel: 'Checking travel times',
  web_search: 'Searching the web',
  [SUBMIT_TOOL_NAME]: 'Writing your itinerary',
};

function clip(s: string): string {
  return s.length > MAX_RESULT_CHARS ? `${s.slice(0, MAX_RESULT_CHARS)}\n…[truncated]` : s;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * The agent loop: Claude decides which tools to call, we execute them, feed results back,
 * and stop when it delivers a valid itinerary through submit_itinerary.
 */
export async function runAgent(opts: RunOptions): Promise<Itinerary> {
  const { brief, emit, signal } = opts;
  const ctx: ToolContext = { brief };
  const tools = buildTools();

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: 'user',
      content: opts.current && opts.instruction ? refinePrompt(brief, opts.current, opts.instruction) : newTripPrompt(brief),
    },
  ];

  emit({ type: 'status', message: opts.current ? 'Reworking your itinerary' : 'Starting to plan' });
  let nudges = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal?.aborted) throw new Error('Cancelled');

    const stream = client().messages.stream(
      { model: env.model, max_tokens: env.maxOutputTokens, system: SYSTEM_PROMPT, tools, messages },
      { signal },
    );

    const announced = new Set<string>();
    for await (const ev of stream) {
      if (ev.type === 'content_block_start') {
        const b = ev.content_block;
        if ((b.type === 'tool_use' || b.type === 'server_tool_use') && !announced.has(b.id)) {
          announced.add(b.id);
          emit({ type: 'tool', id: b.id, name: b.name, label: FRIENDLY[b.name] ?? b.name, state: 'running' });
        }
      } else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        emit({ type: 'text', delta: ev.delta.text });
      }
    }
    const msg = await stream.finalMessage();
    messages.push({ role: 'assistant', content: msg.content });

    // Web search runs on Anthropic's side; report it to the UI.
    for (const b of msg.content) {
      if (b.type === 'server_tool_use' && b.name === 'web_search') {
        const q = (b.input as { query?: string })?.query;
        emit({ type: 'tool', id: b.id, name: b.name, label: q ? `Searching: ${q}` : 'Searching the web', state: 'done' });
      }
    }

    if (msg.stop_reason === 'max_tokens') {
      throw new Error('The plan was too long to finish. Try fewer days or a shorter request.');
    }
    if (msg.stop_reason === 'refusal') {
      throw new Error('The request could not be completed. Try rephrasing your trip details.');
    }
    if (msg.stop_reason === 'pause_turn') continue; // server-side tool still working; resume

    const uses = msg.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use');

    if (uses.length === 0) {
      if (++nudges > 2) throw new Error('The planner stopped without producing an itinerary. Please try again.');
      messages.push({ role: 'user', content: 'Please finish by calling submit_itinerary with the complete plan.' });
      continue;
    }

    let accepted: Itinerary | null = null;
    const results: Anthropic.Messages.ToolResultBlockParam[] = await Promise.all(
      uses.map(async (u): Promise<Anthropic.Messages.ToolResultBlockParam> => {
        // ---- final delivery ----
        if (u.name === SUBMIT_TOOL_NAME) {
          const parsed = ItinerarySchema.safeParse(u.input);
          if (!parsed.success) {
            const issues = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
            emit({ type: 'tool', id: u.id, name: u.name, label: 'Fixing a few details', state: 'error' });
            return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Validation failed:\n- ${issues.join('\n- ')}\nFix these and call submit_itinerary again with the full itinerary.` };
          }
          const problems = checkItineraryAgainstBrief(parsed.data, brief);
          if (problems.length) {
            emit({ type: 'tool', id: u.id, name: u.name, label: 'Double-checking the plan', state: 'error' });
            return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: `The itinerary has problems:\n- ${problems.join('\n- ')}\nFix these and call submit_itinerary again with the full itinerary.` };
          }
          accepted = parsed.data;
          emit({ type: 'tool', id: u.id, name: u.name, label: 'Itinerary ready', state: 'done' });
          return { type: 'tool_result', tool_use_id: u.id, content: 'Accepted.' };
        }

        // ---- data tools ----
        const tool = findClientTool(u.name);
        if (!tool) {
          return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Unknown tool "${u.name}".` };
        }
        const input = tool.schema.safeParse(u.input);
        if (!input.success) {
          emit({ type: 'tool', id: u.id, name: u.name, label: FRIENDLY[u.name] ?? u.name, state: 'error' });
          return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Invalid input: ${input.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
        }
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const out = await (tool as any).run(input.data, ctx);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          emit({ type: 'tool', id: u.id, name: u.name, label: (tool as any).label(input.data), state: 'done' });
          return { type: 'tool_result', tool_use_id: u.id, content: clip(JSON.stringify(out)) };
        } catch (e) {
          emit({ type: 'tool', id: u.id, name: u.name, label: FRIENDLY[u.name] ?? u.name, state: 'error', detail: errMsg(e) });
          return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Tool failed: ${errMsg(e)}. Continue without it if you can, and mention the gap in caveats.` };
        }
      }),
    );

    if (accepted) return accepted;
    messages.push({ role: 'user', content: results });
  }

  throw new Error('The planner ran out of steps before finishing. Please try again.');
}
