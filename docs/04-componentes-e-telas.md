# 04. Componentes e telas

## 1. Mapa de telas

| Rota | Página | Quem acessa | Estado |
| --- | --- | --- | --- |
| `/login` | `LoginPage` | Visitante | Implementada: Google, e-mail e senha, criar conta, volta para `?next=` |
| `/login` (link de acesso) | `LoginPage` | Quem abriu o link enviado por e-mail | Implementada: confirma o e-mail e conclui a entrada sem senha (convite de revisão, coautor ou "Receber link de acesso por e-mail") |
| `/` | `ProjectsPage` | Usuário com sessão | Implementada: projetos de que é membro, em tempo real, "Novo projeto" e "Revisões para você" (consulta `collectionGroup('reviews')` pelo e-mail verificado) |
| `/p/:projectId` | `EditorPage` | Membro; convidado com e-mail verificado | Implementada: layout responsivo, salvamento automático, diálogos do cabeçalho, aceite de convite de coautoria, aviso de projeto inexistente ou sem acesso |
| `/p/:projectId/reviews/:reviewId` | `ReviewPage` | Membro (autor) e revisor com grant | Implementada: PDF da versão, pins numerados, threads, aprovar ou pedir alterações, "Ver alterações" desde a rodada anterior |

Todas as páginas são carregadas com `React.lazy` em `src/app/router.tsx`. O Monaco só é baixado quando o editor abre.

`/`, `/p/:projectId` e a revisão passam por `RequireAuth`: sem sessão (com o Firebase configurado), vão para `/login?next=<rota>` e voltam depois do login. No modo demonstração, entram direto e a lista mostra o projeto de exemplo; versões, revisões e membros mostram um aviso de que exigem o Firebase.

## 2. Componentização da tela principal (EditorPage)

### 2.1 Árvore de componentes

