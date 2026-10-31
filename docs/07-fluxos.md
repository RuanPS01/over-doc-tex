# 07. Fluxos

Cada cenário descreve o que o usuário vê e a mecânica interna. Não há servidor: tudo roda no navegador, e as gravações com mais de um documento vão num lote (`writeBatch`) que as regras conferem por inteiro (`06-banco-de-dados.md`, seção 4). Os passos marcados como *implementado* já existem no código; os demais são a especificação a seguir.

## Cenário A: autoria e solicitação de revisão (snapshot)

### O que o usuário vê

1. O autor escreve no Monaco e vê o PDF ao lado (no celular, alterna entre Código e PDF).
2. Clica em "Solicitar revisão", escolhe os documentos (o principal vem marcado), informa o e-mail do revisor e uma mensagem.
3. Vê o progresso "Congelando versão 1.0" e, ao final, a revisão #1 na fila. Pode continuar editando: o que muda daqui em diante pertence à próxima versão.

### Mecânica interna (no navegador)

| Passo | O que acontece |
| --- | --- |
| 1 | Força o autosave pendente e lê os arquivos na revisão atual, para congelar exatamente o que o autor vê |
| 2 | Para cada arquivo: calcula sha256 (Web Crypto) e grava em `blobs/{hash}`, em pedaços, se o cabeçalho ainda não existir (deduplicação); monta o manifesto ordenado e `sourceHash = sha256(manifesto)` |
| 3 | Compila cada documento no Web Worker com o motor WebAssembly (com SyncTeX) e extrai o texto por página |
| 4 | Grava PDF, SyncTeX e texto por página em `snapshots/{sid}/files/{documentId}.pdf`, `.synctex` e `.pages`, em pedaços (`writeStoredFile`). As regras só aceitam esses arquivos **antes** de o documento do snapshot existir |
| 5 | Lote 1, congelamento: cria `snapshots/{sid}` (com `sequence = counters.snapshots + 1`) e atualiza o projeto (`counters.snapshots`, `latestSnapshotId`). Carimba `resolution.fixedInSnapshotId` nas threads resolvidas desde a versão anterior |
| 6 | Lote 2, revisão: cria `snapshots/{sid}/grants/{email}`, `reviews/{rid}` (número `counters.reviews + 1`) e avança `counters.reviews` |
| 7 | Envia o convite ao revisor (ver abaixo) |
| 8 | Em falha de compilação, mostra o log e nada é gravado no Firestore; os arquivos do passo 4 podem ser reenviados na próxima tentativa |

### Convite do revisor

1. O app do autor chama `sendSignInLinkToEmail` do Firebase Auth para o e-mail do revisor, com o link de retorno `/p/{projectId}/reviews/{reviewId}`. O próprio Firebase envia o e-mail (é preciso ativar "Link de e-mail" nos provedores de login). Como alternativa, o app oferece um link `mailto:` com o mesmo endereço.
2. O revisor abre o link e entra (o link já confirma o e-mail; Google também serve, se for o mesmo endereço).
3. As regras liberam snapshot e revisão porque o e-mail verificado dele bate com o grant e com `reviewerEmail`. Na primeira abertura, o app grava `reviewerUid`, `reviewerName` e `status: in_review`.
4. Rodadas seguintes para o mesmo revisor repetem o lote 2 com o mesmo e-mail.

### Convite de coautoria

1. O dono grava `pendingMembers[email] = 'editor' | 'viewer'` no projeto.
2. O convidado entra com esse e-mail verificado; as regras deixam ele ver o projeto e se adicionar a `members` e `memberIds` com o papel do convite, apagando a entrada de `pendingMembers` no mesmo pedido.

## Cenário B: revisão estilo Pull Request e resolução

### Comentário em trecho de texto

1. O `PdfViewer` renderiza a página com a camada de texto do pdf.js.
2. Ao soltar a seleção, o `SelectionPopover` oferece "Adicionar comentário".
3. A âncora é montada assim:
   - `rects`: `Range.getClientRects()` convertido para coordenadas relativas à caixa da página e dividido pela largura e altura (0 a 1);
   - `quote.exact`: texto selecionado; `prefix` e `suffix`: até 32 caracteres antes e depois no texto da página;
   - `position`: deslocamentos no texto concatenado da página (mesma ordem do `pages.json` do snapshot).
