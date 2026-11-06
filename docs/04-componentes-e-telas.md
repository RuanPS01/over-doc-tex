# 04. Componentes e telas

## 1. Mapa de telas

| Rota | Página | Quem acessa | Estado |
| --- | --- | --- | --- |
| `/login` | `LoginPage` | Visitante | Implementada: Google, e-mail e senha, criar conta, "Esqueci a senha" (link do Firebase para criar uma senha nova), volta para `?next=` |
| `/login` (link de acesso) | `LoginPage` | Quem abriu o link enviado por e-mail | Implementada: confirma o e-mail e conclui a entrada sem senha (convite de revisão, coautor ou "Receber link de acesso por e-mail") |
| `/` | `ProjectsPage` | Usuário com sessão | Implementada: projetos de que é membro, em tempo real, "Novo projeto" e "Revisões para você" (consulta `collectionGroup('reviews')` pelo e-mail verificado). No cabeçalho: "Configurações de IA", idioma, tema, notificações e o menu da conta (`AccountMenu`: "Perfil" e "Sair da conta"). No celular, o título fica numa linha e os botões na seguinte |
| `/p/:projectId` | `EditorPage` | Membro; convidado com e-mail verificado | Implementada: layout responsivo, salvamento automático, diálogos do cabeçalho, aceite de convite de coautoria, aviso de projeto inexistente ou sem acesso |
| `/p/:projectId/reviews/:reviewId` | `ReviewPage` | Membro (autor) e revisor com grant | Implementada: PDF da versão, pins numerados, threads, aprovar ou pedir alterações, "Ver alterações" desde a rodada anterior, marcações ligáveis e download do PDF original ou com anotações |

Todas as páginas são carregadas com `React.lazy` em `src/app/router.tsx`. O Monaco só é baixado quando o editor abre.

`/`, `/p/:projectId` e a revisão passam por `RequireAuth`: sem sessão (com o Firebase configurado), vão para `/login?next=<rota>` e voltam depois do login. No modo demonstração, entram direto e a lista mostra o projeto de exemplo; versões, revisões e membros mostram um aviso de que exigem o Firebase.

## 2. Componentização da tela principal (EditorPage)

### 2.1 Árvore de componentes

