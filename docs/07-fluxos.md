# 07. Fluxos

Cada cenário descreve o que o usuário vê e a mecânica interna. Os passos marcados como *implementado* já existem no código; os demais são a especificação a seguir.

## Cenário A: autoria e solicitação de revisão (snapshot)

### O que o usuário vê

1. O autor escreve no Monaco e vê o PDF ao lado (no celular, alterna entre Código e PDF).
2. Clica em "Solicitar revisão", escolhe os documentos (o principal vem marcado), informa o e-mail do revisor e uma mensagem.
3. Vê o progresso "Congelando versão 1.0" e, ao final, a revisão #1 na fila. Pode continuar editando: o que muda daqui em diante pertence à próxima versão.

### Mecânica interna

| Passo | Onde | O que acontece |
| --- | --- | --- |
| 1 | Cliente | Força o autosave pendente e envia `expectedRevisions` (`fileId: revision`) para garantir que o congelado é exatamente o que o autor vê |
| 2 | Function `requestReview` | Valida o papel (owner/editor), o e-mail e as revisões esperadas; divergência devolve `stale` e o cliente repete |
| 3 | Function | Para cada arquivo: calcula sha256, envia para `blobs/{hash}` se ainda não existir (deduplicação) e monta o manifesto ordenado; `sourceHash = sha256(manifesto)` |
| 4 | Function | Cria `jobs/{jobId}` (`type: snapshot`) e enfileira no Cloud Tasks a chamada `POST /snapshot` do `latex-worker` |
| 5 | latex-worker | Materializa a árvore a partir dos blobs, compila cada documento com `latexmk -synctex=1`, extrai o texto por página e envia PDF, SyncTeX e `pages.json` ao Storage |
| 6 | latex-worker | Em transação: incrementa `counters.snapshots`, grava `snapshots/{sid}` uma única vez, atualiza `latestSnapshotId` |
| 7 | latex-worker | Carimba `resolution.fixedInSnapshotId` nas threads resolvidas desde o snapshot anterior |
| 8 | Function (continuação via trigger do snapshot) | Cria `reviews/{rid}` (número sequencial), `invites/{sha256(token)}` com validade de 14 dias e o documento em `mail` com o link `/invite/{token}` |
| 9 | Cliente | Acompanha `jobs/{jobId}` com `onSnapshot`; em falha de compilação, mostra o log e nenhum snapshot é criado |

### Aceite do convite

1. O revisor abre `/invite/{token}` e entra com Google ou e-mail/senha.
2. `acceptInvite(token)` calcula o hash, confere validade e se o e-mail verificado do usuário é o do convite.
3. Preenche `reviewerUid` e `status: in_review` na revisão e cria `snapshots/{sid}/grants/{uid}` com `grantedDocumentIds`.
4. Rodadas seguintes para o mesmo revisor criam o grant direto e enviam só a notificação por e-mail.

## Cenário B: revisão estilo Pull Request e resolução

### Comentário em trecho de texto

1. O `PdfViewer` renderiza a página com a camada de texto do pdf.js.
2. Ao soltar a seleção, o `SelectionPopover` oferece "Adicionar comentário".
3. A âncora é montada assim:
   - `rects`: `Range.getClientRects()` convertido para coordenadas relativas à caixa da página e dividido pela largura e altura (0 a 1);
   - `quote.exact`: texto selecionado; `prefix` e `suffix`: até 32 caracteres antes e depois no texto da página;
   - `position`: deslocamentos no texto concatenado da página (mesma ordem do `pages.json` do snapshot).
4. Um `writeBatch` cria a thread (`status: open`, `commentCount: 0`) e o primeiro comentário. As regras conferem snapshot, documento concedido e autoria.
5. O trigger `onCommentCreated` atualiza contadores, participantes e envia notificação ao autor.

### Pin com desenho livre

1. Na ferramenta "Desenhar", eventos `pointerdown`, `pointermove` e `pointerup` sobre a página coletam pontos normalizados. `touch-action: none` só na camada de desenho, para não bloquear a rolagem fora dela.
2. Ao terminar, os traços são simplificados (Ramer-Douglas-Peucker, epsilon 0.002) e o pin é posicionado no canto superior direito da caixa do desenho (ajustável pelo revisor).
3. A thread é criada com `kind: 'pin'` e `anchor.drawing`. O traço é renderizado como SVG por cima da página, então acompanha o zoom.

