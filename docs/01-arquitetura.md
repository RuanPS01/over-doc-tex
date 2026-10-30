# 01. Arquitetura

## 1. Visão geral

O OverDocTeX é um PWA de edição LaTeX com revisão por versões congeladas (snapshots), comentários ancorados no PDF, diff visual recompilado e um assistente de IA contextual. O backend é Firebase, complementado por dois serviços para cargas pesadas.

```
+--------------------------------------+
|  PWA  (React 18 + Vite + Tailwind)   |
|  GitHub Pages + Service Worker       |
+------------------+-------------------+
                   |
     SDK Firebase  |  HTTPS (Bearer = ID token)
                   |
+------------------+---------------------------------------------------+
|                                                                       |
|  Firebase Authentication   (Google, e-mail e senha)                   |
|  Cloud Firestore           (projetos, arquivos, snapshots, revisões)  |
|  Cloud Storage             (blobs por hash, PDFs, SyncTeX, diffs)     |
|                                                                       |
+------------------+------------------------------+---------------------+
                   |                              |
+------------------+-----------------+  +---------+---------------------+
|  Cloud Functions (2a geração)      |  |  latex-worker (Cloud Run)     |
|  aiStream        (stream NDJSON)   |  |  TeX Live + latexmk           |
|  requestReview / acceptInvite      |  |  /compile  /snapshot  /diff   |
|  triggers de notificação           |  |  sandbox sem rede, sem        |
|  requestDiff / getDiffUrl          |  |  shell-escape                 |
+------------------+-----------------+  +---------+---------------------+
                   |                              |
          API Anthropic (Claude)         Cloud Tasks (fila de jobs)
                   |
          Extensão Trigger Email (coleção mail)
```

## 2. Camadas e responsabilidades

| Camada | Tecnologia | Responsabilidade |
| --- | --- | --- |
| Cliente | React 18, TypeScript estrito, Vite, Tailwind, shadcn/ui | Editor, visualizador de PDF, revisão, chat de IA, modo offline |
| Dados em tempo real | Firestore (SDK web com cache persistente) | Árvore de arquivos, threads, comentários, status de jobs |
| Arquivos | Cloud Storage | Conteúdo endereçado por hash, PDFs de snapshot e de diff |
| Rotas leves | Cloud Functions 2a geração, Node 22 | Autorização, orquestração, IA em stream, convites, notificações |
| Rotas pesadas | Cloud Run `latex-worker` (container com TeX Live) | Compilação, congelamento de snapshot, geração do PDF de diff |
| Filas | Cloud Tasks | Desacoplar pedidos de compilação e diff com repetição automática |
| E-mail | Extensão oficial Trigger Email | Convite ao revisor e notificações |
| IA | Claude via SDK oficial `@anthropic-ai/sdk` | Escrita, paráfrase, estrutura, sumário, auditoria de referências |

Região padrão: `southamerica-east1` (São Paulo), para latência menor no público-alvo.

## 3. Decisões arquiteturais

**D1. Snapshots imutáveis com conteúdo endereçado por hash.** Cada arquivo congelado vira `projects/{id}/blobs/{sha256}` no Storage; o snapshot guarda só o manifesto (caminho, hash, tamanho). Arquivos que não mudaram entre versões não são duplicados, e o `sourceHash` do manifesto vira chave de cache do diff. As regras negam qualquer escrita de cliente em `snapshots`.

**D2. Compilação fora das Cloud Functions.** TeX Live completo não cabe no ambiente gerenciado das Functions e precisa de isolamento forte. O `latex-worker` roda em Cloud Run (gVisor), sem rede de saída, com `-no-shell-escape`, `openout_any=p`, limite de tempo e de memória por job.

**D3. O revisor não é membro do projeto.** O acesso é concedido por documentos de grant (`snapshots/{sid}/grants/{uid}`) criados quando o convite é aceito. Assim o revisor vê apenas os snapshots e documentos liberados, nunca o rascunho em edição.

**D4. Threads aninhadas na revisão.** `reviews/{rid}/threads/{tid}` permite que as regras verifiquem o revisor com um único `get` pelo caminho, sem consultas, e que consultas `collectionGroup` sirvam os painéis agregados.

