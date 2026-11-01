# 04. Componentes e telas

## 1. Mapa de telas

| Rota | Página | Quem acessa | Estado |
| --- | --- | --- | --- |
| `/login` | `LoginPage` | Visitante | Implementada: Google, e-mail e senha, criar conta, "Esqueci a senha" (link do Firebase para criar uma senha nova), volta para `?next=` |
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
    │   ├── ChangesDialog                abas Código (diff por palavra) e PDF marcado (DiffPdfViewer)
    │   ├── RequestReviewDialog          acesso (e-mails ou link), documentos concedidos, congela se mudou, abre a revisão, gera o diff em PDF e envia o link
    │   └── ProjectSettingsDialog        nome, descrição, documentos (ProjectDocumentsSection), membros e convites
    └── EditorShell                      .h-viewport flex-col overflow-hidden
      └── CompileStoreProvider           estado da compilação; Ctrl+S e Ctrl+Enter compilam
        ├── EditorHeader                 cabeçalho travado (h-header)
        │   ├── botão Arquivos           só fora do desktop, abre FileTreeSheet
        │   ├── título do projeto        min-w-0 flex-1 truncate
        │   ├── Compilar                 sempre visível (só ícone abaixo de sm); vira Compilando com indicador
        │   ├── Solicitar revisão        visível a partir de sm (só dono e editores)
        │   ├── Versões, Ver alterações  visíveis a partir de lg; abrem os diálogos pelo store (openDialog)
        │   ├── Assistente de IA         botão alternável
        │   ├── ThemeMenu                tema claro, escuro ou do sistema (a partir de sm; no celular, dentro de "Mais")
        │   ├── NotificationBell         notificações da conta (a partir de 360px)
        │   └── DropdownMenu "Mais"      o que a largura escondeu, Importar, Exportar (.zip), Configurações do projeto, Configurações de IA e, no celular, Tema
        ├── main
        │   ├── DesktopWorkspace         layoutMode = desktop
        │   │   └── ResizablePanelGroup  layout salvo em localStorage
        │   │       ├── FileTreePanel    Novo arquivo, Importar, Exportar (.zip) e Ordenar na barra; pastas recolhíveis; menu por arquivo (renomear, excluir)
        │   │       ├── CodeEditorPanel  Monaco (somente leitura para quem só lê); "Mostrar no PDF" (SyncTeX)
        │   │       └── PdfPane          liga o PdfPreviewPanel ao estado da compilação; duplo clique leva ao código
        │   └── MobileWorkspace          layoutMode = mobile-portrait | mobile-landscape
        │       ├── PaneSwitcher         abas Código | PDF (só em retrato)
        │       ├── CodeEditorPanel      montado sempre, oculto com `hidden`
        │       └── PdfPane              montado sempre, oculto com `hidden`; compilar com sucesso mostra o PDF
        ├── FileTreeSheet                Sheet lateral (fora do desktop)
        ├── ImportDialog                 .zip, arquivos ou pasta; destino e política de conflito
        └── AiAssistantPanel             janela encaixada no rodapé ou solta (desktop) ou Sheet inferior (celular)
            ├── AiChat
            │   ├── estado vazio         "Configurar a minha IA" quando não há modelo
            │   ├── AiMessage            Markdown sanitizado, fontes, modelo que respondeu, erros
            │   │   └── StructuredResultView
            │   └── AiComposer           seletor de tarefa, texto, enviar ou parar
            └── AiSettingsDialog         "Usar a minha própria IA"
                └── ModelEntryCard       provedor, modelo (lista do provedor) e chave, por item da fila; botão Testar modelo
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
| `FileTreePanel` | Árvore a partir dos caminhos, com criar, renomear e excluir. Pastas começam recolhidas e mostram quantos arquivos têm; o menu "Ordenar e organizar" escolhe a ordem (nome de A a Z ou de Z a A, tipo pela extensão, modificados por último, tamanho), "Pastas no topo" (ligado por padrão; desligado, pastas e arquivos entram na mesma ordenação) e abre ou recolhe todas. Ordem e pastas no topo valem para todos os projetos; as pastas abertas, por projeto (ambas no localStorage deste navegador). Abrir um arquivo dentro de uma pasta recolhida (arquivo novo, SyncTeX, "Abrir no código") abre as pastas até ele. Lógica pura em `model/file-tree.ts` | ação de arquivo aberta | `useProjectFiles`, `useFileTreeView`, `useFileActions` (via `FileActionsDialogs`) |
| `CodeEditorPanel` | Monaco com LaTeX e tema dos tokens | modelos do Monaco (por `path`) | `useProjectFiles`, store |
| `CompileStoreProvider` | Compilar o projeto e guardar o resultado | compilando, etapa, último PDF bom, último resultado | `useLatexCompile` |
| `PdfPane` | Passar estado e ações da compilação ao visualizador | nenhum | `useCompileStore`, `useProjectFiles` |
| `PdfPreviewPanel` | Páginas do PDF (pdf.js), zoom, download, andamento e lista de erros com arquivo e linha | zoom, lista aberta | props |
| `AiAssistantPanel` | Conter o chat no formato certo para o layout. No desktop é uma janela: encaixada no rodapé à direita (padrão), à esquerda ou no meio, sempre com o mesmo tamanho (até 420 x 640) e em exibição compacta (cabeçalho de 36px, menos espaço, campo de mensagem de uma linha); ou solta, arrastada pelo título, sem sair da tela nem subir sobre o cabeçalho. O botão de encaixe do cabeçalho escolhe a posição ou "Janela solta" (também pelo teclado). Posição lembrada neste navegador (`overdoctex.ai-window`); lógica pura em `model/assistant-window.ts` | conversa (`useAiStream`), diálogo de configuração aberto, posição da janela (`useAssistantWindow`) | `useAiConfig`; `files`, `open` e `onOpenChange` vêm do `EditorShell` por props |
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
| Assistente de IA | Janela de 420px encaixada no rodapé (direita, esquerda ou meio) ou solta e arrastável | Sheet inferior 85dvh | Sheet inferior 85dvh |
| Ações do cabeçalho | Todas visíveis | Parte no menu "Mais" | Quase todas no menu "Mais" |

