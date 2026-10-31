import { PdfPreviewPanel } from '@/features/pdf-viewer/components/pdf-preview-panel';
import type { CompileStage } from '@/lib/latex/compiler';
import type { TexIssue } from '@/lib/latex/prepare';
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
  const { isCompiling, stage, pdf, last, compile } = useCompileStore();
  const { projectId, revealLine } = useEditorStore();
  const { data: files = [] } = useProjectFiles(projectId);

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
    />
  );
}
