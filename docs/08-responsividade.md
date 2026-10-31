# 08. Responsividade (mobile-first)

## 1. Regras rígidas

1. **Contrato de 360px:** nenhuma tela pode ter rolagem horizontal no `body`, em hipótese alguma. Se os botões não cabem, vão para um menu suspenso (DropdownMenu) ou Sheet.
2. **Altura da janela:** a casca do editor e da revisão usa `.h-viewport` (`100dvh`, com `100vh` como fallback) e `overflow-hidden` na raiz. Nunca `h-screen`. O cabeçalho fica travado e apenas o conteúdo interno de cada painel rola.
3. **Rolagem só dentro de painéis:** editor, PDF, árvore e chat têm `overflow-y-auto` próprio. Rolagem horizontal é permitida apenas dentro de um painel quando o usuário pede (zoom do PDF acima de 100%, bloco de código largo no chat).
4. **Mobile-first:** a classe sem prefixo é a do celular; `sm:`, `lg:` acrescentam.

## 2. Modos de layout

Definidos em `src/hooks/use-layout-mode.ts`:

| Modo | Condição | Árvore | Editor e PDF | IA |
| --- | --- | --- | --- | --- |
| `desktop` | `(min-width: 1024px) and (min-height: 501px)` | Coluna redimensionável | Colunas redimensionáveis | Painel flutuante |
| `mobile-landscape` | `(orientation: landscape) and (max-height: 500px)` | Sheet lateral | Duas colunas curtas | Sheet inferior |
| `mobile-portrait` | demais casos (inclui tablet em retrato) | Sheet lateral | Um por vez, abas Código e PDF | Sheet inferior |

A altura entra na condição do desktop porque um celular deitado tem mais de 1024px de largura em alguns modelos, mas só uns 400px de altura; três colunas ali seriam inutilizáveis.

Breakpoints do Tailwind usados: `xs` (360px, próprio), `sm` (640px), `lg` (1024px) e `landscape-short` (variante `raw` com a mesma media query do modo paisagem).

Cuidado com `xs`: ele já vale em 360px. Dentro de um diálogo, a largura útil é bem menor que a janela (em 360px sobram uns 300px depois das margens), então três botões com rótulo lado a lado a partir de `xs` transbordam. Para o que fica dentro de diálogo, use `sm`.

## 3. Código do layout

### 3.1 Casca (`src/features/editor/components/editor-shell.tsx`)

```tsx
export function EditorShell({ projectName }: { projectName: string }) {
  const layoutMode = useLayoutMode();

  return (
    <div className="flex h-viewport flex-col overflow-hidden bg-background">
      <EditorHeader projectName={projectName} layoutMode={layoutMode} />

      <main className="relative min-h-0 flex-1 overflow-hidden">
        {layoutMode === 'desktop' ? (
          <DesktopWorkspace />
        ) : (
          <MobileWorkspace orientation={layoutMode === 'mobile-landscape' ? 'landscape' : 'portrait'} />
        )}
      </main>

      {layoutMode !== 'desktop' && <FileTreeSheet />}
      <AiAssistantPanel layoutMode={layoutMode} />
    </div>
  );
}
```

Pontos que fazem funcionar: `h-viewport` fixa a altura visível; `min-h-0` no `main` permite que o filho flex encolha (sem ele, o conteúdo empurra a altura e o body rola); `overflow-hidden` contém tudo.

### 3.2 Desktop (`desktop-workspace.tsx`)

```tsx
export function DesktopWorkspace() {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: 'editor-desktop', storage: safeStorage });

  return (
    <ResizablePanelGroup orientation="horizontal" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}>
      <ResizablePanel id="files" defaultSize="18%" minSize="12%" maxSize="32%" collapsible collapsedSize="0%">
        <FileTreePanel />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="code" defaultSize="41%" minSize="25%">
        <CodeEditorPanel />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="pdf" defaultSize="41%" minSize="25%">
        <PdfPreviewPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
```

O layout escolhido pelo usuário é salvo no `localStorage` por um adaptador que ignora falhas (aba anônima, cota), porque é só conveniência.

### 3.3 Celular (`mobile-workspace.tsx`)

```tsx
export function MobileWorkspace({ orientation }: MobileWorkspaceProps) {
  const { activePane, setActivePane } = useEditorStore();

  if (orientation === 'landscape') {
    return (
      <div className="grid h-full min-h-0 grid-cols-2 divide-x">
        <div className="min-h-0 min-w-0"><CodeEditorPanel /></div>
        <div className="min-h-0 min-w-0"><PdfPreviewPanel /></div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneSwitcher value={activePane} onChange={setActivePane} />
      <div className="relative min-h-0 flex-1">
        <div className={cn('absolute inset-0', activePane !== 'code' && 'hidden')}><CodeEditorPanel /></div>
        <div className={cn('absolute inset-0', activePane !== 'pdf' && 'hidden')}><PdfPreviewPanel /></div>
      </div>
    </div>
  );
}
```

