# 01. Arquitetura

## 1. Visão geral

O OverDocTeX é um PWA estático de edição LaTeX com revisão por versões congeladas (snapshots), comentários ancorados no PDF, diff visual recompilado, importação e exportação de projetos e um assistente de IA contextual. **Não há servidor próprio:** o app roda no navegador, guarda dados no Firebase (Auth e Firestore, inclusive os binários, em pedaços) e fala direto com a API de IA escolhida pelo usuário, com a chave dele.

```
+--------------------------------------------------------------+
|  PWA (React 18 + Vite + Tailwind): GitHub Pages e Hosting    |
|  Service Worker (offline) e Web Workers (LaTeX, diff)        |
|                                                              |
|  Editor | PDF | Revisão | Importação/Exportação | IA         |
+-------------+----------------------------+-------------------+
              |                            |
      SDK Firebase (regras)        SDKs de IA no navegador
              |                    (chave do próprio usuário)
+-------------+--------------+     +-------+------------------+
|  Firebase Authentication   |     |  Claude (Anthropic)      |
|  Cloud Firestore           |     |  OpenAI                  |
|  (dados e binários)        |     |  Gemini (Google)         |
+----------------------------+     +--------------------------+
```

## 2. Camadas e responsabilidades

| Camada | Tecnologia | Responsabilidade |
| --- | --- | --- |
| Interface | React 18, TypeScript estrito, Vite, Tailwind, shadcn/ui | Editor, visualizador de PDF, revisão, chat de IA, modo offline |
| Dados em tempo real | Firestore (SDK web com cache persistente) | Projetos, arquivos, versões, revisões, threads, configuração de IA |
| Arquivos | Firestore, em pedaços de até 1.000.000 bytes | Conteúdo por hash, PDFs de versão e de diff (`06-banco-de-dados.md`, seção 3) |
| Regras | `firestore.rules` | Toda a autorização e a coerência entre documentos gravados em lote, inclusive dos binários |
| Trabalho pesado | Web Workers no navegador | Compilação LaTeX (Siglum, TeX Live 2025 em WebAssembly, com SyncTeX), recompilação do diff visual e texto das páginas (pdf.js) |
| IA | `@anthropic-ai/sdk`, `openai`, `@google/genai` no navegador | Escrita, paráfrase, estrutura, sumário, auditoria de referências |
| Hospedagem | GitHub Pages e Firebase Hosting | O mesmo site estático nos dois; deploy pelo workflow `.github/workflows/deploy.yml` |

## 3. Decisões arquiteturais

**D1. Snapshots imutáveis com conteúdo endereçado por hash.** Cada arquivo congelado vira `projects/{id}/blobs/{sha256}`; o snapshot guarda só o manifesto. Arquivos iguais entre versões não se duplicam. As regras negam qualquer alteração de snapshot.

**D2. Sem servidor.** Tudo que antes seria uma Cloud Function é feito pelo app e conferido pelas regras: o snapshot só nasce no mesmo lote que avança o contador do projeto exatamente 1; a revisão só nasce junto com o grant do revisor; contadores de comentários só sobem de 1 em 1. Assim o projeto roda com GitHub Pages mais Firebase, sem nada para manter em execução.

**D3. Compilação e diff no navegador.** O LaTeX é compilado pelo Siglum (`@siglum/engine`, MIT): pdfTeX do TeX Live 2025 em WebAssembly, num Web Worker. O motor (cerca de 30 MB) e os conjuntos de pacotes vêm da CDN do Siglum na primeira compilação e ficam em cache no navegador; o código do documento nunca sai do navegador. Pacotes que não estão nesses conjuntos vêm de um repositório estático do próprio site (`public/texlive`, arquivos `.tar.xz` do TeX Live 2025 gerados por `scripts/latex-packages.mjs`), no formato que o Siglum espera de um proxy, então não há servidor; arquivos que o Siglum descarta ao instalar um pacote (o `.ldf` do babel) vão soltos junto com o documento. Não exige isolamento entre origens (COOP/COEP): sem `SharedArrayBuffer` o Siglum copia os dados entre página e worker, um pouco mais devagar, e o login com Google por popup continua funcionando. Descartados: SwiftLaTeX (AGPL, parado desde 2023 e com servidores fora do ar) e texlive.net (manda o documento a terceiros e não libera CORS). O diff usará o mesmo motor, conforme `07-fluxos.md`. O preço é a primeira compilação mais lenta e um conjunto de pacotes menor que um TeX Live completo.