**D5. IA em stream NDJSON direto na função.** O PWA é estático (GitHub Pages) e chama a URL da função `aiStream` diretamente, com CORS liberado só para as origens configuradas. Mesmo se o app migrar para o Firebase Hosting, o rewrite não deve ser usado para o stream: ele tem limite de 60 segundos e pode acumular a resposta. Cada linha é um evento validado por Zod nos dois lados.

**D11. Hospedagem estática no GitHub Pages.** O build do Vite é publicado pelo workflow `.github/workflows/deploy.yml`, sempre depois do deploy das regras e índices do Firebase, para que o app nunca rode contra regras antigas. O subcaminho do Pages (`/<repositório>/`) é injetado em `BASE_PATH` e repassado ao roteador; um `404.html` igual ao `index.html` faz as rotas do SPA abrirem em acesso direto. O bloco `hosting` do `firebase.json` fica como alternativa.

**D6. RAG lexical (BM25) em vez de embeddings.** Projetos LaTeX têm centenas de blocos, não milhões. BM25 é determinístico, não exige banco vetorial nem custo de indexação e explica por que um trecho foi escolhido (eventos `context`). Embeddings ficam como evolução se a avaliação mostrar ganho.

**D7. Diff por recompilação de LaTeX anotado.** Em vez de desenhar sobre PDFs, o worker injeta macros de marcação no código e recompila. O TeX refaz as quebras de linha com o texto antigo e o novo lado a lado, o que produz um PDF legível e pesquisável. Detalhes em `07-fluxos.md`, Cenário C.

**D8. Estado no cliente.** Dados do servidor no TanStack React Query (com `onSnapshot` atualizando o cache); estado de interface em Context local por feature (ex.: `EditorStoreProvider`). Sem Redux.

**D9. Provedor de IA isolado.** Toda chamada ao modelo passa por `functions/src/ai/claude.ts` (modelo `claude-opus-5-5`, pensamento adaptativo, esforço por tarefa e `fallbacks: 'default'` para recusas). Trocar de provedor significa reescrever esse arquivo, sem tocar no contrato NDJSON.

**D10. Contratos compartilhados.** `shared/` contém os tipos do Firestore e os schemas Zod da IA, importados pelo frontend (alias `@shared`) e pelas Functions (empacotadas com esbuild, que embute `shared/` no bundle).

## 4. Estrutura de pastas

Itens marcados como *(planejado)* ainda não existem e seguem a mesma convenção quando forem criados.

