# 02. Tecnologias

Versões instaladas conforme o `package.json`. O projeto é ESM e não tem servidor próprio: tudo abaixo roda no navegador, exceto o Firebase. Atualizações de versão maior seguem `10-manutencao-e-granularidade.md`.

## 1. Aplicação

| Tecnologia | Versão | Uso | Observações |
| --- | --- | --- | --- |
| React | 18.3 | UI | Requisito do produto; `StrictMode` ligado |
| TypeScript | 7.0 | Tipagem estrita | Compilador nativo. `baseUrl` não existe mais: `paths` são relativos ao tsconfig |
| Vite | 8 | Dev server e build (Rolldown) | Base configurável por `BASE_PATH` (GitHub Pages) e chunks de fornecedores separados |
| Tailwind CSS | 3.4 | Estilo | Tokens via `hsl(var(--token) / <alpha-value>)` (`03-identidade-visual.md`) |
| shadcn/ui (Radix UI) | Dialog 1.3, Select 2.4 e outros | Componentes acessíveis | Código copiado em `src/components/ui`, estilo "new-york" |
| Wouter | 3 | Roteamento | `Router` com `base` igual ao subcaminho do Vite |
| TanStack React Query | 5 | Cache de dados remotos | `onSnapshot` alimenta o cache com `setQueryData` |
| @monaco-editor/react | 4.7 | Editor de código | Monaco 0.55 carregado do CDN e guardado pelo service worker |
| react-resizable-panels | 4 | Colunas redimensionáveis | API v4: `Group`, `Panel`, `Separator`; tamanho em string é porcentagem |
| Firebase Web SDK | 13 | Auth, Firestore, Storage | Firestore com `persistentLocalCache` (offline) |
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

### Planejado

| Tecnologia | Uso |
| --- | --- |
| Motor LaTeX em WebAssembly (avaliar SwiftLaTeX e BusyTeX) | Compilação no navegador, em Web Worker |
| pdfjs-dist | Renderização do PDF com camadas de texto e de anotação |

## 2. Firebase

| Serviço | Uso | Plano |
| --- | --- | --- |
| Authentication | Google, e-mail e senha, link por e-mail (convite do revisor) | Spark ou Blaze |
| Cloud Firestore | Todos os dados; autorização pelas regras | Spark ou Blaze |
| Cloud Storage | Blobs por hash, PDFs de versão e de diff | **Blaze**, exigido desde fevereiro de 2026 (com cotas gratuitas) |

Não há Cloud Functions, Cloud Run nem extensões: nada de servidor para manter.

## 3. Testes e verificações

| Ferramenta | Versão | Uso |
| --- | --- | --- |
| Vitest | 5 | Testes unitários em `tests/unit/` (motor de IA com API simulada, importação e exportação) |
| @firebase/rules-unit-testing + firebase-tools | Firebase 12, CLI 15 | Regras nos emuladores, em pacote isolado (`tests/rules/`) porque exige o SDK 12 |
| Playwright | pré-instalado no ambiente de CI | Contrato de responsividade (`scripts/check-responsive.mjs`) |

## 4. Variáveis de ambiente

Frontend (`.env`, ver `.env.example`):

| Variável | Descrição |
| --- | --- |
| `VITE_FIREBASE_*` | Configuração pública do app Firebase |
| `VITE_USE_FIREBASE_EMULATORS` | `true` conecta Auth, Firestore e Storage aos emuladores locais |
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

## 6. Deploy (GitHub Pages com Firebase antes)

O workflow `.github/workflows/deploy.yml` faz o CI e o deploy.

| Job | Quando roda | O que faz |
| --- | --- | --- |
| `verify` | PR e main | Convenções, testes unitários, build e contrato de responsividade |
| `rules-tests` | PR e main | Regras do Firestore e do Storage nos emuladores |
| `firebase-deploy` | main e execução manual, depois de `verify` e `rules-tests` | `firebase deploy --only firestore:rules,firestore:indexes,storage` |
| `pages-build` | main e execução manual, depois de `verify` | `npm run build:pages` com o subcaminho do Pages e a configuração pública do Firebase |
| `pages-deploy` | depois de `firebase-deploy` **e** `pages-build` | Publica no GitHub Pages |

Se o deploy do Firebase falhar, o site não é publicado: o app nunca vai ao ar contra regras antigas.

### Configuração única

