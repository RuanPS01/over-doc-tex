# OverDocTeX

Editor de documentos LaTeX em formato PWA, com revisão por versões congeladas, comentários ancorados no PDF no estilo Pull Request, pins com desenho livre, diff visual recompilado (removido em vermelho, inserido em verde) e assistente de IA contextual.

O app é **100% estático** (GitHub Pages e Firebase Hosting) com Firebase Auth e Firestore, inclusive para os binários, guardados em pedaços. Tudo cabe no plano Spark, sem cartão. Não há Cloud Functions nem servidor próprio, e a plataforma **não oferece IA própria**: cada usuário configura a sua (Claude, OpenAI ou Gemini, inclusive chave gratuita), com modelos de reserva para quando um atinge o limite.

## Estado atual

Este repositório contém a fundação do produto:

- **Arquitetura e especificação** completas em [`docs/`](docs/00-regras-para-ia.md).
- **Modelo de dados** tipado (`shared/firestore/types.ts`), regras de segurança que validam todas as escritas do cliente (`firestore.rules`), índices e testes de regras.
- **Frontend** React 18 + TypeScript + Vite + Tailwind + shadcn/ui com o layout responsivo do editor (colunas no desktop; abas ou duas colunas curtas no celular) e Monaco com realce LaTeX.
- **Assistente de IA no navegador** com a chave do usuário: diálogo "Usar a minha própria IA" com fila de até 5 modelos, lista de modelos consultada ao vivo no provedor, RAG lexical (BM25), saídas estruturadas validadas com Zod e verificação real de links das referências.
- **Importação e exportação**: projeto inteiro em .zip; importação de .zip, arquivos avulsos ou pastas do dispositivo, para a raiz ou uma pasta interna, sobrescrevendo ou mantendo os dois arquivos (`nome-1`).

- **Compilação LaTeX no navegador** com o Siglum (pdfTeX do TeX Live 2025 em WebAssembly), sem servidor: PDF desenhado com pdf.js, erros com arquivo e linha, bibliografia BibTeX (o `.bbl` é gerado no navegador), pacotes extras servidos pelo próprio site (`node scripts/latex-packages.mjs`).
- **Versões e revisão**: congelar versões (código, PDF, texto das páginas e SyncTeX de cada documento), pedir revisão por e-mail (link de acesso do Firebase) escolhendo os documentos, tela de revisão com comentário em trecho de texto, pins com desenho livre, threads (as abertas seguem para a rodada seguinte, reancoradas), resolução, aprovação, notificações e "Abrir no código".
- **Ver alterações**: diff por palavra do código (entre versões ou com o rascunho) e o PDF recompilado com as alterações marcadas (inserido em verde, removido riscado em vermelho), com "Próxima alteração".
- **Projeto e arquivos**: criar, renomear e excluir arquivos, documentos secundários, membros com papéis e convites de coautoria por e-mail, editor somente leitura para quem só lê, SyncTeX entre PDF e código.

O que ainda falta (biblatex com Biber, estilos ABNT na bibliografia e outros) está em `docs/10-manutencao-e-granularidade.md`.

## Começando

```bash
npm install
npm run dev          # http://localhost:5173 (modo demonstração sem Firebase)
```

Para usar o Firebase, copie `.env.example` para `.env` e preencha a configuração pública do app web. Com `VITE_USE_FIREBASE_EMULATORS=true`, o app usa os emuladores locais.

A IA funciona também no modo demonstração: abra o assistente, clique em "Configurar a minha IA" e cole a sua chave. Sem login, a configuração fica no navegador; com login, em `users/{uid}/private/ai`, legível só pelo dono. Detalhes em [`docs/11-servico-de-ia.md`](docs/11-servico-de-ia.md).

## Verificações

```bash
npm run typecheck
npm test                     # Vitest: motor de IA (API simulada) e importação/exportação
npm run build
npm run check:conventions
npm run check:responsive     # requer Playwright com Chromium
npm --prefix tests/rules install && npm run test:rules   # requer Java 21+
```

## Deploy

Cada push na `main` roda o CI e, se tudo passar, publica as regras e os índices do Firebase e, em seguida, o PWA em dois lugares ao mesmo tempo: GitHub Pages e Firebase Hosting (`.github/workflows/deploy.yml`). Pull requests rodam só as verificações. A configuração única (variáveis, autenticação, papéis e pré-requisitos) está em [`docs/02-tecnologias.md`](docs/02-tecnologias.md#6-deploy).

Não há Cloud Storage: ele exige o plano Blaze desde fevereiro de 2026. Os binários ficam no Firestore em pedaços de até 1 MB (`docs/06-banco-de-dados.md`, seção 3), dentro da cota gratuita de 1 GiB.

## Documentação

| Arquivo | Assunto |
| --- | --- |
| [00-regras-para-ia.md](docs/00-regras-para-ia.md) | Regras obrigatórias para IA e desenvolvedores |
| [01-arquitetura.md](docs/01-arquitetura.md) | Camadas, decisões e estrutura de pastas |
| [02-tecnologias.md](docs/02-tecnologias.md) | Stack, versões, variáveis, scripts e deploy |
| [03-identidade-visual.md](docs/03-identidade-visual.md) | Tokens, tipografia, ícones e acessibilidade |
| [04-componentes-e-telas.md](docs/04-componentes-e-telas.md) | Telas e componentização do editor e da revisão |
| [05-padroes-de-nomes.md](docs/05-padroes-de-nomes.md) | Convenções de nomes, commits e branches |
| [06-banco-de-dados.md](docs/06-banco-de-dados.md) | Firestore, arquivos em pedaços, regras e índices |
| [07-fluxos.md](docs/07-fluxos.md) | Snapshot, revisão, algoritmo do diff, IA, importação e exportação |
| [08-responsividade.md](docs/08-responsividade.md) | Contrato de 360px e código do layout |
| [09-contexto-do-produto.md](docs/09-contexto-do-produto.md) | Visão, personas, escopo e glossário |
| [10-manutencao-e-granularidade.md](docs/10-manutencao-e-granularidade.md) | Onde colocar código, receitas e backlog |
| [11-servico-de-ia.md](docs/11-servico-de-ia.md) | Provedores, fila de modelos, tarefas e segurança da IA |