```
EditorPage                               pages/editor-page.tsx (papel, convite pendente, nome na lista de membros)
└── EditorStoreProvider                  features/editor/state/editor-store.tsx (papel e diálogo aberto)
    ├── EditorDialogs                    na própria página: junta snapshots, diff, review e projects
    │   ├── VersionHistorySheet          "Revisões e versões": abas Revisões (ProjectReviewQueue, a principal e aberta por padrão) e Versões (congelar, PDF, comparar, .zip)
    │   ├── ChangesDialog                abas Código (diff por palavra) e PDF marcado (DiffPdfViewer)
    │   ├── RequestReviewDialog          versão que será congelada (ReviewVersionNotice), acesso (e-mails ou link), vários e-mails separados por vírgula,
    │   │                                documentos concedidos; congela uma versão nova, abre a revisão, gera o diff em PDF e envia o link (RequestReviewResultView)
    │   └── ProjectSettingsDialog        nome, descrição, documentos (ProjectDocumentsSection), membros e convites
    └── EditorShell                      .h-viewport flex-col overflow-hidden
      └── CompileStoreProvider           estado da compilação; Ctrl+S e Ctrl+Enter compilam
        ├── EditorHeader                 cabeçalho travado (h-header)
        │   ├── botão Arquivos           só fora do desktop, abre FileTreeSheet
        │   ├── título do projeto        min-w-0 flex-1 truncate
        │   ├── Compilar                 sempre visível (só ícone abaixo de sm); vira Compilando com indicador
        │   ├── Solicitar revisão        visível a partir de sm (só dono e editores)
        │   ├── Revisões e versões, Ver alterações  visíveis a partir de lg; abrem os diálogos pelo store (openDialog)
        │   ├── Assistente de IA         botão alternável
        │   ├── ThemeMenu                tema claro, escuro ou do sistema (a partir de sm; no celular, dentro de "Mais")
        │   ├── NotificationBell         notificações da conta (a partir de 360px)
        │   └── DropdownMenu "Mais"      o que a largura escondeu, Importar, Exportar (.zip), Configurações do projeto, Configurações de IA e, no celular, Tema
        ├── main
        │   ├── DesktopWorkspace         layoutMode = desktop
        │   │   └── ResizablePanelGroup  layout salvo em localStorage
        │   │       ├── FileTreePanel    Novo arquivo, Importar, Exportar (.zip) e Ordenar na barra; pastas recolhíveis; menu por arquivo (renomear, excluir)
        │   │       ├── CodeEditorPanel  Monaco (somente leitura para quem só lê); Desfazer e Refazer (UndoRedoButtons, histórico do
        │   │       │                    próprio Monaco; Ctrl+Z também com o foco fora do editor); "Mostrar no PDF" (SyncTeX)
        │   │       └── PdfPane          liga o PdfPreviewPanel ao estado da compilação; duplo clique leva ao código
        │   └── MobileWorkspace          layoutMode = mobile-portrait | mobile-landscape
        │       ├── PaneSwitcher         abas Código | PDF (só em retrato)
        │       ├── CodeEditorPanel      montado sempre, oculto com `hidden`
        │       └── PdfPane              montado sempre, oculto com `hidden`; compilar com sucesso mostra o PDF
        ├── FileTreeSheet                Sheet lateral (fora do desktop)
        ├── ImportDialog                 .zip, arquivos ou pasta; destino e política de conflito
        └── AiAssistantPanel             aba encaixada no rodapé (DockedAssistant) ou janela solta (desktop); Sheet inferior (celular)
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
| `PdfPreviewPanel` | Páginas do PDF (pdf.js), zoom, download, andamento e lista de erros com arquivo e linha. Índice do documento (`PdfOutlinePanel`) recolhível pelo botão no começo da barra, fechado por padrão porque a tela já está dividida | zoom, lista aberta, índice aberto (lembrado em `overdoctex.pdf-outline.editor`) | props |
| `AiAssistantPanel` | Conter o chat no formato certo para o layout. O botão "Assistente de IA" do cabeçalho liga e desliga o assistente. No desktop, ligado e encaixado no rodapé (à direita por padrão, à esquerda ou no meio), ele é uma aba (`DockedAssistant`, veja abaixo); solto, é uma janela de até 420 x 640 arrastada pelo título, sem sair da tela nem subir sobre o cabeçalho. O botão de encaixe escolhe a posição ou "Janela solta" (também pelo teclado). Posição lembrada neste navegador (`overdoctex.ai-window`); lógica pura em `model/assistant-window.ts` | conversa (`useAiStream`), diálogo de configuração aberto, posição da janela (`useAssistantWindow`) | `useAiConfig`; `files`, `open` e `onOpenChange` vêm do `EditorShell` por props |
| `DockedAssistant` | Assistente encaixado como aba no rodapé. Só a aba ("Assistente", 28px de altura) fica na tela; o mouse em cima faz a aba crescer até virar a janela (a aba e a janela são o mesmo elemento, e o conteúdo já está na largura final, revelado pelo recorte com opacidade e desfoque), e ela volta à aba se o mouse sair sem interação (350 ms de espera). Os controles laterais ficam no lugar final e só aparecem e somem, sem acompanhar o crescimento. Ligar pelo cabeçalho também anima a aba crescendo. Clique, foco ou digitação dentro fixam a janela até "Ocultar" (botão ao lado) ou Esc; clicar na aba abre fixada com o cursor no campo. Aberta, ocupa pouco: até 560px de largura, altura pelo conteúdo (151px sem conversa), conversa com teto de 45% da tela (até 380px), sugestões de tarefa antes da primeira mensagem e campo de uma linha. Ao lado ficam Ocultar, o encaixe e "Mais" (Nova conversa, Configurar a minha IA, Desligar o assistente). A aba mostra quando a IA está respondendo e acende um ponto quando chega resposta com a janela oculta. Arrastar a alça de cima solta a janela: o arraste só começa depois de o ponteiro andar 4px (um clique na alça não solta nada), a janela solta nasce com o cabeçalho debaixo do cursor e acompanha até o botão ser solto. O arraste ouve o ponteiro na janela do navegador, não no elemento clicado, porque a alça sai da tela quando a janela vira solta; ele também termina se o botão já estiver solto ou o navegador perder o foco. Estados em `nextDockReveal` (puro) e `useDockReveal` | revelação (aba, espiando, fixada), tarefa escolhida, última resposta vista | conversa e posição vêm do `AiAssistantPanel` |
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
| Assistente de IA | Aba no rodapé (direita, esquerda ou meio) que revela a janela compacta de até 560px, ou janela solta e arrastável | Sheet inferior 85dvh | Sheet inferior 85dvh |
| Ações do cabeçalho | Todas visíveis | Parte no menu "Mais" | Quase todas no menu "Mais" |

O código está em `src/features/editor/components/` e as regras completas em `08-responsividade.md`.

## 3. Tela de revisão (ReviewPage)

```
ReviewPage                               pages/review-page.tsx: membro entra como autor, quem não é membro como revisor
└── ReviewWorkspace                      .h-viewport, mesma casca do editor
    ├── ReviewHeader                     "#1 título", versão, status; aprovar, pedir alterações, encerrar ou reabrir; Envio (dono e editores); nome do visitante; ThemeMenu; NotificationBell
    ├── PdfDocumentView                  features/pdf-viewer (pdf.js) com a camada de texto ligada, zoom, índice do documento aberto por padrão e
    │   │                                download em menu: "PDF original" ou "PDF com anotações" (useAnnotatedPdf)
    │   ├── título                       seletor de documento quando a revisão concede mais de um; no espaço livre da barra, à direita,
    │   │                                junto das ferramentas, a dica da ferramenta (Ponto, Desenhar) ou a mensagem de quem pediu a revisão
    │   ├── Marcações (Switch)           liga e desliga destaques, desenhos e pins no PDF; desligado, as ferramentas e o "Comentar trecho" somem
    │   ├── ferramentas                  Selecionar texto | Ponto | Desenhar (na barra do PDF)
    │   ├── UndoRedoButtons              Desfazer e Refazer na barra (a partir de sm; no celular, flutuando à esquerda, embaixo)
    │   └── AnnotationLayer (por página) destaques dos trechos, desenhos (Strokes), pins numerados, desenhos sem comentário
    │                                    (DrawingMark: clicar seleciona e mostra "Apagar desenho") e a marcação pendente
    ├── SelectionPopover                 "Comentar trecho" logo abaixo da seleção de texto
    ├── ThreadList                       painel de comentários redimensionável e recolhível (desktop) ou Sheet inferior (celular)
    │   ├── PendingAnnotationPanel       comentário da marcação nova (citação do trecho; cor, desfazer traço e "Manter só o desenho"
    │   │                                no desenho); rola para ficar à vista quando a marcação muda
    │   └── ThreadCard                   citação, "Rodada anterior" (conversa da thread de origem), comentários (ThreadComments: editar
    │                                    o próprio texto, excluir a própria resposta), responder, resolver ou reabrir, "Abrir no código"
    │                                    (autor), aviso de "Desatualizada" e o menu "..." (Refazer a marcação no PDF, Excluir comentário)
    └── ReviewChangesDialog              abas "PDF marcado" (DiffPdfViewer) e "Texto" (DiffView do texto das páginas)
