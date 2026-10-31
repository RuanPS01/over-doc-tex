# 04. Componentes e telas

## 1. Mapa de telas

| Rota | Página | Quem acessa | Estado |
| --- | --- | --- | --- |
| `/login` | `LoginPage` | Visitante | Implementada: Google, e-mail e senha, criar conta, volta para `?next=` |
| `/` | `ProjectsPage` | Usuário com sessão | Implementada: projetos de que é membro, em tempo real, e "Novo projeto" |
| `/p/:projectId` | `EditorPage` | Membro | Implementada: layout responsivo, salvamento automático, aviso de projeto inexistente ou sem acesso |
| `/p/:projectId/reviews/:reviewId` | `ReviewPage` | Membro e revisor com grant | Esqueleto |
| `/invite/:token` | `InviteAcceptPage` | Revisor convidado | Planejada |
| `/reviews` | `MyReviewsPage` (consulta `collectionGroup('reviews')`) | Revisor | Planejada |

Todas as páginas são carregadas com `React.lazy` em `src/app/router.tsx`. O Monaco só é baixado quando o editor abre.

`/`, `/p/:projectId` e a revisão passam por `RequireAuth`: sem sessão (com o Firebase configurado), vão para `/login?next=<rota>` e voltam depois do login. No modo demonstração, entram direto e a lista mostra o projeto de exemplo.

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
        │   └── DropdownMenu "Mais"      o que a largura escondeu, mais Importar e Exportar (.zip)
        ├── main
        │   ├── DesktopWorkspace         layoutMode = desktop
        │   │   └── ResizablePanelGroup  layout salvo em localStorage
        │   │       ├── FileTreePanel    com Importar e Exportar (.zip) na barra
        │   │       ├── CodeEditorPanel  Monaco
        │   │       └── PdfPreviewPanel
        │   └── MobileWorkspace          layoutMode = mobile-portrait | mobile-landscape
        │       ├── PaneSwitcher         abas Código | PDF (só em retrato)
        │       ├── CodeEditorPanel      montado sempre, oculto com `hidden`
        │       └── PdfPreviewPanel      montado sempre, oculto com `hidden`
        ├── FileTreeSheet                Sheet lateral (fora do desktop)
        ├── ImportDialog                 .zip, arquivos ou pasta; destino e política de conflito
        └── AiAssistantPanel             painel flutuante (desktop) ou Sheet inferior (celular)
            ├── AiChat
            │   ├── estado vazio         "Configurar a minha IA" quando não há modelo
            │   ├── AiMessage            Markdown sanitizado, fontes, modelo que respondeu, erros
            │   │   └── StructuredResultView
            │   └── AiComposer           seletor de tarefa, texto, enviar ou parar
            └── AiSettingsDialog         "Usar a minha própria IA"
                └── ModelEntryCard       provedor, modelo (lista ao vivo) e chave, por item da fila
