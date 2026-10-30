# 04. Componentes e telas

## 1. Mapa de telas

| Rota | Página | Quem acessa | Estado |
| --- | --- | --- | --- |
| `/login` | `LoginPage` | Visitante | Implementada |
| `/` | `ProjectsPage` | Membro | Implementada (lista de exemplo) |
| `/p/:projectId` | `EditorPage` | Membro | Layout responsivo implementado |
| `/p/:projectId/reviews/:reviewId` | `ReviewPage` | Membro e revisor com grant | Esqueleto |
| `/invite/:token` | `InviteAcceptPage` | Revisor convidado | Planejada |
| `/reviews` | `MyReviewsPage` (consulta `collectionGroup('reviews')`) | Revisor | Planejada |

Todas as páginas são carregadas com `React.lazy` em `src/app/router.tsx`. O Monaco só é baixado quando o editor abre.

## 2. Componentização da tela principal (EditorPage)

### 2.1 Árvore de componentes

```
EditorPage                               pages/editor-page.tsx
└── EditorStoreProvider                  features/editor/state/editor-store.tsx
    └── EditorShell                      .h-viewport flex-col overflow-hidden
        ├── EditorHeader                 cabeçalho travado (h-header)
        │   ├── botão Arquivos           só fora do desktop, abre FileTreeSheet
        │   ├── título do projeto        min-w-0 flex-1 truncate
        │   ├── Compilar                 sempre visível (só ícone abaixo de sm)
        │   ├── Solicitar revisão        visível a partir de sm
        │   ├── Versões, Ver alterações  visíveis a partir de lg
        │   ├── Assistente de IA         botão alternável
        │   └── DropdownMenu "Mais"      recebe o que a largura escondeu
        ├── main
        │   ├── DesktopWorkspace         layoutMode = desktop
        │   │   └── ResizablePanelGroup  layout salvo em localStorage
        │   │       ├── FileTreePanel
        │   │       ├── CodeEditorPanel  Monaco
        │   │       └── PdfPreviewPanel
        │   └── MobileWorkspace          layoutMode = mobile-portrait | mobile-landscape
        │       ├── PaneSwitcher         abas Código | PDF (só em retrato)
        │       ├── CodeEditorPanel      montado sempre, oculto com `hidden`
        │       └── PdfPreviewPanel      montado sempre, oculto com `hidden`
        ├── FileTreeSheet                Sheet lateral (fora do desktop)
        └── AiAssistantPanel             painel flutuante (desktop) ou Sheet inferior (celular)
            └── AiChat
                ├── AiMessage            Markdown sanitizado, fontes, erros
                │   └── StructuredResultView
                └── AiComposer           seletor de tarefa, texto, enviar ou parar
```

### 2.2 Responsabilidades e dono de cada estado

| Componente | Responsabilidade | Estado que possui | Dados que lê |
| --- | --- | --- | --- |
| `EditorPage` | Ler `projectId` da rota e montar o provider | nenhum | parâmetros da rota |
| `EditorStoreProvider` | Estado de interface compartilhado | arquivo ativo, painel ativo no celular, Sheet de arquivos aberto, IA aberta | nenhum |
| `EditorShell` | Decidir o layout pelo `useLayoutMode()` | nenhum | media queries |
| `EditorHeader` | Ações do projeto com regra de transbordo | nenhum | store |
| `DesktopWorkspace` | Três colunas redimensionáveis | layout (pela biblioteca, persistido) | nenhum |
| `MobileWorkspace` | Um painel por vez ou duas colunas curtas | nenhum | store |
| `FileTreePanel` | Árvore indentada a partir dos caminhos | nenhum | `useProjectFiles` |
| `CodeEditorPanel` | Monaco com LaTeX e tema dos tokens | modelos do Monaco (por `path`) | `useProjectFiles`, store |
| `PdfPreviewPanel` | Páginas do PDF e zoom | zoom | (planejado) `useLatestBuild` |
| `AiAssistantPanel` | Conter o chat no formato certo para o layout | conversa (`useAiStream`) | store |

Regras que esta divisão garante:

- **O layout muda sem perder trabalho.** O Monaco usa a prop `path`, que mantém um modelo por arquivo no registro global do Monaco; trocar de desktop para celular remonta o componente, mas o texto, o desfazer e o cursor continuam.
- **No celular, o painel inativo não é desmontado**, só recebe `hidden`. O PDF mantém a rolagem e o editor mantém o foco ao alternar as abas.
- **A conversa de IA sobrevive ao fechar o painel**, porque `useAiStream` fica acima do condicional que esconde o painel.
- **Nenhum componente visual fala com o Firebase.** `useProjectFiles` e `useAiStream` são os únicos pontos de integração desta tela.

