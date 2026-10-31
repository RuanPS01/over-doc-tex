import { useParams } from 'wouter';
import { EditorShell } from '@/features/editor/components/editor-shell';
import { EditorStoreProvider } from '@/features/editor/state/editor-store';

/**
 * Rota /p/:projectId. Páginas apenas compõem features: nenhuma chamada ao
 * Firebase acontece aqui.
 */
export default function EditorPage() {
  const { projectId = 'demo' } = useParams<{ projectId: string }>();
  return (
    <EditorStoreProvider projectId={projectId} projectName="Revisão Colaborativa de Documentos LaTeX" initialFileId="main">
      <EditorShell />
    </EditorStoreProvider>
  );
}
