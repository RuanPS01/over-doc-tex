# 07. Fluxos

Cada cenário descreve o que o usuário vê e a mecânica interna. Não há servidor: tudo roda no navegador, e as gravações com mais de um documento vão num lote (`writeBatch`) que as regras conferem por inteiro (`06-banco-de-dados.md`, seção 4). Os passos marcados como *implementado* já existem no código; os demais são a especificação a seguir.

## Cenário A: autoria e solicitação de revisão (snapshot) (implementado)

### O que o usuário vê

1. O autor escreve no Monaco e vê o PDF ao lado (no celular, alterna entre Código e PDF).
2. Em "Versões", congela uma versão quando quiser (com descrição opcional; ajuste 1.1 ou principal 2.0), abre o PDF guardado, compara com o rascunho e baixa o código daquela versão em .zip.
3. Clica em "Solicitar revisão", informa o e-mail do revisor, um título, uma mensagem e marca os documentos secundários que ele vê (o principal sempre vai). Documentos secundários são cadastrados em "Configurações do projeto" (outro .tex com \documentclass, como um apêndice).
4. Vê o progresso ("Compilando a versão", "Guardando o código e o PDF", "Congelando", "Abrindo a revisão" e, numa rodada seguinte, "Gerando a comparação em PDF") e, ao final, a revisão #1 com o link para copiar, "Enviar pelo meu e-mail" e "Abrir a revisão". Se o código não mudou desde a última versão e ela tem os documentos pedidos, a revisão usa essa versão. Pode continuar editando: o que muda daqui em diante pertence à próxima versão.

**Como o app grava:** cada documento (principal e secundários) é compilado e guarda `{documentId}.pdf`, `.pages` (texto por página) e `.synctex` (formato compacto, abaixo). Falha de compilação mostra os erros do TeX com arquivo e linha (o clique leva à linha) e nada é gravado. O cache de PDF do próprio Siglum fica desligado: ele usa só o texto do principal como chave e devolveria um PDF antigo quando só um arquivo de `\input` mudou.

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

### Revisão pelo link, com ou sem conta (implementado)

1. Em "Solicitar revisão", o autor escolhe "Qualquer pessoa com o link". O e-mail fica opcional; o código do link nasce no mesmo lote da revisão e o diálogo mostra o link para copiar (`?k=código&v=versão`).
2. Quem abre o link sem estar logado entra com login anônimo (sem tela de login) e informa o nome. A ficha de visitante é gravada com o código; o nome fica no navegador e, ao voltar, a pessoa entra direto.
3. Em outro aparelho, a pessoa informa o mesmo nome (maiúsculas, acentos e espaços não importam) e continua como o mesmo revisor: os comentários levam a identidade do nome.
4. A mesma tela oferece "Entrar ou criar conta": leva ao login com `?next=` igual ao link e, depois de entrar (Google, e-mail e senha, conta nova ou link de acesso), volta à revisão já com a conta.
5. Quem já está logado e não foi convidado entra pelo link direto com a própria conta, sem informar nome: a ficha leva o nome da conta e a chave `uid:` mais o id dela, e os comentários são da conta (como os de qualquer conta, pelo `authorId`). Convidado por e-mail ou membro do projeto entra como sempre, pelo grant ou pelo papel.
6. O cabeçalho do visitante sem conta mostra o nome dele (clique para trocar) e não tem a volta para a lista de projetos nem as notificações; quem entrou com conta vê o cabeçalho normal.

### Envio da revisão (implementado)

Na tela da revisão, dono e editores têm o botão "Envio" no cabeçalho (`ReviewSharingDialog`):

- **Quem pode abrir:** "Só os e-mails convidados" (com login) ou "Qualquer pessoa com o link" (sem conta). Passar a "link" cria o código se não houver; voltar a "e-mails" corta o acesso de quem entrou pelo link.
- **Link:** copiar e "Gerar novo link" (com confirmação), que derruba o anterior.
- **E-mails convidados:** acrescentar vários de uma vez. Cada um ganha a concessão na versão com os mesmos documentos e recebe o link de acesso por e-mail; a revisão aparece em "Minhas revisões" da pessoa (consulta por `reviewerEmails`).

### Convite de coautoria (implementado)

