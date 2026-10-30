import { getFirestore } from 'firebase-admin/firestore';
import type { FileDoc } from '@shared/firestore/types';
import { firestorePaths } from '@shared/firestore/paths';

export interface SourceFile {
  fileId: string;
  path: string;
  kind: 'tex' | 'bib';
  content: string;
}

/**
 * Carrega os arquivos de texto do projeto usados como contexto da IA.
 * `fileIds` vazio significa projeto inteiro. Arquivos acima do limite inline
 * (conteúdo no Storage) ficam de fora nesta versão.
 */
export async function loadSourceFiles(
  projectId: string,
  fileIds: readonly string[],
): Promise<SourceFile[]> {
  const snap = await getFirestore()
    .collection(firestorePaths.files(projectId))
    .where('kind', 'in', ['tex', 'bib'])
    .get();

  const wanted = new Set(fileIds);
  return snap.docs.flatMap((doc) => {
    const data = doc.data() as FileDoc;
    if (wanted.size > 0 && !wanted.has(doc.id)) return [];
    if (data.content === null) return [];
    if (data.kind !== 'tex' && data.kind !== 'bib') return [];
    return [{ fileId: doc.id, path: data.path, kind: data.kind, content: data.content }];
  });
}
