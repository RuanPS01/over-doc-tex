import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useCallback } from 'react';
import { firestorePaths, snapshotFileName } from '@shared/firestore/paths';
import type { ProjectDoc, SnapshotDoc, SnapshotFileEntry, SnapshotRender, ThreadDoc } from '@shared/firestore/types';
import { useProjectSources } from '@/features/editor/hooks/use-project-sources';
import { readProjectDocuments, withMainDocument } from '@/features/projects/hooks/use-project-documents';
import { MAIN_DOCUMENT_ID } from '@/features/projects/model/new-project';
import { getFirebase } from '@/lib/firebase/app';
import { writeStoredFile } from '@/lib/firebase/stored-files';
import { compileLatex } from '@/lib/latex/compiler';
import { buildCompileInput, hasDocumentClass, type TexIssue } from '@/lib/latex/prepare';
import { encodeSyncData } from '@/lib/latex/synctex';
import { extractPageTexts } from '@/lib/pdf/page-text';
import { classifyFileKind, contentTypeOf } from '@/lib/project-archive/archive-paths';
import { sha256Hex } from '@/lib/stored-files/chunks';
import { countWords, manifestText, nextVersion, sortManifest, versionLabel, type PageTextFile, type VersionBump } from '../model/version';

export type FreezeStage = 'compiling' | 'uploading' | 'freezing';

export interface FreezeInput {
  message: string;
  bump: VersionBump;
  /** Devolve a última versão, sem congelar outra, se o código não mudou desde ela. */
  reuseIfUnchanged: boolean;
  /** Documentos que a versão reaproveitada precisa ter (um secundário criado depois dela obriga a congelar de novo). */
  requiredDocumentIds?: readonly string[];
  onStage: (stage: FreezeStage) => void;
}

export interface FreezeResult {
  snapshotId: string;
  label: string;
  /** A versão já existia (código igual ao da última). */
  reused: boolean;
}

/** Falha que a interface mostra com a lista de erros do TeX. */
export class FreezeError extends Error {
  constructor(
    message: string,
    readonly issues: TexIssue[] = [],
  ) {
    super(message);
  }
}

/**
 * Congela o projeto como ele está na tela (docs/07-fluxos.md, cenário A):
 * grava cada arquivo em blobs/{sha256} (o que já existe não sobe de novo),
 * compila o principal, grava o PDF e o texto por página da versão e, por
 * último, num lote só, o snapshot e o contador do projeto. As regras recusam
 * o snapshot fora desse lote.
 */