### Resposta e resolução

1. O autor recebe a notificação, abre a revisão e vê as threads por página.
2. "Abrir no código" usa `sourceHint` (SyncTeX) para posicionar o Monaco na linha correspondente do rascunho.
3. Corrige no editor (rascunho da versão 1.1), responde na thread e marca "Resolvido" (`resolution.kind: fixed_next_version`).
4. O revisor pode reabrir. Na próxima rodada, threads abertas da revisão anterior aparecem como pendentes; ao serem levadas adiante, ganham `carriedFromThreadId` e são reancoradas no novo snapshot.

### Reancoragem

Na ordem: (1) `position` com conferência de `quote.exact`; (2) busca de `exact` com `prefix` e `suffix` na mesma página e nas duas vizinhas, com tolerância a pequenas diferenças; (3) sem correspondência, a thread vira `outdated` e mostra a citação original.

## Cenário C: diff visual e recompilação

### O que o usuário vê

1. Na revisão, o revisor clica em "Ver alterações".
2. Um indicador mostra "Gerando comparação" e, segundos depois, o PDF aparece no mesmo visualizador com o texto removido riscado em vermelho e o inserido em verde, já com as quebras de linha refeitas.
3. A barra de diff mostra contadores e "Próxima alteração".

### Qual versão é comparada

O revisor compara **snapshots**: a base é `review.baseSnapshotId` (versão 1.0) e o alvo é o snapshot da revisão atual (versão 1.1, congelada quando o autor pediu a nova rodada). Assim o revisor nunca vê o rascunho em movimento. O autor tem uma prévia extra que compara o último snapshot com o rascunho atual; esse resultado é visível só para membros.

### Algoritmo de orquestração (backend)

**Passo 0. Pedido idempotente.** A função `requestDiff({ projectId, documentId, baseSnapshotId, targetSnapshotId })`:

1. confere se o usuário é membro ou tem grant nos dois snapshots;
2. calcula `diffKey = sha256(base.sourceHash + ':' + target.sourceHash + ':' + documentId + ':' + DIFF_ENGINE_VERSION)`;
3. se `diffJobs/{diffKey}` existe com `done`, `queued` ou `running`, devolve a chave (o cliente passa a observar o documento);
4. senão, cria o job como `queued` e enfileira `POST /diff` no `latex-worker` via Cloud Tasks.

**Passo 1. Materializar as duas árvores.** O worker baixa os blobs dos manifestos (cache local por hash) para `base/` e `target/`.

**Passo 2. Achatar.** A partir de `rootPath`, expande `\input`, `\include` e `\subfile` recursivamente nas duas árvores, gerando uma string única por versão e um mapa de origem (`arquivo`, `linha inicial`, `deslocamento`) para cada trecho. Limites: profundidade 20, detecção de ciclos, caminhos sempre dentro da árvore.

**Passo 3. Separar preâmbulo e corpo.** Divide em `\begin{document}` e `\end{document}`. O preâmbulo final é o da versão alvo mais o bloco de macros do diff (passo 7). Mudanças de preâmbulo não são marcadas no PDF; entram no resumo do job.

**Passo 4. Analisar o corpo em uma árvore leve.** Um lexer tolerante a erros gera nós:

| Nó | Exemplos | Tratamento no diff |
| --- | --- | --- |
| Texto | palavras, espaços, pontuação | Diff por palavra |
| Quebra de parágrafo | linha em branco | Fronteira de bloco |
| Comando de texto com argumento recursável | `\emph`, `\textbf`, `\caption`, `\footnote`, `\section` | Diff dentro do argumento |
| Comando atômico | `\cite`, `\ref`, `\eqref`, `\label`, `\url`, `\includegraphics` | Igual ou diferente como unidade |
| Ambiente de texto | `itemize`, `enumerate`, `quote`, `abstract`, `center` | Recursão no corpo |
| Ambiente matemático | `$...$`, `\[...\]`, `equation`, `align` | Atômico |
| Ambiente literal | `verbatim`, `lstlisting`, `minted` | Atômico |
| Float | `figure`, `table` | Recursão no corpo, com `\includegraphics` atômico |
| Tabela | `tabular` | Células separadas por `&` e `\\` como fronteiras rígidas |
| Comentário | `% ...` | Ignorado na comparação e omitido na saída |

