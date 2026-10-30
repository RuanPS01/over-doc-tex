import type { FileDoc, FileKind } from '@shared/firestore/types';

/** Modelo de visão do arquivo no editor (desacoplado do documento do Firestore). */
export interface EditorFile {
  id: string;
  path: string;
  name: string;
  kind: FileKind;
  content: string | null;
}

export function toEditorFile(id: string, doc: FileDoc): EditorFile {
  return { id, path: doc.path, name: doc.name, kind: doc.kind, content: doc.content };
}

/** Projeto de exemplo usado no modo demonstração (sem Firebase configurado). */
export const DEMO_FILES: EditorFile[] = [
  {
    id: 'main',
    path: 'main.tex',
    name: 'main.tex',
    kind: 'tex',
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
    content: `@article{silva2020,
  title = {Revisão de código aplicada a textos acadêmicos},
  author = {Silva, Ana and Souza, Bruno},
  year = {2020},
  url = {https://example.org/silva2020}
}
`,
  },
  { id: 'fig', path: 'figuras/arquitetura.pdf', name: 'arquitetura.pdf', kind: 'pdf', content: null },
];
