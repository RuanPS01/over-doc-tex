# 06. Banco de dados (Firestore e Storage)

A fonte da verdade dos tipos é `shared/firestore/types.ts`; os caminhos estão em `shared/firestore/paths.ts`; as permissões em `firestore.rules` e `storage.rules`, testadas em `tests/rules/`.

**Não há servidor:** toda gravação vem do app de quem age. As regras validam cada documento e, nos fluxos que envolvem vários documentos, a coerência entre eles no mesmo lote (`writeBatch`), com `getAfter` e `existsAfter`.

## 1. Árvore de coleções

```
users/{uid}                                              perfil e preferências
  private/ai                                             configuração da IA (chaves): só o dono
  notifications/{notificationId}                         notificações gravadas por quem age

projects/{projectId}                                     projeto, membros, convites e contadores
  files/{fileId}                                         árvore de arquivos (rascunho mutável)
  documents/{documentId}                                 documentos compiláveis (principal e secundários)
  snapshots/{snapshotId}                                 versão congelada (IMUTÁVEL)
    grants/{email}                                       acesso de revisor por e-mail verificado
  reviews/{reviewId}                                     rodada de revisão (fila estilo PR)
    threads/{threadId}                                   comentário ancorado em texto ou pin espacial
      comments/{commentId}                               mensagens da thread
  diffs/{diffKey}                                        cache do PDF de diff
  aiConversations/{conversationId}                       conversa privada com a IA
    messages/{messageId}
  referenceChecks/{checkId}                              relatórios de verificação de referências
```

## 2. Coleções

### 2.1 `users/{uid}/private/ai`

Configuração da IA do usuário (`UserAiConfigDoc`): lista ordenada de modelos, o primeiro é o principal. Reserva com `apiKey` vazia herda a chave do item anterior do mesmo provedor. Só o dono lê e grava. Detalhes em `11-servico-de-ia.md`.

```json
{
  "models": [
    { "provider": "gemini", "model": null, "apiKey": "<chave do usuário>" },
    { "provider": "gemini", "model": "gemini-2.5-flash", "apiKey": "" },
    { "provider": "anthropic", "model": null, "apiKey": "<outra chave>" }
  ],
  "updatedAt": "2026-10-31T12:00:00Z"
}
```

### 2.2 `projects/{projectId}`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `name`, `description` | string, string ou null | |
| `ownerId` | string | uid do dono |
| `members` | mapa `uid: 'owner' \| 'editor' \| 'viewer'` | Fonte da verdade das regras |
| `memberIds` | string[] | Espelho das chaves de `members` para `array-contains` |
| `pendingMembers` | mapa `email: 'editor' \| 'viewer'` | Convites de coautoria; o convidado se adiciona ao aceitar |
| `engine` | `'pdflatex' \| 'xelatex' \| 'lualatex'` | Motor padrão |
| `mainDocumentId` | string | Documento exibido ao revisor por padrão |
| `latestSnapshotId` | string ou null | |
| `counters` | `{ snapshots, reviews }` | Só aceitam +1, no lote do snapshot ou da revisão |
| `stats`, `createdAt`, `updatedAt`, `archivedAt` | | |

### 2.3 `projects/{projectId}/files/{fileId}`

Rascunho vivo. Texto até 512 KiB fica inline em `content`; binários e textos maiores vão para `blobs/{sha256}`. As **pastas são derivadas dos caminhos** (`path`): a árvore e a importação não criam documentos de pasta; `kind: 'folder'` fica reservado para pastas vazias.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `name`, `path` | string | `path` normalizado: `capitulos/introducao.tex` |
| `parentId` | string ou null | Nulo para arquivos criados pela importação |
| `kind` | `folder, tex, bib, sty, cls, image, pdf, data, other` | Classificado pela extensão |
| `content` | string ou null | Texto inline |
| `blobPath`, `contentHash` | string ou null | `projects/{id}/blobs/{sha256}` |
| `size`, `revision` | number | `revision` sobe a cada gravação |
| `updatedAt`, `updatedBy` | | `updatedBy` precisa ser quem grava |

### 2.4 `projects/{projectId}/documents/{documentId}`

Ponto de entrada compilável com PDF próprio (tese, apêndice, carta de resposta): `title`, `role` (`main` ou `secondary`), `rootFileId`, `rootPath`, `engine`, `order` e `lastBuild` (`{ status, pdfPath, logPath, sourceHash, durationMs, finishedAt }`), gravado pelo app depois da compilação no navegador.

### 2.5 `projects/{projectId}/snapshots/{snapshotId}` (imutável)