1. Em "Configurações do projeto", o dono informa o e-mail e o papel ("Edita" ou "Só lê"); o app grava `pendingMembers[email]` e mostra o link do projeto para enviar.
2. O convidado abre o link e entra com esse e-mail verificado (Google ou link de acesso por e-mail). O editor mostra "Convite para ..." com "Aceitar convite"; ao aceitar, ele se adiciona a `members` e `memberIds` com o papel do convite, apaga a entrada de `pendingMembers` e grava o próprio nome em `memberProfiles`, tudo no mesmo pedido.
3. O dono muda o papel ou remove membros na mesma tela; quem edita muda nome e descrição do projeto.

## Cenário B: revisão estilo Pull Request e resolução (implementado)

**Como está no app:** na barra do PDF ficam as ferramentas "Selecionar texto" (padrão), "Ponto" e "Desenhar", e um seletor de documento quando a revisão concede mais de um.

- **Trecho:** ao soltar a seleção dentro da camada de texto de uma página, aparece "Comentar trecho"; a âncora `TextAnchor` guarda os retângulos (juntados por linha), a citação com até 32 caracteres de contexto e a posição no texto da página (`.pages`). O trecho fica destacado no PDF.
- **Ponto:** um clique na página cria o pin (`drawing: null`).
- **Desenho:** cada traço (ponteiro, mouse ou toque) é simplificado (Ramer-Douglas-Peucker, epsilon 0,002) e entra no comentário pendente; o painel tem cor (tokens `annotation-*`) e "Desfazer traço"; o pin fica no canto superior direito do desenho; limite de 2.000 pontos.
- **Linha do código:** na criação, o SyncTeX da versão dá `sourceHint` (arquivo e linha); o autor usa "Abrir no código".
- **Notificações:** cada ação grava `users/{uid}/notifications` para o outro lado (comentário novo, resposta, resolvido ou reaberto, revisor abriu, aprovou ou pediu alterações, revisão encerrada). O sino (lista, contagem, marcar como lidas) abre a revisão.
- Respostas sobem o contador da thread no mesmo lote; autor e revisor resolvem (o autor com `fixed_next_version`, o revisor com `answered`) ou reabrem; ao congelar a versão seguinte, quem congela carimba `fixedInSnapshotId` e a thread aparece como "Corrigida".

- **Rodada seguinte:** ao pedir nova revisão ao mesmo revisor, as threads ainda abertas da rodada anterior vêm junto (`carriedFromThreadId`), reancoradas na versão nova como em "Reancoragem" abaixo (trecho com os retângulos refeitos pelo pdf.js a partir do texto das páginas; pin movido pela linha do código no SyncTeX). Trecho não encontrado vira `outdated` ("Desatualizada") com a citação original. A conversa antiga aparece no cartão, em "Rodada anterior", e as respostas novas seguem abaixo.

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

## Cenário C: diff visual e recompilação (implementado, com as diferenças abaixo)

**Como está no app:**

- **Na revisão ("Ver alterações"):** abas "PDF marcado" e "Texto". O PDF vem do cache `diffs/{diffKey}`, que o autor gera ao pedir a rodada seguinte (etapa "Gerando a comparação em PDF") ou ao abrir a aba; o revisor só lê o cache, porque não lê o código. A aba Texto compara o texto das páginas (`.pages`) da versão anterior do mesmo revisor com o da atual, já normalizado (palavras hifenizadas juntadas, uma frase por linha) para o reflow não aparecer como alteração.
- **No editor ("Ver alterações"):** abas "Código" (diff por palavra, arquivo por arquivo, também contra o rascunho) e "PDF marcado" (entre versões, com cache; contra o rascunho, gerado na hora e sem cache).
- **Barra do PDF marcado:** contadores de palavras, "Anterior" e "Próxima alteração", e marcas na margem de cada alteração.

**Diferenças em relação ao algoritmo abaixo** (código em `src/lib/diff/latex-diff.ts` e `visual-diff.ts`):

- Roda na thread principal (o texto é leve); só a compilação vai para o worker do Siglum.
- Comandos de texto com um argumento (`\emph`, `\textbf`, `\section`, `\caption`, `\footnote`...) que só mudaram o argumento recebem o diff dentro dele, sem `\DIFmark` no argumento (o marcador fica antes do comando). Os demais comandos (`\cite{...}`), grupos entre chaves e matemática são átomos: mudou, o átomo inteiro é marcado.
- Blocos com ambiente (`itemize`, `figure`, `tabular`...) são comparados inteiros e vão em `DIFaddenv` ou `DIFdelenv`.
- A posição de cada alteração vem de `\DIFmark{n}` como destino nomeado do pdfTeX (`\pdfdest`), lido pelo pdf.js, em vez do `zref` no `.aux` (o Siglum não devolve o `.aux`).
- O preâmbulo carrega `xcolor` e `ulem` só se o documento ainda não carregou; no nível `paragraph` não usa o `ulem` (só cor). O `ulem` vem do repositório de pacotes do site.

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

