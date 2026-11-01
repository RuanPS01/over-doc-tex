import { useQueryClient } from '@tanstack/react-query';
import { doc, increment, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { firestorePaths } from '@shared/firestore/paths';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase/app';
import { t } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import { sha256Hex } from '@/lib/stored-files/chunks';
import type { EditorFile } from '../model/editor-file';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/** Espera depois da última tecla antes de gravar. */
export const AUTOSAVE_DELAY_MS = 800;
/** Igual ao teto de `content` em firestore.rules (524288). */
export const MAX_INLINE_TEXT_BYTES = 512 * 1024;

function saveErrorMessage(error: unknown): string {
  const code = (error as { code?: string }).code;
  if (code === 'permission-denied') return t('Sem permissão para editar: sua conta só pode ler este projeto.');
  if (code === 'not-found') return t('O arquivo foi removido do projeto.');
  return t('Não foi possível salvar. As alterações continuam no editor; tente de novo em instantes.');
}

/**
 * Salvamento automático do texto: grava `files/{id}` com o conteúdo, o
 * tamanho, o hash e a revisão +1. A última gravação vale (sem edição
 * simultânea em tempo real, fora do escopo atual).
 */
export function useFileAutosave(projectId: string) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const timers = useRef(new Map<string, { content: string; timer: ReturnType<typeof setTimeout> }>());
  const inFlight = useRef(0);

  const save = useCallback(
    async (fileId: string, content: string) => {
      // O cache também recebe o texto novo: IA e exportação usam o que está na tela.
      queryClient.setQueryData<EditorFile[]>(queryKeys.files(projectId), (files) =>
        files?.map((file) => (file.id === fileId ? { ...file, content } : file)),
      );
      if (!isFirebaseConfigured) {
        setStatus('saved');
        return;
      }

      const data = new TextEncoder().encode(content);
      if (data.byteLength > MAX_INLINE_TEXT_BYTES) {
        setStatus('error');
        setError(t('Arquivo acima de 512 KB: divida o texto em arquivos menores com \\input.'));
        return;
      }
      const { db, auth } = getFirebase();
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setStatus('error');
        setError(t('Sua sessão terminou. Entre de novo para salvar.'));
        return;
      }

      inFlight.current++;
      setStatus('saving');
      try {
        await updateDoc(doc(db, firestorePaths.file(projectId, fileId)), {
          content,
          size: data.byteLength,
          contentHash: await sha256Hex(data),
          revision: increment(1),
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });
        inFlight.current--;
        setError(null);
        if (inFlight.current === 0 && timers.current.size === 0) setStatus('saved');
      } catch (caught) {
        inFlight.current--;
        setStatus('error');
        setError(saveErrorMessage(caught));
      }
    },
    [projectId, queryClient],
  );

  const flush = useCallback(() => {
    for (const [fileId, { content, timer }] of timers.current) {
      clearTimeout(timer);
      void save(fileId, content);
    }
    timers.current.clear();
  }, [save]);

  const schedule = useCallback(
    (fileId: string, content: string) => {
      const previous = timers.current.get(fileId);
      if (previous) clearTimeout(previous.timer);
      const timer = setTimeout(() => {
        timers.current.delete(fileId);
        void save(fileId, content);
      }, AUTOSAVE_DELAY_MS);
      timers.current.set(fileId, { content, timer });
      setStatus('pending');
    },
    [save],
  );

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (timers.current.size === 0 && inFlight.current === 0) return;
      flush();
      event.preventDefault();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Troca de layout ou saída do editor: grava o que ainda estava esperando.
      flush();
    };
  }, [flush]);

  return { status, error, schedule };
}
