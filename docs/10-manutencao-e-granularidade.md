# 10. Manutenção e granularidade

## 1. Granularidade do código

| Regra | Limite orientativo | Quando dividir |
| --- | --- | --- |
| Um componente exportado por arquivo | 1 | Sempre que surgir um segundo componente reutilizável |
| Tamanho de componente | até cerca de 150 linhas | Extrair subcomponentes ou um hook quando o JSX tiver mais de uma responsabilidade (ex.: `AiSettingsDialog` e `ModelEntryCard`) |
| Hook de dados | um recurso por hook (`useProjectFiles`, `useAiConfig`) | Nunca um hook que busca "tudo da tela" |
| Módulos do motor de IA | um arquivo por responsabilidade (`rag.ts`, `prompts.ts`, `model-chain.ts`, `providers/<id>.ts`) | Quando um arquivo misturar chamada de rede e regra pura |
| Funções puras | sem I/O, testáveis isoladamente | RAG, fila de modelos, plano de importação, caminhos do zip, parser BibTeX, âncoras, futuro motor de diff |

Preferir composição a props booleanas que mudam o comportamento inteiro do componente.

## 2. Onde colocar código novo

Não há servidor: todo código de produto roda no navegador. O que antes seria um endpoint vira uma escrita validada pelas regras do Firebase (`06-banco-de-dados.md`) ou trabalho local.

| Preciso de... | Lugar |
| --- | --- |
| Um botão, diálogo ou input genérico | `src/components/ui` (padrão shadcn/ui) |
| Um componente genérico sem domínio, mas não shadcn | `src/components/common` |
| Um componente que conhece threads, snapshots, IA... | `src/features/<domínio>/components` |
| Buscar ou gravar dados no Firebase | `src/features/<domínio>/hooks` |
| Um hook de interface sem domínio (media query, teclado) | `src/hooks` |
| Infraestrutura (parser, conversões, zip, download) | `src/lib/<assunto>` |
| Lógica de IA (provedor, prompt, tarefa, contexto) | `src/lib/ai` (mapa completo em `11-servico-de-ia.md`) |
| Compilação LaTeX (motor, preparação, log) | `src/lib/latex`; o diff, planejado, em `src/lib/diff` |
| Um pacote LaTeX que o compilador não tem | Nome do pacote do TeX Live em `ROOT_PACKAGES` de `scripts/latex-packages.mjs` (as dependências entram sozinhas) |
| Tipo de documento do Firestore ou caminho | `shared/firestore/types.ts` e `paths.ts` |
| Rota nova | `src/pages/<nome>-page.tsx` e uma linha em `src/app/router.tsx` |
| Uma operação que envolve vários documentos | Um `writeBatch` no hook, e a validação cruzada (`getAfter`, `existsAfter`) em `firestore.rules` |

Se algo parecer exigir servidor (segredo da plataforma, tarefa agendada, e-mail transacional), registre a decisão em `01-arquitetura.md` antes de implementar: o projeto é estático por escolha (decisões D1 a D10).

## 3. Receitas

### 3.1 Adicionar uma tarefa de IA

1. Incluir o nome em `AI_TASKS` (`src/lib/ai/schemas.ts`). Se a saída for estruturada, criar o schema Zod e incluí-lo em `AiStructuredResultSchema`.
2. Configurar esforço, `maxTokens`, estratégia de contexto (`bm25` ou `section-leads`) e `structured` em `src/lib/ai/tasks.ts`.
3. Escrever o system prompt em `src/lib/ai/prompts.ts` (texto estável, sem datas ou ids).
4. Se a tarefa tiver etapas próprias, tratar em `execute()` de `src/lib/ai/run-task.ts`, usando `provider.generateStructured` para que a saída seja validada com Zod antes do evento `result`.
5. Adicionar o rótulo em `TASK_LABELS` (`ai-composer.tsx`) e, se houver resultado estruturado, a visualização em `structured-result-view.tsx`.
6. Cobrir em `tests/unit/ai-engine.test.ts` e atualizar a tabela de tarefas em `11-servico-de-ia.md`.

### 3.2 Adicionar um provedor de IA

Passo a passo em `11-servico-de-ia.md` (seção 11.10). Em resumo: um arquivo `src/lib/ai/providers/<id>.ts` que implementa `AiProvider`, uma entrada no registro `PROVIDERS` e o id no enum de `AiModelConfigSchema`. A interface de configuração lê o registro, então não precisa mudar.