1. Abre o assistente (janela no desktop, encaixada no rodapé ou solta; Sheet inferior no celular). Sem IA configurada, o painel mostra "Configurar a minha IA"; o mesmo diálogo abre por "Configurações de IA" no menu "Mais ações" do projeto.
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

1. Sem sessão, `/` leva a `/login?next=%2F`; depois de entrar (Google ou e-mail e senha, com opção de criar conta), o app volta para a rota pedida. "Esqueci a senha" manda, para o e-mail digitado, o link de troca de senha do Firebase (`sendPasswordResetEmail`); a página do Firebase cria a senha nova e volta ao login com o mesmo `?next=`. A mensagem não diz se a conta existe (proteção contra enumeração de e-mails do Firebase).
2. Os e-mails do Firebase (link de acesso, convite de revisão, troca de senha) e a página de troca de senha saem no idioma da interface: o app mantém `auth.languageCode` igual ao idioma escolhido, e o Firebase usa o modelo de e-mail desse idioma. Modelos editados no console do Firebase valem só para o idioma em que foram editados.
3. Perfil (menu da conta no cabeçalho de "Meus projetos"): o nome novo vai para o Firebase Authentication (`updateProfile`) e para a entrada da pessoa em `memberProfiles` de cada projeto em que ela é membro (lotes de até 400; as regras só deixam mudar a própria entrada). Comentários e notificações já gravados continuam com o nome antigo. A senha muda com a senha atual (`reauthenticateWithCredential` e `updatePassword`) ou pelo link de troca do Firebase, que também cria uma senha para quem só entrava com Google ou link de acesso.
4. "Meus projetos" lista, em tempo real, os projetos em que `memberIds` contém o usuário, do mais recente para o mais antigo (índice composto de `firestore.indexes.json`).
5. "Novo projeto" pede o nome e grava, em duas etapas: o projeto, com o usuário como único membro (`owner`), sem convites e com contadores zerados (o que a regra de criação exige); depois, num lote, `documents/main` e `files/main` (`main.tex` com um modelo em português e o nome escapado no `\title`). São duas etapas porque as regras de `documents` e `files` conferem o papel lendo o projeto, que precisa já existir.
6. O editor abre em `/p/{id}`. Projeto inexistente ou sem acesso mostra "Projeto não encontrado" (as regras respondem "sem permissão" nos dois casos). Se o arquivo `main` não existir (projeto importado), abre o `main.tex` da raiz, o primeiro `.tex` ou o primeiro arquivo de texto.

Verificado de ponta a ponta contra os emuladores de Auth e Firestore: redirecionamento para o login, criação de conta, lista vazia, criação do projeto, edição salva (revisão 2 no banco), texto mantido depois de recarregar, projeto na lista, aviso de projeto inexistente e saída da conta.

## Fluxo de compilação de trabalho (implementado)

1. O salvamento automático (`useFileAutosave`, implementado) grava `files/{id}` com o texto, o tamanho, o sha256 e `revision + 1`, 800 ms depois da última tecla; também grava o que estiver pendente ao sair do editor ou fechar a aba. Vale a última gravação (não há edição simultânea em tempo real). Texto acima de 512 KB não é aceito pelas regras, e o editor avisa.
2. "Compilar", Ctrl+S ou Ctrl+Enter (Cmd no Mac) dispara `useLatexCompile`:
   - o texto de cada arquivo vem do modelo aberto no Monaco (o que está na tela, mesmo antes do salvamento) ou do cache dos arquivos;
   - imagens e outros binários vêm dos arquivos em pedaços do Firestore e ficam em memória na sessão;
   - o principal é o arquivo aberto, se tiver `\documentclass`; senão o `main.tex` da raiz; senão o `.tex` com `\documentclass` de caminho mais curto. Os demais caminhos ficam relativos à pasta dele.
3. Antes de entregar ao TeX (`buildCompileInput`, sem mudar o `.tex` do usuário nem a numeração das linhas):
   - no `\usepackage{babel}` do documento, `brazil` e `portuges` viram `brazilian` e `portuguese` com `provide=*` (o idioma carrega pelos arquivos de localidade, que vêm no Siglum);
   - o babel carregado por uma classe (o abnTeX2 pede `[brazil]`) e os idiomas das opções da classe (`french`, `spanish`...) precisam do `.ldf`, que o Siglum descarta ao instalar um pacote; esses arquivos saem soltos em `public/texlive/files` e o compilador os manda junto com o documento (`src/lib/latex/texlive-files.ts`);
   - com backref, uma linha colada ao `\begin{document}` refaz o `.brf` a partir do `.aux` (o Siglum só guarda `.aux`, `.toc`, `.lof`, `.lot`, `.out` e `.bbl` entre as passagens; sem isso toda referência sairia "Nenhuma citação no texto").