```

### 2.2 Responsabilidades e dono de cada estado

| Componente | Responsabilidade | Estado que possui | Dados que lê |
| --- | --- | --- | --- |
| `EditorPage` | Ler `projectId` da rota e montar o provider | nenhum | parâmetros da rota |
| `EditorStoreProvider` | Estado de interface compartilhado | projeto, arquivo ativo, painel ativo no celular, Sheet de arquivos, IA e importação abertas | nenhum |
| `EditorShell` | Decidir o layout pelo `useLayoutMode()` | nenhum | media queries |
| `EditorHeader` | Ações do projeto com regra de transbordo | nenhum | store |
| `DesktopWorkspace` | Três colunas redimensionáveis | layout (pela biblioteca, persistido) | nenhum |
| `MobileWorkspace` | Um painel por vez ou duas colunas curtas | nenhum | store |
| `FileTreePanel` | Árvore indentada a partir dos caminhos | nenhum | `useProjectFiles` |
| `CodeEditorPanel` | Monaco com LaTeX e tema dos tokens | modelos do Monaco (por `path`) | `useProjectFiles`, store |
| `PdfPreviewPanel` | Páginas do PDF e zoom | zoom | (planejado) `useLatestBuild` |
| `AiAssistantPanel` | Conter o chat no formato certo para o layout | conversa (`useAiStream`), diálogo de configuração aberto | `useAiConfig`; `files`, `open` e `onOpenChange` vêm do `EditorShell` por props |
| `AiSettingsDialog` | Editar e validar a fila de modelos | rascunho da fila, erros por item | `useAiConfig` |
| `ImportDialog` | Ler a origem, montar e aplicar o plano de importação | origem lida, destino, política de conflito | `useProjectFiles`, `useProjectArchive` |

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
| `Input` | nativo | Chaves de API, nomes de pasta, login |
| `Dialog` | Radix Dialog | Largura e altura limitadas à janela; título com `pr-8` para o botão de fechar; rodapé empilha no celular |
| `Select` | Radix Select | Lista em `popper` com a largura do gatilho; item marcado com fundo primário e ícone de check |

### Genéricos (`src/components/common`)

| Componente | Notas |
| --- | --- |
| `MarkdownContent` | Único ponto com `dangerouslySetInnerHTML`; recebe Markdown, sanitiza com DOMPurify |
| `FullPageStatus` | Tela inteira de espera, aviso ou erro (abrindo sessão, abrindo projeto, projeto não encontrado) |

### Domínio (`src/features/*/components`)

| Feature | Componentes |
| --- | --- |
| `editor` | `EditorShell`, `EditorHeader`, `DesktopWorkspace`, `MobileWorkspace`, `PaneSwitcher`, `FileTreePanel`, `FileTreeSheet`, `CodeEditorPanel`, `ImportDialog` |
| `pdf-viewer` | `PdfPreviewPanel` (planejado: `PdfViewer`, `PdfPage` e camadas) |
| `ai-assistant` | `AiAssistantPanel`, `AiSettingsDialog`, `ModelEntryCard`, `AiMessage`, `AiComposer`, `StructuredResultView` |
| `auth` | `AuthProvider`, `RequireAuth` |
| `projects` | `ProjectList`, `DemoProjectList`, `NewProjectDialog` |
| `review` (planejado) | `ReviewShell`, `ReviewToolbar`, `SelectionPopover`, `ThreadSidebar`, `ThreadSheet`, `ThreadCard`, `CommentComposer` |
| `snapshots` (planejado) | `VersionHistorySheet`, `RequestReviewDialog` |
| `diff` (planejado) | `DiffBar`, `DiffStatusBadge` |

### Hooks de integração

| Hook | Feature | O que faz |
| --- | --- | --- |
| `useProjects` | projects | Projetos do usuário em tempo real (`memberIds array-contains uid`, `updatedAt desc`) |
| `useCreateProject` | projects | Cria o projeto (dono), o documento principal e o `main.tex` (ids fixos `main`) |
| `useProject` | projects | Projeto aberto no editor; nulo quando não existe ou a conta não é membro |
| `useProjectFiles` | editor | Arquivos do projeto em tempo real (ou de demonstração) |
| `useFileAutosave` | editor | Salva o texto 800 ms depois da última tecla e mostra Salvando, Salvo ou o erro |
| `useProjectArchive` | editor | Exporta o .zip e aplica o plano de importação (Firestore, com binários em pedaços, ou cache no modo demonstração) |
| `useExportProject` | editor | Exportação do projeto aberto, usada pela árvore e pelo menu |
| `useAiConfig` | ai-assistant | Configuração da IA na conta (`users/{uid}/private/ai`) ou no navegador |
| `useAiStream` | ai-assistant | Conversa com a fila de modelos, deltas por quadro, troca de modelo |
| `useProviderModels` | ai-assistant | Lista de modelos ao vivo do provedor, com catálogo de reserva |
| `useAuth` | auth | Sessão e login |