4. Um `writeBatch` cria a thread (`status: open`, `commentCount: 1`, `participantIds: [uid]`) e o primeiro comentário. As regras conferem snapshot, documento concedido e autoria.
5. Comentários seguintes vão num lote com a atualização da thread (`commentCount + 1`, o autor entra em `participantIds`). Em seguida o app grava a notificação em `users/{autor}/notifications`.

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

### Algoritmo (no navegador, em Web Worker)

**Passo 0. Cache.** `diffKey = base_alvo_documento_versãoDoMotor`. Se `diffs/{diffKey}` existe, o PDF em cache abre direto (snapshots são imutáveis, então o resultado seria o mesmo). Senão, o diff é gerado localmente; quem edita o projeto grava o resultado no cache, e o revisor sem cache gera só para si.

**Passo 1. Materializar as duas árvores.** O Worker baixa os blobs dos manifestos (com cache local por hash) e monta as árvores `base/` e `target/` no sistema de arquivos em memória do motor.

**Passo 2. Achatar.** A partir de `rootPath`, expande `\input`, `\include` e `\subfile` recursivamente nas duas árvores, gerando uma string única por versão e um mapa de origem (`arquivo`, `linha inicial`, `deslocamento`) para cada trecho. Limites: profundidade 20, detecção de ciclos, caminhos sempre dentro da árvore.

**Passo 3. Separar preâmbulo e corpo.** Divide em `\begin{document}` e `\end{document}`. O preâmbulo final é o da versão alvo mais o bloco de macros do diff (passo 7). Mudanças de preâmbulo não são marcadas no PDF; entram no resumo do diff.

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

**Passo 8. Compilar.** O `diff.tex` vai para a árvore alvo do motor WebAssembly. Imagens que só existem na base (figuras removidas) são copiadas para `__base__/` e o caminho é reescrito. O motor roda no Worker, sem acesso à página, com prazo de 90 segundos, no modo equivalente a `-interaction=nonstopmode -halt-on-error -synctex=1` e sem shell-escape.

**Passo 9. Degradação controlada.** Se a compilação falhar, o motor tenta de novo com granularidade menor:

| Nível | Granularidade | Quando |
| --- | --- | --- |
| 1 | `word` | Padrão |
| 2 | `paragraph` | Marca blocos inteiros, sem marcação dentro de comandos |
| 3 | `text-only` | Sem PDF: devolve um diff textual estruturado para exibição em HTML, com o log da falha |

O nível alcançado vai para `diffs.granularity`.

**Passo 10. Marcadores de navegação.** Cada marcação emite `\DIFmark{id}`. Depois da compilação, o motor lê o `.aux` (página e posição vertical de cada id) e grava `changes[]` com página, `y` normalizado e uma prévia do texto. Isso alimenta "Próxima alteração".

**Passo 11. Publicar.** Quem edita grava o PDF em pedaços em `diffs/{diffKey}/chunks` (`writeChunks`) e, no último lote, o próprio `diffs/{diffKey}` com `granularity`, `stats`, `changes` e o campo `pdf` (tamanho, sha256, número de pedaços). Uma vez só; as regras proíbem alterar.

**Passo 12. Exibir.** O PDF é remontado dos pedaços (`readChunks`, com conferência do sha256) e abre no mesmo visualizador. Membros e revisores com o documento no grant da versão alvo podem ler os pedaços.

Esboço do orquestrador no Worker:

