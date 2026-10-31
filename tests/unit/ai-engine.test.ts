/**
 * Motor de IA contra uma API da Anthropic simulada: o fetch global é trocado e
 * cada chamada responde com um stream SSE no formato real da API.
 * O provedor Gemini foi validado com chave real (ver docs/11-servico-de-ia.md).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PROVIDERS } from '@/lib/ai/providers';
import { runAiTask } from '@/lib/ai/run-task';
import { AiTaskError, type AiConfig, type AiEvent, type AiTask } from '@/lib/ai/schemas';

type Block = Record<string, unknown>;
interface Recorded {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown> & { model?: string; messages?: unknown[]; tools?: Array<Record<string, unknown>> };
}

const KEY = 'sk-ant-api03-teste-xxxxxxxxxxxxxxxxxxxx';
const INVALID_KEY = 'sk-ant-invalida-xxxxxxxxxxxxxxxxxxxx';
const requests: Recorded[] = [];
let script: Array<(body: Recorded['body']) => Response> = [];

function sse(blocks: Array<{ start: Block; deltas?: Block[] }>, stopReason: string): Response {
  const lines: string[] = [];
  const emit = (type: string, data: object) => lines.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  emit('message_start', {
    message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 120, output_tokens: 0 } },
  });
  blocks.forEach((block, index) => {
    emit('content_block_start', { index, content_block: block.start });
    for (const delta of block.deltas ?? []) emit('content_block_delta', { index, delta });
    emit('content_block_stop', { index });
  });
  emit('message_delta', { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 42 } });
  emit('message_stop', {});
  return new Response(lines.join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const text = (value: string) => ({
  start: { type: 'text', text: '' },
  deltas: (value.match(/.{1,8}/g) ?? []).map((piece) => ({ type: 'text_delta', text: piece })),
});
const json = (value: object) => text(JSON.stringify(value));
const fetchUse = (id: string, url: string) => ({
  start: { type: 'server_tool_use', id, name: 'web_fetch', input: {} },
  deltas: [{ type: 'input_json_delta', partial_json: JSON.stringify({ url }) }],
});
const jsonResponse = (status: number, value: object) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

const files = [
  { id: 'main', path: 'main.tex', kind: 'tex', content: '\\section{Introdução}\nTexto sobre diff de LaTeX e revisão.\n' },
  {
    id: 'refs',
    path: 'refs.bib',
    kind: 'bib',
    content:
      '@article{silva2020, title={Revisão de textos}, url={https://example.org/silva}}\n' +
      '@misc{quebrado, title={Fora do ar}, url={https://example.org/404}}\n' +
      '@book{semlink, title={Livro}}',
  },
];

const single: AiConfig = { models: [{ provider: 'anthropic', model: null, apiKey: KEY }] };
const withReserve: AiConfig = {
  models: [
    { provider: 'anthropic', model: null, apiKey: KEY },
    { provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: '' },
  ],
};

async function collect(task: AiTask, config: AiConfig = single) {
  const events: AiEvent[] = [];
  let error: AiTaskError | null = null;
  try {
    const signal = new AbortController().signal;
    for await (const event of runAiTask({ input: { task, prompt: 'Explique o diff de LaTeX', selection: null, history: [] }, files, config, signal })) {
      events.push(event);
    }
  } catch (failure) {
    error = failure as AiTaskError;
  }
  return { events, error };
}

beforeAll(() => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = init?.body ? (JSON.parse(String(init.body)) as Recorded['body']) : {};
    requests.push({ url, headers, body });
    if (url.includes('/v1/models/')) {
      return headers.authorization === `Bearer ${INVALID_KEY}`
        ? jsonResponse(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })
        : jsonResponse(200, { id: 'claude-opus-5-5', type: 'model', display_name: 'Claude Opus 5.5', created_at: '2026-01-01T00:00:00Z' });
    }
    const next = script.shift();
    if (!next) throw new Error('chamada inesperada à API simulada');
    return next(body);
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('texto em stream', () => {
  it('envia a chave do usuário direto do navegador, com fallback de recusa', async () => {
    script = [() => sse([text('O diff compara snapshots e recompila.')], 'end_turn')];
    const { events } = await collect('chat');
    const request = requests.at(-1)!;
    expect(request.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(request.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(request.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(request.body).toMatchObject({ model: 'claude-opus-5-5', stream: true, fallbacks: 'default', thinking: { type: 'adaptive' } });
    expect(JSON.stringify(request.body.messages)).toContain('<documento caminho=\\"main.tex\\"');
    const deltas = events.flatMap((event) => (event.type === 'delta' ? [event.text] : []));
    expect(deltas.join('')).toBe('O diff compara snapshots e recompila.');
    expect(events.at(-1)).toMatchObject({ type: 'done', servedBy: { model: 'claude-opus-5-5' } });
  });

  it('recusa pede descarte do texto parcial', async () => {
    script = [() => sse([text('Começo...')], 'refusal')];
    const { error } = await collect('chat');
    expect(error).toMatchObject({ code: 'refused', discardPartial: true });
  });
});

describe('saída estruturada', () => {
  it('valida o JSON com Zod antes de emitir o resultado', async () => {
    const outline = {
      summary: 'Ordem ok',
      sections: [{ level: 'section', title: 'Introdução', sourcePath: 'main.tex', action: 'keep', rationale: 'abre o texto' }],
      latex: '\\tableofcontents',
    };
    script = [() => sse([json(outline)], 'end_turn')];
    const { events } = await collect('updateToc');
    expect(requests.at(-1)!.body).toMatchObject({ output_config: { format: { type: 'json_schema' } } });
    expect(events.find((event) => event.type === 'result')).toMatchObject({ result: { task: 'updateToc', data: { latex: '\\tableofcontents' } } });
  });

  it('repete uma vez no mesmo modelo e depois devolve invalid_output', async () => {
    script = [() => sse([json({ summary: 1 })], 'end_turn'), () => sse([json({ summary: 2 })], 'end_turn')];
    const { error } = await collect('updateToc');
    expect(error?.code).toBe('invalid_output');
    expect(script).toHaveLength(0);
  });
});

describe('verificação de referências', () => {
  it('usa web_fetch, retoma pause_turn e deixa o link quebrado prevalecer', async () => {
    script = [
      () =>
        sse(
          [
            fetchUse('srv_1', 'https://example.org/silva'),
            {
              start: {
                type: 'web_fetch_tool_result',
                tool_use_id: 'srv_1',
                content: {
                  type: 'web_fetch_result',
                  url: 'https://example.org/silva',
                  retrieved_at: null,
                  content: { type: 'document', title: 'Revisão de textos', citations: null, source: { type: 'text', media_type: 'text/plain', data: 'Artigo.' } },
                },
              },
            },
          ],
          'pause_turn',
        ),
      (body) => {
        expect(body.messages).toHaveLength(2);
        return sse(
          [
            fetchUse('srv_2', 'https://example.org/404'),
            { start: { type: 'web_fetch_tool_result', tool_use_id: 'srv_2', content: { type: 'web_fetch_tool_result_error', error_code: 'url_not_accessible' } } },
            text('ok'),
          ],
          'end_turn',
        );
      },
      () =>
        sse(
          [
            json({
              judgements: [
                { key: 'silva2020', verdict: 'matches', explanation: 'Título confere.' },
                { key: 'quebrado', verdict: 'matches', explanation: 'O modelo tentou aprovar.' },
                { key: 'semlink', verdict: 'uncertain', explanation: 'Sem link.' },
              ],
            }),
          ],
          'end_turn',
        ),
    ];
    const before = requests.length;
    const { events, error } = await collect('checkReferences');
    expect(error).toBeNull();
    expect(requests[before]!.body.tools?.[0]).toMatchObject({ type: 'web_fetch_20260209', allowed_callers: ['direct'] });
    const result = events.find((event) => event.type === 'result');
    const audit = result?.type === 'result' && result.result.task === 'checkReferences' ? result.result.data : null;
    const byKey = Object.fromEntries((audit?.results ?? []).map((item) => [item.key, item]));
    expect(byKey.silva2020).toMatchObject({ linkStatus: 'ok', verdict: 'matches' });
    expect(byKey.quebrado).toMatchObject({ linkStatus: 'broken', verdict: 'unreachable' });
    expect(byKey.semlink).toMatchObject({ linkStatus: 'no_url', verdict: 'uncertain' });
    expect(audit?.summary).toEqual({ ok: 1, problems: 1, uncertain: 1 });
  });
});

describe('fila de modelos', () => {
  it('troca para a reserva em 429, sem repetir o principal, e pausa o modelo limitado', async () => {
    script = [
      () => jsonResponse(429, { type: 'error', error: { type: 'rate_limit_error', message: 'rate limited' } }),
      () => sse([text('Resposta da reserva.')], 'end_turn'),
    ];
    const before = requests.length;
    const { events } = await collect('chat', withReserve);
    expect(requests.length - before).toBe(2);
    expect(events.find((event) => event.type === 'switch')).toMatchObject({ message: expect.stringMatching(/limite/i) });
    expect(requests.at(-1)!.body.model).toBe('claude-haiku-5-5');
    expect(requests.at(-1)!.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(events.at(-1)).toMatchObject({ type: 'done', servedBy: { model: 'claude-haiku-5-5' } });

    // Na chamada seguinte, o principal em pausa vai para o fim da fila.
    script = [() => sse([text('De novo pela reserva.')], 'end_turn')];
    const next = await collect('chat', withReserve);
    expect(requests.at(-1)!.body.model).toBe('claude-haiku-5-5');
    expect(next.events.some((event) => event.type === 'switch')).toBe(false);
  });

  it('sem modelo com chave, avisa que a IA não está configurada', async () => {
    const { error } = await collect('chat', { models: [{ provider: 'gemini', model: null, apiKey: '' }] });
    expect(error?.code).toBe('not_configured');
  });
});

describe('verificação da chave', () => {
  it('detecta chave inválida e aceita a válida', async () => {
    await expect(PROVIDERS.anthropic.verifyKey(INVALID_KEY, 'claude-opus-5-5')).rejects.toMatchObject({ code: 'invalid_key' });
    await expect(PROVIDERS.anthropic.verifyKey(KEY, 'claude-opus-5-5')).resolves.toBeUndefined();
  });
});