export function useFreezeSnapshot(projectId: string, projectName: string) {
  const collectSources = useProjectSources(projectId);

  return useCallback(
    async ({ message, bump, reuseIfUnchanged, requiredDocumentIds = [], onStage }: FreezeInput): Promise<FreezeResult> => {
      const { db, auth } = getFirebase();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new FreezeError('Entre na sua conta para congelar versões.');

      const { texts, binaries, mainPath, loadIssues } = await collectSources(null);
      if (loadIssues.length > 0) throw new FreezeError('Alguns arquivos não puderam ser lidos. Tente de novo.', loadIssues);
      if (!mainPath) throw new FreezeError('Nenhum arquivo .tex com \\documentclass no projeto.');

      const encoder = new TextEncoder();
      const textData = await Promise.all(
        texts.map(async (file) => {
          const data = encoder.encode(file.content);
          return { path: file.path, data, hash: await sha256Hex(data) };
        }),
      );
      const manifest: SnapshotFileEntry[] = sortManifest([
        ...textData.map(({ path, data, hash }) => ({ path, hash, size: data.byteLength, kind: classifyFileKind(path) })),
        ...[...binaries].map(([path, { data, hash }]) => ({ path, hash, size: data.byteLength, kind: classifyFileKind(path) })),
      ]);
      const sourceHash = await sha256Hex(encoder.encode(manifestText(manifest)));

      const projectRef = doc(db, firestorePaths.project(projectId));
      const project = (await getDoc(projectRef)).data() as ProjectDoc | undefined;
      if (!project) throw new FreezeError('Projeto não encontrado.');
      const latest = project.latestSnapshotId
        ? ((await getDoc(doc(db, firestorePaths.snapshot(projectId, project.latestSnapshotId)))).data() as SnapshotDoc | undefined)
        : undefined;
      const hasRequired = requiredDocumentIds.every((id) => latest?.documents?.[id]);
      if (reuseIfUnchanged && latest && project.latestSnapshotId && latest.sourceHash === sourceHash && hasRequired) {
        return { snapshotId: project.latestSnapshotId, label: latest.label, reused: true };
      }

      // Cada documento (o principal e os secundários) gera um PDF próprio.
      const documents = withMainDocument(await readProjectDocuments(projectId), projectName);
      const isRoot = (path: string) => texts.some((file) => file.path === path && hasDocumentClass(file.content));
      onStage('compiling');
      const binaryData = new Map([...binaries].map(([path, binary]) => [path, binary.data]));
      const builds = [];
      for (const document of documents) {
        const rootPath = document.role === 'main' ? (isRoot(document.rootPath) ? document.rootPath : mainPath) : document.rootPath;
        if (!isRoot(rootPath)) {
          throw new FreezeError(`O documento "${document.title}" aponta para ${rootPath}, que não existe ou não tem \\documentclass.`);
        }
        const compiled = await compileLatex(buildCompileInput(rootPath, texts, binaryData), rootPath, () => undefined);
        if (!compiled.pdf) {
          const prefix = documents.length > 1 ? `"${document.title}": ` : '';
          throw new FreezeError(`${prefix}a compilação falhou. Corrija os erros antes de congelar a versão.`, compiled.issues);
        }
        builds.push({ document, rootPath, pdf: compiled.pdf, synctex: compiled.synctex });
      }

      onStage('uploading');
      for (const file of textData) {
        await writeStoredFile(db, firestorePaths.blob(projectId, file.hash), file.data, {
          contentType: contentTypeOf(file.path),
          uid,
          sha256: file.hash,
        });
      }
      const snapshotRef = doc(collection(db, firestorePaths.snapshots(projectId)));
      const renders: Record<string, SnapshotRender> = {};
      let mainPages: string[] = [];
      for (const { document, rootPath, pdf, synctex } of builds) {
        const fileOf = (kind: 'pdf' | 'pages' | 'synctex') => firestorePaths.snapshotFile(projectId, snapshotRef.id, snapshotFileName(document.id, kind));
        const pages = await extractPageTexts(pdf);
        const pageFile: PageTextFile = { pages };
        await writeStoredFile(db, fileOf('pdf'), pdf, { contentType: 'application/pdf', uid });
        await writeStoredFile(db, fileOf('pages'), encoder.encode(JSON.stringify(pageFile)), { contentType: 'application/json', uid });
        if (synctex) await writeStoredFile(db, fileOf('synctex'), encoder.encode(encodeSyncData(synctex)), { contentType: 'application/json', uid });
        renders[document.id] = {
          title: document.title,
          role: document.role,
          rootPath,
          pdfPath: fileOf('pdf'),
          pdfSha256: await sha256Hex(pdf),
          pageCount: pages.length,
          synctexPath: synctex ? fileOf('synctex') : null,
          pageTextPath: fileOf('pages'),
        };
        if (document.id === MAIN_DOCUMENT_ID) mainPages = pages;
      }

      onStage('freezing');
      const version = nextVersion(latest?.version ?? null, bump);
      const sequence = project.counters.snapshots + 1;
      const snapshot: Omit<SnapshotDoc, 'createdAt'> & { createdAt: unknown } = {
        label: versionLabel(version),
        version,
        sequence,
        parentSnapshotId: project.latestSnapshotId,
        message: message.trim() || null,
        engine: project.engine,
        files: manifest,
        sourceHash,
        documents: renders,
        stats: { words: countWords(mainPages), pages: mainPages.length },
        createdBy: uid,
        createdAt: serverTimestamp(),
      };
      const batch = writeBatch(db);
      batch.set(snapshotRef, snapshot);
      batch.update(projectRef, {
        counters: { snapshots: sequence, reviews: project.counters.reviews },
        latestSnapshotId: snapshotRef.id,
        updatedAt: serverTimestamp(),
      });
      try {
        await batch.commit();
      } catch (error) {
        if ((error as { code?: string }).code === 'permission-denied') {
          throw new FreezeError('Sem permissão para congelar, ou outra pessoa congelou uma versão agora. Tente de novo.');
        }
        throw error;
      }

      await stampFixedThreads(projectId, snapshotRef.id);
      return { snapshotId: snapshotRef.id, label: snapshot.label, reused: false };
    },
    [collectSources, projectId, projectName],
  );
}

/**
 * Threads resolvidas como "corrigido na próxima versão" ganham o id da versão
 * que acabou de nascer. Melhor esforço: falhar aqui não desfaz a versão.
 */
async function stampFixedThreads(projectId: string, snapshotId: string): Promise<void> {
  const { db } = getFirebase();
  try {
    const reviews = await getDocs(collection(db, firestorePaths.reviews(projectId)));
    for (const review of reviews.docs) {
      const resolved = await getDocs(query(collection(db, firestorePaths.threads(projectId, review.id)), where('status', '==', 'resolved')));
      for (const thread of resolved.docs) {
        const resolution = (thread.data() as ThreadDoc).resolution;
        if (resolution?.kind !== 'fixed_next_version' || resolution.fixedInSnapshotId) continue;
        await updateDoc(thread.ref, { 'resolution.fixedInSnapshotId': snapshotId, updatedAt: serverTimestamp() });
      }
    }
  } catch {
    // Sem rede ou sem permissão: o carimbo é informativo.
  }
}
