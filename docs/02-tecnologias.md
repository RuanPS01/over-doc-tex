# 02. Tecnologias

Versões instaladas no momento da criação do projeto. Atualizações de versão maior seguem `10-manutencao-e-granularidade.md`.

## 1. Frontend

| Tecnologia | Versão | Uso | Observações |
| --- | --- | --- | --- |
| React | 18.3 | UI | Requisito do produto; `StrictMode` ligado |
| TypeScript | 7.0 | Tipagem estrita (ESM) | Compilador nativo. `baseUrl` não existe mais: `paths` são relativos ao tsconfig |
| Vite | 8 | Dev server e build (Rolldown) | Chunks de fornecedores separados em `vite.config.ts` |
| Tailwind CSS | 3.4 | Estilo | Tokens via `hsl(var(--token) / <alpha-value>)`; ver `03-identidade-visual.md` |
| shadcn/ui (Radix UI) | Radix 1.x/2.x | Componentes acessíveis | Código copiado em `src/components/ui`, estilo "new-york" |
| Wouter | 3 | Roteamento | Leve, com `useParams` e rotas lazy |
| TanStack React Query | 5 | Cache de dados do servidor | `onSnapshot` alimenta o cache com `setQueryData` |
| @monaco-editor/react | 4.7 | Editor de código | Monaco 0.55 carregado do CDN e guardado pelo service worker |
| react-resizable-panels | 4 | Colunas redimensionáveis | API v4: `Group`, `Panel`, `Separator`; tamanho em string é porcentagem |
| Firebase Web SDK | 13 | Auth, Firestore, Storage | Firestore com `persistentLocalCache` (offline) |
| Zod | 4 | Validação | Schemas em `shared/` |
| marked + DOMPurify | 18 / 3 | Markdown do chat de IA | Sanitização obrigatória |
| lucide-react | 1.x | Ícones | Sempre com `aria-label` no botão quando sem texto |
| vite-plugin-pwa | 2 | Manifesto e service worker (Workbox) | `registerType: autoUpdate` |

### Planejado no frontend

| Tecnologia | Uso |
| --- | --- |
| pdfjs-dist | Renderização do PDF com camadas de texto (seleção) e de anotação |
| perfect-freehand ou SVG próprio | Traços do desenho livre do revisor |

## 2. Backend

| Tecnologia | Versão | Uso |
| --- | --- | --- |
| Cloud Functions (2a geração) | firebase-functions 7 | `aiStream` e, em seguida, `requestReview`, `acceptInvite`, `requestDiff`, triggers |
| firebase-admin | 14 | Firestore, Auth e Storage no servidor |
| @anthropic-ai/sdk | 1.3 | Modelo de IA (`claude-opus-5-5`), stream, saídas estruturadas com Zod |
| esbuild | 0.28 | Empacota as Functions e embute `shared/` |
| Node.js | 22 | Runtime das Functions e do worker |

### Planejado no backend

| Tecnologia | Uso |
| --- | --- |
| Cloud Run `latex-worker` | Container com TeX Live 2026, `latexmk`, `synctex`, `pdftotext` |
| Cloud Tasks | Fila de compilação, snapshot e diff com repetição |
| Extensão Trigger Email | Envio do convite ao revisor a partir da coleção `mail` |
| Secret Manager | `ANTHROPIC_API_KEY` e credenciais SMTP |

## 3. Variáveis de ambiente

Frontend (`.env`, ver `.env.example`):

| Variável | Descrição |
| --- | --- |
| `VITE_FIREBASE_*` | Configuração pública do app Firebase |
| `VITE_API_BASE_URL` | URL base das funções HTTP (ex.: emulador ou `https://southamerica-east1-<projeto>.cloudfunctions.net`) |
| `VITE_USE_FIREBASE_EMULATORS` | `true` conecta Auth, Firestore e Storage aos emuladores locais |

Sem `VITE_FIREBASE_API_KEY` e `VITE_FIREBASE_PROJECT_ID`, o app roda em **modo demonstração**: arquivos de exemplo e IA simulada (`src/lib/ai/demo-stream.ts`).

Functions:

| Parâmetro | Tipo | Descrição |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | segredo (`defineSecret`) | Chave da API do modelo |
| `ALLOWED_ORIGINS` | lista (`defineList`) | Origens liberadas no CORS do `aiStream` |

