import type { DocumentDoc, FileDoc, ProjectDoc } from '@shared/firestore/types';

/** O documento principal e o arquivo inicial têm ids fixos, então o editor sabe o que abrir. */
export const MAIN_DOCUMENT_ID = 'main';
export const MAIN_FILE_ID = 'main';
export const MAIN_FILE_PATH = 'main.tex';
export const MAX_PROJECT_NAME = 120;

/** Nome sem espaços sobrando; nulo quando vazio. */
export function normalizeProjectName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_PROJECT_NAME);
  return name.length > 0 ? name : null;
}

const LATEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '%': '\\%',
  _: '\\_',
  '^': '\\textasciicircum{}',
  '~': '\\textasciitilde{}',
};

/** Escapa o nome para entrar no \title sem quebrar a compilação. */
export function escapeLatex(text: string): string {
  return text.replace(/[\\{}$&#%_^~]/g, (char) => LATEX_ESCAPES[char] ?? char);
}

export function starterTex(name: string): string {
  return [
    '\\documentclass[12pt]{article}',
    '\\usepackage[brazil]{babel}',
    '\\usepackage[T1]{fontenc}',
    '',
    `\\title{${escapeLatex(name)}}`,
    '\\author{}',
    '',
    '\\begin{document}',
    '\\maketitle',
    '',
    '\\section{Introdução}',
    'Comece a escrever aqui.',
    '',
    '\\end{document}',
    '',
  ].join('\n');
}

/** Sentinela de data do servidor (serverTimestamp) no lugar dos Timestamps. */
type WithServerTime<T, K extends keyof T> = Omit<T, K> & Record<K, unknown>;

export interface NewProjectDocs {
  project: WithServerTime<ProjectDoc, 'createdAt' | 'updatedAt'>;
  document: WithServerTime<DocumentDoc, 'createdAt' | 'updatedAt'>;
  file: WithServerTime<FileDoc, 'updatedAt'>;
}

/**
 * Documentos de um projeto novo. O projeto segue a regra de criação de
 * firestore.rules (só o dono como membro, sem convites, contadores zerados);
 * documento e arquivo vão num segundo lote, porque as regras deles conferem
 * o papel lendo o projeto já gravado.
 */
export function buildNewProject(input: {
  uid: string;
  name: string;
  content: string;
  contentHash: string;
  now: unknown;
}): NewProjectDocs {
  const size = new TextEncoder().encode(input.content).byteLength;
  return {
    project: {
      name: input.name,
      description: null,
      ownerId: input.uid,
      members: { [input.uid]: 'owner' },
      memberIds: [input.uid],
      pendingMembers: {},
      engine: 'pdflatex',
      mainDocumentId: MAIN_DOCUMENT_ID,
      latestSnapshotId: null,
      counters: { snapshots: 0, reviews: 0 },
      stats: { fileCount: 1, totalBytes: size },
      createdAt: input.now,
      updatedAt: input.now,
      archivedAt: null,
    },
    document: {
      title: input.name,
      role: 'main',
      rootFileId: MAIN_FILE_ID,
      rootPath: MAIN_FILE_PATH,
      engine: null,
      order: 0,
      lastBuild: null,
      createdAt: input.now,
      updatedAt: input.now,
    },
    file: {
      name: MAIN_FILE_PATH,
      path: MAIN_FILE_PATH,
      parentId: null,
      kind: 'tex',
      content: input.content,
      blobPath: null,
      contentHash: input.contentHash,
      size,
      revision: 1,
      updatedAt: input.now,
      updatedBy: input.uid,
    },
  };
}
