# 03. Identidade visual

## 1. Princípios

- **Foco no documento:** a interface é neutra para que o PDF e o código sejam o centro. Cor forte só em ações primárias, estados e marcações de revisão.
- **Clareza de estado:** compilando, congelado, em revisão, resolvido. Cada estado tem cor semântica e texto, nunca só cor.
- **Leveza de IA:** o assistente aparece como painel flutuante limpo, inspirado em interfaces centradas em conversa, sem competir com o editor.

## 2. Tokens de cor

Definidos em `src/styles/globals.css` como canais HSL (`H S% L%`) e expostos no Tailwind por `tailwind.config.ts`. **Componentes usam apenas as classes semânticas.**

| Token | Classe Tailwind | Uso |
| --- | --- | --- |
| `--background` / `--foreground` | `bg-background`, `text-foreground` | Fundo e texto padrão |
| `--card`, `--popover` | `bg-card`, `bg-popover` | Superfícies elevadas, menus, painel de IA |
| `--panel` | `bg-panel` | Árvore de arquivos e barras laterais |
| `--primary` | `bg-primary`, `text-primary` | Ação principal (Compilar, Enviar), links |
| `--secondary`, `--muted`, `--accent` | `bg-secondary`, `bg-muted`, `bg-accent` | Botões secundários, esqueletos, hover e item ativo |
| `--destructive` | `bg-destructive`, `text-destructive` | Erros, exclusões, referência inacessível |
| `--success` | `text-success`, `bg-success/15` | Thread resolvida, referência confere |
| `--warning` | `bg-warning/10`, `border-warning/50` | Avisos, modo demonstração, veredito incerto |
| `--border`, `--input`, `--ring` | `border-border`, `border-input`, `ring-ring` | Bordas e foco |
| `--pdf-canvas` | `bg-pdf-canvas` | Fundo atrás das páginas do PDF |
| `--diff-added`, `--diff-added-bg` | `text-diff-added`, `bg-diff-added-bg` | Inserções no diff (verde) |
| `--diff-removed`, `--diff-removed-bg` | `text-diff-removed`, `bg-diff-removed-bg` | Remoções no diff (vermelho) |
| `--annotation-1` a `--annotation-4` | `text-annotation-1` ... | Paleta do revisor: amarelo marca-texto, vermelho, azul, verde |
| `--editor-*` | (lidos em runtime) | Tema do Monaco |

O tema escuro redefine os mesmos tokens sob `.dark`. A classe é aplicada no `<html>` por `ThemeSync` (`src/app/providers.tsx`) conforme a preferência do sistema.

### Cores de anotação gravadas no banco

Traços e destaques guardam o **nome do token** (`'annotation-2'`), nunca a cor. Assim o desenho do revisor acompanha o tema claro ou escuro e o contraste continua correto.

### Exceções controladas

| Onde | Por quê | Como |
| --- | --- | --- |
| `theme_color` e `background_color` do manifesto, `<meta name="theme-color">` | O navegador exige valor literal | `hsl(...)` espelhando os tokens, com comentário apontando a origem |
| Tema do Monaco | O Monaco só aceita hexadecimal | `src/lib/monaco/theme-from-tokens.ts` lê os tokens CSS e converte em runtime |
| Preâmbulo LaTeX do diff | Cores vivem no PDF | `xcolor` com misturas nomeadas (`green!50!black`), definidas só no worker |
| Ícone do app (`public/icons/icon.svg`) | Arquivo de imagem | `hsl(...)` dos tokens |

## 3. Tipografia

| Uso | Fonte | Classe |
| --- | --- | --- |
| Interface | Inter, com fallback `system-ui` | `font-sans` |
| Código e LaTeX | JetBrains Mono, com fallback `ui-monospace` | `font-mono` |

Escala: `text-xs` (metadados, barras de painel), `text-sm` (padrão da interface), `text-base` e `text-lg` (títulos de tela). Títulos de tela em `font-semibold`.

## 4. Forma, espaço e elevação

- Raio base `--radius: 0.5rem`; `rounded-lg`, `rounded-md`, `rounded-sm` derivam dele.
- Altura do cabeçalho do editor: token `--header-height` (`h-header`, 3rem).
- Barras de painel (nome do arquivo, zoom do PDF): `h-9`.
- Elevação: `shadow-sm` em botões, `shadow-md` em páginas de PDF e menus, `shadow-2xl` só no painel flutuante de IA.

## 5. Ícones

- Biblioteca: `lucide-react`, tamanho padrão `size-4` (definido no `Button`).
- Botão só com ícone exige `aria-label` em português.
- Ícones de referência: `Play` (compilar), `Send` (solicitar revisão), `History` (versões), `GitCompare` (ver alterações), `Sparkles` (IA), `FolderTree` (arquivos).

## 6. Texto da interface

- Português do Brasil, frases curtas, sem travessão, sem emojis, sem setas.
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
