# 10. Manutenção e granularidade

## 1. Granularidade do código

| Regra | Limite orientativo | Quando dividir |
| --- | --- | --- |
| Um componente exportado por arquivo | 1 | Sempre que surgir um segundo componente reutilizável |
| Tamanho de componente | até cerca de 150 linhas | Extrair subcomponentes ou um hook quando o JSX tiver mais de uma responsabilidade |
| Hook de dados | um recurso por hook (`useProjectFiles`, `useThreads`) | Nunca um hook que busca "tudo da tela" |
| Funções do backend | um arquivo por responsabilidade (`rag.ts`, `prompts.ts`, `claude.ts`) | Quando um arquivo misturar I/O e regra pura |
| Funções puras | sem I/O, testáveis isoladamente | Lógica de diff, RAG, parser BibTeX, âncoras |

Preferir composição a props booleanas que mudam o comportamento inteiro do componente.

## 2. Onde colocar código novo

| Preciso de... | Lugar |
| --- | --- |
| Um botão, diálogo ou input genérico | `src/components/ui` (padrão shadcn/ui) |
| Um componente genérico sem domínio, mas não shadcn | `src/components/common` |
| Um componente que conhece threads, snapshots, IA... | `src/features/<domínio>/components` |
| Buscar ou gravar dados no Firebase | `src/features/<domínio>/hooks` |
| Um hook de interface sem domínio (media query, teclado) | `src/hooks` |
| Infraestrutura (cliente HTTP, parser, conversões) | `src/lib/<assunto>` |
| Tipo de documento do Firestore ou caminho | `shared/firestore/types.ts` e `paths.ts` |
| Schema de contrato entre cliente e servidor | `shared/<assunto>/schemas.ts` |
| Rota nova | `src/pages/<nome>-page.tsx` e uma linha em `src/app/router.tsx` |
| Endpoint leve ou trigger | `functions/src/<domínio>/` e export em `functions/src/index.ts` |
| Algo que precisa de TeX Live | `services/latex-worker` |

## 3. Receitas

### 3.1 Adicionar uma tarefa de IA

1. Incluir o nome em `AI_TASKS` (`shared/ai/schemas.ts`). Se a saída for estruturada, criar o schema Zod, incluir em `STRUCTURED_TASKS` e em `AiStructuredResultSchema`.
2. Configurar esforço, `maxTokens`, estratégia de contexto e papéis em `functions/src/ai/tasks.ts`.
3. Escrever o system prompt em `functions/src/ai/prompts.ts` (texto estável, sem datas ou ids).
4. Se a tarefa tiver etapas próprias, tratar em `run-task.ts`, validando qualquer saída estruturada com Zod antes do evento `result`.
5. Adicionar o rótulo em `TASK_LABELS` (`ai-composer.tsx`) e, se houver resultado estruturado, a visualização em `structured-result-view.tsx`.
6. Atualizar a tabela de tarefas em `07-fluxos.md`.

### 3.2 Adicionar uma coleção ou campo

1. Tipo em `shared/firestore/types.ts` e caminho em `shared/firestore/paths.ts`.
2. Regra em `firestore.rules` (e em `storage.rules`, se houver arquivo).
3. Índices compostos em `firestore.indexes.json`; desligar índice de campos grandes em `fieldOverrides`.
4. Cenários em `tests/rules/firestore-rules.test.mjs` (permitido e negado).
5. Documentação em `06-banco-de-dados.md`.

Tudo no mesmo commit.

### 3.3 Adicionar uma tela

1. Escrever primeiro o layout de 360px; depois `sm:` e `lg:`.
2. Página em `src/pages`, lazy em `router.tsx`.
3. Se for tela de trabalho (editor, revisão), usar a casca com `.h-viewport` e `overflow-hidden`.
4. Incluir a rota em `scripts/check-responsive.mjs` e rodar `npm run check:responsive`.
5. Registrar em `04-componentes-e-telas.md`.

### 3.4 Mudar o motor de diff

