import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCatalog } from '../../scripts/ai-models-catalog.mjs';
import { compareModels, isTextChatModel, parseModelCatalog, prepareModelList, type ProviderModel } from '@/lib/ai/model-list';

const model = (id: string, released: number | null = null, label: string | null = null): ProviderModel => ({ id, label, released });

describe('lista de modelos de IA', () => {
  it('só modelos que conversam por texto', () => {
    expect(isTextChatModel('gemini', 'gemini-3.8-flash')).toBe(true);
    expect(isTextChatModel('gemini', 'gemini-flash-lite-latest')).toBe(true);
    expect(isTextChatModel('gemini', 'gemini-2.5-flash-preview-tts')).toBe(false);
    expect(isTextChatModel('gemini', 'text-embedding-004')).toBe(false);
    expect(isTextChatModel('openai', 'gpt-6.1-terra')).toBe(true);
    expect(isTextChatModel('openai', 'o3')).toBe(true);
    expect(isTextChatModel('openai', 'gpt-4o-realtime-preview')).toBe(false);
    expect(isTextChatModel('openai', 'text-embedding-3-large')).toBe(false);
    expect(isTextChatModel('openai', 'dall-e-3')).toBe(false);
    expect(isTextChatModel('anthropic', 'claude-opus-5-5')).toBe(true);
  });

  it('mais novos primeiro: data quando existe; senão apelidos "latest", depois a versão no nome', () => {
    const withDates = [model('claude-sonnet-5', 2), model('claude-opus-5-5', 9), model('claude-haiku-5-5', 5)].sort(compareModels);
    expect(withDates.map((item) => item.id)).toEqual(['claude-opus-5-5', 'claude-haiku-5-5', 'claude-sonnet-5']);
    const gemini = prepareModelList('gemini', [model('gemini-2.5-pro'), model('gemini-3.8-flash'), model('gemini-flash-latest'), model('gemini-3.10-flash'), model('gemini-2.5-pro')]);
    expect(gemini.map((item) => item.id)).toEqual(['gemini-flash-latest', 'gemini-3.10-flash', 'gemini-3.8-flash', 'gemini-2.5-pro']);
  });

  it('repetido junta nome e data das duas fontes', () => {
    const [merged] = prepareModelList('anthropic', [model('claude-opus-5-5', null, 'Claude Opus 5.5'), model('claude-opus-5-5', 7)]);
    expect(merged).toEqual(model('claude-opus-5-5', 7, 'Claude Opus 5.5'));
  });

  it('catálogo do deploy: gerado a partir do models.dev e lido pelo app', () => {
    const api = {
      google: {
        models: {
          a: { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', release_date: '2026-09-02', modalities: { output: ['text'] } },
          b: { id: 'gemini-omni-flash-preview', name: 'Omni', release_date: '2026-06-30', modalities: { output: ['video'] } },
          c: { id: 'gemini-1.0-pro', name: 'Antigo', release_date: '2024-01-01', modalities: { output: ['text'] }, status: 'deprecated' },
        },
      },
      anthropic: { models: { a: { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', release_date: '2026-09-22', modalities: { output: ['text'] } } } },
    };
    const catalog = buildCatalog(api, new Date('2026-11-01T12:00:00Z'));
    expect(catalog.providers.gemini).toEqual([{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', released: Date.parse('2026-09-02') }]);
    expect(catalog.providers.openai).toBeUndefined();
    const parsed = parseModelCatalog(JSON.parse(JSON.stringify(catalog)))!;
    expect(parsed.generatedAt).toBe(Date.parse('2026-11-01T12:00:00Z'));
    expect(parsed.providers.anthropic?.[0]).toEqual({ id: 'claude-opus-5-5', label: 'Claude Opus 5.5', released: Date.parse('2026-09-22') });
    expect(parseModelCatalog({ providers: {} })).toBeNull();
    expect(parseModelCatalog('lixo')).toBeNull();
  });
});

describe('teste do modelo', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/ai/providers');
    vi.resetModules();
  });

  it('manda um pedido curto e devolve a resposta, o tempo e se houve modelo alternativo', async () => {
    const streamText = vi.fn(async function* (_input: { effort: string; maxTokens: number }) {
      yield { type: 'fallback' as const };
      yield { type: 'delta' as const, text: ' O' };
      yield { type: 'delta' as const, text: 'K\n' };
      yield { type: 'done' as const, stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1 } };
    });
    vi.doMock('@/lib/ai/providers', () => ({
      createProvider: vi.fn(async () => ({ streamText })),
      resolveModel: () => 'gemini-3.8-flash',
    }));
    const { testModel } = await import('@/lib/ai/test-model');
    const result = await testModel({ provider: 'gemini', model: 'gemini-3.8-flash', apiKey: 'AIza-teste' }, new AbortController().signal);
    expect(result).toMatchObject({ model: 'gemini-3.8-flash', reply: 'OK', usedFallback: true });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(streamText.mock.calls[0]![0]).toMatchObject({ effort: 'low', maxTokens: 1024 });
  });
});
