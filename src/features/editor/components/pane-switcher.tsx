import { Code2, FileText } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT } from '@/hooks/use-t';
import type { EditorPane } from '../state/editor-store';

interface PaneSwitcherProps {
  value: EditorPane;
  onChange: (pane: EditorPane) => void;
}

/** Alternância Código/PDF do celular em retrato. Ocupa a largura toda: nunca transborda. */
export function PaneSwitcher({ value, onChange }: PaneSwitcherProps) {
  const { t } = useT();
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as EditorPane)} className="shrink-0 border-b px-2 py-1.5">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="code">
          <Code2 />
          {t('Código')}
        </TabsTrigger>
        <TabsTrigger value="pdf">
          <FileText />
          PDF
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