**Passo 5. Alinhar blocos (nível macro).** O corpo vira uma sequência de blocos (parágrafos, ambientes, comandos de seção), cada um com hash normalizado (espaços colapsados, sem comentários). Um diff de Myers sobre as sequências de hash, ancorado em blocos únicos (estratégia *patience*), classifica cada bloco em igual, inserido ou removido. Pares adjacentes removido e inserido com similaridade de Jaccard por palavras >= 0,5 viram **modificado**.

**Passo 6. Diff fino (nível micro).** Para cada bloco modificado:

1. Mesma estrutura (mesmo tipo de nó e mesmo ambiente): recursão nos filhos.
2. Sequências de texto: tokenização em palavras, espaços e pontuação e diff de Myers O((N+M)D) sobre os tokens.
3. Limpeza semântica:
   - igualdades com menos de 3 tokens entre duas edições são absorvidas pelas edições, evitando texto picotado;
   - limites de edição alinhados a fronteiras de palavra;
   - se mais de 60% do bloco mudou, o bloco inteiro é marcado como removido e reinserido, o que é mais legível.

**Passo 7. Emitir o LaTeX anotado.** Regras de segurança, nesta ordem de prioridade:

| Regra | Descrição |
| --- | --- |
| R1 | Uma marcação nunca atravessa fronteira de grupo `{}`, de ambiente, de `&` ou `\\` de tabela, nem argumento de comando. Trechos são quebrados nas fronteiras |
| R2 | Texto inserido vira `\DIFadd{...}`; removido vira `\DIFdel{...}` |
| R3 | Atômicos inseridos ou removidos (citações, matemática inline) usam `\DIFaddatom` ou `\DIFdelatom`, que só colorem: `ulem` não funciona em modo matemático |
| R4 | Ambientes inteiros inseridos ou removidos são envolvidos por `DIFaddenv` ou `DIFdelenv` |
| R5 | Conteúdo removido é neutralizado: `\label` e `\index` saem (evita rótulos duplicados); seção removida vira `\DIFdelsection{título}` (sem numeração nem sumário); float removido vira bloco não flutuante com a legenda riscada |
| R6 | Argumentos móveis (títulos de seção, legendas) recebem macros robustas e `\pdfstringdefDisableCommands`, para não quebrar sumário nem marcadores do PDF. O `\DIFmark` nunca vai dentro de argumento móvel: em títulos, é emitido logo depois do comando de seção, senão a posição é gravada duas vezes (sumário e corpo) |
| R7 | Ambiente literal alterado é tratado como remoção mais inserção do bloco inteiro |

Bloco injetado no fim do preâmbulo, imediatamente antes de `\begin{document}` (pdfLaTeX e XeLaTeX):

```latex
% OverDocTeX diff, motor diff-1.0.0
\RequirePackage{xcolor}
\RequirePackage[normalem]{ulem}
\RequirePackage{zref-savepos,zref-abspage}
\makeatletter\zref@addprop{savepos}{abspage}\makeatother
\colorlet{DIFaddcolor}{green!50!black}
\colorlet{DIFdelcolor}{red!75!black}
\DeclareRobustCommand{\DIFadd}[1]{{\color{DIFaddcolor}\uline{#1}}}
\DeclareRobustCommand{\DIFdel}[1]{{\color{DIFdelcolor}\sout{#1}}}
\DeclareRobustCommand{\DIFaddatom}[1]{{\color{DIFaddcolor}#1}}
\DeclareRobustCommand{\DIFdelatom}[1]{{\color{DIFdelcolor}#1}}
\newenvironment{DIFaddenv}{\color{DIFaddcolor}}{}
\newenvironment{DIFdelenv}{\color{DIFdelcolor}}{}
\DeclareRobustCommand{\DIFdelsection}[1]{\par\noindent{\color{DIFdelcolor}\bfseries\sout{#1}}\par}
% Grava página e posição de cada alteração no .aux (navegação "Próxima alteração").
\DeclareRobustCommand{\DIFmark}[1]{\zsavepos{dif-#1}}
% O bloco entra no fim do preâmbulo, depois do hyperref: títulos com marcação
% viram texto limpo nos marcadores do PDF.
\ifdefined\pdfstringdefDisableCommands
  \pdfstringdefDisableCommands{%
    \def\DIFadd#1{#1}\def\DIFdel#1{}%
    \def\DIFaddatom#1{#1}\def\DIFdelatom#1{}%
    \def\DIFmark#1{}}%
\fi
```

