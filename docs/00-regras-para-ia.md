# 00. Regras para IA e desenvolvedores

> **Leia este documento antes de qualquer alteração no projeto.** Ele vale para qualquer agente de IA (Claude Code, Copilot, Cursor ou outro) e para pessoas, e tem precedência sobre preferências próprias do modelo.

## 1. As três regras obrigatórias

### Regra 1: consultar a documentação ANTES de implementar

| Vou mexer em... | Leia antes |
| --- | --- |
| Qualquer coisa | `09-contexto-do-produto.md` |
| Estrutura de pastas, camadas, decisões | `01-arquitetura.md` |
| Dependências, versões, scripts, deploy | `02-tecnologias.md` |
| Cores, tipografia, ícones, tema | `03-identidade-visual.md` |
| Telas e componentes existentes | `04-componentes-e-telas.md` |
| Nomes de arquivos, tipos, coleções, commits | `05-padroes-de-nomes.md` |
| Coleções, campos, regras de segurança | `06-banco-de-dados.md` |
| Snapshot, revisão, diff, importação | `07-fluxos.md` |
| Layout, largura, qualquer coisa visual | `08-responsividade.md` |
| Criar arquivo, componente ou hook novo | `10-manutencao-e-granularidade.md` |
| Provedores, prompts, fila de modelos de IA | `11-servico-de-ia.md` |

Consultar não é opcional: quase toda necessidade de "componente novo" já tem um componente pronto em `04-componentes-e-telas.md`. Criar duplicata é o defeito mais comum de agentes.

### Regra 2: atualizar a documentação DEPOIS de implementar, no mesmo trabalho

Casos que sempre exigem atualização:

- criou, renomeou ou removeu página, componente reutilizável ou hook (`04`);
- mudou coleção, campo ou regra de segurança (`06`, `firestore.rules`, testes em `tests/rules/`);
- mudou token visual (`03`);
- criou um padrão de layout responsivo reaproveitável (`08`);
- adicionou ou removeu dependência (`02`);
- mudou um fluxo (`07` e `09`);
- mudou provedor, prompt ou regra da fila de IA (`11`).

Documentação que descreve algo que não existe mais é pior que documentação ausente. Se encontrar informação defasada enquanto trabalha, corrija na hora.

### Regra 3: nunca usar travessão, caractere de seta nem emoji

Proibido em qualquer texto gerado: rótulo, placeholder, mensagem, comentário de código, commit, documentação.

| Proibido | Use no lugar |
| --- | --- |
| Travessão e meia-risca | dois pontos, vírgula, parênteses ou ponto; "a" e "até" em faixas |
| Setas de texto | "para", "vira", "resulta em", "vem de" |
| Emojis | ícone do `lucide-react` na interface; nada no texto |

O hífen simples é permitido. Ícones de seta (`ArrowLeft`) são permitidos: a regra é sobre caractere de texto. O `npm run check:conventions` verifica isso.

## 2. Idioma

- Documentação, textos de interface, mensagens de erro e comentários: **português do Brasil**, com acentos e cedilha corretos.
- Identificadores de código (variáveis, funções, tipos, coleções, campos): **inglês** (`05-padroes-de-nomes.md`).

## 3. Proibições

| Proibido | Motivo | Alternativa |
| --- | --- | --- |
| Cores hexadecimais, `rgb()` ou nomes de cor em componentes | Quebra o tema claro/escuro | Tokens semânticos: `bg-background`, `text-primary`, `border-border` |
| `h-screen` ou `100vh` em tela de altura fixa | No celular, `100vh` ignora a barra de endereço | `.h-viewport` (100dvh) com `overflow-hidden` |
| Rolagem horizontal no `body` | Contrato de 360px | `min-w-0`, `truncate`, `grid-cols-1`, menus |
| `dangerouslySetInnerHTML` fora de `src/components/common/markdown-content.tsx` | XSS (e a chave de IA do usuário está no navegador) | `MarkdownContent`, que sanitiza com DOMPurify |
| SDK do Firebase em páginas ou componentes visuais | Acoplamento | Hooks em `src/features/<domínio>/hooks/` |
| Caminho do Firestore montado fora de `shared/firestore/paths.ts` | Divergência | `firestorePaths` |
| Gravar snapshot, revisão ou contador fora do lote previsto em `07-fluxos.md` | As regras recusam, e o dado fica incoerente | Lotes (`writeBatch`) com todos os documentos que as regras conferem juntos |
| Chave de API embutida no build, em `.env` público ou em log | A plataforma não tem IA própria; chaves são só dos usuários | `users/{uid}/private/ai` ou o navegador do próprio usuário (`11-servico-de-ia.md`) |
| Aceitar status de link ou dado factual vindo do texto do modelo | Alucinação | Status vem da ferramenta do provedor; o modelo só julga semântica |
| `enum` do TypeScript e `any` | Tipos opacos | Uniões de literais e `unknown` com Zod |
| Editar primitivo de `components/ui` para atender uma tela | Muda todas as telas sem ninguém ver | Passar `className` (o `cn()` desempata) |

## 4. Obrigações

- **Validação nas fronteiras:** saída estruturada da IA, configuração salva e arquivos importados passam por schema Zod ou normalização antes de uso.
- **Mobile-first:** escreva primeiro o layout de 360px e depois `sm:`, `lg:`.
- **Contratos:** tipos do Firestore em `shared/firestore/types.ts`; contrato da IA em `src/lib/ai/schemas.ts`.
- **Comente o porquê, não o quê:** registre a decisão e o defeito que ela evita.

## 5. Checklist de fim de tarefa

```bash
npm run typecheck            # TypeScript estrito
npm test                     # testes unitários (motor de IA, importação e exportação)
npm run build                # build de produção com service worker
npm run check:conventions    # proibições desta página
npm run check:responsive     # contrato de 360px em 4 viewports (requer Playwright)
npm run test:rules           # regras nos emuladores (requer Java 21+)
```

- [ ] Todas as verificações acima passam (ou digo explicitamente qual não rodou e por quê).
- [ ] Nenhum travessão, seta ou emoji no que escrevi.
- [ ] Nenhuma cor literal; tema claro e escuro conferidos.
- [ ] Testado em 360px, sem rolagem horizontal da página.
- [ ] Documentos afetados atualizados.
- [ ] Não criei componente ou hook duplicado.
- [ ] Commit em branch própria, nunca na `main`.