O código está em `src/features/editor/components/` e as regras completas em `08-responsividade.md`.

## 3. Tela de revisão (ReviewPage)

```
ReviewPage                               pages/review-page.tsx: membro entra como autor, quem não é membro como revisor
└── ReviewWorkspace                      .h-viewport, mesma casca do editor
    ├── ReviewHeader                     "#1 título", versão, status; aprovar, pedir alterações, encerrar ou reabrir; Envio (dono e editores); nome do visitante; ThemeMenu; NotificationBell
    ├── PdfDocumentView                  features/pdf-viewer (pdf.js) com a camada de texto ligada, zoom e download
    │   ├── título                       seletor de documento quando a revisão concede mais de um
    │   ├── ferramentas                  Selecionar texto | Ponto | Desenhar (na barra do PDF)
    │   └── AnnotationLayer (por página) destaques dos trechos, desenhos em SVG, pins numerados e a marcação pendente
    ├── SelectionPopover                 "Comentar trecho" logo abaixo da seleção de texto
    ├── ThreadList                       lateral de 24rem (desktop) ou Sheet inferior (celular)
    │   ├── PendingAnnotationPanel       comentário da marcação nova (citação do trecho; cor e desfazer traço no desenho)
    │   └── ThreadCard                   citação, "Rodada anterior" (conversa da thread de origem), comentários, responder,
    │                                    resolver ou reabrir, "Abrir no código" (autor), aviso de "Desatualizada"
    └── ReviewChangesDialog              abas "PDF marcado" (DiffPdfViewer) e "Texto" (DiffView do texto das páginas)
```

Pontos de atenção:

