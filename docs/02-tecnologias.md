# 02. Tecnologias

Versões instaladas conforme o `package.json`. O projeto é ESM e não tem servidor próprio: tudo abaixo roda no navegador, exceto o Firebase. Atualizações de versão maior seguem `10-manutencao-e-granularidade.md`.

## 1. Aplicação

| Tecnologia | Versão | Uso | Observações |
| --- | --- | --- | --- |
| React | 18.3 | UI | Requisito do produto; `StrictMode` ligado |
| TypeScript | 7.0 | Tipagem estrita | Compilador nativo. `baseUrl` não existe mais: `paths` são relativos ao tsconfig |
| Vite | 8 | Dev server e build (Rolldown) | Base configurável por `BASE_PATH` (subcaminho no GitHub Pages, raiz no Firebase Hosting) e chunks de fornecedores separados |
| Tailwind CSS | 3.4 | Estilo | Tokens via `hsl(var(--token) / <alpha-value>)` (`03-identidade-visual.md`) |
| shadcn/ui (Radix UI) | Dialog 1.3, Select 2.4 e outros | Componentes acessíveis | Código copiado em `src/components/ui`, estilo "new-york" |
| Wouter | 3 | Roteamento | `Router` com `base` igual ao subcaminho do Vite |
| TanStack React Query | 5 | Cache de dados remotos | `onSnapshot` alimenta o cache com `setQueryData` |
| @monaco-editor/react | 4.7 | Editor de código | Monaco 0.55 carregado do CDN e guardado pelo service worker |
| react-resizable-panels | 4 | Colunas redimensionáveis | API v4: `Group`, `Panel`, `Separator`; tamanho em string é porcentagem |
| Firebase Web SDK | 13 | Auth e Firestore (inclusive binários em pedaços) | Firestore com `persistentLocalCache` (offline) |
| Zod | 4 | Validação | Configuração e saídas estruturadas da IA |
| marked + DOMPurify | 18 / 3 | Markdown do chat de IA | Sanitização obrigatória |
| fflate | 0.8 | Zip da importação e exportação | Síncrono, pequeno; limites conferidos antes de descompactar |
| lucide-react | 1.x | Ícones | Botão só com ícone exige `aria-label` |
| vite-plugin-pwa | 2 | Manifesto e service worker (Workbox) | `registerType: autoUpdate` |

### IA (no navegador, com a chave do usuário)

| SDK | Versão | Provedor | Observações |
| --- | --- | --- | --- |
| `@anthropic-ai/sdk` | 1.3 | Claude | `dangerouslyAllowBrowser: true`; a chave vai no cabeçalho `Authorization` |
| `openai` | 6 | OpenAI | API Responses, `dangerouslyAllowBrowser: true` |
| `@google/genai` | 1.52 | Gemini | Usa a variante web do SDK no build |

Cada SDK vira um pedaço próprio do build e só é baixado quando o provedor é usado. Detalhes, modelos padrão e regras da fila de reserva em `11-servico-de-ia.md`.

### Compilação e PDF

| Tecnologia | Versão | Uso | Observações |
| --- | --- | --- | --- |
| `@siglum/engine` | 0.1.4 (exata) | Compilação LaTeX no navegador (pdfTeX, TeX Live 2025, WebAssembly) | MIT. Motor e conjuntos de pacotes vêm de `cdn.siglum.org/tl2025`; versão fixa porque os arquivos da CDN precisam casar com ela. O worker é servido pelo alias `siglum-worker` do `vite.config.ts` |
| `xzwasm` | 0.1.2 (exata) | Descompacta os pacotes `.tar.xz` do repositório próprio | MIT; o Siglum usa a global `self.xzwasm` |
| `pdfjs-dist` | 6.4 (exata) | Desenho das páginas do PDF em canvas | Apache-2.0; carregado sob demanda, com o worker por `?url` |

