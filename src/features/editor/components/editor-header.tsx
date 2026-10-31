import {
  ArrowLeft,
  Download,
  FolderTree,
  GitCompare,
  History,
  MoreVertical,
  Play,
  Send,
  Settings,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { LayoutMode } from '@/hooks/use-layout-mode';
import { useExportProject } from '../hooks/use-export-project';
import { useEditorStore } from '../state/editor-store';

interface EditorHeaderProps {
  projectName: string;
  layoutMode: LayoutMode;
}

/**
 * Cabeçalho travado do editor. Regra de 360px: ações que não cabem somem
 * da barra (classes `hidden sm:inline-flex`) e aparecem no menu "Mais"
 * (itens com `sm:hidden`), sem medir nada em JavaScript.
 */
export function EditorHeader({ projectName, layoutMode }: EditorHeaderProps) {
  const { aiOpen, setAiOpen, setFileTreeOpen, setImportOpen } = useEditorStore();
  const { exportProject } = useExportProject();
  const isDesktop = layoutMode === 'desktop';

  return (
    <header className="flex h-header shrink-0 items-center gap-1 border-b bg-background px-2 pt-safe">
      {!isDesktop && (
        <Button variant="ghost" size="icon" aria-label="Abrir arquivos" onClick={() => setFileTreeOpen(true)}>
          <FolderTree />
        </Button>
      )}
      <Button variant="ghost" size="icon" asChild className="hidden sm:inline-flex">
        <Link href="/" aria-label="Voltar aos projetos">
          <ArrowLeft />
        </Link>
      </Button>

      <h1 className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{projectName}</h1>

      <Button size="sm" className="px-2 sm:px-3" aria-label="Compilar">
        <Play />
        <span className="hidden sm:inline">Compilar</span>
      </Button>
      <Button variant="outline" size="sm" className="hidden sm:inline-flex">
        <Send />
        Solicitar revisão
      </Button>
      <Button variant="ghost" size="sm" className="hidden lg:inline-flex">
        <History />
        Versões
      </Button>
      <Button variant="ghost" size="sm" className="hidden lg:inline-flex">
        <GitCompare />
        Ver alterações
      </Button>
      <Button
        variant={aiOpen ? 'secondary' : 'ghost'}
        size="icon"
        aria-label="Assistente de IA"
        aria-pressed={aiOpen}
        onClick={() => setAiOpen(!aiOpen)}
      >
        <Sparkles />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Mais ações">
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Projeto</DropdownMenuLabel>
          <DropdownMenuItem className="sm:hidden">
            <Send />
            Solicitar revisão
          </DropdownMenuItem>
          <DropdownMenuItem className="lg:hidden">
            <History />
            Versões
          </DropdownMenuItem>
          <DropdownMenuItem className="lg:hidden">
            <GitCompare />
            Ver alterações
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="sm:hidden">
            <Link href="/">
              <ArrowLeft />
              Voltar aos projetos
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setImportOpen(true)}>
            <Upload />
            Importar .zip, arquivos ou pasta
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportProject()}>
            <Download />
            Exportar projeto (.zip)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Settings />
            Configurações do projeto
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