**D4. O revisor não é membro do projeto.** O acesso vem de grants por **e-mail verificado** (`snapshots/{sid}/grants/{email}`), criados pelo autor no mesmo lote da revisão. O revisor vê só os snapshots e documentos liberados, nunca o rascunho. Coautores entram por convite de e-mail (`pendingMembers`) e se adicionam sozinhos ao aceitar.

**D5. IA sempre do usuário.** Não existe IA da plataforma. Cada usuário configura uma fila de modelos (principal e reservas) com as próprias chaves, guardada na conta (`users/{uid}/private/ai`) ou no navegador. As chamadas saem do navegador direto para o provedor (`11-servico-de-ia.md`).

**D6. RAG lexical (BM25).** Projetos LaTeX têm centenas de blocos. BM25 é determinístico, não exige banco vetorial e explica por que um trecho foi escolhido.

**D7. Diff por recompilação de LaTeX anotado.** O motor injeta macros de marcação no código e recompila; o TeX refaz as quebras de linha com o texto antigo e o novo (`07-fluxos.md`).

**D8. Estado no cliente.** Dados remotos no TanStack React Query (com `onSnapshot` atualizando o cache); estado de interface em Context local por feature. Sem store global.

**D9. Provedores de IA num registro único.** `PROVIDERS` (`src/lib/ai/providers/index.ts`) concentra rótulo, modelo padrão, catálogo, verificação de chave, listagem e criação de cada provedor. Adicionar um provedor não toca nas tarefas.

**D10. Hospedagem estática no GitHub Pages e no Firebase Hosting.** O mesmo código publica nos dois, sempre depois do deploy das regras e índices do Firebase. O build roda duas vezes porque o caminho base muda: no Pages, o subcaminho (`/<repositório>/`) vem de `BASE_PATH` e vai para o Vite, o manifesto e o roteador, e um `404.html` igual ao `index.html` abre as rotas do SPA em acesso direto; no Hosting, o site fica na raiz (`<site>.web.app`, escolhido por `FIREBASE_HOSTING_SITE` ou o padrão do projeto) e as rotas abrem pelo rewrite para `index.html` do `firebase.json`. O Hosting tem a vantagem do domínio já autorizado no Firebase Auth e cabeçalhos de cache sob controle.

**D11. Binários no próprio Firestore, sem Cloud Storage.** O Cloud Storage exige o plano Blaze (com cartão) desde fevereiro de 2026, e qualquer armazenamento de objetos de terceiros (R2, B2, S3) precisaria de um servidor para guardar a chave e conferir permissões. Os binários viraram arquivos em pedaços no Firestore: cabeçalho com tamanho, tipo e sha256 mais a subcoleção `chunks`, e o cabeçalho só entra no mesmo lote do último pedaço. As mesmas regras do Firestore protegem tudo (membros, grants do revisor, versão congelada), e o projeto inteiro cabe no plano Spark. O preço é a cota: 1 GiB no total, cada pedaço lido conta como uma leitura, e por isso há tetos (25 MiB por blob, 50 MiB por PDF de versão ou diff, 100 MB por importação) e o PDF da compilação de trabalho não é gravado.

