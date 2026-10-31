import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useEditorStore } from '../state/editor-store';
import { FileTreePanel } from './file-tree-panel';

/** No celular, a árvore de arquivos vira um menu lateral (Sheet). */
export function FileTreeSheet() {
  const { fileTreeOpen, setFileTreeOpen } = useEditorStore();
  return (
    <Sheet open={fileTreeOpen} onOpenChange={setFileTreeOpen}>
      <SheetContent side="left" className="gap-0 p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Arquivos do projeto</SheetTitle>
          <SheetDescription>Escolha um arquivo para abrir no editor.</SheetDescription>
        </SheetHeader>
        <FileTreePanel className="pt-10" />
      </SheetContent>
    </Sheet>
  );
}
