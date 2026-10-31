import { useMemo, useState } from 'react';
import { PdfPreviewPanel } from '@/features/pdf-viewer/components/pdf-preview-panel';
import type { CompileStage } from '@/lib/latex/compiler';
import type { TexIssue } from '@/lib/latex/prepare';
import { sourceAt } from '@/lib/latex/synctex';
import { useProjectFiles } from '../hooks/use-project-files';
import { useCompileStore } from '../state/compile-store';
import { useEditorStore } from '../state/editor-store';

const STAGE_LABELS: Record<CompileStage, string> = {
  engine: 'Baixando o compilador (cerca de 45 MB, só na primeira vez)',
  packages: 'Carregando pacotes',
  compiling: 'Compilando',
};

function pdfNameFor(mainPath: string | null): string {
  if (!mainPath) return 'main.pdf';
  return mainPath.slice(mainPath.lastIndexOf('/') + 1).replace(/\.tex$/, '.pdf');
}

/** Liga o visualizador de PDF ao estado da compilação do projeto aberto. */
export function PdfPane() {
  const { isCompiling, stage, pdf, synctex, pdfFocus, last, compile } = useCompileStore();
  const { projectId, revealLine } = useEditorStore();
  const { data: files = [] } = useProjectFiles(projectId);
  const [pageSizes, setPageSizes] = useState<Array<{ width: number; height: number }>>([]);

  const focus = useMemo(() => {
    const size = pdfFocus ? pageSizes[pdfFocus.page - 1] : undefined;
    return pdfFocus && size ? { page: pdfFocus.page, y: pdfFocus.yPt / size.height, nonce: pdfFocus.nonce } : null;
  }, [pdfFocus, pageSizes]);

  // Duplo clique no PDF: busca reversa do SyncTeX leva o editor à linha que gerou o trecho.
  const handlePageDoubleClick = (page: number, x: number, y: number) => {
    const size = pageSizes[page - 1];
    const found = synctex && size ? sourceAt(synctex, page, x * size.width, y * size.height) : null;
    const file = found ? files.find((candidate) => candidate.path === found.path) : undefined;
    if (found && file) revealLine(file.id, found.line);
  };

  const summary = last
    ? last.ok
      ? `Compilado em ${(last.durationMs / 1000).toFixed(1).replace('.', ',')} s`
      : 'A compilação falhou'
    : null;

  const handleIssueSelect = (issue: TexIssue) => {
    const file = files.find((candidate) => candidate.path === issue.file);
    if (file) revealLine(file.id, issue.line ?? 1);
  };

  return (
    <PdfPreviewPanel
      pdf={pdf}
      fileName={pdfNameFor(last?.mainPath ?? null)}
      isCompiling={isCompiling}
      statusLabel={stage ? STAGE_LABELS[stage] : isCompiling ? 'Preparando os arquivos' : null}
      summary={summary}
      failed={last !== null && !last.ok}
      issues={last?.issues ?? []}
      onCompile={compile}
      onIssueSelect={handleIssueSelect}
      onPageDoubleClick={synctex ? handlePageDoubleClick : undefined}
      onPageSizes={setPageSizes}
      focus={focus}
    />
  );
}
