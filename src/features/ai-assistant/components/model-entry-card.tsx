import { Loader2, PauseCircle, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { maskApiKey } from '@/lib/ai/local-config-storage';
import type { ModelHealth } from '@/lib/ai/model-chain';
import { PROVIDERS, PROVIDER_IDS, detectProvider, type AiProviderId } from '@/lib/ai/providers';
import { useProviderModels } from '../hooks/use-provider-models';

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

function pauseLabel(health: ModelHealth): string {
  const minutes = Math.max(1, Math.ceil((health.until - Date.now()) / 60_000));
  return `Em pausa por ${minutes} min: ${health.message}`;
}

export function ModelEntryCard({ index, entry, inheritFrom, effectiveKey, health, error, onChange, onRemove }: ModelEntryCardProps) {
  const providerId = useId();
  const modelId = useId();
  const keyId = useId();
  const info = PROVIDERS[entry.provider];
  const { models, live, isFetching, failed } = useProviderModels(entry.provider, effectiveKey);

  const selectValue = entry.customModel ? CUSTOM_VALUE : (entry.model ?? DEFAULT_VALUE);
  const options = entry.model && !entry.customModel && !models.includes(entry.model) ? [entry.model, ...models] : models;

  const handleKeyInput = (value: string) => {
    // Colar uma chave de outro provedor troca o provedor do item.
    const detected = detectProvider(value);
    if (detected && detected !== entry.provider) {
      onChange({ provider: detected, model: null, customModel: false, keyInput: value, storedKey: '', inherit: false });
    } else {
      onChange({ keyInput: value });
    }
  };

  const modelCaption = isFetching
    ? 'Consultando modelos no provedor...'
    : live
      ? 'Lista consultada agora no provedor.'
      : failed
        ? 'Não foi possível consultar o provedor; mostrando a lista conhecida.'
        : 'Informe a chave para consultar a lista no provedor.';

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
              <SelectItem value={CUSTOM_VALUE}>Nome customizado</SelectItem>
              <SelectItem value={DEFAULT_VALUE}>Padrão do provedor ({info.defaultModel})</SelectItem>
              {options.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isFetching && <Loader2 className="size-3 animate-spin" />}
            {modelCaption}
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

      {info.note && <p className="text-xs text-muted-foreground">{info.note}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
