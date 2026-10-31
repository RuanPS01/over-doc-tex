# OverDocTeX

Editor de documentos LaTeX em formato PWA, com revisão por versões congeladas, comentários ancorados no PDF no estilo Pull Request, pins com desenho livre, diff visual recompilado (removido em vermelho, inserido em verde) e assistente de IA contextual.

O app é **100% estático** (GitHub Pages) com Firebase Auth, Firestore e Storage. Não há Cloud Functions nem servidor próprio, e a plataforma **não oferece IA própria**: cada usuário configura a sua (Claude, OpenAI ou Gemini, inclusive chave gratuita), com modelos de reserva para quando um atinge o limite.

## Estado atual

Este repositório contém a fundação do produto:

- **Arquitetura e especificação** completas em [`docs/`](docs/00-regras-para-ia.md).
- **Modelo de dados** tipado (`shared/firestore/types.ts`), regras de segurança que validam todas as escritas do cliente (`firestore.rules`, `storage.rules`), índices e testes de regras.
- **Frontend** React 18 + TypeScript + Vite + Tailwind + shadcn/ui com o layout responsivo do editor (colunas no desktop; abas ou duas colunas curtas no celular) e Monaco com realce LaTeX.
- **Assistente de IA no navegador** com a chave do usuário: diálogo "Usar a minha própria IA" com fila de até 5 modelos, lista de modelos consultada ao vivo no provedor, RAG lexical (BM25), saídas estruturadas validadas com Zod e verificação real de links das referências.
- **Importação e exportação**: projeto inteiro em .zip; importação de .zip, arquivos avulsos ou pastas do dispositivo, para a raiz ou uma pasta interna, sobrescrevendo ou mantendo os dois arquivos (`nome-1`).

Compilação LaTeX em WebAssembly, snapshots, revisão e diff estão especificados em `docs/07-fluxos.md` e são as próximas entregas.

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

Cada push na `main` roda o CI e, se tudo passar, publica as regras e os índices do Firebase e, em seguida, o PWA no GitHub Pages (`.github/workflows/deploy.yml`). Pull requests rodam só as verificações. A configuração única (variáveis, autenticação e papéis) está em [`docs/02-tecnologias.md`](docs/02-tecnologias.md#6-deploy-github-pages-com-firebase-antes).

O Cloud Storage exige o plano Blaze desde fevereiro de 2026 (com cotas gratuitas); Auth e Firestore funcionam no Spark.

## Documentação

| Arquivo | Assunto |
| --- | --- |
| [00-regras-para-ia.md](docs/00-regras-para-ia.md) | Regras obrigatórias para IA e desenvolvedores |
| [01-arquitetura.md](docs/01-arquitetura.md) | Camadas, decisões e estrutura de pastas |
| [02-tecnologias.md](docs/02-tecnologias.md) | Stack, versões, variáveis, scripts e deploy |
| [03-identidade-visual.md](docs/03-identidade-visual.md) | Tokens, tipografia, ícones e acessibilidade |
| [04-componentes-e-telas.md](docs/04-componentes-e-telas.md) | Telas e componentização do editor e da revisão |
| [05-padroes-de-nomes.md](docs/05-padroes-de-nomes.md) | Convenções de nomes, commits e branches |
| [06-banco-de-dados.md](docs/06-banco-de-dados.md) | Firestore, Storage, regras e índices |
| [07-fluxos.md](docs/07-fluxos.md) | Snapshot, revisão, algoritmo do diff, IA, importação e exportação |
| [08-responsividade.md](docs/08-responsividade.md) | Contrato de 360px e código do layout |
| [09-contexto-do-produto.md](docs/09-contexto-do-produto.md) | Visão, personas, escopo e glossário |
| [10-manutencao-e-granularidade.md](docs/10-manutencao-e-granularidade.md) | Onde colocar código, receitas e backlog |
| [11-servico-de-ia.md](docs/11-servico-de-ia.md) | Provedores, fila de modelos, tarefas e segurança da IA |