### 2.3 Comportamento por layout

| Elemento | Desktop (>= 1024px e altura > 500px) | Celular paisagem (altura <= 500px) | Celular retrato |
| --- | --- | --- | --- |
| Árvore de arquivos | Coluna redimensionável e recolhível | Sheet lateral | Sheet lateral |
| Editor e PDF | Colunas lado a lado redimensionáveis | Duas colunas curtas fixas | Um por vez, abas Código e PDF |
| Assistente de IA | Painel flutuante 420px no canto inferior direito | Sheet inferior 85dvh | Sheet inferior 85dvh |
| Ações do cabeçalho | Todas visíveis | Parte no menu "Mais" | Quase todas no menu "Mais" |

O código está em `src/features/editor/components/` e as regras completas em `08-responsividade.md`.

## 3. Tela de revisão (ReviewPage), planejada

```
ReviewPage
└── ReviewStoreProvider                  ferramenta ativa (selecionar, desenhar, pin), thread em foco
    └── ReviewShell                      .h-viewport, mesma casca do editor
        ├── ReviewHeader                 versão "1.0", status, "Ver alterações", aprovar ou pedir mudanças
        ├── ReviewToolbar                selecionar texto | desenhar | pin | cor (tokens annotation-*)
        ├── PdfViewer                    features/pdf-viewer (pdf.js)
        │   └── PdfPage (por página, virtualizada)
        │       ├── CanvasLayer          renderização da página
        │       ├── TextLayer            spans do pdf.js para seleção
        │       ├── HighlightLayer       retângulos das âncoras de texto
        │       ├── DrawingLayer         SVG dos traços (coordenadas normalizadas)
        │       └── PinLayer             marcadores flutuantes
        ├── SelectionPopover             "Adicionar comentário" sobre a seleção
        ├── ThreadSidebar (desktop)      lista de threads por página e status
        │   └── ThreadCard               comentários, resposta, resolver ou reabrir
        ├── ThreadSheet (celular)        a mesma lista em Sheet inferior
        └── DiffBar                      contadores e "próxima alteração" no modo diff
```

Pontos de atenção:

- **Coordenadas normalizadas:** tudo que é desenhado sobre a página usa valores de 0 a 1, então zoom e rotação não exigem recalcular nada no banco.
- **Seleção no celular:** o `SelectionPopover` aparece acima da seleção nativa e respeita `env(safe-area-inset-*)`.
- **Modo diff:** o `PdfViewer` recebe o PDF de diff no lugar do PDF do snapshot. Threads abertas da rodada anterior aparecem na lateral com a indicação "pendente".

## 4. Catálogo de componentes

### UI pura (`src/components/ui`)

| Componente | Base | Notas |
| --- | --- | --- |
| `Button` | Radix Slot + cva | Variantes `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`; tamanhos `sm`, `default`, `lg`, `icon` |
| `Sheet` | Radix Dialog | Lados `left`, `right`, `top`, `bottom`; `showClose` opcional; inferior respeita `pb-safe` |
| `DropdownMenu` | Radix DropdownMenu | `collisionPadding` e largura máxima de `100vw - 1rem` para caber em 360px |
| `Tabs` | Radix Tabs | Usado no `PaneSwitcher` |
| `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` | react-resizable-panels 4 | Área de arraste maior que a linha visível |
| `Textarea` | nativo | Compositor da IA |

### Genéricos (`src/components/common`)

| Componente | Notas |
| --- | --- |
| `MarkdownContent` | Único ponto com `dangerouslySetInnerHTML`; recebe Markdown, sanitiza com DOMPurify |

### Domínio (`src/features/*/components`)

| Feature | Componentes |
| --- | --- |
| `editor` | `EditorShell`, `EditorHeader`, `DesktopWorkspace`, `MobileWorkspace`, `PaneSwitcher`, `FileTreePanel`, `FileTreeSheet`, `CodeEditorPanel` |
| `pdf-viewer` | `PdfPreviewPanel` (planejado: `PdfViewer`, `PdfPage` e camadas) |
| `ai-assistant` | `AiAssistantPanel`, `AiMessage`, `AiComposer`, `StructuredResultView` |
| `auth` | `AuthProvider` |
| `review` (planejado) | `ReviewShell`, `ReviewToolbar`, `SelectionPopover`, `ThreadSidebar`, `ThreadSheet`, `ThreadCard`, `CommentComposer` |
| `snapshots` (planejado) | `VersionHistorySheet`, `RequestReviewDialog` |
| `diff` (planejado) | `DiffBar`, `DiffStatusBadge` |