**D12. Tradução própria, sem biblioteca e com o português como chave.** A interface fala português (Brasil), inglês e espanhol. O texto em português escrito no código é a chave (como no gettext): `t('Compilar')` busca "Compile" ou "Compilar" nos dicionários de `src/lib/i18n/messages/{en,es}`, e uma chave sem tradução cai no português. Assim o código continua legível, não há arquivo de chaves abstratas para manter sincronizado e um teste (`tests/unit/i18n.test.ts`) acha toda chave usada e exige as duas traduções. Sem escolha manual, o idioma segue o principal do sistema (`navigator.languages[0]`); fora dos três, inglês. A escolha fica no navegador (`overdoctex.locale`), vira o `lang` do `<html>` antes do primeiro desenho (script do `index.html`) e a página tem `translate="no"`, para a tradução automática do navegador não reescrever a interface nem o código LaTeX. Textos gravados no banco (comentários, título padrão da revisão, título das notificações) ficam no idioma de quem gravou; o que vem de um código guardado (status da revisão, papel, cor da anotação) é traduzido na hora de mostrar. Nomes de arquivo baixados usam palavras sem acento traduzidas (`rascunho`, `alteracoes`). Descartados: i18next e FormatJS (dependência e chaves abstratas para um app de três idiomas, sem plural complexo nem carga sob demanda).

## 4. Estrutura de pastas

Itens marcados como *(planejado)* ainda não existem.

```
over-doc-tex/
├── .github/workflows/deploy.yml       CI em PRs; regras do Firebase, GitHub Pages e Firebase Hosting na main
├── docs/                              documentação de referência (00 a 11)
├── shared/firestore/
│   ├── types.ts                       tipos de todas as coleções e âncoras
│   └── paths.ts                       caminhos do Firestore (dados e arquivos em pedaços)
├── src/
│   ├── main.tsx                       montagem do React e registro do service worker
│   ├── app/                           providers, roteador (com o subcaminho do Pages)
│   ├── pages/                         uma página por rota; só compõe features
│   ├── features/
│   │   ├── auth/                      AuthProvider, RequireAuth e useAuth
│   │   ├── projects/                  lista e criação de projetos, useProject
│   │   ├── editor/
│   │   │   ├── components/            casca, cabeçalho, workspaces, árvore, Monaco, ImportDialog
│   │   │   ├── hooks/                 useProjectFiles, useProjectSources, useFileAutosave, useFileActions, useProjectArchive, useExportProject
│   │   │   ├── model/                 modelo de visão e dados de demonstração
│   │   │   └── state/                 estado de interface do editor
│   │   ├── pdf-viewer/                PdfPreviewPanel, PdfDocumentView e PdfPages (pdf.js)
│   │   ├── ai-assistant/
│   │   │   ├── components/            painel, diálogo "Usar a minha própria IA", cartão de modelo
│   │   │   └── hooks/                 useAiConfig, useAiStream, useProviderModels
│   │   ├── snapshots/                 congelar versão, histórico, PDF e código de cada versão
│   │   ├── review/                    solicitar revisão, ReviewPage (trecho, ponto, desenho), threads, fila e "Revisões para você"
│   │   ├── notifications/             sino e gravação das notificações
│   │   └── diff/                      "Ver alterações": código e PDF marcado (com cache em diffs/{diffKey})
│   ├── components/
│   │   ├── ui/                        shadcn/ui puro: button, dialog, dropdown-menu, input, resizable, select, sheet, tabs, textarea
│   │   └── common/                    markdown-content, botões de tema e de idioma, cabeçalho mínimo
│   ├── hooks/                         hooks genéricos: media query, modo de layout, tema, tradução (useT)
│   ├── lib/
│   │   ├── ai/                        motor de IA: provedores, fila, RAG, prompts, tarefas, referências
│   │   ├── project-archive/           caminhos seguros, plano de importação, zip
│   │   ├── stored-files/              arquivos em pedaços: divisão, remontagem, sha256 (puro)
│   │   ├── firebase/                  inicialização preguiçosa, emuladores e leitura/gravação dos pedaços
│   │   ├── markdown/                  marked + DOMPurify
│   │   ├── monaco/                    linguagem LaTeX e tema derivado dos tokens
│   │   ├── latex/                     compilação (Siglum), preparação do projeto, leitura do log e SyncTeX
│   │   ├── diff/                      diff por palavra (Myers), comparação de árvores e diff visual (LaTeX anotado e compilação)
│   │   ├── pdf/                       pdf.js, texto por página, âncoras de trecho e desenho
│   │   ├── i18n/                      idioma (sistema ou escolha), t() e msg(), dicionários en e es por área
│   │   ├── email.ts                   validação de e-mail e endereço de volta do link de acesso
│   │   ├── download.ts, query-keys.ts, utils.ts
│   └── styles/globals.css             tokens e utilitários (.h-viewport)
├── tests/
│   ├── unit/                          Vitest: motor de IA e importação/exportação
│   └── rules/                         regras nos emuladores (pacote isolado)
├── scripts/                           verificação de responsividade e de convenções
├── firestore.rules, firestore.indexes.json, firebase.json
└── vite.config.ts, vitest.config.ts, tailwind.config.ts
```

