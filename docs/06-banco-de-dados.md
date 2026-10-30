# 06. Banco de dados (Firestore e Storage)

A fonte da verdade dos tipos é `shared/firestore/types.ts`; os caminhos estão em `shared/firestore/paths.ts`; as permissões em `firestore.rules` e `storage.rules`. Este documento explica o modelo e as decisões.

## 1. Árvore de coleções

```
users/{uid}                                              perfil e preferências
  notifications/{notificationId}                         notificações in-app

projects/{projectId}                                     projeto, membros e contadores
  files/{fileId}                                         árvore de arquivos (rascunho mutável)
  documents/{documentId}                                 documentos compiláveis (principal e secundários)
  snapshots/{snapshotId}                                 versão congelada (IMUTÁVEL)
    grants/{uid}                                         acesso de revisor a este snapshot
  reviews/{reviewId}                                     rodada de revisão (fila estilo PR)
    threads/{threadId}                                   comentário ancorado em texto ou pin espacial
      comments/{commentId}                               mensagens da thread
  diffJobs/{diffKey}                                     job e resultado do PDF de diff
  jobs/{jobId}                                           compilação e congelamento em andamento
  aiConversations/{conversationId}                       conversa privada com a IA
    messages/{messageId}
  referenceChecks/{checkId}                              relatórios de verificação de referências

invites/{inviteId}                                       convites por e-mail (só servidor)
mail/{mailId}                                            fila da extensão Trigger Email (só servidor)
```

## 2. Coleções

### 2.1 `projects/{projectId}`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `name`, `description` | string, string ou null | |
| `ownerId` | string | uid do dono |
| `members` | mapa `uid: 'owner' \| 'editor' \| 'viewer'` | Fonte da verdade das regras |
| `memberIds` | string[] | Espelho das chaves de `members` para `array-contains` |
| `engine` | `'pdflatex' \| 'xelatex' \| 'lualatex'` | Motor padrão |
| `mainDocumentId` | string | Documento exibido ao revisor por padrão |
| `latestSnapshotId` | string ou null | |
| `counters` | `{ snapshots, reviews }` | Atualizados em transação pelo servidor |
| `stats` | `{ fileCount, totalBytes }` | |
| `createdAt`, `updatedAt`, `archivedAt` | Timestamp | |

```json
{
  "name": "Tese de Mestrado",
  "description": null,
  "ownerId": "uidAna",
  "members": { "uidAna": "owner", "uidBia": "editor" },
  "memberIds": ["uidAna", "uidBia"],
  "engine": "pdflatex",
  "mainDocumentId": "docMain",
  "latestSnapshotId": "snap_0003",
  "counters": { "snapshots": 3, "reviews": 2 },
  "stats": { "fileCount": 42, "totalBytes": 3811200 }
}
```

### 2.2 `projects/{projectId}/files/{fileId}`

Rascunho vivo do autor. Texto até 512 KiB fica inline em `content` (o limite do documento é 1 MiB); binários e textos maiores vão para o Storage em `blobs/{sha256}`.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `name`, `path` | string | `path` normalizado: `capitulos/introducao.tex` |
| `parentId` | string ou null | Pasta pai |
| `kind` | `folder, tex, bib, sty, cls, image, pdf, data, other` | |
| `content` | string ou null | Texto inline |
| `blobPath` | string ou null | `projects/{id}/blobs/{sha256}` |
| `contentHash` | string ou null | sha256 do conteúdo |
| `size` | number | bytes |
| `revision` | number | Incrementa a cada gravação; usado no autosave e no congelamento |
| `updatedAt`, `updatedBy` | Timestamp, string | |

O índice de `content` é desligado (`fieldOverrides`) para não pagar indexação de texto grande.

### 2.3 `projects/{projectId}/documents/{documentId}`

Documento compilável, isto é, um ponto de entrada `.tex` com PDF próprio (ex.: tese, apêndice, carta de resposta).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `title` | string | |
| `role` | `'main' \| 'secondary'` | O revisor vê o `main`; `secondary` só com concessão |
| `rootFileId`, `rootPath` | string | |
| `engine` | motor ou null | Nulo herda do projeto |
| `order` | number | |
| `lastBuild` | objeto ou null | `{ status, pdfPath, logPath, sourceHash, durationMs, finishedAt }`, escrito pelo worker |