Os dois painéis ficam montados; o inativo recebe `hidden`. O Monaco usa `automaticLayout: true`, então recalcula o tamanho quando volta a aparecer.

### 3.4 Cabeçalho com transbordo (`editor-header.tsx`)

Sem medir nada em JavaScript: cada ação tem uma versão na barra e outra no menu "Mais", com classes opostas.

```tsx
<Button variant="outline" size="sm" className="hidden sm:inline-flex">Solicitar revisão</Button>
...
<DropdownMenuItem className="sm:hidden">Solicitar revisão</DropdownMenuItem>
```

| Ação | Na barra a partir de | No menu "Mais" abaixo de |
| --- | --- | --- |
| Arquivos (Sheet) | sempre fora do desktop | nunca |
| Voltar aos projetos | `sm` | `sm` |
| Compilar | sempre (só ícone abaixo de `sm`) | nunca |
| Solicitar revisão | `sm` | `sm` |
| Versões, Ver alterações | `lg` | `lg` |
| Assistente de IA | sempre (ícone) | nunca |

Em 360px a barra tem: Arquivos, título truncado, Compilar, IA e Mais.

## 4. Padrões que evitam transbordo

| Situação | Solução |
| --- | --- |
| Texto longo em linha flexível | `min-w-0` no item flex e `truncate` no texto |
| Grid com uma coluna e texto `truncate` | `grid-cols-1` (gera `minmax(0, 1fr)`). A coluna implícita `auto` cresce até o tamanho do texto e transborda |
| Menus Radix | `collisionPadding={8}` e `max-w-[calc(100vw-1rem)]` |
| Sheets laterais | `w-[85vw] max-w-sm` |
| Painel flutuante | `w-[min(420px,calc(100vw-2rem))]` e altura `min(640px, calc(100dvh - 6rem))` |
| Blocos de código no chat | `max-w-full overflow-x-auto` no `pre` |
| Páginas do PDF | largura proporcional ao painel; zoom acima de 100% rola dentro do painel |
| Áreas seguras (notch, barra de gestos) | `.pt-safe` no cabeçalho, `.pb-safe` no Sheet inferior e `viewport-fit=cover` no `index.html` |

O caso do grid foi encontrado pelo verificador automático: a lista de projetos chegava a 418px em uma tela de 360px.

### Formulário longo em modal: cabeçalho e rodapé fixos

O diálogo "Usar a minha própria IA" e o de importação são mais altos que a janela. Rolar o modal inteiro levaria junto o título e os botões. O desenho:

- `DialogContent` com `flex flex-col gap-0 overflow-hidden p-0`, altura `h-[calc(100dvh-1rem)]` no celular e `sm:h-auto sm:max-h-[88vh]` na janela larga (o `flex` substitui o `grid` padrão; o `p-0` passa o respiro para as faixas);
- `DialogHeader` com `shrink-0 border-b px-5 pb-4 pt-5` (e `pr-8` embutido, para o título não passar por baixo do botão de fechar);
- corpo com `flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-5 py-4`: a ÚNICA área que rola;
- `DialogFooter` com `shrink-0 border-t bg-background px-5 py-4`; no celular os botões empilham por `flex-col-reverse`, com a ação principal em cima;
- grupos de campos lado a lado (Provedor e Modelo) usam `grid grid-cols-1 sm:grid-cols-2`, e cada coluna tem `min-w-0`, senão um texto `truncate` estica o diálogo.

## 5. Teclado virtual e toque

- O Sheet da IA usa `85dvh`: quando o teclado abre, a altura dinâmica diminui e o compositor continua visível.
- A camada de desenho do revisor usa `touch-action: none` só sobre a página em modo desenho; fora dele, a rolagem por toque continua normal.
- Alvos de toque com pelo menos 36px (`size-9` nos botões de ícone).

## 6. Verificação automática

`npm run check:responsive` (`scripts/check-responsive.mjs`) sobe o build com `vite preview` e, com Playwright, abre `/`, `/login` e `/p/demo` em quatro viewports (360x740, 740x360, 768x1024, 1280x800). Falha se:

- `document.documentElement.scrollWidth` ou `document.body.scrollWidth` passar da largura da janela;
- a raiz `.h-viewport` do editor não tiver exatamente a altura da janela;
- o número de painéis visíveis não for o esperado (1 em retrato, 2 nos demais);
- o menu "Mais ações" sair da tela em 360px.

As capturas ficam em `dist-screenshots/` (ou em `SCREENSHOT_DIR`).