### 3.3 Adicionar uma coleção ou campo

1. Tipo em `shared/firestore/types.ts` e caminho em `shared/firestore/paths.ts`.
2. Regra em `firestore.rules`. Como não há servidor, a regra é a única validação: confira dono, tipos, campos imutáveis e, em operações de vários documentos, a consistência do lote.
3. Índices compostos em `firestore.indexes.json`; desligar índice de campos grandes em `fieldOverrides`.
4. Cenários em `tests/rules/firestore-rules.test.mjs` (permitido e negado).
5. Documentação em `06-banco-de-dados.md`.

Tudo no mesmo commit.

### 3.4 Guardar um binário novo

Não há Cloud Storage: use `writeStoredFile` (cabeçalho próprio) ou `writeChunks` (quando o cabeçalho é um documento que já tem outros campos, como o diff), de `src/lib/firebase/stored-files.ts`, e leia com `readStoredFile` ou `readChunks`. Para um lugar novo:

1. Caminho em `shared/firestore/paths.ts`.
2. Em `firestore.rules`, um `match` para o cabeçalho (com `validStoredFile` ou `validFileInfo`, `lastChunkWritten` e o teto em bytes) e outro para `chunks/{index}` (com `validChunkIndex`, `validChunk` e `!headerExists`).
3. Cenários de cabeçalho sem o último pedaço, tamanho incoerente e gravação depois de finalizar em `tests/rules/firestore-rules.test.mjs`.
4. Tabela da seção 3 de `06-banco-de-dados.md`, com o teto e o custo na cota.

Lembre que tudo divide a cota de 1 GiB: prefira não guardar o que pode ser regerado no navegador.

### 3.5 Adicionar uma tela

1. Escrever primeiro o layout de 360px; depois `sm:` e `lg:`.
2. Página em `src/pages`, lazy em `router.tsx`.
3. Se for tela de trabalho (editor, revisão), usar a casca com `.h-viewport` e `overflow-hidden`.
4. Diálogo mais alto que a janela segue o padrão "Formulário longo em modal" de `08-responsividade.md`.
5. Incluir a rota em `scripts/check-responsive.mjs` e rodar `npm run check:responsive`.
6. Registrar em `04-componentes-e-telas.md`.

### 3.6 Mudar a importação ou a exportação

As regras puras (caminhos, plano, limites) ficam em `src/lib/project-archive` e têm testes em `tests/unit/project-archive.test.ts`. Toda entrada de zip passa por `normalizeArchivePath`, que recusa caminho absoluto e `..`; não leia nomes de entrada sem passar por ela. Limites novos entram em `IMPORT_LIMITS` e são conferidos antes de descompactar.

### 3.7 Mudar o motor de diff

Toda mudança que altere o LaTeX gerado incrementa a versão do motor. Como a versão faz parte do `diffKey`, PDFs antigos não são reaproveitados por engano. Os anteriores continuam no banco até existir a coleta de lixo (backlog), então não troque a versão do motor sem necessidade: cada troca regera os diffs e ocupa cota.

## 4. Verificações

| Comando | Quando |
| --- | --- |
| `npm run typecheck` | Sempre |
| `npm test` | Sempre (motor de IA com API simulada, importação e exportação) |
| `npm run build` | Sempre |
| `npm run check:conventions` | Sempre |
| `npm run check:responsive` | Ao mexer em layout, cabeçalhos, listas, Sheets e diálogos |
| `npm run test:rules` | Ao mexer em regras, tipos ou caminhos (requer Java 21+; instale antes com `npm --prefix tests/rules install`) |

O workflow `.github/workflows/deploy.yml` roda todas essas verificações em cada pull request e antes de cada deploy; um PR só deve ser mesclado com o CI verde.

Os testes de regras ficam em um pacote separado (`tests/rules/`) porque `@firebase/rules-unit-testing` exige o SDK Firebase 12, enquanto o app usa o 13.

A suíte de regras começa com o Firestore vazio (`createTestEnv` limpa o banco). Não dependa de dados deixados por outra execução na mesma sessão do emulador.

Atrás de proxy HTTP (máquinas corporativas, contêineres de agentes), o firebase-tools manda até as chamadas internas entre emuladores pelo proxy e elas falham. Rode sem as variáveis de proxy: `env -u HTTPS_PROXY -u HTTP_PROXY -u JAVA_TOOL_OPTIONS npm run test:rules`.

