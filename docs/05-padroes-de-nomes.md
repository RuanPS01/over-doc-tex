# 05. Padrões de nomes

## 1. Idioma

| Onde | Idioma |
| --- | --- |
| Identificadores (variáveis, funções, tipos, arquivos, coleções, campos) | Inglês |
| Comentários, documentação, commits | Português do Brasil |
| Textos de interface e mensagens de erro | Português do Brasil no código, como chave de `t()`; inglês e espanhol nos dicionários de `src/lib/i18n/messages` |

## 2. Arquivos e pastas

| Tipo | Padrão | Exemplo |
| --- | --- | --- |
| Arquivos de código | `kebab-case` | `editor-header.tsx`, `use-ai-stream.ts` |
| Componente React | um componente exportado principal por arquivo, nome do arquivo igual ao do componente em kebab-case | `EditorHeader` em `editor-header.tsx` |
| Página | sufixo `-page`, export default | `editor-page.tsx` |
| Hook | prefixo `use-` no arquivo e `use` na função | `use-project-files.ts` / `useProjectFiles` |
| Provider de contexto | sufixo `-provider` ou `-store` | `auth-provider.tsx`, `editor-store.tsx` |
| Pastas de feature | substantivo em kebab-case | `ai-assistant`, `pdf-viewer` |
| Documentação | número de dois dígitos e tema | `07-fluxos.md` |

## 3. TypeScript

| Elemento | Padrão | Exemplo |
| --- | --- | --- |
| Tipos e interfaces | `PascalCase` | `EditorFile`, `ThreadAnchor` |
| Documento do Firestore | sufixo `Doc` | `ProjectDoc`, `ThreadDoc` |
| Schema Zod | sufixo `Schema`; tipo inferido sem sufixo | `AiRequestSchema` / `AiRequest` |
| Uniões de status | literais em `snake_case` | `'changes_requested'`, `'fixed_next_version'` |
| Funções e variáveis | `camelCase`, verbo para ações | `buildUserMessage`, `isFirebaseConfigured` |
| Constantes de módulo | `UPPER_SNAKE_CASE` | `MAX_CHUNK_CHARS`, `AI_MODEL` |
| Booleanos | prefixo `is`, `has`, `can`, `should` | `isStreaming`, `canEdit` |
| Handlers de evento | `handle` + evento; props `on` + evento | `handleKeyDown` / `onSend` |

Não usar `enum`, `namespace` nem `any`.

## 4. Firestore

| Elemento | Padrão | Exemplo |
| --- | --- | --- |
| Coleções | `camelCase`, plural | `projects`, `aiConversations`, `diffJobs` |
| Campos | `camelCase` | `reviewerUid`, `lastActivityAt` |
| Datas | sufixo `At` (Timestamp) | `createdAt`, `resolvedAt` |
| Referências | sufixo `Id` ou `Ids` | `snapshotId`, `memberIds` |
| Arquivos em pedaços | cabeçalho com id significativo e subcoleção `chunks/{índice}` ("0", "1"...) | `blobs/{sha256}`, `snapshots/{sid}/files/main.pdf/chunks/0` |
| IDs determinísticos | hash hexadecimal | `diffKey`, `invites/{sha256(token)}` |

Todo caminho é montado por `firestorePaths` e `snapshotFileName` (`shared/firestore/paths.ts`).

## 5. React Query

Chaves vêm de `src/lib/query-keys.ts`, sempre como array do mais geral para o mais específico:

```ts
queryKeys.files(projectId)                 // ['project', projectId, 'files']
queryKeys.threads(projectId, reviewId)     // ['project', projectId, 'reviews', reviewId, 'threads']
```

## 6. IA, LaTeX e testes

| Elemento | Padrão | Exemplo |
| --- | --- | --- |
| Id de provedor de IA | minúsculas, nome da empresa ou produto | `anthropic`, `openai`, `gemini` |
| Arquivo de provedor | `src/lib/ai/providers/<id>.ts` | `gemini.ts` |
| Tarefas de IA | `camelCase`, verbo | `rewriteText`, `checkReferences`, `updateToc` |
| Eventos do motor de IA | substantivo curto em minúsculas | `status`, `delta`, `switch`, `done` |
| Macros LaTeX do diff | prefixo `\DIF` | `\DIFadd`, `\DIFdelenv` |
| Testes unitários | `tests/unit/<assunto>.test.ts` | `ai-engine.test.ts` |
| Cenários de teste | frase que descreve o comportamento | `'revisor não amplia os documentos concedidos'` |

## 7. CSS e design system

| Elemento | Padrão | Exemplo |
| --- | --- | --- |
| Tokens CSS | `--kebab-case` | `--diff-added-bg`, `--annotation-1` |
| Utilitários próprios | `kebab-case` descritivo | `.h-viewport`, `.pb-safe` |
| Breakpoints próprios | `kebab-case` | `xs`, `landscape-short` |

## 8. Git

- **Branches:** `tipo/descricao-curta`, ex.: `feat/thread-sidebar`, `fix/overflow-lista-projetos`.
- **Commits:** Conventional Commits com descrição em português no imperativo:
  - `feat(editor): adiciona layout responsivo com painéis redimensionáveis`
  - `fix(projetos): evita transbordo da lista em 360px`
  - `docs(banco): documenta coleção diffJobs`
- Tipos aceitos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`.
- Escopos usuais: `editor`, `revisao`, `diff`, `ia`, `banco`, `regras`, `pwa`, `importacao`, `ci`.

## 9. Textos da interface

- Rótulos de botão no infinitivo: "Compilar", "Ver alterações".
- `aria-label` escrito em português dentro de `t()` e descrevendo a ação: `t('Abrir arquivos')`, `t('Mais ações')`.
- A chave de `t()` é sempre uma string literal; partes variáveis entram como `{nome}`: `t('Revisão #{number}', { number })`.
- Nada de travessão, emojis ou setas.