### Fronteiras de importação

| Origem | Pode importar | Não pode importar |
| --- | --- | --- |
| `pages/` | `features/`, `components/`, `hooks/` | SDK do Firebase, `lib/firebase` |
| `features/<x>/components` | `components/`, `hooks/`, `lib/`, `shared/`, hooks da própria feature, componentes públicos de outras features | SDK do Firebase (exceto `*-provider.tsx`), hooks de outra feature |
| `features/<x>/hooks` | `lib/`, `shared/`, SDK do Firebase | componentes |
| `components/ui`, `components/common` | `lib/utils`, `lib/markdown` | `features/`, Firebase, IA |
| `hooks/` | React | `features/`, Firebase |
| `lib/` | `shared/`, bibliotecas externas | `features/`, `pages/` |

Componente de uma feature que precisa de dados de outra recebe por props (ex.: `AiAssistantPanel` recebe `files`, `open` e `onOpenChange` do `EditorShell`; `VersionHistorySheet` recebe a aba Revisões pronta). Hooks podem usar hooks de outra feature quando a dependência é natural (o congelamento usa `useProjectSources` do editor; a revisão usa `useFreezeSnapshot`), sem ciclos. Quando uma tela junta várias features, a composição fica na página (`EditorDialogs` em `editor-page.tsx`).

## 5. Segurança

- **Autenticação:** Firebase Auth (Google, e-mail e senha, e link por e-mail para revisores). E-mail verificado é exigido para grants e convites.
- **Autorização:** só as regras do Firestore, com o mesmo modelo (membros por papel, convites por e-mail, grants por e-mail). Cobertas por `tests/rules/`.
- **Integridade sem servidor:** lotes validados com `getAfter` e `existsAfter` (snapshot com contador, revisão com grant, cabeçalho de arquivo com o último pedaço). O sha256 de cada arquivo em pedaços é conferido ao remontar.
- **Chaves de IA:** só do usuário, em documento privado ou no navegador; nunca no build.
- **Conteúdo gerado:** Markdown da IA sanitizado; conteúdo do documento e de páginas externas delimitado e marcado como dado.
- **Importação:** caminhos normalizados (bloqueio de `..`, absolutos e lixo de sistema) e limites de tamanho conferidos antes de descompactar.

## 6. Custos e escala

- Sem servidores: Auth, Firestore e Hosting cabem no plano Spark (gratuito, sem cartão); a IA é paga por cada usuário na própria chave.
- O limite real é a cota do Firestore: 1 GiB guardado (dados e binários juntos), 50 mil leituras e 20 mil gravações por dia. Um PDF de 5 MB custa 5 leituras de pedaço para abrir, e o cache offline evita repetir.
- Leituras vêm do cache persistente do Firestore; `onSnapshot` só traz deltas.
- PDFs de diff ficam em cache por par de versões: o mesmo par nunca é compilado duas vezes por quem edita.
