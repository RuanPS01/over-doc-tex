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
| `npm run preview` | Serve o build localmente |
| `npm run typecheck` | Apenas o typecheck |
| `npm run check:conventions` | Verifica as proibições de `00-regras-para-ia.md` |
| `npm run check:responsive` | Abre o build em 4 viewports e valida o contrato de 360px |
| `npm --prefix functions run build` | Typecheck e bundle das Functions em `functions/lib` |

## 5. Por que estas escolhas

- **Tailwind 3.4 em vez de 4:** o padrão clássico de tokens do shadcn/ui (variáveis HSL em `globals.css` e `tailwind.config.ts`) é estável e bem documentado. A migração para a configuração CSS-first do Tailwind 4 está no backlog.
- **Monaco do CDN:** mantém o bundle inicial pequeno. O Workbox guarda o Monaco com `CacheFirst`, então o editor abre offline depois da primeira visita. Empacotar o Monaco localmente é a alternativa se o uso offline na primeira visita virar requisito.
- **Wouter em vez de React Router:** o app tem poucas rotas e não precisa de loaders ou ações de dados; o estado assíncrono já está no React Query.
- **esbuild nas Functions:** o deploy do Firebase envia só a pasta `functions/`; o bundle embute `shared/` e mantém `node_modules` como dependências externas.
