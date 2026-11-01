# 03. Identidade visual

## 1. Princípios

- **Foco no documento:** a interface é neutra para que o PDF e o código sejam o centro. Cor forte só em ações primárias, estados e marcações de revisão.
- **Clareza de estado:** compilando, congelado, em revisão, resolvido. Cada estado tem cor semântica e texto, nunca só cor.
- **Leveza de IA:** o assistente aparece como painel flutuante limpo, inspirado em interfaces centradas em conversa, sem competir com o editor.

## 2. Tokens de cor

Paleta monocromática (Colab Arena). Definida em `src/styles/globals.css` como canais HSL (`H S% L%`, com o hexadecimal de origem em comentário) e exposta no Tailwind por `tailwind.config.ts`. **Componentes usam apenas as classes semânticas.**

| Token | Claro | Escuro | Classe Tailwind | Uso |
| --- | --- | --- | --- | --- |
| `--background` | `#fafafa` | `#0a0a0a` | `bg-background` | Fundo da página e das barras laterais (`--panel` usa o mesmo valor) |
| `--foreground` | `#121212` | `#ededed` | `text-foreground` | Texto padrão |
| `--card`, `--popover` | `#ffffff` | `#121212` | `bg-card`, `bg-popover` | Superfícies elevadas, menus, diálogos, área do editor |
| `--muted`, `--secondary` | `#e5e5e5` | `#212121` | `bg-muted`, `bg-secondary` | **Hover**, esqueletos, botões secundários, fundo do PDF |
| `--muted-foreground` | `#737373` | `#808080` | `text-muted-foreground` | Texto de apoio (4,5:1 sobre o fundo nos dois temas) |
| `--accent` | `#242424` | `#2e2e2e` | `bg-accent` + `text-accent-foreground` | **Seleção forte** (arquivo aberto, selo de renomeado). Nunca hover: no claro ele é quase preto |
| `--primary` | `#171717` | `#ededed` | `bg-primary`, `text-primary` | Ação principal (Compilar, Salvar, Enviar), links, item marcado em listas |
| `--destructive` | `#dc2626` | `#9e2f2f` | `bg-destructive` | Botões e fundos de erro ou exclusão |
| `--border`, `--input` | `#e0e0e0` | `#242424` | `border-border`, `border-input` | Bordas |
| `--ring` | `#737373` (derivado) | `#8c8c8c` | `ring-ring` | Foco visível |
| `--success` | `#22c55e` | `#22c55e` | `bg-success/15` | Fundo de "confere", "novo", resolvido |
| `--warning` | `#f59e0b` | `#f59e0b` | `bg-warning/10`, `border-warning/50` | Avisos, modo demonstração, veredito incerto |
| `--status-online`, `-away`, `-busy`, `-offline` | `#22c55e`, `#f59e0b`, `#ef4444`, `#9ca3af` | iguais | `bg-status-online`... | Indicadores de presença |
| `--pdf-canvas` | `#e5e5e5` | `#212121` | `bg-pdf-canvas` | Fundo atrás das páginas do PDF |
| `--overlay` | preto | preto | `bg-overlay/45` (claro), `dark:bg-overlay/70` | Fundo atrás de modais e menus laterais: escurece a tela nos dois temas (usar `--foreground` clareava a tela no escuro) |
| `--crt-glow` | branco | branco | (só no CSS de `.tv-screen`) | Linha luminosa da animação de TV antiga dos modais |
| `--diff-*` | verde e vermelho | verde e vermelho | `text-diff-added`, `bg-diff-removed-bg`... | Inserções e remoções no diff (cor de conteúdo, fora da paleta neutra) |
| `--annotation-1` a `--annotation-4` | amarelo, vermelho, azul, verde | idem | `text-annotation-1`... | Paleta do revisor (cor de conteúdo); pins abertos da revisão usam `bg-annotation-3` com `text-background`, e os resolvidos, `bg-muted` com borda; trechos comentados, `bg-annotation-1/35`; traços do desenho, `stroke-annotation-*` (a cor escolhida, gravada como token) |
| `--editor-*` | neutros da paleta | neutros da paleta | (lidos em runtime) | Tema do Monaco; comandos, comentários e matemática mantêm cor para leitura do código |

**Cor de texto com contraste garantido.** Duas cores da paleta não servem como texto: o `#9e2f2f` do escuro (2,6:1 sobre `#121212`) e o `#22c55e` do claro (2,2:1 sobre `#fafafa`). Por isso `text-destructive` e `text-success` usam tokens próprios (`--destructive-text` e `--success-text`, mapeados em `theme.extend.textColor`), enquanto `bg-*` e `border-*` continuam com a cor da paleta:

| Classe | Claro | Escuro |
| --- | --- | --- |
| `text-destructive` | `#dc2626` (4,6:1) | `#ef4444`, o vermelho de status busy (5,0:1) |
| `text-success` | `#15803d`, o verde de online escurecido (4,8:1) | `#22c55e` (8,2:1) |

**Hover e seleção.** Botões `outline` e `ghost`, itens de menu e de lista e cartões usam `hover:bg-muted`; `bg-accent` fica para o estado selecionado, sempre com `text-accent-foreground`.

O tema escuro redefine os mesmos tokens sob `.dark`. A pessoa escolhe **Claro**, **Escuro** ou **Padrão do sistema** (o padrão) no botão de tema do cabeçalho de todas as telas (`ThemeMenu`, em `src/components/common/theme-menu.tsx`; no editor em celular, dentro de "Mais ações"; no login e na página não encontrada, no canto superior). A escolha fica no localStorage deste navegador (`overdoctex.theme`) e `src/lib/theme.ts` aplica a classe `dark` e o `color-scheme` no `<html>`; em "Padrão do sistema", ela acompanha a troca do aparelho na hora. Um script curto no `index.html` aplica a mesma regra antes do primeiro desenho, para a página não piscar no tema errado.