Gravado uma vez, no lote que avança `counters.snapshots`, depois de enviar blobs e PDFs.

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
  "createdBy": "uidBia"
}
```

`files` é array porque caminhos têm `/` e `.`, que exigiriam escape em field paths, e o manifesto é sempre lido inteiro.

### 2.6 `snapshots/{snapshotId}/grants/{email}`

O id é o e-mail do revisor em minúsculas. A existência do documento libera a leitura do snapshot para quem entrar com esse e-mail **verificado**; `documentIds` define quais PDFs ele abre.

```json
{ "documentIds": ["docMain", "docApendice"], "reviewIds": ["rev_0002"], "grantedBy": "uidAna", "expiresAt": null }
```

### 2.7 `projects/{projectId}/reviews/{reviewId}`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `number` | number | Sequencial ("#2"); igual ao `counters.reviews` do mesmo lote |
| `title`, `description`, `projectName` | string | `projectName` denormalizado para o revisor |
| `snapshotId`, `snapshotLabel`, `baseSnapshotId`, `previousReviewId` | | |
| `requestedBy`, `requestedAt` | | |
| `reviewerEmail` | string | Minúsculas; chave da permissão do revisor |
| `reviewerUid`, `reviewerName` | string ou null | Preenchidos pelo revisor ao abrir |
| `status` | `invited, in_review, changes_requested, approved, closed` | |
| `grantedDocumentIds` | string[] | |
| `lastActivityAt`, `closedAt` | | |

As contagens de threads abertas e resolvidas vêm de consultas de agregação (`getCountFromServer`), não de campos mantidos à mão.

| De | Para | Quem |
| --- | --- | --- |
| `invited` | `in_review` | Revisor, ao abrir |
| `in_review` | `changes_requested` ou `approved` | Revisor |
| `changes_requested` | `in_review` | Autor ou nova rodada |
| qualquer | `closed` | Autor |

### 2.8 `reviews/{reviewId}/threads/{threadId}` e `comments`

A thread guarda a âncora (texto ou pin com desenho, coordenadas de 0 a 1), status, resolução, `sourceHint` (SyncTeX) e os contadores `commentCount`, `participantIds` e `lastCommentAt`, que o app atualiza no mesmo lote do comentário (as regras só aceitam +1 e a entrada do próprio autor nos participantes).

```json
{
  "projectId": "p1",
  "reviewId": "rev_0002",
  "snapshotId": "snap_0003",
  "documentId": "docMain",
  "kind": "pin",
  "anchor": {
    "type": "pin",
    "page": 7,
    "point": { "x": 0.62, "y": 0.31 },
    "drawing": {
      "bounds": { "x": 0.48, "y": 0.22, "width": 0.30, "height": 0.18 },
      "strokes": [
        { "tool": "pen", "color": "annotation-2", "width": 0.004, "points": [0.50, 0.25, 0.55, 0.23, 0.70, 0.24, 0.76, 0.31] }
      ]
    }
  },
  "status": "open",
  "resolution": null,
  "createdBy": "uidRevisor",
  "createdByRole": "reviewer",
  "commentCount": 1,
  "participantIds": ["uidRevisor"]
}
```

Decisões da âncora: coordenadas normalizadas (independem de zoom e tela); três seletores de texto (geometria, citação com contexto, posição) para reancorar; pontos achatados (`[x0, y0, x1, y1, ...]`, porque o Firestore não aceita array dentro de array), simplificados e limitados a 2.000 por desenho; cor como token (`annotation-2`).

Resolução: o autor marca `resolved` com `fixed_next_version`; ao congelar a próxima versão, quem edita carimba `resolution.fixedInSnapshotId` (as regras só permitem mudar esse campo nesse caso).

### 2.9 `projects/{projectId}/diffs/{diffKey}`

Cache do PDF de diff gerado no navegador. `diffKey = base_alvo_documento_versãoDoMotor`; como snapshots são imutáveis, a mesma chave sempre produz o mesmo resultado. Gravado uma vez por quem edita; revisores leem quando têm grant na versão alvo.

```json
{
  "documentId": "docMain",
  "baseSnapshotId": "snap_0002",
  "targetSnapshotId": "snap_0003",
  "engineVersion": "diff-1.0.0",
  "granularity": "word",
  "pdfPath": "projects/p1/snapshots/snap_0003/diffs/snap_0002/docMain/diff-1.0.0.pdf",
  "stats": { "insertedWords": 412, "deletedWords": 157, "changedBlocks": 23 },
  "changes": [{ "id": "d17", "kind": "mod", "page": 12, "y": 0.41, "preview": "os resultados indicam" }],
  "createdBy": "uidBia"
}
```

### 2.10 Demais coleções

- `aiConversations/{id}` e `messages/{id}`: privados do criador, gravados pelo app.
- `referenceChecks/{id}`: relatório final de `checkReferences`, gravado por um membro.
- `users/{uid}/notifications/{id}`: gravadas pelo app de quem age (membro do projeto ou revisor da revisão citada).

## 3. Storage

| Caminho | Conteúdo | Escrita | Leitura |
| --- | --- | --- | --- |
| `projects/{id}/blobs/{sha256}` | Conteúdo por hash | owner/editor (criar), imutável | membros |
| `projects/{id}/builds/{documentId}/latest.pdf` | Última compilação | owner/editor | membros |
| `projects/{id}/snapshots/{sid}/{documentId}.pdf` (e `.synctex.gz`, `.pages.json`) | Arquivos da versão | owner/editor, só **antes** do documento do snapshot existir | membros e revisor com o documento no grant |
| `projects/{id}/snapshots/{sid}/diffs/{baseSid}/{documentId}/{versão}.pdf` | PDF de diff | owner/editor, imutável | membros e revisor com o documento no grant |

As regras do Storage fazem no máximo duas leituras do Firestore por pedido.

## 4. Gravações em lote validadas pelas regras

| Fluxo | Documentos no mesmo lote | O que as regras conferem |
| --- | --- | --- |
| Congelar versão | `snapshots/{novo}` mais `projects/{id}` (`counters.snapshots`, `latestSnapshotId`) | Sequência igual ao contador anterior mais 1 e ao contador depois do lote; `latestSnapshotId` aponta para o snapshot criado |
| Abrir revisão | `grants/{email}` mais `reviews/{nova}` mais `projects/{id}` (`counters.reviews`) | Número igual ao contador anterior mais 1; snapshot e grant existem depois do lote |
| Comentar | `comments/{novo}` mais a thread (`commentCount`, `participantIds`) | Contador sobe exatamente 1; só o autor entra nos participantes |
| Aceitar convite de coautoria | `projects/{id}` (`members`, `memberIds`, `pendingMembers`) | O usuário entra com o papel do convite do próprio e-mail verificado, e o convite some |
| Carimbar correção | thread (`resolution.fixedInSnapshotId`) | Só esse campo, só em thread resolvida e ainda sem carimbo |

## 5. Regras de segurança (resumo)

| Recurso | Ler | Escrever |
| --- | --- | --- |
| `users/{uid}/private/ai` | só o dono | só o dono |
| `projects` | membros e convidados por e-mail (`list` exige `memberIds array-contains uid`) | criar como dono, com contadores zerados; detalhes por owner/editor; membros e convites pelo dono; aceite pelo convidado |
| `files`, `documents` | membros | owner/editor |
| `snapshots` | membros ou grant por e-mail | criar no lote de congelamento; nunca alterar |
| `grants` | membros ou o próprio e-mail | owner/editor |
| `reviews` | membros ou o revisor (e-mail) | criar no lote de abertura; autor e revisor mudam status permitido |
| `threads`, `comments` | membros ou o revisor | criar com âncora válida; status, contador e carimbo conforme a seção 4 |
| `diffs` | membros ou grant na versão alvo | owner/editor, uma vez |
| `aiConversations`, `messages` | só o criador | só o criador |
| `notifications` | só o destinatário | quem age, se participa do projeto ou da revisão |

**Testes** (`npm run test:rules`): 47 de 47 cenários do Firestore aprovados no emulador. No Storage, 4 de 7: os 3 cenários de permissão que dependem de consulta ao Firestore (`firestore.get`, `firestore.exists`) não passaram no ambiente onde a suíte foi criada, porque lá o emulador não executou nem o exemplo mínimo dessas funções. O job `rules-tests` do CI é o primeiro ambiente limpo onde eles rodam.

## 6. Índices

| Coleção | Campos | Uso |
| --- | --- | --- |
| `projects` | `memberIds` (contains) + `updatedAt` desc | "Meus projetos" |
| `reviews` (collection group) | `reviewerEmail` + `lastActivityAt` desc | "Minhas revisões" |
| `reviews` | `status` + `requestedAt` desc | Fila de revisão do projeto |
| `threads` | `documentId` + `status` + `createdAt` | Threads da página atual |
| `notifications` | `read` + `createdAt` desc | Central de notificações |

Índices de campos grandes desligados (`fieldOverrides`): `files.content`, `snapshots.files`, `threads.anchor`.

## 7. Invariantes

1. Snapshot nunca muda; blob por hash nunca muda; arquivos de uma versão só sobem antes de ela ser congelada.
2. `memberIds` é sempre igual às chaves de `members`.
3. Contadores só sobem de 1 em 1, no lote do documento que contam.
4. Toda thread pertence a um snapshot e a um documento concedido na revisão.
5. Um revisor só enxerga o que está nos grants do próprio e-mail verificado.
6. Chaves de IA ficam só em `users/{uid}/private/ai` ou no navegador do usuário.

## 8. Retenção

- Rascunhos: enquanto o projeto existir.
- Snapshots e blobs: permanentes (histórico auditável).
- PDFs de diff: regeneráveis; regra de ciclo de vida do bucket remove após 90 dias sem acesso.