Toda mudança que altere o LaTeX gerado incrementa `DIFF_ENGINE_VERSION`. Como a versão faz parte do `diffKey`, PDFs antigos não são reaproveitados por engano; os anteriores expiram pela regra de ciclo de vida do bucket.

## 4. Verificações

| Comando | Quando |
| --- | --- |
| `npm run typecheck` | Sempre |
| `npm run build` | Sempre |
| `npm run check:conventions` | Sempre |
| `npm run check:responsive` | Ao mexer em layout, cabeçalhos, listas, Sheets |
| `npm --prefix functions run build` | Ao mexer em `functions/` ou `shared/` |
| `npm run test:rules` | Ao mexer em regras, tipos ou caminhos (requer Java 21+; instale antes com `npm --prefix tests/rules install`) |

O workflow `.github/workflows/deploy.yml` roda todas essas verificações em cada pull request e antes de cada deploy; um PR só deve ser mesclado com o CI verde.

Os testes de regras ficam em um pacote separado (`tests/rules/`) porque `@firebase/rules-unit-testing` exige o SDK Firebase 12, enquanto o app usa o 13.

## 5. Dependências

- Atualizações de versão menor e de correção: mensais, em um commit `chore(deps)`.
- Versão maior: um commit por biblioteca, com leitura do guia de migração e atualização de `02-tecnologias.md`.
- Versões com atenção especial:
  - `react-resizable-panels`: a API mudou na v4 (`Group`, `Panel`, `Separator`).
  - `monaco-editor`: mantenha a versão de tipos igual à carregada do CDN pelo `@monaco-editor/loader`.
  - TypeScript 7: não usar `baseUrl` nem `moduleResolution: node`.
  - `@anthropic-ai/sdk`: o modelo e os cabeçalhos beta ficam só em `functions/src/ai/claude.ts`.

## 6. Documentação

- Mudou comportamento, mude o documento correspondente no mesmo commit.
- Os arquivos `00` a `10` são a referência; não criar documentos paralelos com o mesmo assunto.
- Textos sem travessão, sem emojis e sem setas (verificado por `check:conventions`).

## 7. Dívidas técnicas e próximos passos

| Item | Detalhe | Prioridade |
| --- | --- | --- |
| `latex-worker` | Implementar `/compile`, `/snapshot` e `/diff` conforme `07-fluxos.md` | Alta |
| Visualizador pdf.js | Substituir os marcadores de página do `PdfPreviewPanel` por páginas reais com camadas de texto e anotação | Alta |
| Funções de revisão | `requestReview`, `acceptInvite`, `requestDiff`, `getDiffUrl` e os triggers de contadores e notificações | Alta |
| Regras do Storage com consulta ao Firestore | Os dois cenários positivos de `storage-rules.test.mjs` falharam no ambiente onde a suíte foi criada; lá, até o exemplo mínimo de `firestore.exists` falhou no emulador. O job `rules-tests` do CI é o primeiro ambiente limpo onde eles rodam; se falharem lá, a regra precisa ser corrigida antes do deploy (o workflow bloqueia o deploy nesse caso) | Alta |
| Limite de uso da IA | Cota por usuário e por projeto (contador diário no Firestore) e App Check no `aiStream` | Média |
| Tamanho do SDK Firebase | Chunk de cerca de 650 kB; carregar Storage e Firestore sob demanda | Média |
| Egress do verificador de links | Rodar com VPC, Cloud NAT e firewall bloqueando faixas privadas | Média |
| Ícones PNG do PWA | Gerar 192 e 512 px (e maskable) a partir de `public/icons/icon.svg` | Baixa |
| Monaco empacotado localmente | Se a abertura offline na primeira visita virar requisito | Baixa |
| Tailwind 4 | Migrar para configuração CSS-first quando o padrão do shadcn/ui estabilizar para o projeto | Baixa |
| Testes unitários | Vitest para `rag.ts`, `bibtex.ts`, `ndjson.ts` e o futuro motor de diff | Média |