A `blake3-wasm`, dependência do Siglum, não empacota no Vite; um alias a troca por um módulo que falha ao carregar, e o Siglum usa o hash DJB2 dele (só serve para detectar mudanças). O repositório de pacotes extras (`public/texlive`, cerca de 120 pacotes e 3,4 MB, fora do git, inclusive o `ulem` das marcações do diff visual) é gerado por `node scripts/latex-packages.mjs`. O cache de PDF do Siglum fica desligado (`useCache: false`): a chave dele é só o texto do principal, e um `\input` alterado devolveria o PDF antigo. O SyncTeX vem do próprio Siglum (`syncTexData`) e é lido por `src/lib/latex/synctex.ts`.

## 2. Firebase

| Serviço | Uso | Plano |
| --- | --- | --- |
| Authentication | Google, e-mail e senha, link por e-mail (convite do revisor) | Spark |
| Cloud Firestore | Todos os dados e os binários (em pedaços de até 1.000.000 bytes); autorização pelas regras | Spark: 1 GiB guardado, 50 mil leituras e 20 mil gravações por dia |
| Hosting | Uma das duas publicações do site | Spark |

Não há Cloud Functions, Cloud Run, Cloud Storage nem extensões: nada de servidor para manter e nada que exija o plano Blaze ou cartão. O Cloud Storage passou a exigir o Blaze em fevereiro de 2026; por isso os binários ficam no Firestore (decisão D11 em `01-arquitetura.md`, modelo em `06-banco-de-dados.md`).

## 3. Testes e verificações

| Ferramenta | Versão | Uso |
| --- | --- | --- |
| Vitest | 5 | Testes unitários em `tests/unit/` (motor de IA com API simulada, importação e exportação, arquivos em pedaços) |
| @firebase/rules-unit-testing + firebase-tools | Firebase 12, CLI 15 | Regras nos emuladores, em pacote isolado (`tests/rules/`) porque exige o SDK 12 |
| Playwright | pré-instalado no ambiente de CI | Contrato de responsividade (`scripts/check-responsive.mjs`) |

## 4. Variáveis de ambiente

Frontend (`.env`, ver `.env.example`):

| Variável | Descrição |
| --- | --- |
| `VITE_FIREBASE_*` | Configuração pública do app Firebase |
| `VITE_USE_FIREBASE_EMULATORS` | `true` conecta Auth e Firestore aos emuladores locais |
| `BASE_PATH` | Só no build: subcaminho de publicação (ex.: `/over-doc-tex/`) |

Sem `VITE_FIREBASE_API_KEY` e `VITE_FIREBASE_PROJECT_ID`, o app roda em **modo demonstração**: arquivos de exemplo, nada é salvo no servidor, e a configuração de IA fica no navegador. A IA funciona também nesse modo, com a chave do usuário.

Não existe chave de IA da plataforma em lugar nenhum.

## 5. Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento do Vite |
| `npm run build` | Typecheck (`tsc -b`) e build de produção com service worker |
| `npm run build:pages` | `build` mais o `404.html` usado pelo GitHub Pages (defina `BASE_PATH`) |
| `npm run preview` | Serve o build localmente |
| `npm run typecheck` | Apenas o typecheck |
| `npm test` | Testes unitários (Vitest) |
| `npm run check:conventions` | Proibições de `00-regras-para-ia.md` |
| `npm run check:responsive` | Abre o build em 4 viewports e valida o contrato de 360px |
| `npm run test:rules` | Regras nos emuladores (depois de `npm --prefix tests/rules install`; requer Java 21+) |
| `node scripts/latex-packages.mjs` | Gera o repositório de pacotes LaTeX em `public/texlive` (necessário para compilar documentos com pacotes fora do Siglum; atrás de proxy, `NODE_USE_ENV_PROXY=1`) |

## 6. Deploy

