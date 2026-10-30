# 05. Padrões de nomes

## 1. Idioma

| Onde | Idioma |
| --- | --- |
| Identificadores (variáveis, funções, tipos, arquivos, coleções, campos) | Inglês |
| Textos de interface, mensagens de erro, comentários, documentação, commits | Português do Brasil |

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

## 4. Firestore e Storage

| Elemento | Padrão | Exemplo |
| --- | --- | --- |
| Coleções | `camelCase`, plural | `projects`, `aiConversations`, `diffJobs` |
| Campos | `camelCase` | `reviewerUid`, `lastActivityAt` |
| Datas | sufixo `At` (Timestamp) | `createdAt`, `resolvedAt` |
| Referências | sufixo `Id` ou `Ids` | `snapshotId`, `memberIds` |
| Caminhos do Storage | `kebab-case` ou ids, extensões reais | `projects/{id}/snapshots/{sid}/{documentId}.pdf` |
| IDs determinísticos | hash hexadecimal | `diffKey`, `invites/{sha256(token)}` |

Todo caminho é montado por `firestorePaths` ou `storagePaths` (`shared/firestore/paths.ts`).

## 5. React Query

Chaves vêm de `src/lib/query-keys.ts`, sempre como array do mais geral para o mais específico:

```ts
queryKeys.files(projectId)                 // ['project', projectId, 'files']
queryKeys.threads(projectId, reviewId)     // ['project', projectId, 'reviews', reviewId, 'threads']
```

## 6. Backend

| Elemento | Padrão | Exemplo |
| --- | --- | --- |
| Cloud Functions exportadas | `camelCase`, verbo ou substantivo de ação | `aiStream`, `requestReview`, `acceptInvite` |
| Triggers | `on` + recurso + evento | `onCommentCreated`, `onThreadUpdated` |
| Tarefas de IA | `camelCase`, verbo | `rewriteText`, `checkReferences`, `updateToc` |
| Segredos e parâmetros | `UPPER_SNAKE_CASE` | `ANTHROPIC_API_KEY`, `ALLOWED_ORIGINS` |
| Macros LaTeX do diff | prefixo `\DIF` | `\DIFadd`, `\DIFdelenv` |

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
- Escopos usuais: `editor`, `revisao`, `diff`, `ia`, `banco`, `regras`, `pwa`, `functions`, `worker`.

## 9. Textos da interface

- Rótulos de botão no infinitivo: "Compilar", "Ver alterações".
- `aria-label` sempre em português e descrevendo a ação: "Abrir arquivos", "Mais ações".
- Nada de travessão, emojis ou setas.