Teste com chave real de provedor de IA só por variável de ambiente, nunca gravada em arquivo, commit ou documento (nem mascarada).

## 5. Dependências

- Atualizações de versão menor e de correção: mensais, em um commit `chore(deps)`.
- Versão maior: um commit por biblioteca, com leitura do guia de migração e atualização de `02-tecnologias.md`.
- Versões com atenção especial:
  - `react-resizable-panels`: a API mudou na v4 (`Group`, `Panel`, `Separator`).
  - `monaco-editor`: mantenha a versão de tipos igual à carregada do CDN pelo `@monaco-editor/loader`.
  - TypeScript 7: não usar `baseUrl` nem `moduleResolution: node`.
  - SDKs de IA (`@anthropic-ai/sdk`, `openai`, `@google/genai`): o modelo padrão, os cabeçalhos beta e as ferramentas de cada provedor ficam só no respectivo `src/lib/ai/providers/<id>.ts`. Depois de atualizar, rode `npm test`: os testes simulam a API em nível HTTP e pegam mudança de formato de requisição.
  - `fflate`: o filtro por entrada é o que permite recusar o zip antes de descompactar; confira se continua existindo.

## 6. Documentação

- Mudou comportamento, mude o documento correspondente no mesmo commit.
- Os arquivos `00` a `11` são a referência; não criar documentos paralelos com o mesmo assunto.
- Textos sem travessão, sem emojis e sem setas (verificado por `check:conventions`).

## 7. Dívidas técnicas e próximos passos

| Item | Detalhe | Prioridade |
| --- | --- | --- |
| BibTeX e Biber na compilação | O Siglum não roda; citações saem como `[?]`. Avaliar rodar o `bibtex8` do próprio binário do BusyTeX entre as passagens | Alta |
| Navegação SyncTeX | O Siglum já gera o `.synctex`; ligar clique no PDF à linha do código e vice-versa | Média |
| Assets do Siglum hospedados por nós | Hoje motor e conjuntos vêm de `cdn.siglum.org` (projeto pequeno, de terceiros). Espelhar no Hosting exige plano pago pelo tráfego de cerca de 45 MB por pessoa | Média |
| Camadas do pdf.js para a revisão | O visualizador desenha as páginas; faltam a camada de texto (seleção) e a de anotação | Alta |
| Editor somente leitura para leitores | Quem tem papel `viewer` hoje digita e vê "Sem permissão para editar" no salvamento; o Monaco deveria abrir em modo leitura e esconder Importar | Média |
| Gerenciar projetos | Renomear, arquivar e convidar coautores pela interface (as regras já permitem renomear e convidar) | Média |
| Revisão | `ReviewPage`, snapshot no navegador, convite do revisor por link de e-mail (`sendSignInLinkToEmail`), threads, desenho e pins | Alta |
| Coleta de lixo de binários | Blobs e PDFs de diff sem referência ficam no banco para sempre (sobrescrever um arquivo cria outro blob). Uma ação "Limpar arquivos não usados" precisaria listar `files` e os manifestos de todos os snapshots e liberar exclusão de blob nas regras com cuidado, porque snapshots dependem deles | Média |
| Uso da cota do Firestore | Mostrar no app quanto o projeto ocupa (soma de `totalBytes` dos cabeçalhos) e avisar perto do limite de 1 GiB | Média |
| Provedor OpenAI com chave real | Coberto por tipos e pelo contrato, mas ainda não exercitado contra a API (Claude foi testado com API simulada e Gemini com chave real) | Média |
| Histórico das conversas de IA | Hoje a conversa vive na memória da aba; persistir em `projects/{projectId}/aiConversations` (caminho e tipo já existem) | Média |
| Tamanho do SDK Firebase | Chunk grande; carregar o Firestore sob demanda | Média |
| Ícones PNG do PWA | Gerar 192 e 512 px (e maskable) a partir de `public/icons/icon.svg` | Baixa |
| Monaco empacotado localmente | Se a abertura offline na primeira visita virar requisito | Baixa |
| Tailwind 4 | Migrar para configuração CSS-first quando o padrão do shadcn/ui estabilizar para o projeto | Baixa |
| Testes unitários | Estender o Vitest para `bibtex.ts`, `model-chain.ts` isolado e o futuro motor de diff | Média |
