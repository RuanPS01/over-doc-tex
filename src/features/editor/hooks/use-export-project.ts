import { useCallback, useState } from 'react';
import { useEditorStore } from '../state/editor-store';
import { useProjectArchive } from './use-project-archive';
import { useProjectFiles } from './use-project-files';

/** Exporta o projeto aberto em .zip; usado pela árvore de arquivos e pelo menu do cabeçalho. */
export function useExportProject() {
  const { projectId, projectName } = useEditorStore();
  const { data: files = [] } = useProjectFiles(projectId);
  const { exportZip } = useProjectArchive(projectId);
  const [isExporting, setIsExporting] = useState(false);

  const exportProject = useCallback(async () => {
    setIsExporting(true);
    try {
      return await exportZip(files, projectName);
    } finally {
      setIsExporting(false);
    }
  }, [exportZip, files, projectName]);

  return { exportProject, isExporting };
}