1. **GitHub Pages:** Settings > Pages > Source: **GitHub Actions**.
2. **Variáveis do repositório** (Settings > Secrets and variables > Actions > aba Variables, no nível do **repositório**, não só do ambiente `firebase`, porque o job de build do Pages não usa esse ambiente):

   | Variável | Usada por | Onde achar o valor |
   | --- | --- | --- |
   | `FIREBASE_PROJECT_ID` | deploy do Firebase e build | Console do Firebase > Configurações do projeto > Geral |
   | `FIREBASE_API_KEY` | build | mesma tela, em "Seus apps" > app da Web > configuração do SDK (`apiKey`) |
   | `FIREBASE_AUTH_DOMAIN` | build | `authDomain` |
   | `FIREBASE_STORAGE_BUCKET` | build | `storageBucket` |
   | `FIREBASE_MESSAGING_SENDER_ID` | build | `messagingSenderId` |
   | `FIREBASE_APP_ID` | build | `appId` |

   São a configuração pública do app da Web, não são segredos. Sem `FIREBASE_API_KEY` e `FIREBASE_PROJECT_ID`, o site publicado roda em modo demonstração. `BASE_PATH` não precisa ser configurada: o workflow pega do próprio Pages.
3. **Autenticação do deploy**, exatamente uma das duas formas (o workflow recusa nenhuma ou as duas):
   - **Workload Identity Federation (recomendada, sem chave guardada):** variáveis `GCP_WORKLOAD_IDENTITY_PROVIDER` (formato `projects/<número>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`) e `GCP_SERVICE_ACCOUNT` (e-mail da conta). O provider deve ter condição `assertion.repository == '<dono>/<repositório>'`, e a conta de serviço precisa conceder `Workload Identity User` (`roles/iam.workloadIdentityUser`) ao principal do repositório. Exige as APIs IAM Service Account Credentials e Security Token Service ativas;
   - **Chave de conta de serviço:** secret `FIREBASE_SERVICE_ACCOUNT` (aba Secrets) com o JSON da chave.
4. **Papéis da conta de serviço** (IAM do Google Cloud, no projeto), conferidos no código do firebase-tools 15:

   | Papel | ID | Para quê |
   | --- | --- | --- |
   | Firebase Rules Admin | `roles/firebaserules.admin` | Publicar as regras do Firestore e do Storage |
   | Cloud Datastore Index Admin | `roles/datastore.indexAdmin` | Criar e remover índices e exceções de campo |
   | Cloud Storage for Firebase Viewer | `roles/firebasestorage.viewer` | Descobrir o bucket padrão (`firebasestorage.defaultBucket.get`) antes de publicar as regras do Storage |
   | Service Usage Consumer | `roles/serviceusage.serviceUsageConsumer` | Conferir se as APIs necessárias estão ativas |

   `Service Account User` não é necessário (só serve para deploy de Functions ou Hosting com conta de execução).
5. **APIs ativas no projeto** (APIs e serviços > Biblioteca): Cloud Firestore API, Firebase Rules API e Cloud Storage for Firebase API. Os papéis acima não incluem ativar APIs, então o deploy falha se alguma estiver desligada.
6. **Banco do Firestore criado antes do primeiro deploy**, na região desejada (ex.: `southamerica-east1`). Se o banco não existir, o firebase-tools tenta criá-lo em `nam5` (EUA).
7. **Cloud Storage:** plano Blaze e bucket padrão criado (Console > Storage > Começar) antes do primeiro deploy, senão o alvo `storage` falha.
8. **Firebase Authentication:** ativar Google, e-mail e senha e **Link de e-mail**; em Settings > Authorized domains, adicionar `<dono>.github.io` (ou o domínio próprio).

O ambiente `firebase` do GitHub é criado no primeiro deploy; nele dá para exigir aprovação manual antes de publicar regras.

## 7. Por que estas escolhas

- **Sem servidor:** a IA é paga por cada usuário com a própria chave, e o resto cabe nas regras do Firebase. Sem Functions, o app inteiro é estático.
- **Tailwind 3.4 em vez de 4:** o padrão clássico de tokens do shadcn/ui é estável e bem documentado; a migração está no backlog.
- **Monaco do CDN:** bundle inicial menor; o Workbox guarda o Monaco com `CacheFirst` para uso offline depois da primeira visita.
- **fflate em vez de JSZip:** mais rápido e menor, com filtro por entrada que permite recusar o zip antes de descompactar.