```
over-doc-tex/
├── docs/                              documentação de referência (00 a 10)
├── shared/                            contratos usados pelo frontend e pelo backend
│   ├── firestore/
│   │   ├── types.ts                   tipos de todas as coleções e âncoras
│   │   └── paths.ts                   caminhos do Firestore e do Storage
│   └── ai/
│       └── schemas.ts                 Zod: requisição, eventos NDJSON, saídas estruturadas
├── src/                               PWA
│   ├── main.tsx                       montagem do React e registro do service worker
│   ├── app/                           bootstrap
│   │   ├── app.tsx
│   │   ├── providers.tsx              React Query, autenticação, tema
│   │   └── router.tsx                 rotas Wouter com lazy loading
│   ├── pages/                         uma página por rota; apenas compõe features
│   │   ├── projects-page.tsx          /
│   │   ├── login-page.tsx             /login
│   │   ├── editor-page.tsx            /p/:projectId
│   │   ├── review-page.tsx            /p/:projectId/reviews/:reviewId
│   │   └── not-found-page.tsx
│   ├── features/                      componentes e hooks de domínio
│   │   ├── auth/
│   │   │   ├── components/auth-provider.tsx
│   │   │   └── hooks/use-auth.ts
│   │   ├── editor/
│   │   │   ├── components/            casca, cabeçalho, workspaces, árvore, Monaco
│   │   │   ├── hooks/use-project-files.ts   integração Firestore + React Query
│   │   │   ├── model/editor-file.ts   modelo de visão e dados de demonstração
│   │   │   └── state/editor-store.tsx estado de interface do editor
│   │   ├── pdf-viewer/
│   │   │   └── components/pdf-preview-panel.tsx
│   │   ├── ai-assistant/
│   │   │   ├── components/            painel, mensagens, compositor, resultados estruturados
│   │   │   └── hooks/use-ai-stream.ts integração com o stream NDJSON
│   │   ├── review/                    (planejado) seleção, threads, desenho, pins
│   │   ├── snapshots/                 (planejado) histórico de versões e solicitação de revisão
│   │   └── diff/                      (planejado) modo "Ver alterações" e navegação
│   ├── components/
│   │   ├── ui/                        shadcn/ui puro: button, sheet, dropdown-menu, tabs, resizable, textarea
│   │   └── common/                    genéricos sem domínio: markdown-content
│   ├── hooks/                         hooks genéricos: use-media-query, use-layout-mode, use-is-dark-theme
│   ├── lib/                           infraestrutura sem dependência de features
│   │   ├── firebase/app.ts            inicialização preguiçosa e emuladores
│   │   ├── ai/                        cliente HTTP, leitor NDJSON, stream de demonstração
│   │   ├── markdown/render-markdown.ts  marked + DOMPurify
│   │   ├── monaco/                    linguagem LaTeX e tema derivado dos tokens
│   │   ├── query-keys.ts
│   │   └── utils.ts                   cn()
│   └── styles/globals.css             tokens do design system e utilitários (.h-viewport)
├── functions/                         Cloud Functions (Node 22, ESM, esbuild)
│   └── src/
│       ├── index.ts                   exporta as funções
│       ├── http/                      autenticação e escritor NDJSON
│       ├── ai/                        prompts, tarefas, RAG, cliente do modelo, orquestração
│       ├── references/                parser BibTeX e verificador de links com proteção SSRF
│       ├── reviews/                   (planejado) requestReview, acceptInvite, triggers
│       └── diffs/                     (planejado) requestDiff, getDiffUrl
├── services/
│   └── latex-worker/                  (planejado) Cloud Run com TeX Live
│       └── src/
│           ├── compile/               latexmk em sandbox
│           ├── snapshot/              congelamento e extração de texto por página
│           └── diff/                  lexer, alinhamento, diff fino, emissor, preâmbulo
├── .github/workflows/deploy.yml       CI em PRs; deploy do Firebase e do GitHub Pages na main
├── scripts/                           verificações automatizadas (responsividade, convenções)
├── tests/rules/                       testes das regras nos emuladores (pacote isolado)
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
└── firebase.json
```

### Fronteiras de importação

| Origem | Pode importar | Não pode importar |
| --- | --- | --- |
| `pages/` | `features/`, `components/`, `hooks/` | SDK do Firebase, `lib/firebase` |
| `features/<x>/components` | `components/`, `hooks/`, `lib/`, `shared/`, hooks da própria feature, componentes públicos de outras features | SDK do Firebase (exceto `*-provider.tsx`) |
| `features/<x>/hooks` | `lib/`, `shared/`, SDK do Firebase | componentes |
| `components/ui`, `components/common` | `lib/utils`, `lib/markdown` | `features/`, Firebase, IA |
| `hooks/` | React | `features/`, Firebase |
| `lib/` | `shared/`, bibliotecas externas | `features/`, `pages/` |
| `shared/` | `zod` | qualquer código de `src/` ou `functions/` |

## 5. Segurança

- **Autenticação:** Firebase Auth (Google e e-mail/senha). Rotas HTTP validam o ID token com `verifyIdToken(token, true)` (checa revogação).
- **Autorização:** regras do Firestore e do Storage com o mesmo modelo (membros por papel e grants por snapshot); funções revalidam o papel no servidor.
- **Conteúdo gerado:** Markdown da IA sanitizado com DOMPurify; links com `rel="noopener noreferrer nofollow"`.
- **Prompt injection:** conteúdo do documento e de páginas externas vai delimitado por tags e o system prompt manda tratá-lo como dado.
- **SSRF:** o verificador de links aceita só http/https, bloqueia faixas privadas a cada redirecionamento e lê no máximo 64 KiB. Em produção, a função roda com egress restrito.
- **Compilação:** sem shell-escape, sem rede, com limites de tempo e memória.

## 6. Escalabilidade e custo

- Leituras do editor vêm do cache persistente do Firestore; o `onSnapshot` só traz deltas.
- Diffs são idempotentes por `diffKey`: o mesmo par de versões nunca é compilado duas vezes.
- O stream de IA tem `concurrency: 40` por instância e `maxInstances: 20`; limites por usuário estão no backlog (`10-manutencao-e-granularidade.md`).
- O `latex-worker` escala a zero quando não há jobs.