O workflow `.github/workflows/deploy.yml` faz o CI e publica o mesmo site em dois lugares: GitHub Pages (`https://<dono>.github.io/<repositório>/`) e Firebase Hosting (`https://<site>.web.app`, em que `<site>` vem de `FIREBASE_HOSTING_SITE` ou é o site padrão do projeto).

| Job | Quando roda | O que faz |
| --- | --- | --- |
| `verify` | PR e main | Convenções, testes unitários, build e contrato de responsividade |
| `rules-tests` | PR e main | Regras do Firestore no emulador |
| `firebase-deploy` | main e execução manual, depois de `verify` e `rules-tests` | `firebase deploy --only firestore:rules,firestore:indexes` |
| `web-build` | main e execução manual, depois de `verify` | Gera o repositório de pacotes LaTeX (com cache) e faz dois builds com a configuração pública do Firebase: `npm run build:pages` com o subcaminho do Pages (`dist/`) e `vite build` na raiz para o Hosting (`dist-hosting/`, guardado como artefato) |
| `pages-deploy` | depois de `firebase-deploy` **e** `web-build` | Publica no GitHub Pages |
| `hosting-deploy` | depois de `firebase-deploy` **e** `web-build` | `firebase deploy --only hosting` com o artefato do Hosting, no site de `FIREBASE_HOSTING_SITE` (o workflow grava `hosting.site` no `firebase.json` antes do deploy); a URL publicada aparece no ambiente `firebase-hosting` |

Se o deploy das regras falhar, nenhum dos dois sites é publicado: o app nunca vai ao ar contra regras antigas. Pages e Hosting publicam em paralelo e um não bloqueia o outro.

Os dois jobs do Firebase autenticam pela ação local `.github/actions/firebase-auth`, que confere a configuração e chama `google-github-actions/auth`.

O cache do Hosting fica em `firebase.json`: `no-cache` para tudo (HTML, `sw.js`, manifesto), para que um deploy novo apareça na hora, e `immutable` por um ano em `/assets/**`, cujos nomes têm hash. Quando duas regras casam com o mesmo caminho, vale a última (conferido no emulador do Hosting), por isso `/assets/**` vem depois.

### Configuração única

1. **GitHub Pages:** Settings > Pages > Source: **GitHub Actions**.
2. **Variáveis do repositório** (Settings > Secrets and variables > Actions > aba Variables, no nível do **repositório**, não só do ambiente `firebase`, porque o job de build do Pages não usa esse ambiente):

   | Variável | Usada por | Onde achar o valor |
   | --- | --- | --- |
   | `FIREBASE_PROJECT_ID` | deploy do Firebase e build | Console do Firebase > Configurações do projeto > Geral |
   | `FIREBASE_API_KEY` | build | mesma tela, em "Seus apps" > app da Web > configuração do SDK (`apiKey`) |
   | `FIREBASE_AUTH_DOMAIN` | build | `authDomain` |
   | `FIREBASE_MESSAGING_SENDER_ID` | build | `messagingSenderId` |
   | `FIREBASE_APP_ID` | build | `appId` |
   | `FIREBASE_HOSTING_SITE` (opcional) | deploy do Hosting | Console > Hosting: o nome do site no cartão (ex.: `overdoctex` para `overdoctex.web.app`). Vazio publica no site padrão do projeto |

   São a configuração pública do app da Web, não são segredos. O `storageBucket` da configuração do SDK não é usado. Sem `FIREBASE_API_KEY` e `FIREBASE_PROJECT_ID`, o site publicado roda em modo demonstração. `BASE_PATH` não precisa ser configurada: o workflow pega do próprio Pages.