```
EditorPage                               pages/editor-page.tsx (papel, convite pendente, nome na lista de membros)
└── EditorStoreProvider                  features/editor/state/editor-store.tsx (papel e diálogo aberto)
    ├── EditorDialogs                    na própria página: junta snapshots, diff, review e projects
    │   ├── VersionHistorySheet          abas Versões (congelar, PDF, comparar, .zip) e Revisões (ProjectReviewQueue)
    │   ├── ChangesDialog                código de uma versão contra outra ou contra o rascunho
    │   ├── RequestReviewDialog          congela se mudou, abre a revisão e envia o link de acesso
    │   └── ProjectSettingsDialog        nome, descrição, membros e convites de coautoria
    └── EditorShell                      .h-viewport flex-col overflow-hidden
      └── CompileStoreProvider           estado da compilação; Ctrl+S e Ctrl+Enter compilam
        ├── EditorHeader                 cabeçalho travado (h-header)
        │   ├── botão Arquivos           só fora do desktop, abre FileTreeSheet
        │   ├── título do projeto        min-w-0 flex-1 truncate
        │   ├── Compilar                 sempre visível (só ícone abaixo de sm); vira Compilando com indicador
        │   ├── Solicitar revisão        visível a partir de sm (só dono e editores)
        │   ├── Versões, Ver alterações  visíveis a partir de lg; abrem os diálogos pelo store (openDialog)
        │   ├── Assistente de IA         botão alternável
        │   └── DropdownMenu "Mais"      o que a largura escondeu, Importar, Exportar (.zip) e Configurações do projeto
        ├── main
        │   ├── DesktopWorkspace         layoutMode = desktop
        │   │   └── ResizablePanelGroup  layout salvo em localStorage
        │   │       ├── FileTreePanel    Novo arquivo, Importar e Exportar (.zip) na barra; menu por arquivo (renomear, excluir)
        │   │       ├── CodeEditorPanel  Monaco (somente leitura para quem só lê)
        │   │       └── PdfPane          liga o PdfPreviewPanel ao estado da compilação
        │   └── MobileWorkspace          layoutMode = mobile-portrait | mobile-landscape
        │       ├── PaneSwitcher         abas Código | PDF (só em retrato)
        │       ├── CodeEditorPanel      montado sempre, oculto com `hidden`
        │       └── PdfPane              montado sempre, oculto com `hidden`; compilar com sucesso mostra o PDF
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
| `EditorPage` | Ler `projectId` da rota, decidir o papel (ou mostrar o convite) e montar o provider e os diálogos | aceite de convite em andamento | `useProject`, `useAuth` |
| `EditorStoreProvider` | Estado de interface compartilhado | projeto, papel, arquivo ativo, painel ativo no celular, Sheet de arquivos, IA, importação e o diálogo do cabeçalho aberto | nenhum |
| `EditorShell` | Decidir o layout pelo `useLayoutMode()` | nenhum | media queries |
| `EditorHeader` | Ações do projeto com regra de transbordo | nenhum | store |
| `DesktopWorkspace` | Três colunas redimensionáveis | layout (pela biblioteca, persistido) | nenhum |
| `MobileWorkspace` | Um painel por vez ou duas colunas curtas | nenhum | store |
| `FileTreePanel` | Árvore indentada a partir dos caminhos, com criar, renomear e excluir | ação de arquivo aberta | `useProjectFiles`, `useFileActions` (via `FileActionsDialogs`) |
| `CodeEditorPanel` | Monaco com LaTeX e tema dos tokens | modelos do Monaco (por `path`) | `useProjectFiles`, store |
| `CompileStoreProvider` | Compilar o projeto e guardar o resultado | compilando, etapa, último PDF bom, último resultado | `useLatexCompile` |
| `PdfPane` | Passar estado e ações da compilação ao visualizador | nenhum | `useCompileStore`, `useProjectFiles` |
| `PdfPreviewPanel` | Páginas do PDF (pdf.js), zoom, download, andamento e lista de erros com arquivo e linha | zoom, lista aberta | props |
| `AiAssistantPanel` | Conter o chat no formato certo para o layout | conversa (`useAiStream`), diálogo de configuração aberto | `useAiConfig`; `files`, `open` e `onOpenChange` vêm do `EditorShell` por props |
| `AiSettingsDialog` | Editar e validar a fila de modelos | rascunho da fila, erros por item | `useAiConfig` |
| `ImportDialog` | Ler a origem, montar e aplicar o plano de importação | origem lida, destino, política de conflito | `useProjectFiles`, `useProjectArchive` |

Regras que esta divisão garante:

- **O layout muda sem perder trabalho.** O Monaco usa a prop `path`, que mantém um modelo por arquivo no registro global do Monaco; trocar de desktop para celular remonta o componente, mas o texto, o desfazer e o cursor continuam.
- **No celular, o painel inativo não é desmontado**, só recebe `hidden`. O PDF mantém a rolagem e o editor mantém o foco ao alternar as abas.
- **A conversa de IA sobrevive ao fechar o painel**, porque `useAiStream` fica acima do condicional que esconde o painel.
- **Nenhum componente visual fala com o Firebase.** Os hooks de cada feature (`useProjectFiles`, `useFreezeSnapshot`, `useRequestReview`, `useAiStream`...) são os pontos de integração. Componentes não chamam hooks de outra feature: quem junta várias features é a página (`EditorDialogs` em `editor-page.tsx`) ou um slot por props (a aba Revisões do `VersionHistorySheet`).

### 2.3 Comportamento por layout

| Elemento | Desktop (>= 1024px e altura > 500px) | Celular paisagem (altura <= 500px) | Celular retrato |
| --- | --- | --- | --- |
| Árvore de arquivos | Coluna redimensionável e recolhível | Sheet lateral | Sheet lateral |
| Editor e PDF | Colunas lado a lado redimensionáveis | Duas colunas curtas fixas | Um por vez, abas Código e PDF |
| Assistente de IA | Painel flutuante 420px no canto inferior direito | Sheet inferior 85dvh | Sheet inferior 85dvh |
| Ações do cabeçalho | Todas visíveis | Parte no menu "Mais" | Quase todas no menu "Mais" |

O código está em `src/features/editor/components/` e as regras completas em `08-responsividade.md`.

## 3. Tela de revisão (ReviewPage)

```
ReviewPage                               pages/review-page.tsx: membro entra como autor, quem não é membro como revisor
└── ReviewWorkspace                      .h-viewport, mesma casca do editor
    ├── ReviewHeader                     "#1 título", versão, status; Comentar; aprovar, pedir alterações, encerrar ou reabrir
    ├── PdfDocumentView                  features/pdf-viewer (pdf.js), zoom e download
    │   └── PinLayer (por página)        pins numerados em coordenadas 0 a 1; no modo Comentar, o clique posiciona o pin
    ├── ThreadList                       lateral de 24rem (desktop) ou Sheet inferior (celular, botão "Comentários (N)")
    │   ├── CommentComposer              comentário novo no ponto escolhido
    │   └── ThreadCard                   comentários (Markdown sanitizado), responder, resolver ou reabrir
    └── ReviewChangesDialog              "Ver alterações": texto das páginas da versão anterior contra a atual