### Cores de anotação gravadas no banco

Traços e destaques guardam o **nome do token** (`'annotation-2'`), nunca a cor. Assim o desenho do revisor acompanha o tema claro ou escuro e o contraste continua correto.

### Exceções controladas

| Onde | Por quê | Como |
| --- | --- | --- |
| `theme_color` e `background_color` do manifesto, `<meta name="theme-color">` (um por tema) | O navegador exige valor literal | `hsl(...)` espelhando `--primary` e `--background`, com comentário apontando a origem |
| Tema do Monaco | O Monaco só aceita hexadecimal | `src/lib/monaco/theme-from-tokens.ts` lê os tokens CSS e converte em runtime |
| Preâmbulo LaTeX do diff | Cores vivem no PDF | `xcolor` com misturas nomeadas (`green!50!black`), definidas só no worker |
| Ícone do app (`public/icons/icon.svg`) | Arquivo de imagem | `hsl(...)` dos tokens |
| Logo do Google no botão de login (`public/icons/google-g.svg`) | As diretrizes do "Sign in with Google" exigem o "G" nas quatro cores da marca, sem versão monocromática nem recoloração | Arquivo SVG com as cores oficiais, usado por `<img>`; logo de 18px a 10px do texto, centralizado com ele no botão |

## 3. Tipografia

| Uso | Fonte | Classe |
| --- | --- | --- |
| Interface | Inter, com fallback `system-ui` | `font-sans` |
| Código e LaTeX | JetBrains Mono, com fallback `ui-monospace` | `font-mono` |

Escala: `text-xs` (metadados, barras de painel), `text-sm` (padrão da interface), `text-base` e `text-lg` (títulos de tela). Títulos de tela em `font-semibold`.

## 4. Forma, espaço e elevação

- Raio base `--radius: 0.75rem`; `rounded-lg` (9px), `rounded-md` (6px) e `rounded-sm` (3px) derivam dele (`--radius` menos 3, 6 e 9px).
- Altura do cabeçalho do editor: token `--header-height` (`h-header`, 3rem).
- Barras de painel (nome do arquivo, zoom do PDF): `h-9`.
- Elevação: `shadow-sm` em botões, `shadow-md` em páginas de PDF e menus, `shadow-2xl` só na janela do assistente de IA (encaixada no rodapé com os cantos de baixo retos, ou solta com todos os cantos redondos). Encaixado, o assistente fica recolhido numa aba de 28px no rodapé (`shadow-md`). Ao abrir, a própria aba cresce até o tamanho da janela (280 ms, largura e altura), o rótulo da aba some logo, o conteúdo aparece desfocado e ganha nitidez durante o crescimento, e os controles laterais, parados no lugar final, só aparecem no fim. Ao fechar, conteúdo e controles somem primeiro e a janela encolhe até a aba. Tempos em `dockMorphTransitions`; sem animação com `prefers-reduced-motion`.
- Modais abrem e fecham como **TV antiga** (`.tv-screen` e `.scrim` em `globals.css`): ao abrir, um ponto luminoso vira linha horizontal e a linha se abre na vertical enquanto o brilho se apaga (520 ms); ao fechar, a imagem achata numa linha, a linha vira ponto e some (420 ms). O fundo ganha opacidade junto e perde ao fechar. A animação usa a propriedade `scale`, que não interfere no `translate` que centraliza o diálogo. Com "reduzir movimento" no sistema, vira um esmaecimento de 150 ms. Menus laterais (`Sheet`) continuam deslizando, com o mesmo fundo.

## 5. Ícones

- Biblioteca: `lucide-react`, tamanho padrão `size-4` (definido no `Button`).
- Botão só com ícone exige `aria-label` em português.
- Ícones de referência: `Play` (compilar), `Send` (solicitar revisão), `History` (versões), `GitCompare` (ver alterações), `Sparkles` (IA), `FolderTree` (arquivos).

## 6. Texto da interface

- Três idiomas: português do Brasil (o texto escrito no código), inglês e espanhol (dicionários em `src/lib/i18n/messages`). Frases curtas, sem travessão, sem emojis, sem setas, nos três.
- O botão de idioma mostra a sigla (PT, EN, ES) e os nomes dos idiomas aparecem sempre no próprio idioma ("English", "Español"). A página inteira tem `translate="no"`: a tradução automática do navegador não age por cima da tradução própria.
- Botões com verbo no infinitivo: "Compilar", "Solicitar revisão", "Ver alterações".
- Estados com substantivo: "Em revisão", "Resolvido", "Congelado".
- Mensagens de erro dizem o que aconteceu e o que fazer: "Não foi possível entrar. Confira os dados e tente novamente."

## 7. Acessibilidade

- Contraste mínimo AA nos dois temas (os pares `*-foreground` foram escolhidos para isso).
- Foco visível em todo elemento interativo (`focus-visible:ring-2 ring-ring`).
- Painéis com `aria-label` ("Editor de código", "Pré-visualização do PDF", "Arquivos do projeto").
- Sheets e diálogos com título e descrição (mesmo que `sr-only`), exigência do Radix.

## 8. Como adicionar um token

1. Declarar a variável em `:root` e em `.dark` (`src/styles/globals.css`).
2. Expor no `tailwind.config.ts` com `token('nome')`.
3. Registrar nesta página, na tabela da seção 2.