Este bloco foi compilado com pdfLaTeX (TeX Live) em um documento de teste com `hyperref`, sumário, citação, matemática, lista, seção removida e legenda alterada: sem erros, sem avisos de PDF string e com as posições de `\DIFmark` gravadas no `.aux`.

Estilo marca-texto: com LuaLaTeX, o motor troca `\uline` e `\sout` por `lua-ul` (`\highLight[DIFaddbg]{...}` e `\strikeThrough`), que quebra linha e aceita comandos internos. Em pdfLaTeX e XeLaTeX fica o sublinhado e o tachado coloridos do `ulem`, porque o `\hl` do pacote `soul` falha com comandos dentro do texto marcado.

Exemplo de saída:

```latex
% versão 1.0: Os resultados indicam melhora.
% versão 1.1: Os resultados indicam uma melhora significativa \cite{silva2020}.
Os resultados indicam \DIFadd{uma }melhora\DIFadd{ significativa}\DIFaddatom{ \cite{silva2020}}.
```

**Passo 8. Compilar.** O `diff.tex` é gravado na árvore alvo. Imagens que só existem na base (figuras removidas) são copiadas para `__base__/` e o caminho é reescrito. Execução:

```
latexmk -<motor> -interaction=nonstopmode -halt-on-error -file-line-error -synctex=1 -no-shell-escape diff.tex
```

Limite de 90 segundos e 2 GiB de memória, sem rede.

**Passo 9. Degradação controlada.** Se a compilação falhar, o worker tenta de novo com granularidade menor:

| Nível | Granularidade | Quando |
| --- | --- | --- |
| 1 | `word` | Padrão |
| 2 | `paragraph` | Marca blocos inteiros, sem marcação dentro de comandos |
| 3 | `text-only` | Sem PDF: devolve um diff textual estruturado para exibição em HTML, com o log da falha |

O nível alcançado vai para `diffJobs.granularity`.

**Passo 10. Marcadores de navegação.** Cada marcação emite `\DIFmark{id}`. Depois da compilação, o worker lê o `.aux` (página e posição vertical de cada id) e grava `changes[]` com página, `y` normalizado e uma prévia do texto. Isso alimenta "Próxima alteração".

**Passo 11. Publicar.** Envia o PDF e o log para `diffs/{diffKey}`, atualiza o job com `status: done`, `granularity`, `stats` e `changes`, e notifica quem pediu (`diff_ready`).

**Passo 12. Exibir.** Membros leem o PDF direto do Storage; o revisor recebe uma URL assinada de 15 minutos pela função `getDiffUrl`, depois de conferir os grants.

Esboço do orquestrador no worker:

```ts
async function runDiffJob(job: DiffJobRequest): Promise<void> {
  const base = await materialize(job.baseSnapshot);
  const target = await materialize(job.targetSnapshot);
  const before = flatten(base, job.rootPath);
  const after = flatten(target, job.rootPath);

  for (const granularity of ['word', 'paragraph'] as const) {
    const annotated = emitAnnotatedLatex(parseBody(before.body), parseBody(after.body), { granularity });
    const source = injectPreamble(after.preamble, job.engine) + annotated.body;
    const result = await compileSandboxed(target.dir, source, { engine: job.engine, timeoutMs: 90_000 });
    if (result.ok) {
      const changes = readChangeMarkers(result.auxPath, annotated.markers);
      await publishDiff(job, result.pdfPath, result.logPath, { granularity, stats: annotated.stats, changes });
      return;
    }
  }
  await publishTextOnlyDiff(job, before, after);
}
```

## Cenário D: interação com a IA contextual (implementado)

### O que o usuário vê

1. Abre o assistente (painel flutuante no desktop, Sheet inferior no celular).
2. Escolhe a tarefa ("Gerar rascunho", "Verificar referências"...) e escreve o pedido.
3. Vê a etapa atual ("Buscando trechos relevantes", "Testando 12 links") e, em seguida, o texto chegando aos poucos, renderizado em Markdown. Resultados estruturados aparecem como lista ou relatório.

### Contrato