- **Coordenadas normalizadas:** destaques, traços e pins usam valores de 0 a 1, então zoom e tamanho de tela não exigem recalcular nada no banco. Os traços são SVG com `vector-effect: non-scaling-stroke`.
- **Camadas:** canvas, camada de texto do pdf.js (spans transparentes) e `AnnotationLayer` por cima. Em "Selecionar texto" a camada de anotação deixa o ponteiro passar (`pointer-events: none`), menos nos pins; em "Desenhar" ela captura o ponteiro com `touch-action: none` só sobre a página.
- **Comentário em trecho:** a âncora junta os retângulos da seleção (por linha), a citação com 32 caracteres de contexto e a posição no texto da página (o mesmo `.pages` da versão).
- **Linha do código:** ao criar a thread, o SyncTeX da versão (`.synctex`) dá `sourceHint`; o autor usa "Abrir no código", que abre o editor em `/p/{id}?arquivo=...&linha=...`.
- **Primeira abertura do revisor:** grava `reviewerUid`, `reviewerName` e `status: in_review` (as regras só aceitam esses campos do revisor) e notifica o autor.
- **Quem não pode ver:** sem e-mail verificado (conta de e-mail e senha) ou com outro e-mail, a página explica e oferece "Entrar com outra conta".
- **Entrada pelo link (`GuestReviewGate`):** sem conta, pede o nome e oferece "Entrar ou criar conta" (login com volta ao link); com a conta aberta e sem convite, grava a ficha com a conta e mostra a revisão sem pedir nome, com o cabeçalho normal.

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
| `ThemeMenu`, `ThemeMenuItems` | Botão de tema (ícone do tema atual: sol, lua ou monitor) com Claro, Escuro e Padrão do sistema; `ThemeMenuItems` põe as mesmas opções dentro de outro menu. Está nos cabeçalhos de projetos, editor e revisão (`useThemePreference`, `src/lib/theme.ts`) |
| `LanguageMenu`, `LanguageMenuItems` | Botão de idioma com a sigla do atual (PT, EN, ES): Português (Brasil), English, Español e Idioma do sistema, com os nomes sempre no próprio idioma e `translate="no"`. Fica ao lado do `ThemeMenu` nos cabeçalhos de projetos, editor (no celular, dentro de "Mais ações") e revisão (`src/lib/i18n/locale.ts`) |
| `PageCornerBar` | Cabeçalho mínimo, só com o `LanguageMenu` e o `ThemeMenu` no canto, das telas sem barra própria (login e página não encontrada) |

### Domínio (`src/features/*/components`)

| Feature | Componentes |
| --- | --- |
| `editor` | `EditorShell`, `EditorHeader`, `DesktopWorkspace`, `MobileWorkspace`, `PaneSwitcher`, `FileTreePanel`, `FileTreeSheet`, `FileActionsDialogs`, `FileNameDialog`, `CodeEditorPanel`, `PdfPane`, `ImportDialog` |
| `pdf-viewer` | `PdfPreviewPanel` (compilação, marca da busca do SyncTeX, duplo clique), `PdfDocumentView` (PDF pronto, com zoom e download), `PdfPages` (pdf.js, páginas desenhadas perto da área visível, camada de texto opcional, camada por página via `renderOverlay`, tamanhos das páginas e duplo clique) |
| `ai-assistant` | `AiAssistantPanel`, `AiSettingsDialog`, `ModelEntryCard`, `AiMessage`, `AiComposer`, `StructuredResultView` |
| `auth` | `AuthProvider`, `RequireAuth` |
| `projects` | `ProjectList`, `DemoProjectList`, `NewProjectDialog`, `ProjectSettingsDialog`, `ProjectDocumentsSection` |
| `notifications` | `NotificationBell` (contagem, lista, marcar como lidas, abrir a revisão) |
| `snapshots` | `VersionHistorySheet`, `FreezeVersionForm`, `VersionCard`, `VersionPdfDialog`, `IssueList` |
| `review` | `ReviewWorkspace`, `ReviewHeader`, `ReviewSharingDialog`, `ReviewAccessChoice`, `GuestReviewGate`, `AnnotationLayer`, `SelectionPopover`, `PendingAnnotationPanel`, `ThreadList`, `ThreadCard`, `CommentComposer`, `ReviewChangesDialog`, `RequestReviewDialog`, `ReviewList`, `ProjectReviewQueue`, `MyReviewsSection` |
| `diff` | `ChangesDialog`, `FileChangeCard`, `DiffView` (texto com `<ins>` e `<del>`, linhas sem mudança recolhidas), `DiffPdfViewer` (PDF marcado com marcas na margem e "Próxima alteração") |

### Hooks de integração

