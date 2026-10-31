# 01. Arquitetura

## 1. Visão geral

O OverDocTeX é um PWA estático de edição LaTeX com revisão por versões congeladas (snapshots), comentários ancorados no PDF, diff visual recompilado, importação e exportação de projetos e um assistente de IA contextual. **Não há servidor próprio:** o app roda no navegador, guarda dados no Firebase (Auth, Firestore, Storage) e fala direto com a API de IA escolhida pelo usuário, com a chave dele.

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
|  Cloud Storage             |     |  Gemini (Google)         |
+----------------------------+     +--------------------------+
```

## 2. Camadas e responsabilidades

| Camada | Tecnologia | Responsabilidade |
| --- | --- | --- |
| Interface | React 18, TypeScript estrito, Vite, Tailwind, shadcn/ui | Editor, visualizador de PDF, revisão, chat de IA, modo offline |
| Dados em tempo real | Firestore (SDK web com cache persistente) | Projetos, arquivos, versões, revisões, threads, configuração de IA |
| Arquivos | Cloud Storage | Conteúdo por hash, PDFs de versão e de diff |
| Regras | `firestore.rules`, `storage.rules` | Toda a autorização e a coerência entre documentos gravados em lote |
| Trabalho pesado | Web Workers no navegador | Compilação LaTeX (motor WebAssembly, planejado) e motor de diff |
| IA | `@anthropic-ai/sdk`, `openai`, `@google/genai` no navegador | Escrita, paráfrase, estrutura, sumário, auditoria de referências |
| Hospedagem | GitHub Pages e Firebase Hosting | O mesmo site estático nos dois; deploy pelo workflow `.github/workflows/deploy.yml` |

## 3. Decisões arquiteturais

**D1. Snapshots imutáveis com conteúdo endereçado por hash.** Cada arquivo congelado vira `projects/{id}/blobs/{sha256}`; o snapshot guarda só o manifesto. Arquivos iguais entre versões não se duplicam. As regras negam qualquer alteração de snapshot.

**D2. Sem servidor.** Tudo que antes seria uma Cloud Function é feito pelo app e conferido pelas regras: o snapshot só nasce no mesmo lote que avança o contador do projeto exatamente 1; a revisão só nasce junto com o grant do revisor; contadores de comentários só sobem de 1 em 1. Assim o projeto roda com GitHub Pages mais Firebase, sem nada para manter em execução.

**D3. Compilação e diff no navegador.** O LaTeX é compilado por um motor WebAssembly num Web Worker (planejado: avaliar SwiftLaTeX e BusyTeX), e o diff usa o mesmo algoritmo de `07-fluxos.md`, também num Worker. O preço é a primeira compilação mais lenta e um conjunto de pacotes LaTeX menor que um TeX Live completo.

**D4. O revisor não é membro do projeto.** O acesso vem de grants por **e-mail verificado** (`snapshots/{sid}/grants/{email}`), criados pelo autor no mesmo lote da revisão. O revisor vê só os snapshots e documentos liberados, nunca o rascunho. Coautores entram por convite de e-mail (`pendingMembers`) e se adicionam sozinhos ao aceitar.

**D5. IA sempre do usuário.** Não existe IA da plataforma. Cada usuário configura uma fila de modelos (principal e reservas) com as próprias chaves, guardada na conta (`users/{uid}/private/ai`) ou no navegador. As chamadas saem do navegador direto para o provedor (`11-servico-de-ia.md`).

**D6. RAG lexical (BM25).** Projetos LaTeX têm centenas de blocos. BM25 é determinístico, não exige banco vetorial e explica por que um trecho foi escolhido.

**D7. Diff por recompilação de LaTeX anotado.** O motor injeta macros de marcação no código e recompila; o TeX refaz as quebras de linha com o texto antigo e o novo (`07-fluxos.md`).

**D8. Estado no cliente.** Dados remotos no TanStack React Query (com `onSnapshot` atualizando o cache); estado de interface em Context local por feature. Sem store global.

**D9. Provedores de IA num registro único.** `PROVIDERS` (`src/lib/ai/providers/index.ts`) concentra rótulo, modelo padrão, catálogo, verificação de chave, listagem e criação de cada provedor. Adicionar um provedor não toca nas tarefas.

**D10. Hospedagem estática no GitHub Pages e no Firebase Hosting.** O mesmo código publica nos dois, sempre depois do deploy das regras e índices do Firebase. O build roda duas vezes porque o caminho base muda: no Pages, o subcaminho (`/<repositório>/`) vem de `BASE_PATH` e vai para o Vite, o manifesto e o roteador, e um `404.html` igual ao `index.html` abre as rotas do SPA em acesso direto; no Hosting, o site fica na raiz (`<projeto>.web.app`) e as rotas abrem pelo rewrite para `index.html` do `firebase.json`. O Hosting tem a vantagem do domínio já autorizado no Firebase Auth e cabeçalhos de cache sob controle.

## 4. Estrutura de pastas

Itens marcados como *(planejado)* ainda não existem.

```
over-doc-tex/
├── .github/workflows/deploy.yml       CI em PRs; regras do Firebase, GitHub Pages e Firebase Hosting na main
├── docs/                              documentação de referência (00 a 11)
├── shared/firestore/
│   ├── types.ts                       tipos de todas as coleções e âncoras
│   └── paths.ts                       caminhos do Firestore e do Storage
├── src/
│   ├── main.tsx                       montagem do React e registro do service worker
│   ├── app/                           providers, roteador (com o subcaminho do Pages)
│   ├── pages/                         uma página por rota; só compõe features
│   ├── features/
│   │   ├── auth/                      AuthProvider e useAuth
│   │   ├── editor/
│   │   │   ├── components/            casca, cabeçalho, workspaces, árvore, Monaco, ImportDialog
│   │   │   ├── hooks/                 useProjectFiles, useProjectArchive, useExportProject
│   │   │   ├── model/                 modelo de visão e dados de demonstração
│   │   │   └── state/                 estado de interface do editor
│   │   ├── pdf-viewer/                PdfPreviewPanel
│   │   ├── ai-assistant/
│   │   │   ├── components/            painel, diálogo "Usar a minha própria IA", cartão de modelo
│   │   │   └── hooks/                 useAiConfig, useAiStream, useProviderModels
│   │   ├── review/                    (planejado) seleção, threads, desenho, pins
│   │   ├── snapshots/                 (planejado) histórico e solicitação de revisão
│   │   └── diff/                      (planejado) modo "Ver alterações"
│   ├── components/
│   │   ├── ui/                        shadcn/ui puro: button, dialog, dropdown-menu, input, resizable, select, sheet, tabs, textarea
│   │   └── common/                    markdown-content
│   ├── hooks/                         hooks genéricos: media query, modo de layout, tema
│   ├── lib/
│   │   ├── ai/                        motor de IA: provedores, fila, RAG, prompts, tarefas, referências
│   │   ├── project-archive/           caminhos seguros, plano de importação, zip
│   │   ├── firebase/                  inicialização preguiçosa e emuladores
│   │   ├── markdown/                  marked + DOMPurify
│   │   ├── monaco/                    linguagem LaTeX e tema derivado dos tokens
│   │   ├── latex/                     (planejado) motor WebAssembly em Web Worker
│   │   ├── diff/                      (planejado) lexer, alinhamento, emissor
│   │   ├── download.ts, query-keys.ts, utils.ts
│   └── styles/globals.css             tokens e utilitários (.h-viewport)
├── tests/
│   ├── unit/                          Vitest: motor de IA e importação/exportação
│   └── rules/                         regras nos emuladores (pacote isolado)
├── scripts/                           verificação de responsividade e de convenções
├── firestore.rules, storage.rules, firestore.indexes.json, firebase.json
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