- `POST {VITE_API_BASE_URL}/aiStream` com `Authorization: Bearer <ID token>` e corpo `AiRequest` (`shared/ai/schemas.ts`).
- Erros de autenticação e validação: HTTP 4xx com JSON `{ code, message }`.
- Depois disso: `200` com `Content-Type: application/x-ndjson`, uma linha por evento:

| Evento | Quando | Campos |
| --- | --- | --- |
| `meta` | Primeiro | `requestId`, `task`, `conversationId` |
| `status` | Mudança de etapa | `stage` (`retrieving`, `checking_links`, `generating`, `validating`, `fallback`), `message` |
| `context` | Após a recuperação | `sources[]` com caminho, linhas e score BM25 |
| `delta` | Cada fragmento de texto | `text` |
| `result` | Tarefas estruturadas | `result` validado por `AiStructuredResultSchema` |
| `error` | Falha | `code`, `message`, `retryable`, `discardPartial` |
| `done` | Fim | `stopReason`, `usage` |

### Mecânica no backend (`functions/src/ai/`)

1. `stream-handler.ts`: valida o ID token, o corpo (Zod) e o papel exigido pela tarefa (`tasks.ts`); cria ou reaproveita a conversa; abre o stream.
2. `run-task.ts`: carrega `.tex` e `.bib` do projeto (`sources.ts`), fatia em blocos lógicos (seções, entradas BibTeX, parágrafos de até 1.500 caracteres) e ranqueia com BM25 (`rag.ts`). Tarefas de estrutura usam a abertura de cada seção e a hierarquia extraída.
3. `prompts.ts`: system prompt especializado por tarefa; o contexto vai entre `<documento>` e `<selecao>`, tratado como dado.
4. `claude.ts`: chamada em stream ao modelo `claude-opus-5-5` com pensamento adaptativo, esforço por tarefa e `fallbacks: 'default'`. Texto livre vira eventos `delta`; recusa ao final vira `error` com `discardPartial: true`; resposta truncada vira `truncated`.
5. Saídas estruturadas (`reorganizeTopics`, `updateToc`, `checkReferences`): formato imposto pelo schema enviado ao modelo e **validado de novo com Zod** antes do evento `result`. JSON inválido vira `invalid_output` (com nova tentativa permitida).
6. `persistence.ts`: grava pergunta e resposta em `aiConversations/{id}/messages` ao fim, inclusive em erro ou cancelamento.

### `checkReferences` em três etapas

1. **Extração determinística** (`references/bibtex.ts`): entradas `.bib` (título, autores, ano, `url` ou `doi`) e links `\url` e `\href` no texto, até 60 referências.
2. **Verificação HTTP no backend** (`references/link-checker.ts`): até 6 em paralelo, 8 segundos por link, até 5 redirecionamentos, proteção SSRF, leitura de até 64 KiB para extrair título, descrição e um trecho da página.
3. **Julgamento semântico pelo modelo:** recebe metadados e o resumo da página (entre `<pagina_externa>`) e devolve só `verdict` e `explanation` por chave. O status do link nunca vem do modelo; link quebrado sempre resulta em `unreachable`.

### Mecânica no cliente

- `src/lib/ai/ndjson.ts` lê o corpo com `ReadableStream`, separa por quebra de linha e valida cada evento com `AiStreamEventSchema`.
- `useAiStream` acumula os deltas e aplica uma vez por frame (`requestAnimationFrame`), mantém o histórico das últimas 10 mensagens e permite cancelar (o `AbortController` fecha o fetch e o backend aborta a chamada ao modelo).
- `MarkdownContent` converte com `marked` e sanitiza com DOMPurify antes do `dangerouslySetInnerHTML`.
- Sem Firebase configurado, `demoAiStream` simula os mesmos eventos.

## Fluxo de compilação de trabalho (rascunho)

1. O autosave grava `files/{id}` com `revision + 1` (debounce de 800 ms).
2. "Compilar" (ou Ctrl+S) cria `jobs/{id}` com `type: compile` e enfileira `POST /compile`.
3. O worker compila e atualiza `documents/{id}.lastBuild` e `builds/{documentId}/latest.pdf`.
4. O `PdfPreviewPanel` observa `lastBuild` e recarrega o PDF; erros mostram o log com link para a linha (`-file-line-error`).
