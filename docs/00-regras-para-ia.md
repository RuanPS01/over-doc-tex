# 00. Regras para IA e desenvolvedores

Este arquivo é lido **antes de qualquer alteração** no repositório, por pessoas e por agentes de IA. Ele resume as regras inegociáveis; os detalhes estão nos demais documentos da pasta `docs/`.

## 1. Ordem de leitura

1. `00-regras-para-ia.md` (este arquivo)
2. `09-contexto-do-produto.md` (o que estamos construindo e para quem)
3. `01-arquitetura.md` (camadas, decisões e estrutura de pastas)
4. O documento específico da tarefa:
   - dados: `06-banco-de-dados.md`
   - telas e componentes: `04-componentes-e-telas.md` e `08-responsividade.md`
   - fluxos (snapshot, revisão, diff, IA): `07-fluxos.md`
   - estilo visual: `03-identidade-visual.md`
   - nomes: `05-padroes-de-nomes.md`
5. `10-manutencao-e-granularidade.md` antes de criar arquivos novos ou dividir código.

## 2. Idioma e texto

- Documentação, textos de interface, mensagens de erro e comentários de código: **português do Brasil**, com acentos e cedilha corretos.
- Identificadores de código (variáveis, funções, tipos, coleções, campos): **inglês**, conforme `05-padroes-de-nomes.md`.
- Em qualquer texto produzido (docs, UI, commits, PRs, respostas da IA): **não usar travessão, não usar emojis e não usar caracteres de seta**. Use vírgulas, dois pontos, parênteses ou listas.

## 3. Proibições

| Proibido | Motivo | Alternativa |
| --- | --- | --- |
| Cores hexadecimais, `rgb()` ou nomes de cor em componentes | Quebra o tema claro/escuro e o design system | Tokens semânticos: `bg-background`, `text-primary`, `border-border` |
| `h-screen` ou `100vh` na casca do editor | Em celulares, `100vh` ignora a barra de endereço | Classe `.h-viewport` (100dvh) com `overflow-hidden` |
| Rolagem horizontal no `body` | Contrato de 360px | `min-w-0`, `truncate`, `grid-cols-1`, menus suspensos |
| `dangerouslySetInnerHTML` fora de `src/components/common/markdown-content.tsx` | XSS | `MarkdownContent`, que sanitiza com DOMPurify |
| Importar o SDK do Firebase em páginas ou componentes visuais | Acoplamento e regras espalhadas | Hooks em `src/features/<domínio>/hooks/` |
| Montar caminhos do Firestore/Storage com template string fora de `shared/firestore/paths.ts` | Caminhos divergentes entre cliente e servidor | `firestorePaths` e `storagePaths` |
| Escrever snapshots, jobs, diffs ou mensagens de IA a partir do cliente | Imutabilidade e integridade | Cloud Functions / latex-worker com Admin SDK |
| `enum` do TypeScript e `any` | Tipos opacos e inseguros | Uniões de literais e `unknown` com validação Zod |
| Aceitar status HTTP de links ou dados factuais vindos do modelo de IA | Alucinação | O backend mede; o modelo só julga semântica |
| Chaves de API ou segredos no frontend ou no repositório | Vazamento | `defineSecret` nas Functions, Secret Manager no Cloud Run |

## 4. Obrigações

- **Validação nas fronteiras:** todo dado que cruza rede (requisição HTTP, linha NDJSON, saída estruturada da IA) passa por um schema Zod de `shared/`.
- **IA sempre em stream NDJSON:** uma linha JSON por evento, deltas de texto incrementais (ver `07-fluxos.md`, Cenário D).
- **Mobile-first:** escreva primeiro o layout de 360px e depois adicione `sm:`, `lg:`.
- **Contratos compartilhados:** tipos de coleção em `shared/firestore/types.ts`; schemas de IA em `shared/ai/schemas.ts`. Mudou o modelo de dados, atualize também `firestore.rules`, `firestore.indexes.json` e `06-banco-de-dados.md` no mesmo commit.
- **Componentes UI puros** (`src/components/ui`) não conhecem domínio, Firebase nem IA.

## 5. Checklist antes de concluir uma tarefa

```bash
npm run typecheck            # TypeScript estrito do frontend e de shared/
npm run build                # build de produção + service worker do PWA
npm run check:conventions    # regras desta página verificadas por script
npm run check:responsive     # contrato de 360px em 4 viewports (requer Playwright)
npm --prefix functions run build   # typecheck + bundle das Cloud Functions
npm run test:rules           # regras do Firestore e do Storage nos emuladores (requer Java 21+)
```

Se uma verificação não puder rodar no seu ambiente, diga isso explicitamente no PR ou na resposta, com o motivo.

## 6. Como a IA deve trabalhar neste repositório

- Ler o código existente antes de propor um padrão novo; seguir o estilo do arquivo vizinho.
- Uma mudança por commit, com mensagem no padrão de `05-padroes-de-nomes.md`.
- Não criar arquivos de documentação fora de `docs/` sem pedido explícito.
- Ao encontrar uma regra deste arquivo em conflito com um pedido, apontar o conflito antes de implementar.
