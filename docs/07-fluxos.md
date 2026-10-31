# 07. Fluxos

Cada cenário descreve o que o usuário vê e a mecânica interna. Não há servidor: tudo roda no navegador, e as gravações com mais de um documento vão num lote (`writeBatch`) que as regras conferem por inteiro (`06-banco-de-dados.md`, seção 4). Os passos marcados como *implementado* já existem no código; os demais são a especificação a seguir.

## Cenário A: autoria e solicitação de revisão (snapshot) (implementado, com as diferenças abaixo)

### O que o usuário vê

1. O autor escreve no Monaco e vê o PDF ao lado (no celular, alterna entre Código e PDF).
2. Em "Versões", congela uma versão quando quiser (com descrição opcional; ajuste 1.1 ou principal 2.0), abre o PDF guardado, compara com o rascunho e baixa o código daquela versão em .zip.
3. Clica em "Solicitar revisão", informa o e-mail do revisor, um título e uma mensagem. Hoje só o documento principal é concedido.
4. Vê o progresso ("Compilando a versão", "Guardando o código e o PDF", "Congelando", "Abrindo a revisão") e, ao final, a revisão #1 com o link para copiar, "Enviar pelo meu e-mail" e "Abrir a revisão". Se o código não mudou desde a última versão, a revisão usa essa versão e nada é congelado de novo. Pode continuar editando: o que muda daqui em diante pertence à próxima versão.

**Diferenças em relação à especificação abaixo:** o SyncTeX não é gerado (o Siglum ainda não o entrega), então `synctexPath` fica nulo e "Abrir no código" não existe; a escolha de documentos secundários ainda não aparece na tela; falha de compilação mostra os erros do TeX com arquivo e linha (clique leva à linha) e nada é gravado.

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

### Convite do revisor (implementado)

1. O app do autor chama `sendSignInLinkToEmail` do Firebase Auth para o e-mail do revisor; o link volta para `/login?next=/p/{projectId}/reviews/{reviewId}&email=...`, onde o revisor confirma o e-mail e entra. O próprio Firebase envia o e-mail (é preciso ativar "Link de e-mail" no provedor E-mail/senha e autorizar o domínio do site em Authentication). Se o envio falhar, a tela avisa e oferece o link para copiar e um `mailto:` com o mesmo endereço.
2. O revisor abre o link e entra (o link já confirma o e-mail; Google também serve, se for o mesmo endereço).
3. As regras liberam snapshot e revisão porque o e-mail verificado dele bate com o grant e com `reviewerEmail`. Na primeira abertura, o app grava `reviewerUid`, `reviewerName` e `status: in_review`.
4. Rodadas seguintes para o mesmo revisor repetem o lote 2 com o mesmo e-mail.

### Convite de coautoria (implementado)

1. Em "Configurações do projeto", o dono informa o e-mail e o papel ("Edita" ou "Só lê"); o app grava `pendingMembers[email]` e mostra o link do projeto para enviar.
2. O convidado abre o link e entra com esse e-mail verificado (Google ou link de acesso por e-mail). O editor mostra "Convite para ..." com "Aceitar convite"; ao aceitar, ele se adiciona a `members` e `memberIds` com o papel do convite, apaga a entrada de `pendingMembers` e grava o próprio nome em `memberProfiles`, tudo no mesmo pedido.
3. O dono muda o papel ou remove membros na mesma tela; quem edita muda nome e descrição do projeto.

## Cenário B: revisão estilo Pull Request e resolução (parcial: pins sem desenho)

**Implementado:** a `ReviewPage` mostra o PDF da versão; "Comentar" e um clique na página criam um pin numerado (`kind: 'pin'`, `drawing: null`) com o primeiro comentário no mesmo lote; respostas sobem o contador da thread no mesmo lote; autor e revisor marcam a thread como resolvida (o autor com `fixed_next_version`, o revisor com `answered`) ou reabrem; ao congelar a versão seguinte, quem congela carimba `fixedInSnapshotId` e a thread aparece como "Corrigida". O revisor aprova ou pede alterações; o autor encerra ou reabre. **Falta:** comentário em trecho de texto, desenho livre, notificações e reancoragem entre rodadas.

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

## Cenário C: diff visual e recompilação (parcial: diff de texto)

**Implementado (granularidade `text-only`):** o diff por palavra de `src/lib/diff/word-diff.ts` (Myers por linha e, nos trechos alterados, por palavra, com as limpezas do passo 6) aparece em dois lugares:

- **No editor ("Ver alterações"):** compara o código de uma versão com outra versão ou com o rascunho, arquivo por arquivo, com contadores de palavras e as linhas sem mudança recolhidas. Só membros, porque lê os blobs.
- **Na revisão ("Ver alterações"):** compara o texto das páginas do PDF (`.pages`) da versão da rodada anterior do mesmo revisor (`baseSnapshotId`) com o da versão atual. O revisor tem grant nas duas versões e nunca vê o código.