4. O Siglum (`src/lib/latex/compiler.ts`) compila com pdfTeX no worker e devolve também o SyncTeX: duplo clique no PDF leva o editor à linha que gerou o trecho, e "Mostrar no PDF" (na barra do editor) rola o PDF até a linha do cursor e a marca por um instante. Na primeira vez baixa o motor e os conjuntos de pacotes da CDN (cerca de 45 MB, depois em cache); pacotes fora deles vêm de `public/texlive`. Ele roda mais de uma passagem quando há sumário ou referências e tenta de novo quando falta um pacote; só os erros da última tentativa vão para a lista. O Siglum guarda no navegador cada pacote que buscou, até os que não achou: quando a revisão do repositório do site (`packages.json`) muda, esse cache é limpo uma vez e os pacotes voltam a ser buscados.
5. O PDF fica só no navegador e aparece no `PdfPreviewPanel` (pdf.js). Uma falha mantém o último PDF bom na tela. Não vai para o banco: cada pessoa compila no próprio navegador, e gravar cada compilação gastaria a cota.
6. Os erros do log viram uma lista com arquivo e linha (`parseTexLog`); o clique abre o arquivo e põe o cursor na linha. A linha do principal é corrigida quando o Siglum entrega só o trecho depois de `\begin{document}` ao TeX (preâmbulo em formato de cache) ou insere linhas (microtype).

**Bibliografia (BibTeX):** o compilador não tem o bibtex, então `src/lib/latex/bibliography.ts` monta o `.bbl` antes de compilar: lê `\bibliography` e `\bibliographystyle`, as citações na ordem em que aparecem (seguindo `\input`, com `\nocite{*}`) e os `.bib` (com `@string` e `#`), e formata como os estilos plain, abbrv, alpha e unsrt, ou autor-ano com natbib (e estilos `*nat`). Com `abntex2cite` (ou `abntex2-alf` e `abntex2-num`), `src/lib/latex/bibliography-abnt.ts` segue o `.bst` do abnTeX2: cada entrada leva `\abntrefinfo{Autor}{AUTOR}{ano}`, de onde `\cite` e `\citeonline` tiram "(SILVA; SOUZA, 2020)" e "Silva e Souza (2020)"; referência com sobrenome em maiúsculas e iniciais, "et al." acima de 3 autores, `[S.l.: s.n.]`, "Disponível em" e "Acesso em", 2020a e 2020b para o mesmo autor e ano, ordem alfabética no modo `alf` e de citação no `num`. `\citeoption` (abnt-emphasize, abnt-etal-list, abnt-etal-cite, abnt-and-type) muda o formato e não conta como citação; `\apud` cita as duas obras. O TeX lê o arquivo como `document.bbl`, e citações indefinidas só viram aviso se continuarem assim na última passagem. Outros estilos caem em plain.

Limitações atuais: biblatex precisa do Biber e não roda (citações saem como `[?]`, com aviso); pacotes que exigem `--shell-escape` (minted) não funcionam; pacotes que não estão no Siglum nem no repositório próprio aparecem como "não disponível no compilador"; o formato do pdfLaTeX do Siglum não traz padrões de hifenização para português, francês e espanhol (o babel avisa e o texto em português sai sem a hifenização própria do idioma).

Verificado no navegador: o projeto de exemplo compila em cerca de 5 s na primeira vez; um erro inserido na linha 10 aparece como `main.tex:10` e o clique leva à linha; no celular o PDF abre sozinho depois de compilar. Contra os emuladores, um projeto importado com imagem PNG (arquivo em pedaços), `booktabs` e `setspace` (do repositório próprio) e `[brazil]{babel}` compila sem erros. Uma dissertação abnTeX2 real (silence, memoir, TikZ, pgfplots, lastpage, backref e abntex2cite `[alf]`, 84 páginas) importada por zip compila em cerca de 30 s, com citações ABNT, "Citado na página" nas referências e nenhum problema na lista; com o cache antigo do Siglum marcando o `silence` como não encontrado, a troca de revisão limpa o cache e a compilação passa (sem a limpeza, falha com "silence.sty não disponível").
