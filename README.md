# OverDocTeX

Editor de documentos LaTeX em formato PWA, com revisão por versões congeladas, comentários ancorados no PDF no estilo Pull Request, pins com desenho livre, diff visual recompilado (removido em vermelho, inserido em verde) e assistente de IA contextual.

## Estado atual

Este repositório contém a fundação do produto:

- **Arquitetura e especificação** completas em [`docs/`](docs/00-regras-para-ia.md).
- **Modelo de dados** tipado (`shared/firestore/types.ts`), regras de segurança (`firestore.rules`, `storage.rules`), índices e testes de regras.
- **Frontend** React 18 + TypeScript + Vite + Tailwind + shadcn/ui com o layout responsivo do editor (colunas no desktop; abas ou duas colunas curtas no celular), Monaco com realce LaTeX e assistente de IA consumindo stream NDJSON.
- **Backend de IA** em Cloud Functions: stream NDJSON, prompts por tarefa, RAG lexical (BM25), saídas estruturadas validadas com Zod e verificação real de links das referências.

Compilação LaTeX, snapshots, revisão e diff estão especificados em `docs/07-fluxos.md` e são as próximas entregas.

## Começando

```bash
npm install
npm run dev          # http://localhost:5173 (modo demonstração sem Firebase)
```

Para usar o Firebase, copie `.env.example` para `.env` e preencha as chaves. Com `VITE_USE_FIREBASE_EMULATORS=true`, o app usa os emuladores locais.

Functions:

```bash
npm --prefix functions install
npm --prefix functions run build
firebase functions:secrets:set ANTHROPIC_API_KEY
```

## Verificações

```bash
npm run typecheck
npm run build
npm run check:conventions
npm run check:responsive     # requer Playwright com Chromium
npm --prefix tests/rules install && npm run test:rules   # requer Java 21+
```

## Deploy

Cada push na `main` roda o CI e, se tudo passar, publica as regras e os índices do Firebase e, em seguida, o PWA no GitHub Pages (`.github/workflows/deploy.yml`). Pull requests rodam só as verificações. A configuração única (variáveis, autenticação e papéis) está em [`docs/02-tecnologias.md`](docs/02-tecnologias.md#6-deploy-github-pages-com-firebase-antes).

## Documentação

| Arquivo | Assunto |
| --- | --- |
| [00-regras-para-ia.md](docs/00-regras-para-ia.md) | Regras obrigatórias para IA e desenvolvedores |
| [01-arquitetura.md](docs/01-arquitetura.md) | Camadas, decisões e estrutura de pastas |
| [02-tecnologias.md](docs/02-tecnologias.md) | Stack, versões, variáveis e scripts |
| [03-identidade-visual.md](docs/03-identidade-visual.md) | Tokens, tipografia, ícones e acessibilidade |
| [04-componentes-e-telas.md](docs/04-componentes-e-telas.md) | Telas e componentização do editor e da revisão |
| [05-padroes-de-nomes.md](docs/05-padroes-de-nomes.md) | Convenções de nomes, commits e branches |
| [06-banco-de-dados.md](docs/06-banco-de-dados.md) | Firestore, Storage, regras e índices |
| [07-fluxos.md](docs/07-fluxos.md) | Snapshot, revisão, algoritmo do diff e IA |
| [08-responsividade.md](docs/08-responsividade.md) | Contrato de 360px e código do layout |
| [09-contexto-do-produto.md](docs/09-contexto-do-produto.md) | Visão, personas, escopo e glossário |
| [10-manutencao-e-granularidade.md](docs/10-manutencao-e-granularidade.md) | Onde colocar código, receitas e backlog |