**Falta:** o PDF recompilado com as marcações (passos 1 a 12 abaixo), a navegação "Próxima alteração" e o cache em `diffs/{diffKey}`.

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

## Arquivos do rascunho (implementado)

1. "Novo arquivo" na barra da árvore pede o caminho (pastas entram no caminho: `capitulos/introducao.tex`) e cria um arquivo de texto vazio, já aberto no editor. Imagens e PDFs entram por Importar.
2. O menu de cada arquivo tem "Renomear ou mover" (o texto da tela vai junto, então nada digitado se perde) e "Excluir" (com confirmação; as versões congeladas continuam com o arquivo).
3. Quem só lê vê o código em modo somente leitura, sem Novo arquivo, Importar, Solicitar revisão nem congelar.

## Criar e abrir um projeto (implementado)

1. Sem sessão, `/` leva a `/login?next=%2F`; depois de entrar (Google ou e-mail e senha, com opção de criar conta), o app volta para a rota pedida.
2. "Meus projetos" lista, em tempo real, os projetos em que `memberIds` contém o usuário, do mais recente para o mais antigo (índice composto de `firestore.indexes.json`).
3. "Novo projeto" pede o nome e grava, em duas etapas: o projeto, com o usuário como único membro (`owner`), sem convites e com contadores zerados (o que a regra de criação exige); depois, num lote, `documents/main` e `files/main` (`main.tex` com um modelo em português e o nome escapado no `\title`). São duas etapas porque as regras de `documents` e `files` conferem o papel lendo o projeto, que precisa já existir.
4. O editor abre em `/p/{id}`. Projeto inexistente ou sem acesso mostra "Projeto não encontrado" (as regras respondem "sem permissão" nos dois casos). Se o arquivo `main` não existir (projeto importado), abre o `main.tex` da raiz, o primeiro `.tex` ou o primeiro arquivo de texto.

Verificado de ponta a ponta contra os emuladores de Auth e Firestore: redirecionamento para o login, criação de conta, lista vazia, criação do projeto, edição salva (revisão 2 no banco), texto mantido depois de recarregar, projeto na lista, aviso de projeto inexistente e saída da conta.

## Fluxo de compilação de trabalho (implementado)

1. O salvamento automático (`useFileAutosave`, implementado) grava `files/{id}` com o texto, o tamanho, o sha256 e `revision + 1`, 800 ms depois da última tecla; também grava o que estiver pendente ao sair do editor ou fechar a aba. Vale a última gravação (não há edição simultânea em tempo real). Texto acima de 512 KB não é aceito pelas regras, e o editor avisa.
2. "Compilar", Ctrl+S ou Ctrl+Enter (Cmd no Mac) dispara `useLatexCompile`:
   - o texto de cada arquivo vem do modelo aberto no Monaco (o que está na tela, mesmo antes do salvamento) ou do cache dos arquivos;
   - imagens e outros binários vêm dos arquivos em pedaços do Firestore e ficam em memória na sessão;
   - o principal é o arquivo aberto, se tiver `\documentclass`; senão o `main.tex` da raiz; senão o `.tex` com `\documentclass` de caminho mais curto. Os demais caminhos ficam relativos à pasta dele.
3. Antes de entregar ao TeX, as opções do babel `brazil` e `portuges` viram `brazilian` e `portuguese` com `provide=*` (o compilador não traz o `brazil.ldf`; o idioma carrega pelos arquivos de localidade). O `.tex` do usuário não muda.
4. O Siglum (`src/lib/latex/compiler.ts`) compila com pdfTeX no worker. Na primeira vez baixa o motor e os conjuntos de pacotes da CDN (cerca de 45 MB, depois em cache); pacotes fora deles vêm de `public/texlive`. Ele roda mais de uma passagem quando há sumário ou referências.
5. O PDF fica só no navegador e aparece no `PdfPreviewPanel` (pdf.js). Uma falha mantém o último PDF bom na tela. Não vai para o banco: cada pessoa compila no próprio navegador, e gravar cada compilação gastaria a cota.
6. Os erros do log viram uma lista com arquivo e linha (`parseTexLog`); o clique abre o arquivo e põe o cursor na linha. A linha do principal é corrigida quando o Siglum entrega só o trecho depois de `\begin{document}` ao TeX (preâmbulo em formato de cache) ou insere linhas (microtype).

Limitações atuais: BibTeX e Biber não rodam (citações saem como `[?]`, com aviso); pacotes que exigem `--shell-escape` (minted) não funcionam; pacotes que não estão no Siglum nem no repositório próprio aparecem como "não disponível no compilador".

Verificado no navegador: o projeto de exemplo compila em cerca de 5 s na primeira vez; um erro inserido na linha 10 aparece como `main.tex:10` e o clique leva à linha; no celular o PDF abre sozinho depois de compilar. Contra os emuladores, um projeto importado com imagem PNG (arquivo em pedaços), `booktabs` e `setspace` (do repositório próprio) e `[brazil]{babel}` compila sem erros.
