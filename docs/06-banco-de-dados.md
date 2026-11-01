# 06. Banco de dados (Firestore)

A fonte da verdade dos tipos é `shared/firestore/types.ts`; os caminhos estão em `shared/firestore/paths.ts`; as permissões em `firestore.rules`, testadas em `tests/rules/`.

**Não há Cloud Storage:** binários (imagens, PDFs importados, PDFs das versões e do diff) ficam no próprio Firestore, divididos em pedaços (seção 3). Com isso o projeto inteiro cabe no plano Spark, sem cartão.

**Não há servidor:** toda gravação vem do app de quem age. As regras validam cada documento e, nos fluxos que envolvem vários documentos, a coerência entre eles no mesmo lote (`writeBatch`), com `getAfter` e `existsAfter`.

## 1. Árvore de coleções

```
users/{uid}                                              perfil e preferências
  private/ai                                             configuração da IA (chaves): só o dono
  notifications/{notificationId}                         notificações gravadas por quem age

projects/{projectId}                                     projeto, membros, convites e contadores
  files/{fileId}                                         árvore de arquivos (rascunho mutável)
  blobs/{sha256}                                         cabeçalho de binário endereçado por hash (IMUTÁVEL)
    chunks/{index}                                       pedaços de até 1.000.000 bytes
  documents/{documentId}                                 documentos compiláveis (principal e secundários)
  snapshots/{snapshotId}                                 versão congelada (IMUTÁVEL)
    grants/{email}                                       acesso de revisor por e-mail verificado
    guests/{uid}                                         ficha de quem revisa pelo link, sem conta
    files/{name}                                         {documentId}.pdf, .synctex, .pages (antes de congelar)
      chunks/{index}
  reviews/{reviewId}                                     rodada de revisão (fila estilo PR)
    links/{código}                                       código do link de acesso sem conta (o id é o código)
    threads/{threadId}                                   comentário ancorado em texto ou pin espacial
      comments/{commentId}                               mensagens da thread
  diffs/{diffKey}                                        cache do diff (o campo pdf descreve os pedaços)
    chunks/{index}                                       PDF do diff
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
| `memberProfiles` | mapa `uid: { name, email }` | Nome e e-mail para a lista de membros (`users/{uid}` é privado). Cada membro grava só a própria entrada (ao criar o projeto, ao aceitar o convite, ao abrir um projeto antigo ou ao trocar o nome em "Perfil", que atualiza todos os projetos dele); o dono só remove a entrada de quem sai |
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

Como o app grava hoje (`useFreezeSnapshot`): o manifesto inclui os arquivos de texto como estão na tela (cada um vira um blob, deduplicado pelo hash); cada documento de `documents` (principal e secundários) é compilado no navegador e guarda três arquivos: `{documentId}.pdf`; `{documentId}.pages`, um JSON `{ "pages": ["texto da página 1", ...] }` extraído com o pdf.js, que ancora os comentários em trecho e alimenta o "Ver alterações" do revisor; e `{documentId}.synctex`, o SyncTeX em JSON compacto (`{ "v": 1, "files": [caminhos do projeto], "pages": [[[arquivo, linha, x, y, largura, altura, profundidade], ...]] }`, em pontos do PDF, com as linhas do principal já corrigidas), que dá a linha do código de cada comentário. `stats.words` conta as palavras do principal. A versão é `1.0` na primeira vez e depois `1.1`, `1.2`... ou a próxima principal (`2.0`), à escolha de quem congela.

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
| `reviewerEmail` | string | Minúsculas; e-mail convidado na criação (vazio numa revisão aberta só pelo link) |
| `reviewerEmails` | string[] | Todos os e-mails convidados, inclusive os acrescentados pelo "Envio da revisão". Ausente em revisões antigas (vale `[reviewerEmail]`) |
| `access` | `email` ou `link` | `email`: só os convidados, com login. `link`: também qualquer pessoa com o link, sem conta. Ausente vale `email` |
| `reviewerUid`, `reviewerName` | string ou null | Revisor que agiu por último (ao abrir ou mudar o status); no visitante, o nome que ele informou |
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

### 2.7.1 Revisão pelo link, sem conta

- `reviews/{reviewId}/links/{código}` (`createdBy`, `createdAt`): o id é o código aleatório do link (24 bytes em base64url). Só quem edita lê, cria e apaga. "Gerar novo link" apaga os códigos anteriores no mesmo lote do novo.
- `snapshots/{snapshotId}/guests/{uid}` (`reviewId`, `token`, `name`, `guestKey`, `createdAt`): a ficha do visitante, gravada por ele mesmo depois do login anônimo (ou com a conta, se ele tiver uma e não for convidado). As regras só aceitam se a revisão é da mesma versão, está com `access: link` e o código existe. A ficha vale enquanto as duas coisas continuarem verdadeiras: trocar o link ou voltar a "só e-mails convidados" corta o acesso na hora.
- Com a ficha válida, o visitante lê a revisão, a versão, os PDFs dos documentos concedidos e o diff da versão, cria threads e comentários, muda o status da revisão e notifica quem pediu, como o revisor por e-mail.
- `guestKey` é o nome normalizado (sem acentos, minúsculas, espaços únicos). É a identidade do revisor: o comentário do visitante leva `authorKey` igual a ela, e quem usar o mesmo nome em outro aparelho (outra sessão anônima) edita os mesmos comentários. O nome digitado fica no localStorage (`overdoctex.review-guest-name`) e é reaproveitado nos próximos links.
- Quem entra pelo link com a própria conta grava a ficha com o nome da conta e `guestKey` igual a `uid:` mais o id dela. O `:` nunca aparece num nome normalizado, e as regras só aceitam uma chave `uid:` com o próprio id, então nenhum visitante assume essa identidade. Os comentários dessa pessoa levam `authorKey: null` e valem pelo `authorId`, como os de qualquer conta.
- O link leva o código e a versão: `/p/{projectId}/reviews/{reviewId}?k={código}&v={snapshotId}` (a versão é necessária para gravar a ficha antes de conseguir ler a revisão).
- Exige o provedor "Anônimo" ativo no Firebase Authentication.

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

Rodada seguinte: as threads abertas viram threads novas na revisão nova, criadas pelo autor com `commentCount: 0`, `carriedFromThreadId` e a âncora reancorada; as regras só deixam nascer `outdated` quem tem `carriedFromThreadId`.

Resolução: o autor marca `resolved` com `fixed_next_version`; ao congelar a próxima versão, quem edita carimba `resolution.fixedInSnapshotId` (as regras só permitem mudar esse campo nesse caso).

### 2.9 `projects/{projectId}/diffs/{diffKey}`

Cache do diff gerado no navegador (`useVisualDiff`): o autor grava ao pedir a rodada seguinte ou ao abrir o PDF marcado; o revisor só lê. `changes[]` vem dos destinos nomeados `DIF{n}` do PDF (página e altura de cada `\DIFmark`). `diffKey = base_alvo_documento_versãoDoMotor`; como snapshots são imutáveis, a mesma chave sempre produz o mesmo resultado. Gravado uma vez por quem edita; revisores leem quando têm grant na versão alvo. O PDF fica em `diffs/{diffKey}/chunks`, e o campo `pdf` faz o papel de cabeçalho (seção 3): o documento entra no mesmo lote do último pedaço.

```json
{
  "documentId": "docMain",
  "baseSnapshotId": "snap_0002",
  "targetSnapshotId": "snap_0003",
  "engineVersion": "diff-1.0.0",
  "granularity": "word",
  "pdf": { "totalBytes": 2480133, "contentType": "application/pdf", "sha256": "9f2c...", "chunkCount": 3, "chunkBytes": 1000000 },
  "stats": { "insertedWords": 412, "deletedWords": 157, "changedBlocks": 23 },
  "changes": [{ "id": "d17", "kind": "mod", "page": 12, "y": 0.41, "preview": "os resultados indicam" }],
  "createdBy": "uidBia"
}
```

### 2.10 Demais coleções

- `aiConversations/{id}` e `messages/{id}`: privados do criador, gravados pelo app.
- `referenceChecks/{id}`: relatório final de `checkReferences`, gravado por um membro.
- `users/{uid}/notifications/{id}`: gravadas pelo app de quem age (membro do projeto ou revisor da revisão citada) a cada comentário, resposta, resolução e mudança de status da revisão; o destinatário lê as 30 mais recentes e marca como lidas (`read`).

## 3. Arquivos em pedaços (binários no Firestore)

Um arquivo é um **cabeçalho** com tamanho, tipo, sha256 e número de pedaços, mais a subcoleção `chunks/{índice}`, em que cada documento guarda até **1.000.000 bytes** num campo `Bytes` (o documento do Firestore aceita 1 MiB, e a diferença fica para o caminho). Código em `src/lib/stored-files/chunks.ts` (puro) e `src/lib/firebase/stored-files.ts` (leitura e gravação).

| Onde | Conteúdo | Escrita | Leitura | Teto |
| --- | --- | --- | --- | --- |
| `projects/{id}/blobs/{sha256}` | Binário da árvore de arquivos, deduplicado pelo hash | owner/editor; id igual ao sha256; imutável | membros | 25 MiB |
| `projects/{id}/snapshots/{sid}/files/{documentId}.pdf` (e `.synctex`, `.pages`) | Arquivos da versão | owner/editor, só **antes** do documento do snapshot existir | membros e revisor com o documento no grant | 50 MiB |
| `projects/{id}/diffs/{diffKey}` + `chunks` | PDF do diff (o campo `pdf` é o cabeçalho) | owner/editor, uma vez | membros e revisor com o documento no grant da versão alvo | 50 MiB |

```jsonc
// projects/p1/blobs/9f2c...e41a  (StoredFileDoc)
{ "totalBytes": 2500000, "contentType": "image/png", "sha256": "9f2c...e41a", "chunkCount": 3, "chunkBytes": 1000000, "createdBy": "uidBia", "createdAt": "..." }
// projects/p1/blobs/9f2c...e41a/chunks/2  (FileChunkDoc)
{ "data": "<Bytes, 500000 bytes>" }
```

**Gravação** (`writeStoredFile` e `writeChunks`):

1. Se o cabeçalho já existe, o arquivo está completo e nada sobe (blob é endereçado pelo hash, então o conteúdo é o mesmo).
2. Os pedaços sobem em lotes de 4 (o pedido ao Firestore tem teto de 10 MiB e o SDK web manda os bytes em base64).
3. O **último lote** leva os últimos pedaços **e** o cabeçalho. As regras só aceitam o cabeçalho se o último pedaço existir ao fim do lote (`existsAfter`), e só aceitam pedaços enquanto o cabeçalho não existe. Portanto, cabeçalho existente quer dizer arquivo completo, e depois dele nada muda.
4. Se o envio cair no meio, os pedaços já gravados podem ser reenviados (as regras permitem sobrescrever pedaço antes do cabeçalho).

**Leitura** (`readStoredFile` e `readChunks`): lê o cabeçalho, depois a subcoleção `chunks` numa consulta só, monta o conteúdo na ordem dos índices e confere o sha256. Pedaço faltando, de tamanho errado ou hash diferente é erro.

**Custo nas cotas do plano Spark** (1 GiB guardado, 50 mil leituras e 20 mil gravações por dia, 10 GiB de saída por mês):

| Operação | Gasto |
| --- | --- |
| Importar um binário de 2,5 MB | 3 gravações de pedaço, 1 do cabeçalho e 2,5 MB dos 1 GiB |
| Abrir ou exportar esse binário | 1 leitura do cabeçalho e 3 dos pedaços |
| Importar de novo o mesmo conteúdo | 1 leitura (o cabeçalho já existe) |

O cache offline do Firestore (`persistentLocalCache`) também guarda os pedaços lidos, então reabrir um PDF já visto não gasta leitura nem rede.

**Compilação de trabalho:** o PDF do rascunho não é gravado no banco. Cada pessoa compila no próprio navegador, e guardar cada compilação gastaria a cota; o documento só registra o resumo (`lastBuild`).

## 4. Gravações em lote validadas pelas regras

| Fluxo | Documentos no mesmo lote | O que as regras conferem |
| --- | --- | --- |
| Congelar versão | `snapshots/{novo}` mais `projects/{id}` (`counters.snapshots`, `latestSnapshotId`) | Sequência igual ao contador anterior mais 1 e ao contador depois do lote; `latestSnapshotId` aponta para o snapshot criado |
| Abrir revisão | `grants/{email}` (por e-mail) e `links/{código}` (pelo link) mais `reviews/{nova}` mais `projects/{id}` (`counters.reviews`) | Número igual ao contador anterior mais 1; snapshot existe depois do lote; por e-mail, o grant também (pelo link, o e-mail pode vir vazio) |
| Envio da revisão | `reviews/{id}` (só `access`, `reviewerEmails`, `lastActivityAt`), `grants/{email}` de cada e-mail novo e `links/{código}` | Quem edita o projeto |
| Comentar | `comments/{novo}` mais a thread (`commentCount`, `participantIds`) | Contador sobe exatamente 1; só o autor entra nos participantes |
| Aceitar convite de coautoria | `projects/{id}` (`members`, `memberIds`, `pendingMembers`, `memberProfiles`) | O usuário entra com o papel do convite do próprio e-mail verificado, o convite some e só a entrada dele entra em `memberProfiles` |
| Remover membro | `projects/{id}` (`members`, `memberIds`, `memberProfiles`) | Só o dono; o dono continua dono; `memberProfiles` não ganha nem muda entradas e só tem chaves de membros |
| Carimbar correção | thread (`resolution.fixedInSnapshotId`) | Só esse campo, só em thread resolvida e ainda sem carimbo |
| Finalizar arquivo em pedaços | últimos `chunks/{i}` mais o cabeçalho (ou o documento do diff) | Cabeçalho coerente (tamanho, número de pedaços, sha256, autor, data do servidor) e último pedaço existindo depois do lote |

## 5. Regras de segurança (resumo)

| Recurso | Ler | Escrever |
| --- | --- | --- |
| `users/{uid}/private/ai` | só o dono | só o dono |
| `projects` | membros e convidados por e-mail (`list` exige `memberIds array-contains uid`) | criar como dono, com contadores zerados; detalhes por owner/editor; membros e convites pelo dono; aceite pelo convidado; cada membro grava a própria entrada em `memberProfiles` |
| `files`, `documents` | membros | owner/editor |
| `snapshots` | membros ou grant por e-mail | criar no lote de congelamento; nunca alterar |
| `grants` | membros ou o próprio e-mail | owner/editor |
| `reviews` | membros ou o revisor (e-mail) | criar no lote de abertura; autor e revisor mudam status permitido |
| `threads`, `comments` | membros ou o revisor | criar com âncora válida; status, contador e carimbo conforme a seção 4 |
| `diffs` | membros ou grant na versão alvo | owner/editor, uma vez; com `pdf`, o último pedaço precisa existir |
| `blobs` e `chunks` | membros | owner/editor; pedaços até o cabeçalho existir, depois nada |
| `snapshots/{sid}/files` e `chunks` | membros ou revisor com o documento no grant | owner/editor, só antes de congelar |
| `diffs/{diffKey}/chunks` | membros ou revisor com o documento no grant | owner/editor, até o diff ser gravado |
| `aiConversations`, `messages` | só o criador | só o criador |
| `notifications` | só o destinatário | quem age, se participa do projeto ou da revisão |

**Testes** (`npm run test:rules`): 81 de 81 cenários aprovados no emulador, 2 para threads levadas entre rodadas (só thread com `carriedFromThreadId` nasce `outdated`), 5 para comentário em trecho, documento não concedido e notificações, 7 para a lista de membros (`memberProfiles`: a própria entrada sim, a de outro não, o dono só remove) e 20 para os arquivos em pedaços (cabeçalho sem o último pedaço, hash diferente do id, tamanho incoerente, pedaço grande demais, gravação depois de finalizar, leitura do revisor por documento concedido). A suíte começa com o Firestore vazio (`createTestEnv` em `tests/rules/harness.mjs`).

## 6. Índices

| Coleção | Campos | Uso |
| --- | --- | --- |
| `projects` | `memberIds` (contains) + `updatedAt` desc | "Meus projetos" |
| `reviews` (collection group) | `reviewerEmail` + `lastActivityAt` desc | "Minhas revisões" |
| `reviews` | `status` + `requestedAt` desc | Fila de revisão do projeto |
| `threads` | `documentId` + `status` + `createdAt` | Threads da página atual |
| `notifications` | `read` + `createdAt` desc | Central de notificações |

Índices de campos grandes desligados (`fieldOverrides`): `files.content`, `snapshots.files`, `threads.anchor` e `chunks.data` (os bytes dos pedaços, em todas as subcoleções `chunks`).

## 7. Invariantes

1. Snapshot nunca muda; blob por hash nunca muda; arquivos de uma versão só sobem antes de ela ser congelada.
2. Cabeçalho de arquivo existente significa arquivo completo; seus pedaços não mudam mais.
3. `memberIds` é sempre igual às chaves de `members`.
4. Contadores só sobem de 1 em 1, no lote do documento que contam.
5. Toda thread pertence a um snapshot e a um documento concedido na revisão.
6. Um revisor só enxerga o que está nos grants do próprio e-mail verificado.
7. Chaves de IA ficam só em `users/{uid}/private/ai` ou no navegador do usuário.

## 8. Retenção

- Rascunhos: enquanto o projeto existir.
- Snapshots e blobs: permanentes (histórico auditável).
- PDFs de diff: regeneráveis, mas sem limpeza automática (não há servidor nem regra de ciclo de vida no Firestore). A coleta de lixo de blobs e diffs sem referência está no backlog (`10-manutencao-e-granularidade.md`).