```ts
async function runDiff(job: DiffRequest): Promise<DiffOutcome> {
  const base = await materialize(job.baseSnapshot);
  const target = await materialize(job.targetSnapshot);
  const before = flatten(base, job.rootPath);
  const after = flatten(target, job.rootPath);

  for (const granularity of ['word', 'paragraph'] as const) {
    const annotated = emitAnnotatedLatex(parseBody(before.body), parseBody(after.body), { granularity });
    const source = injectPreamble(after.preamble, job.engine) + annotated.body;
    const result = await compileInWorker(target, source, { engine: job.engine, timeoutMs: 90_000 });
    if (result.ok) {
      const changes = readChangeMarkers(result.aux, annotated.markers);
      return { pdf: result.pdf, granularity, stats: annotated.stats, changes };
    }
  }
  return textOnlyDiff(before, after);
}
```

## Cenário D: interação com a IA contextual (implementado)

### O que o usuário vê

1. Abre o assistente (painel flutuante no desktop, Sheet inferior no celular). Sem IA configurada, o painel mostra "Configurar a minha IA".
2. No diálogo "Usar a minha própria IA", escolhe provedor, modelo e cola a própria chave; pode adicionar modelos de reserva.
3. Escolhe a tarefa ("Gerar rascunho", "Verificar referências"...) e escreve o pedido.
4. Vê a etapa atual e o texto chegando aos poucos. Se um modelo falhar, a resposta recomeça pelo modelo de reserva, com o motivo da troca.

### Mecânica

O motor roda no navegador, sem servidor. A especificação completa (provedores, fila de reserva com pausa por motivo, saída estruturada com Zod, eventos, verificação de referências e testes) está em `11-servico-de-ia.md`.

## Importação e exportação de projeto (implementado)

### Exportar

1. "Exportar projeto (.zip)" na árvore de arquivos ou no menu "Mais".
2. Textos saem do cache do editor; binários são remontados dos pedaços em `blobPath` (`readStoredFile`, com conferência do sha256). O zip (`fflate`) mantém a árvore de pastas e é baixado como `<nome-do-projeto>.zip`.

### Importar

1. "Importar" abre o diálogo com três origens: arquivo .zip, arquivos avulsos ou uma pasta do dispositivo (`webkitdirectory`, com o caminho relativo de cada arquivo).
2. **Leitura segura:** cada caminho é normalizado; entradas com `..`, absolutas, com unidade de disco ou de sistema (`__MACOSX`, `.DS_Store`) são ignoradas e listadas. Limites: 2.000 arquivos, 100 MB no total e 25 MB por arquivo (os binários contam na cota de 1 GiB do Firestore), conferidos pelo tamanho declarado **antes** de descompactar (proteção contra zip que se expande demais) e de novo depois.
3. Se o zip tem uma pasta raiz única, o diálogo oferece importar só o conteúdo dela.
4. O usuário escolhe a **pasta de destino** (raiz, uma pasta existente ou uma nova) e a **política de conflito**: sobrescrever o arquivo de mesmo caminho ou manter os dois, com o importado recebendo `-1`, `-2`... antes da extensão.
5. O plano (novo, sobrescreve, renomeado) aparece antes da confirmação.
6. Ao confirmar: textos de até 400 KiB vão inline em `files`; binários e textos maiores viram `blobs/{sha256}` em pedaços (pulando o que já existe) e o documento guarda `blobPath`. Os documentos de `files` vão em lotes de até 400. No modo demonstração, os arquivos entram só no cache da aba.

Verificado de ponta a ponta contra os emuladores de Auth e Firestore, com as regras reais: um binário de 2,5 MB virou 3 pedaços com cabeçalho correto, a segunda importação do mesmo conteúdo não regravou nada e a exportação devolveu o arquivo idêntico (mesmo sha256).

## Fluxo de compilação de trabalho (rascunho)

1. O autosave grava `files/{id}` com `revision + 1` (debounce de 800 ms).
2. "Compilar" (ou Ctrl+S) entrega a árvore ao motor WebAssembly no Web Worker.
3. Ao terminar, o PDF fica só no navegador (memória e cache local) e o app grava o resumo em `documents/{id}.lastBuild`. O PDF de trabalho não vai para o banco: cada pessoa compila no próprio navegador, e gravar cada compilação gastaria a cota.
4. O `PdfPreviewPanel` mostra o PDF; erros exibem o log com link para a linha.