| Hook | Feature | O que faz |
| --- | --- | --- |
| `useProjects` | projects | Projetos do usuário em tempo real (`memberIds array-contains uid`, `updatedAt desc`) |
| `useCreateProject` | projects | Cria o projeto (dono), o documento principal e o `main.tex` (ids fixos `main`) |
| `useProject` | projects | Projeto aberto (nome, membros, convites, `memberProfiles`); nulo quando não existe ou a conta não pode vê-lo |
| `useProjectMembers` | projects | Detalhes, convidar, cancelar convite, mudar papel, remover membro, aceitar convite e gravar o próprio nome na lista |
| `useProjectDocuments` | projects | Documentos do projeto (principal e secundários) em tempo real, adicionar e remover secundário |
| `useNotifications` | notifications | As 30 notificações mais recentes, não lidas, marcar como lida; `sendNotifications` grava para os destinatários |
| `useProjectFiles` | editor | Arquivos do projeto em tempo real (ou de demonstração) |
| `useFileAutosave` | editor | Salva o texto 800 ms depois da última tecla e mostra Salvando, Salvo ou o erro |
| `useProjectSources` | editor | Junta o projeto como está na tela: texto do Monaco (ou do cache), binários dos arquivos em pedaços e o arquivo principal |
| `useLatexCompile` | editor | Compila com o Siglum o que `useProjectSources` juntou (PDF, erros e SyncTeX) |
| `useFileActions` | editor | Criar, renomear (levando o texto da tela) e excluir arquivos do rascunho |
| `useSnapshots` | snapshots | Versões do projeto em tempo real, da mais nova para a mais antiga |
| `useFreezeSnapshot` | snapshots | Congela a versão: blobs, compilação, PDF e texto por página em pedaços, snapshot e contador num lote |
| `useSnapshotFiles` | snapshots | Lê o código (blobs, com cache por hash), o PDF e o texto por página de uma versão |
| `useTreeChanges`, `useVersionComparison` | diff | Compara o código de duas versões, ou de uma versão com o rascunho, palavra por palavra |
| `useVisualDiff` | diff | Diff em PDF entre versões (cache em `diffs/{diffKey}`, gerado e guardado por quem edita) ou contra o rascunho |
| `useRequestReview` | review | Congela se o código mudou, abre a revisão (grant, revisão e contador num lote), gera o diff em PDF, leva as threads abertas e envia o link de acesso ao revisor |
| `useCarryThreads` | review | Leva as threads abertas da rodada anterior para a revisão nova, reancoradas (trecho pelo `.pages` e pdf.js, pin pelo SyncTeX) |
| `useReview`, `useReviews`, `useMyReviews` | review | Uma revisão, a fila do projeto e as revisões pedidas ao e-mail da conta |
| `useThreads`, `useComments` | review | Threads da revisão (na ordem de leitura do PDF) e comentários de cada uma, em tempo real |
| `useReviewActions` | review | Thread nova (ponto, desenho ou trecho, com `sourceHint`) com o primeiro comentário, resposta com o contador, status da thread e da revisão, e as notificações de cada uma |
| `useReviewDocuments`, `useReviewPdf`, `useReviewPageTexts`, `useReviewSyncData` | review | Documentos concedidos, PDF, texto das páginas e SyncTeX do documento aberto na revisão |
| `usePageTextDiff`, `useReviewVisualDiff` | review | Diff do texto das páginas e o PDF marcado desde a rodada anterior (o revisor só lê o cache) |
| `useTextSelection` | review | Seleção de texto dentro de uma página do PDF, para o comentário em trecho |
| `useProjectArchive` | editor | Exporta o .zip e aplica o plano de importação (Firestore, com binários em pedaços, ou cache no modo demonstração) |
| `useExportProject` | editor | Exportação do projeto aberto, usada pela árvore e pelo menu |
| `useAiConfig` | ai-assistant | Configuração da IA na conta (`users/{uid}/private/ai`) ou no navegador |
| `useAiStream` | ai-assistant | Conversa com a fila de modelos, deltas por quadro, troca de modelo |
| `useProviderModels` | ai-assistant | Lista de modelos do provedor (ao vivo com a chave; senão a última consultada, a pública do deploy ou a embutida) |
| `useModelTest` | ai-assistant | Pedido curto ao modelo escolhido para saber se ele responde |
| `useAuth` | auth | Sessão e login |