```

Pontos de atenção:

- **Índice do documento:** na revisão, o índice (marcadores do PDF) abre por padrão ao lado das páginas para guiar a leitura; a escolha de fechar fica lembrada neste navegador (`overdoctex.pdf-outline.review`). Num visualizador estreito (celular), começa fechado e abre por cima do PDF.
- **Dica e mensagem sem faixa nova:** a dica de "Ponto" e "Desenhar" e a mensagem do pedido de revisão ficam no espaço livre da barra do PDF, alinhadas à direita, junto das ferramentas, então escolher uma ferramenta não empurra o PDF para baixo. No celular a barra não tem espaço: a dica flutua sobre o topo do PDF (sem ocupar espaço) e a mensagem fica no topo do painel de comentários.
- **Painéis redimensionáveis (desktop):** como as colunas do editor, o índice, as páginas e os comentários ficam lado a lado e as bordas entre eles arrastam para mudar a largura. Arrastar o índice ou os comentários até a borda recolhe o painel, e puxar a borda abre de novo. O índice também abre e fecha pelo botão no começo da barra do PDF; os comentários, pelo botão com o total de comentários na mesma barra e pelo botão no topo do painel. Começar um comentário (trecho, ponto ou desenho) ou escolher uma marcação no PDF reabre os comentários. Ao reabrir, o painel volta com a última largura usada, e não com o mínimo. Comentários: 384px por padrão, de 260px até 55% da tela, grupo lembrado em `review-desktop`. Índice: 224px por padrão, de 160px até metade do visualizador.
- **Coordenadas normalizadas:** destaques, traços e pins usam valores de 0 a 1, então zoom e tamanho de tela não exigem recalcular nada no banco. Os traços são SVG com `vector-effect: non-scaling-stroke`.
- **Pins semitransparentes:** os números sobre a página ficam com 60% de opacidade (45% nos resolvidos) para o texto embaixo continuar legível; ficam opacos no hover, no foco e quando a thread está selecionada.
- **Mexer num comentário:** quem criou a thread (o visitante pelo mesmo nome, em qualquer aparelho) e quem edita o projeto veem o menu "..." no cartão: "Refazer a marcação no PDF" e "Excluir comentário" (com confirmação dentro do cartão; a marcação e todas as respostas somem, e o desfazer traz de volta). Na remarcação, a marcação antiga sai do PDF na hora e a ferramenta segue o tipo dela (trecho: "Selecionar texto"; ponto: "Ponto"; desenho: "Desenhar", na mesma cor). A marcação nova vale sozinha: soltar a seleção, clicar o ponto ou parar de desenhar por 1,2 s (dá para fazer vários traços; o salvamento espera o traço em andamento). O cartão mostra o que fazer e "Cancelar remarcação" (Esc também cancela, e no celular o botão flutuante vira "Cancelar remarcação"), que traz a marcação antiga de volta. A conversa continua a mesma, e uma thread desatualizada volta a aberta. Os mesmos arrastam o pin no PDF para mudar de lugar (o desenho vai junto, sem sair da página); o arraste só começa depois de 4px, então um clique continua abrindo a thread. Texto de um comentário só quem escreveu edita (lápis, salvo com "editado" ao lado da data) e só quem escreveu exclui a própria resposta (fica "Comentário excluído."). Os botões aparecem no hover e sempre em telas de toque. Nada disso aparece com a revisão encerrada.
- **Desenho sem comentário:** no painel do desenho novo, "Manter só o desenho" grava só o desenho (`drawingOnly`): sem cartão nem número. Clicar no traço (em "Selecionar texto") seleciona o desenho, com contorno tracejado e, para quem pode, "Apagar desenho". Ele entra no PDF com anotações sem cartão na margem.
- **Desfazer e refazer:** botões na barra do PDF e Ctrl+Z, Ctrl+Shift+Z ou Ctrl+Y fora de campos de texto (que têm o desfazer próprio). Valem para o que a pessoa fez nesta tela, nesta visita: comentário novo, desenho, resposta, edição, resposta excluída, comentário ou desenho excluído, marcação nova (arraste ou remarcação) e resolver ou reabrir. Com traços de um desenho ainda sem comentário, Ctrl+Z tira o último traço. A dica do botão diz o que será desfeito ("Desfazer: comentário novo"). Se a volta falhar (outra pessoa mudou o mesmo comentário, sem rede), aparece o aviso e a ação sai do histórico. Mudar o status da revisão (aprovar, pedir alterações, encerrar) fica fora: é uma decisão com notificação.
- **Tirar a seleção:** clicar de novo no número ou no cartão da thread selecionada tira a seleção; clicar num lugar vazio do PDF (fora de pins e botões) ou do painel de comentários também. Soltar uma seleção de texto não conta como clique vazio, e o campo de resposta e os botões do cartão selecionado não mudam a seleção.
- **Marcações:** o interruptor "Marcações" na barra do PDF (rótulo a partir de `xl`, ícone a partir de `sm`) mostra o PDF como foi congelado, sem a camada de anotação; desligado, as ferramentas de marcar e o "Comentar trecho" saem, a marcação pendente é descartada, e a lista de comentários continua ao lado. Liga de novo a cada abertura.
- **Download:** o botão de download da barra vira um menu com "PDF original" (os bytes da versão) e "PDF com anotações", que `useAnnotatedPdf` gera no navegador com o pdf-lib (fluxo em `07-fluxos.md`, cenário B). O nome do arquivo leva `-anotado` traduzido.
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
| `Dialog` | Radix Dialog | Largura e altura limitadas à janela; título com `pr-8` para o botão de fechar; rodapé empilha no celular. `closeClassName` reposiciona o X quando o diálogo tem barra própria no topo (no PDF da versão, o X fica no meio da barra de 40px) |
| `Select` | Radix Select | Lista em `popper` com a largura do gatilho; item marcado com fundo primário e ícone de check |
| `Switch` | nativo (`button` com `role="switch"`) | Interruptor no visual do shadcn/ui, sem pacote do Radix; `checked` e `onCheckedChange`. Usado em "Marcações" da revisão |

### Genéricos (`src/components/common`)

| Componente | Notas |
| --- | --- |
| `MarkdownContent` | Único ponto com `dangerouslySetInnerHTML`; recebe Markdown, sanitiza com DOMPurify |
| `FullPageStatus` | Tela inteira de espera, aviso ou erro (abrindo sessão, abrindo projeto, projeto não encontrado) |
| `UndoRedoButtons` | Desfazer e Refazer (ícones `Undo2` e `Redo2`), com a ação e o atalho na dica; usado na revisão e no editor de código |
| `ThemeMenu`, `ThemeMenuItems` | Botão de tema (ícone do tema atual: sol, lua ou monitor) com Claro, Escuro e Padrão do sistema; `ThemeMenuItems` põe as mesmas opções dentro de outro menu. Está nos cabeçalhos de projetos, editor e revisão (`useThemePreference`, `src/lib/theme.ts`) |
| `LanguageMenu`, `LanguageMenuItems` | Botão de idioma com a sigla do atual (PT, EN, ES): Português (Brasil), English, Español e Idioma do sistema, com os nomes sempre no próprio idioma e `translate="no"`. Fica ao lado do `ThemeMenu` nos cabeçalhos de projetos, editor (no celular, dentro de "Mais ações") e revisão (`src/lib/i18n/locale.ts`) |
| `AccountMenu`, `ProfileDialog` (`features/auth`) | Botão redondo com a foto ou a inicial; o menu mostra nome e e-mail, "Perfil" e "Sair da conta". `ProfileDialog` troca o nome (no Firebase Authentication e em `memberProfiles` dos projetos) e a senha (com a atual, ou link por e-mail; quem só entra com Google ou link de acesso recebe um link para criar uma). Operações em `useProfile` |
| `PageCornerBar` | Cabeçalho mínimo, só com o `LanguageMenu` e o `ThemeMenu` no canto, das telas sem barra própria (login e página não encontrada) |

### Domínio (`src/features/*/components`)

| Feature | Componentes |
| --- | --- |
| `editor` | `EditorShell`, `EditorHeader`, `DesktopWorkspace`, `MobileWorkspace`, `PaneSwitcher`, `FileTreePanel`, `FileTreeSheet`, `FileActionsDialogs`, `FileNameDialog`, `CodeEditorPanel`, `PdfPane`, `ImportDialog` |
| `pdf-viewer` | `PdfPreviewPanel` (compilação, marca da busca do SyncTeX, duplo clique), `PdfDocumentView` (PDF pronto, com zoom e download; com `downloadOptions`, o download vira menu com "PDF original" e as outras opções, e `onAreaClick` avisa cliques na área do PDF), `PdfPages` (pdf.js, páginas desenhadas perto da área visível, camada de texto opcional, camada por página via `renderOverlay`, tamanhos das páginas, duplo clique e o documento aberto via `onDocument`), `PdfOutlineFrame` (índice e páginas num grupo redimensionável, com a borda arrastável e o índice recolhível; a estrutura não muda com ou sem índice, para as páginas não serem montadas de novo), `PdfOutlinePanel` e `PdfOutlineToggle` (índice do documento, como o do leitor do Chrome: hierarquia recolhível, seção atual marcada, níveis acima dela abertos sozinhos e a seção visível na lista; o clique rola até ela, que continua marcada até a rolagem chegar; ao lado das páginas a partir de 520px de largura, por cima delas abaixo disso, fechando ao escolher). Estado em `usePdfOutline`; leitura e regras puras em `src/lib/pdf/outline.ts` |
| `ai-assistant` | `AiAssistantPanel`, `DockedAssistant`, `DockMenu`, `AiSettingsDialog`, `ModelEntryCard`, `AiMessage`, `AiComposer`, `StructuredResultView` |
| `auth` | `AuthProvider`, `RequireAuth` |
| `projects` | `ProjectList`, `DemoProjectList`, `NewProjectDialog`, `ProjectSettingsDialog`, `ProjectDocumentsSection` |
| `notifications` | `NotificationBell` (contagem, lista, marcar como lidas, abrir a revisão) |
| `snapshots` | `VersionHistorySheet`, `FreezeVersionForm`, `VersionCard`, `VersionPdfDialog`, `IssueList` |
| `review` | `ReviewWorkspace`, `ReviewHeader`, `ReviewSharingDialog`, `ReviewAccessChoice`, `GuestReviewGate`, `AnnotationLayer`, `SelectionPopover`, `PendingAnnotationPanel`, `ThreadList`, `ThreadCard`, `ThreadComments` (comentários com editar e excluir a própria resposta), `Strokes` (traços em SVG; clicáveis no desenho sem comentário), `DrawingMark` (desenho sem comentário, selecionável e apagável), `CommentComposer` (também edição: texto inicial, Esc cancela), `ReviewChangesDialog`, `RequestReviewDialog`, `ReviewVersionNotice` (número da versão que será congelada, ajuste ou principal), `RequestReviewResultView` (revisão aberta, convites e link), `ReviewList`, `ProjectReviewQueue`, `MyReviewsSection` |
| `diff` | `ChangesDialog`, `FileChangeCard`, `DiffView` (texto com `<ins>` e `<del>`, linhas sem mudança recolhidas), `DiffPdfViewer` (PDF marcado com marcas na margem e "Próxima alteração") |

### Hooks de integração

| Hook | Feature | O que faz |
| --- | --- | --- |
| `useUndoStack` | hooks | Histórico de desfazer e refazer de uma tela (`UndoHistory`, `src/lib/undo-history.ts`): uma operação por vez, até 50 ações, o erro volta para quem chamou |
| `useUndoShortcuts` | hooks | Ctrl+Z desfaz; Ctrl+Shift+Z e Ctrl+Y refazem (Cmd no Mac), fora de campos de texto e do Monaco |
| `useCollapsiblePanel` | hooks | Painel lateral recolhível de um grupo do react-resizable-panels: recolher, reabrir com a última largura (lembrada no navegador, gravada só depois de parar de mudar) e o estado recolhido |
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
| `useFreezeSnapshot` | snapshots | Congela a versão: blobs, compilação, PDF e texto por página em pedaços, snapshot e contador num lote (sempre uma versão nova, inclusive para a revisão) |
| `useSnapshotFiles` | snapshots | Lê o código (blobs, com cache por hash), o PDF e o texto por página de uma versão |
| `useTreeChanges`, `useVersionComparison` | diff | Compara o código de duas versões, ou de uma versão com o rascunho, palavra por palavra |
| `useVisualDiff` | diff | Diff em PDF entre versões (cache em `diffs/{diffKey}`, gerado e guardado por quem edita) ou contra o rascunho |
| `useRequestReview`, `useNextReviewVersion` | review | Congela uma versão nova, abre a revisão (um grant por e-mail, revisão e contador num lote), gera o diff em PDF, leva as threads abertas e envia o link de acesso a cada revisor; `useNextReviewVersion` dá o número que será congelado (ajuste e principal) |
| `useCarryThreads` | review | Leva as threads abertas da rodada anterior para a revisão nova, reancoradas (trecho pelo `.pages` e pdf.js, pin pelo SyncTeX) |
| `useReview`, `useReviews`, `useMyReviews` | review | Uma revisão, a fila do projeto e as revisões pedidas ao e-mail da conta |
| `useThreads`, `useComments` | review | Threads da revisão (na ordem de leitura do PDF) e comentários de cada uma, em tempo real |
| `useReviewActions`, `useReviewViewer` | review | Thread nova (ponto, desenho ou trecho, com `sourceHint`) com o primeiro comentário, resposta com o contador, status da thread e da revisão, e as notificações de cada uma; desenho sem comentário (`createDrawing`), marcação nova da thread (`setMarking`), exclusão lógica da thread e o desfazer dela (`deleteThread`, `restoreThread`), edição, exclusão e volta do próprio comentário. `useReviewViewer` diz quem está vendo (conta, nome do visitante, se edita o projeto) para `canManageThread` e `isCommentAuthor` (`model/review.ts`) |
| `useReviewHistory` | review | As ações da revisão que dá para desfazer: cada uma grava e registra no `useUndoStack` o caminho de volta (exclusão lógica, texto anterior, marcação anterior, status anterior) |
| `usePinDrag` | review | Arrastar o pin de uma thread na página: segue o ponteiro a partir do ponto pego, separa clique de arraste (4px) e grava ao soltar |
| `useReviewDocuments`, `useReviewPdf`, `useReviewPageTexts`, `useReviewSyncData` | review | Documentos concedidos, PDF, texto das páginas e SyncTeX do documento aberto na revisão |
| `usePageTextDiff`, `useReviewVisualDiff` | review | Diff do texto das páginas e o PDF marcado desde a rodada anterior (o revisor só lê o cache) |
| `useTextSelection` | review | Seleção de texto dentro de uma página do PDF, para o comentário em trecho |
| `useAnnotatedPdf` | review | "PDF com anotações": lê os comentários de cada thread do documento (e os da rodada anterior), as cores dos tokens e gera o PDF com `buildAnnotatedPdf` |
| `useProjectArchive` | editor | Exporta o .zip e aplica o plano de importação (Firestore, com binários em pedaços, ou cache no modo demonstração) |
| `useExportProject` | editor | Exportação do projeto aberto, usada pela árvore e pelo menu |
| `useAiConfig` | ai-assistant | Configuração da IA na conta (`users/{uid}/private/ai`) ou no navegador |
| `useAiStream` | ai-assistant | Conversa com a fila de modelos, deltas por quadro, troca de modelo |
| `useProviderModels` | ai-assistant | Lista de modelos do provedor (ao vivo com a chave; senão a última consultada, a pública do deploy ou a embutida) |
| `useModelTest` | ai-assistant | Pedido curto ao modelo escolhido para saber se ele responde |
| `useAuth` | auth | Sessão e login |
