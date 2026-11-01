import type { FileDoc, FileKind } from '@shared/firestore/types';

/** Modelo de visão do arquivo no editor (desacoplado do documento do Firestore). */
export interface EditorFile {
  id: string;
  path: string;
  name: string;
  kind: FileKind;
  /** Texto inline; nulo para binários e textos grandes, que ficam em `blobPath`. */
  content: string | null;
  blobPath: string | null;
  /** Bytes do conteúdo (para ordenar a árvore por tamanho). */
  size: number;
  /** Última gravação, em ms; nulo enquanto o servidor não confirma (gravação recém-feita). */
  updatedAt: number | null;
}

export function toEditorFile(id: string, doc: FileDoc): EditorFile {
  return {
    id,
    path: doc.path,
    name: doc.name,
    kind: doc.kind,
    content: doc.content,
    blobPath: doc.blobPath,
    size: typeof doc.size === 'number' ? doc.size : 0,
    // Escrita local ainda pendente chega sem updatedAt (serverTimestamp).
    updatedAt: doc.updatedAt ? doc.updatedAt.toMillis() : null,
  };
}

const utf8Size = (text: string) => new TextEncoder().encode(text).length;

/**
 * Arquivo a abrir quando o ativo não existe (projeto importado, arquivo
 * apagado): o main.tex da raiz, senão o primeiro .tex, senão o primeiro texto.
 */
export function pickFallbackFile(files: readonly EditorFile[]): EditorFile | null {
  const editable = files.filter((file) => file.content !== null);
  return (
    editable.find((file) => file.path === 'main.tex') ??
    editable.find((file) => file.kind === 'tex') ??
    editable[0] ??
    null
  );
}

const DEMO_SOURCES: EditorFile[] = [
  {
    id: 'main',
    path: 'main.tex',
    name: 'main.tex',
    kind: 'tex',
    blobPath: null,
    size: 0,
    updatedAt: null,
    content: String.raw`\documentclass[12pt]{article}
\usepackage[brazil]{babel}
\usepackage{graphicx}
\usepackage{hyperref}

\title{Revisão Colaborativa de Documentos \LaTeX}
\author{Equipe OverDocTeX}

\begin{document}
\maketitle
\tableofcontents

\input{capitulos/introducao}

\section{Métodos}
O diff visual compara dois snapshots congelados e recompila o documento
com marcações de inserção e remoção, como em $\Delta = V_{1.1} - V_{1.0}$.

\bibliographystyle{plain}
\bibliography{referencias}
\end{document}
`,
  },
  {
    id: 'cap-intro',
    path: 'capitulos/introducao.tex',
    name: 'introducao.tex',
    kind: 'tex',
    blobPath: null,
    size: 0,
    updatedAt: null,
    content: String.raw`\section{Introdução}
A revisão de documentos científicos ainda depende de trocas de arquivos por e-mail.
Este trabalho propõe um fluxo semelhante ao de Pull Requests \cite{silva2020}.
`,
  },
  {
    id: 'refs',
    path: 'referencias.bib',
    name: 'referencias.bib',
    kind: 'bib',
    blobPath: null,
    size: 0,
    updatedAt: null,
    content: `@article{silva2020,
  title = {Revisão de código aplicada a textos acadêmicos},
  author = {Silva, Ana and Souza, Bruno},
  year = {2020},
  url = {https://example.org/silva2020}
}
`,
  },
  { id: 'fig', path: 'figuras/arquitetura.pdf', name: 'arquitetura.pdf', kind: 'pdf', content: null, blobPath: null, size: 48_213, updatedAt: null },
];

/** Projeto de exemplo usado no modo demonstração (sem Firebase configurado). */
export const DEMO_FILES: EditorFile[] = DEMO_SOURCES.map((file) => (file.content === null ? file : { ...file, size: utf8Size(file.content) }));