## 4. Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento do Vite |
| `npm run build` | Typecheck (`tsc -b`) e build de produção com service worker |
| `npm run build:pages` | `build` mais o `404.html` usado pelo GitHub Pages (defina `BASE_PATH`, ex.: `/over-doc-tex/`) |
| `npm run preview` | Serve o build localmente |
| `npm run typecheck` | Apenas o typecheck |
| `npm run check:conventions` | Verifica as proibições de `00-regras-para-ia.md` |
| `npm run check:responsive` | Abre o build em 4 viewports e valida o contrato de 360px |
| `npm --prefix functions run build` | Typecheck e bundle das Functions em `functions/lib` |
| `npm run test:rules` | Testes das regras nos emuladores (depois de `npm --prefix tests/rules install`) |

## 5. Por que estas escolhas

- **Tailwind 3.4 em vez de 4:** o padrão clássico de tokens do shadcn/ui (variáveis HSL em `globals.css` e `tailwind.config.ts`) é estável e bem documentado. A migração para a configuração CSS-first do Tailwind 4 está no backlog.
- **Monaco do CDN:** mantém o bundle inicial pequeno. O Workbox guarda o Monaco com `CacheFirst`, então o editor abre offline depois da primeira visita. Empacotar o Monaco localmente é a alternativa se o uso offline na primeira visita virar requisito.
- **Wouter em vez de React Router:** o app tem poucas rotas e não precisa de loaders ou ações de dados; o estado assíncrono já está no React Query.
- **esbuild nas Functions:** o deploy do Firebase envia só a pasta `functions/`; o bundle embute `shared/` e mantém `node_modules` como dependências externas.

## 6. Deploy (GitHub Pages com Firebase antes)

O workflow `.github/workflows/deploy.yml` faz o CI e o deploy.

| Job | Quando roda | O que faz |
| --- | --- | --- |
| `verify` | PR e main | Convenções, build do frontend, build das Functions e contrato de responsividade |
| `rules-tests` | PR e main | Regras do Firestore e do Storage nos emuladores |
| `firebase-deploy` | main e execução manual, depois de `verify` e `rules-tests` | `firebase deploy --only firestore:rules,firestore:indexes,storage` (mais `functions` se `DEPLOY_FUNCTIONS=true`) |
| `pages-build` | main e execução manual, depois de `verify` | `npm run build:pages` com o subcaminho do Pages e a configuração pública do Firebase |
| `pages-deploy` | depois de `firebase-deploy` **e** `pages-build` | Publica no GitHub Pages |

Se o deploy do Firebase falhar, o site não é publicado: o app nunca vai ao ar contra regras antigas.

### Configuração única

1. **GitHub Pages:** Settings > Pages > Source: **GitHub Actions**.
2. **Variáveis do repositório** (Settings > Secrets and variables > Actions > Variables):

| Variável | Obrigatória | Valor |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | sim | id do projeto Firebase |
| `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID` | sim, para sair do modo demonstração | configuração do app web (Console do Firebase > Configurações do projeto). Não são segredos |
| `DEPLOY_FUNCTIONS` | não | `true` para incluir as Cloud Functions no deploy (padrão: desligado) |
| `ALLOWED_ORIGINS` | não | origens do CORS do `aiStream`, separadas por vírgula. Padrão: `https://<dono>.github.io` |
| `API_BASE_URL` | não | URL base das funções. Padrão: `https://southamerica-east1-<projeto>.cloudfunctions.net` |

3. **Autenticação do deploy**, uma das duas formas:
   - **Workload Identity Federation (recomendada, sem chave de longa duração):** variáveis `GCP_WORKLOAD_IDENTITY_PROVIDER` (`projects/<número>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`) e `GCP_SERVICE_ACCOUNT` (e-mail da conta de serviço), com o provider restrito a este repositório;
   - **Chave de conta de serviço:** secret `FIREBASE_SERVICE_ACCOUNT` com o JSON da chave.
4. **Papéis da conta de serviço:** para regras, índices e Storage, `Firebase Rules Admin`, `Cloud Datastore Index Admin` e `Service Usage Consumer`. Para incluir Functions, o caminho mais simples é acrescentar `Firebase Admin` e `Service Account User`; o deploy com segredos também pede acesso ao Secret Manager. Refine os papéis depois do primeiro deploy.
5. **Firebase Authentication:** em Authentication > Settings > Authorized domains, adicionar `<dono>.github.io` (ou o domínio próprio).
6. **Cloud Storage:** o bucket padrão exige o plano Blaze desde fevereiro de 2026 (o uso gratuito continua dentro das cotas). Crie o bucket antes do primeiro deploy, senão o alvo `storage` falha.
7. **Cloud Functions (só com `DEPLOY_FUNCTIONS=true`):** plano Blaze e o segredo criado uma vez com `firebase functions:secrets:set ANTHROPIC_API_KEY`.

O ambiente `firebase` do GitHub é criado no primeiro deploy; nele dá para exigir aprovação manual antes de publicar regras (Settings > Environments > firebase > Required reviewers).