3. **Autenticação do deploy**, exatamente uma das duas formas (o workflow recusa nenhuma ou as duas):
   - **Workload Identity Federation (recomendada, sem chave guardada):** variáveis `GCP_WORKLOAD_IDENTITY_PROVIDER` (formato `projects/<número>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`) e `GCP_SERVICE_ACCOUNT` (e-mail da conta). O provider deve ter condição `assertion.repository == '<dono>/<repositório>'`, e a conta de serviço precisa conceder `Workload Identity User` (`roles/iam.workloadIdentityUser`) ao principal do repositório. Exige as APIs IAM Service Account Credentials e Security Token Service ativas;
   - **Chave de conta de serviço:** secret `FIREBASE_SERVICE_ACCOUNT` (aba Secrets) com o JSON da chave.
4. **Papéis da conta de serviço** (IAM do Google Cloud, no projeto), conferidos no código do firebase-tools 15:

   | Papel | ID | Para quê |
   | --- | --- | --- |
   | Firebase Rules Admin | `roles/firebaserules.admin` | Publicar as regras do Firestore |
   | Cloud Datastore Index Admin | `roles/datastore.indexAdmin` | Criar e remover índices e exceções de campo |
   | Service Usage Consumer | `roles/serviceusage.serviceUsageConsumer` | Conferir se as APIs necessárias estão ativas |
   | Firebase Hosting Admin | `roles/firebasehosting.admin` | Criar a versão do site, enviar os arquivos e publicar no Hosting (inclui `firebase.projects.get`, usado para achar o site padrão) |

   `Service Account User` não é necessário (só serve para deploy de Functions ou Hosting com conta de execução).
5. **APIs ativas no projeto** (APIs e serviços > Biblioteca): Cloud Firestore API, Firebase Rules API e Firebase Hosting API. Os papéis acima não incluem ativar APIs, então o deploy falha se alguma estiver desligada.
6. **Banco do Firestore criado antes do primeiro deploy**, na região desejada (ex.: `southamerica-east1`). Se o banco não existir, o firebase-tools tenta criá-lo em `nam5` (EUA).
7. **Firebase Hosting:** ativado uma vez (Console > Hosting > Começar), para existir o site padrão; sem ele o deploy falha com "Could not determine the default site for the project". Para publicar em outro site do mesmo projeto, crie-o em "Adicionar outro site" e informe o nome em `FIREBASE_HOSTING_SITE`.
8. **Firebase Authentication:** ativar Google, e-mail e senha e **Link de e-mail**; em Settings > Authorized domains, adicionar `<dono>.github.io` (ou o domínio próprio). `<projeto>.web.app` e `<projeto>.firebaseapp.com` já vêm autorizados; com outro site, confira se `<site>.web.app` e `<site>.firebaseapp.com` estão na lista e adicione se faltarem, senão o login falha com `auth/unauthorized-domain`.

Os ambientes `firebase` e `firebase-hosting` do GitHub são criados no primeiro deploy; neles dá para exigir aprovação manual antes de publicar. Guarde o secret e as variáveis no nível do repositório, não dentro de um ambiente: os dois jobs do Firebase usam ambientes diferentes.

## 7. Por que estas escolhas

- **Sem servidor:** a IA é paga por cada usuário com a própria chave, e o resto cabe nas regras do Firebase. Sem Functions, o app inteiro é estático.
- **Binários no Firestore em vez do Cloud Storage:** mantém tudo no plano Spark e sob as mesmas regras; o custo é a cota de 1 GiB e uma leitura por pedaço de 1 MB.
- **Siglum para compilar:** TeX Live 2025 completo no motor, licença MIT, roda no navegador sem servidor e sem COOP/COEP (o login com Google por popup continua funcionando). Pacotes que faltam vêm de arquivos estáticos do próprio site no formato do TeX Live, então não há proxy para manter.
- **Tailwind 3.4 em vez de 4:** o padrão clássico de tokens do shadcn/ui é estável e bem documentado; a migração está no backlog.
- **Monaco do CDN:** bundle inicial menor; o Workbox guarda o Monaco com `CacheFirst` para uso offline depois da primeira visita.
- **fflate em vez de JSZip:** mais rápido e menor, com filtro por entrada que permite recusar o zip antes de descompactar.