### 2.4 `projects/{projectId}/snapshots/{snapshotId}` (imutável)

Criado uma única vez pelo servidor, depois de compilar todos os documentos. Nenhum cliente escreve aqui.

```json
{
  "label": "1.0",
  "version": { "major": 1, "minor": 0 },
  "sequence": 1,
  "parentSnapshotId": null,
  "message": "Capítulos 1 a 3 para revisão",
  "engine": "pdflatex",
  "files": [
    { "path": "main.tex", "hash": "9f2c...e1", "size": 4210, "kind": "tex" },
    { "path": "figuras/arquitetura.pdf", "hash": "77ab...03", "size": 182733, "kind": "pdf" }
  ],
  "sourceHash": "c41d...9a",
  "documents": {
    "docMain": {
      "title": "Tese",
      "role": "main",
      "rootPath": "main.tex",
      "pdfPath": "projects/p1/snapshots/snap_0001/docMain.pdf",
      "pdfSha256": "a0b1...ff",
      "pageCount": 87,
      "synctexPath": "projects/p1/snapshots/snap_0001/docMain.synctex.gz",
      "pageTextPath": "projects/p1/snapshots/snap_0001/docMain.pages.json"
    }
  },
  "stats": { "words": 31250, "pages": 87 },
  "createdBy": "uidAna"
}
```

Por que `files` é array e não mapa: caminhos têm `/` e `.`, que exigiriam escape em field paths; o manifesto é lido inteiro, nunca consultado por campo.

### 2.5 `projects/{projectId}/snapshots/{snapshotId}/grants/{uid}`

A existência do documento libera a leitura do snapshot para um não membro. `documentIds` define quais PDFs ele pode abrir (o principal sempre incluso).

```json
{ "documentIds": ["docMain", "docApendice"], "reviewIds": ["rev_0002"], "grantedBy": "uidAna", "expiresAt": null }
```

### 2.6 `projects/{projectId}/reviews/{reviewId}`

Uma rodada de revisão sobre um snapshot. O conjunto ordenado de revisões do projeto é a **fila de revisão**.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `number` | number | Exibido como "#2" |
| `title`, `description` | string | |
| `projectName` | string | Denormalizado: o revisor não lê o projeto |
| `snapshotId`, `snapshotLabel` | string | Versão revisada |
| `baseSnapshotId` | string ou null | Versão anterior, base do diff |
| `previousReviewId` | string ou null | Rodada anterior (threads pendentes) |
| `requestedBy`, `requestedAt` | | |
| `reviewerEmail` | string | Minúsculas |
| `reviewerUid`, `reviewerName` | string ou null | Preenchidos ao aceitar o convite |
| `status` | `invited, in_review, changes_requested, approved, closed` | |
| `grantedDocumentIds` | string[] | |
| `threadCounts` | `{ open, resolved, total }` | Mantido por trigger |
| `lastActivityAt`, `closedAt` | Timestamp | |

Máquina de estados:

| De | Para | Quem |
| --- | --- | --- |
| `invited` | `in_review` | Função `acceptInvite` |
| `in_review` | `changes_requested` ou `approved` | Revisor |
| `changes_requested` | `in_review` | Autor (reabre) ou nova rodada |
| qualquer | `closed` | Autor |

### 2.7 `reviews/{reviewId}/threads/{threadId}`

```json
{
  "projectId": "p1",
  "reviewId": "rev_0002",
  "snapshotId": "snap_0003",
  "documentId": "docMain",
  "kind": "text",
  "anchor": {
    "type": "text",
    "page": 12,
    "rects": [
      { "x": 0.118, "y": 0.402, "width": 0.764, "height": 0.016 },
      { "x": 0.118, "y": 0.420, "width": 0.312, "height": 0.016 }
    ],
    "quote": {
      "exact": "os resultados indicam uma melhora significativa",
      "prefix": "Conforme a Tabela 3, ",
      "suffix": " em relação ao método"
    },
    "position": { "start": 1843, "end": 1890 }
  },
  "status": "open",
  "resolution": null,
  "sourceHint": { "path": "capitulos/resultados.tex", "line": 48, "column": null },
  "carriedFromThreadId": null,
  "createdBy": "uidRevisor",
  "createdByRole": "reviewer",
  "commentCount": 3,
  "participantIds": ["uidRevisor", "uidAna"],
  "lastCommentAt": "2026-10-30T14:02:11Z"
}
```