```

Pontos de atenção:

- **Coordenadas normalizadas:** os pins usam valores de 0 a 1, então zoom e tamanho de tela não exigem recalcular nada no banco.
- **Primeira abertura do revisor:** grava `reviewerUid`, `reviewerName` e `status: in_review` (as regras só aceitam esses campos do revisor).
- **Quem não pode ver:** sem e-mail verificado (conta de e-mail e senha) ou com outro e-mail, a página explica e oferece "Entrar com outra conta".
- **Ainda não implementado:** seleção de texto com âncora (`TextAnchor`), desenho livre nos pins e o diff visual em PDF; ver `10-manutencao-e-granularidade.md`.

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
| `editor` | `EditorShell`, `EditorHeader`, `DesktopWorkspace`, `MobileWorkspace`, `PaneSwitcher`, `FileTreePanel`, `FileTreeSheet`, `FileActionsDialogs`, `FileNameDialog`, `CodeEditorPanel`, `PdfPane`, `ImportDialog` |
| `pdf-viewer` | `PdfPreviewPanel` (compilação), `PdfDocumentView` (PDF pronto, com zoom e download), `PdfPages` (pdf.js, páginas desenhadas perto da área visível, camada por página via `renderOverlay`) |
| `ai-assistant` | `AiAssistantPanel`, `AiSettingsDialog`, `ModelEntryCard`, `AiMessage`, `AiComposer`, `StructuredResultView` |
| `auth` | `AuthProvider`, `RequireAuth` |
| `projects` | `ProjectList`, `DemoProjectList`, `NewProjectDialog`, `ProjectSettingsDialog` |
| `snapshots` | `VersionHistorySheet`, `FreezeVersionForm`, `VersionCard`, `VersionPdfDialog`, `IssueList` |
| `review` | `ReviewWorkspace`, `ReviewHeader`, `PinLayer`, `ThreadList`, `ThreadCard`, `CommentComposer`, `ReviewChangesDialog`, `RequestReviewDialog`, `ReviewList`, `ProjectReviewQueue`, `MyReviewsSection`; planejado: `SelectionPopover` e a camada de desenho |
| `diff` | `ChangesDialog`, `FileChangeCard`, `DiffView` (texto com `<ins>` e `<del>`, linhas sem mudança recolhidas); planejado: `DiffBar` do diff visual em PDF |

### Hooks de integração

| Hook | Feature | O que faz |
| --- | --- | --- |
| `useProjects` | projects | Projetos do usuário em tempo real (`memberIds array-contains uid`, `updatedAt desc`) |
| `useCreateProject` | projects | Cria o projeto (dono), o documento principal e o `main.tex` (ids fixos `main`) |
| `useProject` | projects | Projeto aberto (nome, membros, convites, `memberProfiles`); nulo quando não existe ou a conta não pode vê-lo |
| `useProjectMembers` | projects | Detalhes, convidar, cancelar convite, mudar papel, remover membro, aceitar convite e gravar o próprio nome na lista |
| `useProjectFiles` | editor | Arquivos do projeto em tempo real (ou de demonstração) |
| `useFileAutosave` | editor | Salva o texto 800 ms depois da última tecla e mostra Salvando, Salvo ou o erro |
| `useProjectSources` | editor | Junta o projeto como está na tela: texto do Monaco (ou do cache), binários dos arquivos em pedaços e o arquivo principal |
| `useLatexCompile` | editor | Compila com o Siglum o que `useProjectSources` juntou |
| `useFileActions` | editor | Criar, renomear (levando o texto da tela) e excluir arquivos do rascunho |
| `useSnapshots` | snapshots | Versões do projeto em tempo real, da mais nova para a mais antiga |
| `useFreezeSnapshot` | snapshots | Congela a versão: blobs, compilação, PDF e texto por página em pedaços, snapshot e contador num lote |
| `useSnapshotFiles` | snapshots | Lê o código (blobs, com cache por hash), o PDF e o texto por página de uma versão |
| `useTreeChanges`, `useVersionComparison` | diff | Compara o código de duas versões, ou de uma versão com o rascunho, palavra por palavra |
| `useRequestReview` | review | Congela se o código mudou, abre a revisão (grant, revisão e contador num lote) e envia o link de acesso ao revisor |
| `useReview`, `useReviews`, `useMyReviews` | review | Uma revisão, a fila do projeto e as revisões pedidas ao e-mail da conta |
| `useThreads`, `useComments` | review | Threads da revisão (na ordem de leitura do PDF) e comentários de cada uma, em tempo real |
| `useReviewActions` | review | Pin novo com o primeiro comentário, resposta com o contador, status da thread e da revisão |
| `useReviewPdf`, `usePageTextDiff` | review | PDF da versão em revisão e o diff do texto das páginas desde a rodada anterior |
| `useProjectArchive` | editor | Exporta o .zip e aplica o plano de importação (Firestore, com binários em pedaços, ou cache no modo demonstração) |
| `useExportProject` | editor | Exportação do projeto aberto, usada pela árvore e pelo menu |
| `useAiConfig` | ai-assistant | Configuração da IA na conta (`users/{uid}/private/ai`) ou no navegador |
| `useAiStream` | ai-assistant | Conversa com a fila de modelos, deltas por quadro, troca de modelo |
| `useProviderModels` | ai-assistant | Lista de modelos ao vivo do provedor, com catálogo de reserva |
| `useAuth` | auth | Sessão e login |