Componente de uma feature que precisa de dados de outra recebe por props (ex.: `AiAssistantPanel` recebe `files`, `open` e `onOpenChange` do `EditorShell`).

## 5. Segurança

- **Autenticação:** Firebase Auth (Google, e-mail e senha, e link por e-mail para revisores). E-mail verificado é exigido para grants e convites.
- **Autorização:** só as regras do Firestore e do Storage, com o mesmo modelo (membros por papel, convites por e-mail, grants por e-mail). Cobertas por `tests/rules/`.
- **Integridade sem servidor:** lotes validados com `getAfter` e `existsAfter` (snapshot com contador, revisão com grant).
- **Chaves de IA:** só do usuário, em documento privado ou no navegador; nunca no build.
- **Conteúdo gerado:** Markdown da IA sanitizado; conteúdo do documento e de páginas externas delimitado e marcado como dado.
- **Importação:** caminhos normalizados (bloqueio de `..`, absolutos e lixo de sistema) e limites de tamanho conferidos antes de descompactar.

## 6. Custos e escala

- Sem servidores: o custo é o do Firebase (Firestore, Storage, que exige o plano Blaze desde fevereiro de 2026, com cotas gratuitas) e o da IA, pago por cada usuário na própria chave.
- Leituras vêm do cache persistente do Firestore; `onSnapshot` só traz deltas.
- PDFs de diff ficam em cache por par de versões: o mesmo par nunca é compilado duas vezes por quem edita.
