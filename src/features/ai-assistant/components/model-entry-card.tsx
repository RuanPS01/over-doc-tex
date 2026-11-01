import { CheckCircle2, FlaskConical, Loader2, PauseCircle, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { useId, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { maskApiKey } from '@/lib/ai/local-config-storage';
import type { ModelHealth } from '@/lib/ai/model-chain';
import { PROVIDERS, PROVIDER_IDS, detectProvider, resolveModel, type AiProviderId } from '@/lib/ai/providers';
import { useModelTest, type ModelTestState } from '../hooks/use-model-test';
import { useProviderModels, type ProviderModelsState } from '../hooks/use-provider-models';

const DEFAULT_VALUE = '__default__';
const CUSTOM_VALUE = '__custom__';

/** Estado de edição de um item da fila no diálogo de configuração. */
export interface DraftEntry {
  id: string;
  provider: AiProviderId;
  /** `null` usa o padrão do provedor. */
  model: string | null;
  customModel: boolean;
  /** Chave já salva (não é exibida; o campo reabre vazio). */
  storedKey: string;
  keyInput: string;
  /** Reserva que usa a chave de um item anterior do mesmo provedor. */
  inherit: boolean;
}

interface ModelEntryCardProps {
  index: number;
  entry: DraftEntry;
  /** Posição (1, 2, ...) do item cuja chave esta reserva herda, quando pode herdar. */
  inheritFrom: number | null;
  /** Chave usada para listar modelos: a digitada, a salva ou a herdada. */
  effectiveKey: string;
  health: ModelHealth | null;
  error: string | null;
  onChange: (patch: Partial<DraftEntry>) => void;
  onRemove?: () => void;
}

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** De onde veio a lista do campo Modelo, em uma frase. */
function listCaption({ source, checkedAt, isFetching, error, canRefresh }: ProviderModelsState): string {
  if (isFetching) return 'Consultando os modelos disponíveis no provedor...';
  const when = checkedAt ? dateTime.format(checkedAt) : '';
  const failure = error ? `Não foi possível consultar o provedor (${error}). ` : '';
  switch (source) {
    case 'live':
      return `Modelos disponíveis para a sua chave, consultados no provedor em ${when}.`;
    case 'remembered':
      return `${failure}Última lista do provedor, de ${when}.${canRefresh ? '' : ' Informe a chave para atualizar.'}`;
    case 'catalog':
      return `${failure}Lista pública de modelos, atualizada em ${when}.${canRefresh ? '' : ' Informe a chave para ver os disponíveis para você.'}`;
    case 'embedded':
      return `${failure}Lista conhecida pelo app.${canRefresh ? '' : ' Informe a chave para consultar o provedor.'}`;
  }
}

const SOURCE_LABELS: Record<ProviderModelsState['source'], string> = {
  live: 'Disponíveis no provedor',
  remembered: 'Última lista do provedor',
  catalog: 'Lista pública',
  embedded: 'Conhecidos pelo app',
};

function TestResult({ state }: { state: ModelTestState }) {
  if (state.status === 'ok') {
    const { result } = state;
    const elapsed =
      result.durationMs < 1000 ? `${result.durationMs} ms` : `${(result.durationMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;
    return (
      <p className="flex min-w-0 items-start gap-1.5 text-xs text-success" role="status">
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
        <span className="min-w-0 break-words">
          {result.model} respondeu em {elapsed}{result.reply ? `: "${result.reply}"` : ', sem texto'}.
          {result.usedFallback && ' O provedor usou um modelo alternativo para responder.'}
        </span>
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p className="flex min-w-0 items-start gap-1.5 text-xs text-destructive" role="alert">
        <XCircle className="mt-0.5 size-3.5 shrink-0" />
        <span className="min-w-0 break-words">{state.message}</span>
      </p>
    );
  }
  return null;
}

function pauseLabel(health: ModelHealth): string {
  const minutes = Math.max(1, Math.ceil((health.until - Date.now()) / 60_000));
  return `Em pausa por ${minutes} min: ${health.message}`;
}

export function ModelEntryCard({ index, entry, inheritFrom, effectiveKey, health, error, onChange, onRemove }: ModelEntryCardProps) {
  const providerId = useId();
  const modelId = useId();
  const keyId = useId();
  const info = PROVIDERS[entry.provider];
  const list = useProviderModels(entry.provider, effectiveKey);
  const testEntry = useMemo(() => ({ provider: entry.provider, model: entry.model, apiKey: effectiveKey }), [entry.provider, entry.model, effectiveKey]);
  const test = useModelTest(testEntry);

  const selectValue = entry.customModel ? CUSTOM_VALUE : (entry.model ?? DEFAULT_VALUE);
  // O modelo salvo continua na lista mesmo que a fonte atual não o traga.
  const options =
    entry.model && !entry.customModel && !list.models.some((model) => model.id === entry.model)
      ? [{ id: entry.model, label: null, released: null }, ...list.models]
      : list.models;
  const canTest = Boolean(effectiveKey) && !(entry.customModel && !entry.model);

  const handleKeyInput = (value: string) => {
    // Colar uma chave de outro provedor troca o provedor do item.
    const detected = detectProvider(value);
    if (detected && detected !== entry.provider) {
      onChange({ provider: detected, model: null, customModel: false, keyInput: value, storedKey: '', inherit: false });
    } else {
      onChange({ keyInput: value });
    }
  };


  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {index + 1}
        </span>
        <h4 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {index === 0 ? 'Modelo principal' : `Modelo ${index + 1} (reserva)`}
        </h4>
        {onRemove && (
          <Button type="button" variant="ghost" size="icon" aria-label={`Remover modelo ${index + 1}`} onClick={onRemove}>
            <Trash2 />
          </Button>
        )}
      </div>

      {health && (
        <p className="flex items-start gap-2 rounded-md bg-warning/10 p-2 text-xs">
          <PauseCircle className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0">{pauseLabel(health)}</span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={providerId} className="text-sm font-medium">
            Provedor
          </label>
          <Select
            value={entry.provider}
            onValueChange={(value) =>
              // Trocar o provedor zera modelo e chave: a chave de um não serve no outro.
              onChange({ provider: value as AiProviderId, model: null, customModel: false, keyInput: '', storedKey: '' })
            }
          >
            <SelectTrigger id={providerId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {PROVIDERS[id].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={modelId} className="text-sm font-medium">
            Modelo
          </label>
          <Select
            value={selectValue}
            onValueChange={(value) =>
              onChange(
                value === CUSTOM_VALUE
                  ? { customModel: true, model: entry.model }
                  : { customModel: false, model: value === DEFAULT_VALUE ? null : value },
              )
            }
          >
            <SelectTrigger id={modelId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_VALUE}>Padrão do provedor ({info.defaultModel})</SelectItem>
              <SelectItem value={CUSTOM_VALUE}>Nome personalizado...</SelectItem>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>{SOURCE_LABELS[list.source]}</SelectLabel>
                {options.map((model) => (
                  <SelectItem key={model.id} value={model.id} description={model.label && model.label !== model.id ? model.id : undefined}>
                    {model.label ?? model.id}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            {list.isFetching && <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin" />}
            <span className="min-w-0">
              {listCaption(list)}
              {list.canRefresh && !list.isFetching && (
                <>
                  {' '}
                  <button type="button" className="inline-flex items-center gap-1 text-primary underline" onClick={list.refresh}>
                    <RefreshCw className="size-3" />
                    Atualizar
                  </button>
                </>
              )}
            </span>
          </p>
        </div>
      </div>

      {entry.customModel && (
        <Input
          aria-label="Nome do modelo"
          placeholder="Nome exato do modelo no provedor"
          value={entry.model ?? ''}
          onChange={(event) => onChange({ model: event.target.value.trim() || null })}
        />
      )}

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={keyId} className="text-sm font-medium">
          Chave de API
        </label>
        {entry.inherit && inheritFrom !== null ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            <span className="min-w-0 flex-1">Chave já preenchida no modelo {inheritFrom}.</span>
            <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => onChange({ inherit: false })}>
              Usar outra chave
            </Button>
          </div>
        ) : (
          <>
            <Input
              id={keyId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={entry.storedKey ? `Chave salva (${maskApiKey(entry.storedKey)}). Deixe vazio para manter.` : 'Cole a chave do provedor'}
              value={entry.keyInput}
              onChange={(event) => handleKeyInput(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Não tem chave?{' '}
              <a href={info.keyUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                Criar chave em {info.label}
              </a>
              {inheritFrom !== null && (
                <>
                  {' '}
                  ou{' '}
                  <button type="button" className="text-primary underline" onClick={() => onChange({ inherit: true, keyInput: '' })}>
                    usar a do modelo {inheritFrom}
                  </button>
                </>
              )}
              .
            </p>
          </>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={!canTest || test.state.status === 'running'}
          title={canTest ? `Manda um pedido curto para ${resolveModel(testEntry)}` : 'Informe a chave e o modelo para testar'}
          onClick={() => void test.run()}
        >
          {test.state.status === 'running' ? <Loader2 className="animate-spin" /> : <FlaskConical />}
          {test.state.status === 'running' ? 'Testando' : 'Testar modelo'}
        </Button>
        <TestResult state={test.state} />
      </div>

      {info.note && <p className="text-xs text-muted-foreground">{info.note}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