Pin espacial com desenho livre:

```json
{
  "kind": "pin",
  "anchor": {
    "type": "pin",
    "page": 7,
    "point": { "x": 0.62, "y": 0.31 },
    "drawing": {
      "bounds": { "x": 0.48, "y": 0.22, "width": 0.30, "height": 0.18 },
      "strokes": [
        {
          "tool": "pen",
          "color": "annotation-2",
          "width": 0.004,
          "points": [0.50, 0.25, 0.55, 0.23, 0.70, 0.24, 0.76, 0.31, 0.70, 0.38, 0.52, 0.37, 0.49, 0.30]
        }
      ]
    }
  }
}
```

Decisões da âncora:

- **Coordenadas normalizadas (0 a 1)** relativas à página, origem no canto superior esquerdo: independem de zoom, DPI e tamanho de tela.
- **Três seletores de texto** (geometria, citação com contexto, posição no texto da página). Se a posição não bater, a citação com prefixo e sufixo reencontra o trecho; se nada bater, a thread vira `outdated`.
- **Pontos achatados** (`[x0, y0, x1, y1, ...]`): o Firestore não aceita array diretamente dentro de array. Traços são simplificados com Ramer-Douglas-Peucker (epsilon 0.002) e limitados a 2.000 pontos por desenho, mantendo a thread bem abaixo de 1 MiB.
- **Cor como token** (`annotation-2`), nunca como valor de cor.
- **`sourceHint`** vem do SyncTeX do snapshot e permite "Abrir no código" na linha certa.
- O índice do campo `anchor` é desligado: não há consultas por ele.

Resolução: o autor marca `status: 'resolved'` com `resolution.kind: 'fixed_next_version'`. Quando o próximo snapshot é congelado, a função preenche `resolution.fixedInSnapshotId` em todas as threads resolvidas desde o anterior.

### 2.8 `threads/{threadId}/comments/{commentId}`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `authorId`, `authorName`, `authorPhotoURL`, `authorRole` | | `authorId` precisa ser o próprio usuário |
| `kind` | `comment, status_change, system` | Cliente só cria `comment` |
| `body` | string (Markdown, até 10.000 caracteres) | Renderizado com `MarkdownContent` |
| `statusChange` | `{ from, to }` ou null | Escrito pelo trigger ao mudar status |
| `createdAt`, `editedAt`, `deletedAt` | | Exclusão lógica |

A thread e o primeiro comentário são criados no mesmo `writeBatch`. Um trigger `onCommentCreated` atualiza `commentCount`, `participantIds`, `lastCommentAt`, `threadCounts` da revisão e as notificações.

### 2.9 `projects/{projectId}/diffJobs/{diffKey}`

`diffKey = sha256(base.sourceHash + ':' + target.sourceHash + ':' + documentId + ':' + engineVersion)`. Pedidos repetidos caem no mesmo documento e no mesmo PDF.

```json
{
  "documentId": "docMain",
  "baseSnapshotId": "snap_0002",
  "targetSnapshotId": "snap_0003",
  "engineVersion": "diff-1.0.0",
  "status": "done",
  "granularity": "word",
  "pdfPath": "projects/p1/diffs/5be0...c2.pdf",
  "logPath": "projects/p1/diffs/5be0...c2.log",
  "stats": { "insertedWords": 412, "deletedWords": 157, "changedBlocks": 23 },
  "changes": [{ "id": "d17", "kind": "mod", "page": 12, "y": 0.41, "preview": "os resultados indicam" }],
  "error": null
}
```

### 2.10 `jobs`, `aiConversations`, `referenceChecks`

- `jobs/{jobId}`: `{ type: 'compile' | 'snapshot', status, progress, result, error }`. O cliente acompanha com `onSnapshot`.
- `aiConversations/{id}` e `messages/{id}`: privados do criador; mensagens gravadas pelo backend ao fim de cada stream, incluindo `structured` (já validado por Zod), `contextRefs` e `usage`.
- `referenceChecks/{id}`: relatório final de `checkReferences` (mesmo formato de `ReferenceAuditSchema`).

