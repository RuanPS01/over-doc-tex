import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { healthOf } from '@/lib/ai/model-chain';
import { PROVIDERS, inheritedKeySource, resolveChain, resolveModel, type AiConfig, type AiProviderId } from '@/lib/ai/providers';
import { AiTaskError, MAX_AI_MODELS } from '@/lib/ai/schemas';
import { useAiConfig } from '../hooks/use-ai-config';
import { ModelEntryCard, type DraftEntry } from './model-entry-card';

const NEW_PRIMARY_PROVIDER: AiProviderId = 'gemini';

function toDraft(config: AiConfig | null): DraftEntry[] {
  if (!config) return [newEntry(NEW_PRIMARY_PROVIDER, false)];
  return config.models.map((entry, index) => ({
    id: crypto.randomUUID(),
    provider: entry.provider,
    model: entry.model,
    customModel: entry.model !== null && !PROVIDERS[entry.provider].catalog.includes(entry.model),
    storedKey: entry.apiKey,
    keyInput: '',
    inherit: !entry.apiKey && inheritedKeySource(config.models, index) !== null,
  }));
}

function newEntry(provider: AiProviderId, inherit: boolean): DraftEntry {
  return { id: crypto.randomUUID(), provider, model: null, customModel: false, storedKey: '', keyInput: '', inherit };
}

/** Converte o rascunho em configuração; reserva que herda vai com chave vazia. */
function toConfig(draft: readonly DraftEntry[]): AiConfig {
  return {
    models: draft.map((entry) => ({
      provider: entry.provider,
      model: entry.model,
      apiKey: entry.inherit ? '' : entry.keyInput.trim() || entry.storedKey,
    })),
  };
}

function describeConfig(config: AiConfig | null): string {
  const chain = config ? resolveChain(config) : [];
  const [primary, ...reserves] = chain;
  if (!primary) return 'Nenhuma IA configurada. O assistente fica desativado até você salvar um modelo com a sua chave.';
  const extra = reserves.length === 0 ? '' : `, com ${reserves.length} ${reserves.length === 1 ? 'reserva' : 'reservas'}`;
  return `Assistente ativo com ${PROVIDERS[primary.provider].label} (${resolveModel(primary)})${extra}.`;
}

interface AiSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Usar a minha própria IA": fila ordenada de modelos (principal e reservas),
 * cada um com provedor, modelo e chave. A plataforma não oferece IA própria.
 */
export function AiSettingsDialog({ open, onOpenChange }: AiSettingsDialogProps) {
  const { config, storage, save, clear } = useAiConfig();
  const [draft, setDraft] = useState<DraftEntry[]>(() => toDraft(config));
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Cada abertura parte da configuração salva, descartando edições canceladas.
  useEffect(() => {
    if (!open) return;
    setDraft(toDraft(config));
    setErrors({});
    setConfirmClear(false);
  }, [open, config]);

  const draftConfig = useMemo(() => toConfig(draft), [draft]);
  const resolved = useMemo(() => {
    // Mesmo índice do rascunho, com a chave herdada já aplicada (ou nulo, sem credencial).
    return draftConfig.models.map((entry, index) => {
      const source = entry.apiKey ? index : inheritedKeySource(draftConfig.models, index);
      const apiKey = source === null ? '' : (draftConfig.models[source]?.apiKey ?? '');
      return { ...entry, apiKey };
    });
  }, [draftConfig]);

  const updateEntry = (index: number, patch: Partial<DraftEntry>) => {
    setErrors((current) => ({ ...current, [index]: '' }));
    setDraft((current) =>
      current.map((entry, position) => {
        if (position !== index) return entry;
        const next = { ...entry, ...patch };
        if (patch.provider && patch.provider !== entry.provider) {
          // Reserva que passa a ter um provedor já usado acima herda a chave dele.
          const models = toConfig(current.map((item, i) => (i === index ? next : item))).models;
          next.inherit = index > 0 && !next.keyInput && inheritedKeySource(models, index) !== null;
        }
        return next;
      }),
    );
  };

  const addReserve = () => {
    // Reserva nova nasce com o provedor do principal e herda a chave dele.
    const provider = draft[0]?.provider ?? NEW_PRIMARY_PROVIDER;
    setDraft((current) => [...current, newEntry(provider, true)]);
  };

  const removeEntry = (index: number) => setDraft((current) => current.filter((_, position) => position !== index));

  const handleSave = async () => {
    const found: Record<number, string> = {};
    resolved.forEach((entry, index) => {
      if (!entry.apiKey) found[index] = 'Cole a chave do provedor.';
      else if (draft[index]?.customModel && !entry.model) found[index] = 'Informe o nome do modelo.';
    });
    if (Object.keys(found).length > 0) return setErrors(found);

    setIsSaving(true);
    try {
      // Confere todas as chaves e modelos antes de gravar: um erro aqui é melhor que no meio do texto.
      const results = await Promise.allSettled(
        resolved.map((entry) => PROVIDERS[entry.provider].verifyKey(entry.apiKey, resolveModel(entry))),
      );
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          found[index] = result.reason instanceof AiTaskError ? result.reason.message : 'Não foi possível validar a chave.';
        }
      });
      if (Object.keys(found).length > 0) return setErrors(found);
      await save(draftConfig);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    if (!confirmClear) return setConfirmClear(true);
    await clear();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[88vh]">
        <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 shrink-0 text-primary" />
            Usar a minha própria IA
          </DialogTitle>
          <DialogDescription>
            A IA do OverDocTeX funciona só com a sua chave: a plataforma não oferece IA própria.{' '}
            {storage === 'account'
              ? 'A configuração fica guardada na sua conta e vale para todo recurso de IA: assistente, reescrita, sumário e verificação de referências.'
              : 'Sem login, a configuração fica guardada só neste navegador.'}
          </DialogDescription>
        </DialogHeader>

        {/* Única área que rola: título e botões ficam sempre à vista. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-5 py-4">
          <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{describeConfig(config)}</p>

          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold">Modelos</h3>
            <p className="text-xs text-muted-foreground">
              Quando um modelo atinge o limite de uso ou falha, o OverDocTeX tenta o próximo da lista sozinho. O modelo que
              bateu no limite sai da frente por alguns minutos, e as próximas chamadas já começam pelo seguinte.
            </p>
          </div>

          {draft.map((entry, index) => {
            const source = inheritedKeySource(draftConfig.models.map((m, i) => (i === index ? { ...m, apiKey: '' } : m)), index);
            const effective = resolved[index];
            return (
              <ModelEntryCard
                key={entry.id}
                index={index}
                entry={entry}
                inheritFrom={source === null ? null : source + 1}
                effectiveKey={effective?.apiKey ?? ''}
                health={effective?.apiKey ? healthOf(effective) : null}
                error={errors[index] || null}
                onChange={(patch) => updateEntry(index, patch)}
                onRemove={index > 0 ? () => removeEntry(index) : undefined}
              />
            );
          })}

          <Button type="button" variant="outline" disabled={draft.length >= MAX_AI_MODELS} onClick={addReserve}>
            <Plus />
            Adicionar modelo de reserva
          </Button>
        </div>

        <DialogFooter className="shrink-0 border-t bg-background px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive sm:mr-auto"
            disabled={!config || isSaving}
            onClick={() => void handleClear()}
          >
            <Trash2 />
            {confirmClear ? 'Clique de novo para limpar' : 'Limpar configuração'}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={isSaving} onClick={() => void handleSave()}>
            {isSaving && <Loader2 className="animate-spin" />}
            {isSaving ? 'Verificando' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