### 2.11 Coleções do servidor

- `invites/{sha256(token)}`: `{ projectId, reviewId, email, expiresAt, acceptedAt, acceptedBy }`. O token puro só existe no e-mail.
- `mail/{id}`: `{ to, message: { subject, text, html } }`, consumido pela extensão Trigger Email.

## 3. Storage

| Caminho | Conteúdo | Escrita | Leitura |
| --- | --- | --- | --- |
| `projects/{id}/blobs/{sha256}` | Conteúdo por hash | owner/editor (create), imutável | membros |
| `projects/{id}/builds/{documentId}/latest.pdf` e `.log` | Última compilação | worker | membros |
| `projects/{id}/snapshots/{sid}/{documentId}.pdf` | PDF congelado | worker | membros e revisor com o documento no grant |
| `.../{documentId}.synctex.gz`, `.pages.json` | SyncTeX e texto por página | worker | idem |
| `projects/{id}/diffs/{diffKey}.pdf` e `.log` | PDF de diff | worker | membros; revisor via URL assinada |

## 4. Regras de segurança (resumo)

| Recurso | Ler | Escrever |
| --- | --- | --- |
| `projects` | membros (`list` exige `memberIds array-contains uid`) | criar como dono; editar campos simples como owner/editor |
| `files`, `documents` | membros | owner/editor; `lastBuild` só servidor |
| `snapshots` | membros ou grant | ninguém (servidor) |
| `reviews` | membros ou o revisor | servidor cria; autor e revisor mudam status permitido |
| `threads` | membros ou o revisor | criar com âncora válida no snapshot e documento concedidos; atualizar só status e resolução |
| `comments` | membros ou o revisor | criar como si mesmo; editar o próprio |
| `diffJobs` | membros ou quem tem grant nos dois snapshots | servidor |
| `aiConversations` | só o criador | servidor (mensagens) |
| `invites`, `mail` | ninguém | servidor |

Os cenários ficam em `tests/rules/` e rodam com `npm run test:rules` nos emuladores. No ambiente onde a suíte foi criada, os 23 cenários do Firestore passaram (dono, editor, viewer, revisor e estranho). No Storage, os 3 cenários de negação passaram, mas os 2 de permissão que dependem de consulta ao Firestore (`firestore.get` e `firestore.exists`) falharam porque o emulador não executou nem o exemplo mínimo dessas funções. Confirmar esses dois cenários em máquina local ou homologação antes do primeiro deploy está em `10-manutencao-e-granularidade.md`.

## 5. Índices

Declarados em `firestore.indexes.json`:

| Coleção | Campos | Uso |
| --- | --- | --- |
| `projects` | `memberIds` (contains) + `updatedAt` desc | Lista "Meus projetos" |
| `reviews` (collection group) | `reviewerUid` + `lastActivityAt` desc | Painel "Minhas revisões" |
| `reviews` | `status` + `requestedAt` desc | Fila de revisão do projeto |
| `threads` | `documentId` + `status` + `createdAt` | Threads da página atual |
| `threads` (collection group) | `projectId` + `status` + `updatedAt` desc | Pendências do projeto e carimbo `fixedInSnapshotId` |
| `notifications` | `read` + `createdAt` desc | Central de notificações |

## 6. Invariantes

1. Snapshot nunca muda depois de criado; blobs por hash nunca mudam.
2. `memberIds` é sempre igual às chaves de `members` (só funções alteram os dois).
3. Toda thread pertence a exatamente um snapshot e um documento concedido na revisão.
4. Contadores (`threadCounts`, `commentCount`, `counters`) só são escritos pelo servidor.
5. Um revisor só enxerga o que está em `grants`: nunca o rascunho em `files`.

## 7. Retenção

- Rascunhos: enquanto o projeto existir.
- Snapshots e blobs: permanentes (são o histórico auditável). Blobs sem referência em nenhum snapshot nem em `files` são coletados por job semanal.
- PDFs de diff: regeneráveis; regra de ciclo de vida do bucket remove após 90 dias sem acesso.
- Convites: expiram em 14 dias.
