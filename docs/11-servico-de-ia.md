# 11. Serviço de IA

A IA do OverDocTeX é **sempre a do usuário**: cada pessoa configura o próprio provedor (Claude, OpenAI ou Gemini) com a própria chave de API. A plataforma não oferece IA própria e não tem servidor de IA: as chamadas saem do navegador direto para a API do provedor.

## 11.1 Decisões de projeto

| Decisão | Como ficou | Por quê |
| --- | --- | --- |
| Sem servidor | O motor roda no navegador (`src/lib/ai/`), com os SDKs oficiais em modo navegador (`dangerouslyAllowBrowser`) | O app é estático (GitHub Pages e Firebase Hosting) e não paga IA por ninguém. A chave é de quem usa, então não há segredo da plataforma para proteger |
| Agnóstico de provedor | Claude (Anthropic), OpenAI e Gemini (Google) atrás da mesma interface `AiProvider` | O usuário escolhe o provedor e o custo, inclusive chave gratuita do Gemini |
| Fila de modelos com reserva | Até 5 modelos (principal mais 4 reservas). O que falha cede a vez ao próximo e pausa conforme o motivo | Um modelo sem cota, fora do ar ou lento não impede a resposta |
| Saída estruturada com Zod | Cada provedor recebe o JSON Schema no formato nativo dele, e o texto devolvido é lido e validado com o mesmo schema Zod | O formato é imposto pelo provedor e conferido por nós; uma resposta fora do schema nunca chega à tela |
| RAG lexical | BM25 sobre blocos de LaTeX (`rag.ts`) | Determinístico, sem embeddings e sem banco vetorial, e explica por que um trecho foi escolhido |
| Eventos incrementais | O motor emite `AiEvent` (status, contexto, delta, resultado, troca, fim), e a UI aplica os deltas uma vez por quadro | Percepção de velocidade igual ao stream NDJSON de um servidor, sem servidor |
| Links verificados pelo provedor | `web_fetch` (Claude) ou `urlContext` (Gemini) abrem as URLs nos servidores do provedor | O navegador não consegue testar sites de terceiros por causa do CORS |
| SDKs sob demanda | Cada SDK é um pedaço separado do build, baixado só quando o provedor é usado (verificar chave, listar modelos ou responder) | Os três somam cerca de 870 kB; sem isso o pacote do editor passava de 1,1 MB. Medido: o editor caiu para 272 kB, e quem usa só Gemini nunca baixa os outros dois |

## 11.2 Mapa de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/ai/schemas.ts` | Tarefas, entrada, saídas estruturadas (Zod), eventos `AiEvent`, `AiTaskError`, schema da configuração |
| `src/lib/ai/providers/types.ts` | Interface `AiProvider`, `parseJsonFromText`, `readableProviderMessage`, utilidades de links |
| `src/lib/ai/providers/anthropic.ts` | Claude: stream, structured outputs, `web_fetch` com retomada de `pause_turn`, fallback de recusa |
| `src/lib/ai/providers/openai.ts` | OpenAI (API Responses): stream e JSON Schema estrito |
| `src/lib/ai/providers/gemini.ts` | Gemini: `generateContentStream`, `responseJsonSchema`, `urlContext` |
| `src/lib/ai/providers/defaults.ts` | Modelo padrão de cada provedor, sem dependência dos SDKs |
| `src/lib/ai/providers/index.ts` | Registro `PROVIDERS` (rótulo, modelo padrão, catálogo, link da chave), carregamento sob demanda dos SDKs, herança de chave, `resolveChain` |
| `src/lib/ai/model-chain.ts` | Saúde da fila: pausa por motivo, ordem por saúde |
| `src/lib/ai/run-task.ts` | Orquestração: fila, prazo por tentativa, repetição de JSON inválido, montagem do contexto |
| `src/lib/ai/rag.ts`, `prompts.ts`, `tasks.ts` | BM25, system prompts por tarefa, esforço e orçamento de contexto |
| `src/lib/ai/references/` | Extração de BibTeX e `\url` e o fluxo de `checkReferences` |
| `src/lib/ai/local-config-storage.ts` | Configuração no navegador (sem login) |
| `src/features/ai-assistant/hooks/use-ai-config.ts` | Configuração na conta (`users/{uid}/private/ai`) ou no navegador |
| `src/features/ai-assistant/hooks/use-ai-stream.ts` | Conversa: consome `runAiTask` e acumula deltas por quadro |
| `src/features/ai-assistant/hooks/use-provider-models.ts` | Lista do campo Modelo: provedor ao vivo, última lista, catálogo do deploy ou embutida |
| `src/features/ai-assistant/hooks/use-model-test.ts`, `src/lib/ai/test-model.ts` | Botão "Testar modelo" |
| `src/lib/ai/model-list.ts` | Filtro, ordem e leitura do catálogo de modelos (puro) |
| `scripts/ai-models-catalog.mjs` | Gera `public/ai-models.json` no deploy (models.dev) |
| `src/features/ai-assistant/components/` | Painel, diálogo "Usar a minha própria IA", cartão de modelo, mensagens |

## 11.3 Provedores

### 11.3.1 Contrato

```ts
interface AiProvider {
  readonly id: 'anthropic' | 'openai' | 'gemini';
  readonly model: string;
  streamText(input: GenerationInput, signal: AbortSignal): AsyncGenerator<ProviderTextEvent>;
  generateStructured<Schema extends z.ZodType>(input, schema: Schema, signal): Promise<{ data; usage }>;
  fetchLinks(urls: readonly string[], signal): Promise<{ pages: Map<string, FetchedPage>; usage }>;
}
```

Cada implementação converte os próprios erros em `AiTaskError` com uma mensagem em português e um código (`invalid_key`, `forbidden`, `rate_limited`, `upstream`, `network`, `refused`, `truncated`, `invalid_output`, `internal`).

### 11.3.2 Detalhes por provedor

| Provedor | Modelo padrão | Stream | Saída estruturada | Links | Cuidados |
| --- | --- | --- | --- | --- | --- |
| Claude | `claude-opus-5-5` | `beta.messages.stream`, eventos `text_delta`; pensamento adaptativo e esforço por tarefa | `output_config.format` com JSON Schema | `web_fetch_20260209` com `allowed_callers: ['direct']`; retoma `pause_turn` reenviando a resposta | `fallbacks: 'default'` (cabeçalho `server-side-fallback-2026-07-01`) refaz uma recusa em outro modelo; recusa final descarta o texto parcial |
| OpenAI | `gpt-5` | `responses.stream`, eventos `response.output_text.delta` | `text.format` com JSON Schema estrito | Não disponível: os links ficam "não verificado" | `max_output_tokens` e `reasoning.effort` |
| Gemini | `gemini-flash-lite-latest` | `generateContentStream`, `chunk.text` | `responseMimeType: application/json` com `responseJsonSchema` | `urlContext`; status de cada URL em `urlContextMetadata` | Chave inválida volta como 400, não 401. `assistant` vira `role: model`. Resposta bloqueada vem sem texto |

O padrão do Gemini é o Flash-Lite porque, medido em 31/10/2026 no nível gratuito, ele respondeu em cerca de 1 s, enquanto o Flash completo passou de 1 min e devolveu 503 em horário de pico.

### 11.3.3 Lista de modelos e teste

O campo "Modelo" mostra, nesta ordem de preferência (`useProviderModels`):

1. **Provedor ao vivo:** com a chave (a digitada, a salva ou a herdada), o diálogo consulta a API de listagem do provedor (`listModels`), 700 ms depois da digitação, e guarda o resultado por 10 min. A chave de cache leva só o tamanho e os 6 últimos caracteres da chave de API. O botão "Atualizar" refaz a consulta.
2. **Última lista do provedor:** cada consulta bem-sucedida fica no localStorage (`overdoctex.ai-models`, só os nomes, nunca a chave) e aparece quando ainda não há chave, com a data da consulta.
3. **Lista pública:** `public/ai-models.json`, gerado a cada deploy por `scripts/ai-models-catalog.mjs` a partir do models.dev (banco aberto de modelos por provedor; o arquivo de lá passa de 5 MB e aqui vira cerca de 6 kB, só com modelos que respondem em texto). Se a fonte falhar no deploy, o passo só avisa.
4. **Lista embutida:** o `catalog` de cada provedor em `PROVIDERS`.

Toda lista passa por `src/lib/ai/model-list.ts`: ficam só os modelos que conversam por texto (sem voz, imagem, vídeo, transcrição, embeddings e agentes), sem repetidos e dos mais novos para os mais antigos (pela data de lançamento quando a fonte informa; senão apelidos `latest` primeiro, depois a versão no nome). Cada item mostra o nome legível do provedor ("Gemini 3.8 Flash") e o identificador da API ao lado. "Padrão do provedor" e "Nome personalizado..." vêm no topo; o modelo salvo aparece na lista mesmo que a fonte atual não o traga.

**Testar modelo:** cada item da fila tem o botão "Testar modelo" (`useModelTest`, `src/lib/ai/test-model.ts`). Ele manda um pedido curto de verdade ("responda OK", esforço baixo, até 1024 tokens para modelos que raciocinam) com a chave efetiva do item e sem novas tentativas automáticas, e mostra o tempo e a resposta, ou o erro do provedor (cota, chave, modelo inexistente). É diferente da conferência do "Salvar", que só pergunta ao provedor se o modelo existe, sem gerar texto.

## 11.4 Fila de modelos

### 11.4.1 Configuração

```ts
interface AiConfig {
  models: Array<{
    provider: 'anthropic' | 'openai' | 'gemini';
    model: string | null; // nulo usa o padrão do provedor
    apiKey: string;       // vazio numa reserva: herda a chave do item anterior do mesmo provedor
  }>; // 1 a 5 itens; o primeiro é o principal
}
```

- **Herança de chave:** uma reserva do mesmo provedor sem chave usa a do item anterior. O usuário alterna entre modelos de um provedor digitando a chave uma vez.
- **Utilizável:** quando pelo menos um item tem credencial (`isConfigUsable`).

### 11.4.2 Pausa por motivo (`model-chain.ts`)

| Motivo | Erros | Pausa |
| --- | --- | --- |
| Limite ou indisponibilidade | `rate_limited`, `upstream` (5xx, 503 de alta demanda, prazo estourado), `network` | 60 s |
| Modelo | `forbidden` (404 ou sem acesso ao modelo) | 30 min, só com reserva |
| Credencial | `invalid_key` | 60 s, só com reserva |
| Outros | `refused`, `invalid_output`, `internal` | sem pausa, mas a vez passa ao próximo |

- O item em pausa **vai para o fim da fila**, não some: se todos os outros falharem, ele ainda é tentado.
- A identidade do item é `provedor|modelo|impressão da chave` (FNV-1a). Trocar a chave ou o modelo tira o item da pausa na hora.
- O diálogo de configuração mostra o item em pausa e o motivo ("Em pausa por 1 min: limite de uso").

### 11.4.3 Algoritmo

```
para cada item da fila (os em pausa no fim):
  SDK com maxRetries 0 se houver próximo (não perder segundos num modelo que já disse não)
  até 2 tentativas no mesmo item:
    tente executar a tarefa, com prazo de 5 min
    sucesso: limpe a pausa do item e termine
    JSON inválido na primeira tentativa: repita no mesmo item
    outra falha: registre a pausa conforme o motivo
      resposta longa demais: pare (repetiria em outro modelo)
      sem próximo: devolva o erro da PRIMEIRA tentativa
      com próximo: emita "switch" (a UI descarta o texto parcial) e siga
```

O erro devolvido quando todos falham é o da primeira tentativa: é ele que diz o que aconteceu com o modelo que o usuário escolheu como principal.

## 11.5 Tarefas e prompts

| Tarefa | Saída | Esforço (Claude) | Contexto |
| --- | --- | --- | --- |
| `chat` | Texto | baixo | BM25 pela pergunta, 40 mil caracteres |
| `rewriteText` | Texto | médio | BM25, 20 mil |
| `paraphrase` | Texto | baixo | BM25, 12 mil |
| `generateDraft` | Texto | alto | BM25, 80 mil, mais a estrutura de seções |
| `reorganizeTopics` | `OutlineProposal` | alto | abertura de cada seção, 60 mil |
| `updateToc` | `OutlineProposal` | médio | abertura de cada seção, 30 mil |
| `checkReferences` | `ReferenceAudit` | médio | referências extraídas |

Regras dos prompts (`prompts.ts`): os prompts são escritos em português nos três idiomas da interface e pedem a resposta no idioma do documento; na dúvida, no idioma da interface (`getLocale()`, lido a cada pedido). Texto estável por tarefa e por idioma (aproveita o cache de prompt do provedor), conteúdo do documento entre `<documento>` e `<selecao>`, páginas externas entre `<pagina_externa>`, e a instrução explícita de tratar esse conteúdo como dado, nunca como instrução.

### 11.5.1 `checkReferences`

1. **Extração determinística:** entradas `.bib` (título, autores, ano, `url` ou `doi`) e `\url`/`\href` do texto, até 60.
2. **Abertura dos links pelo provedor:** o status (`ok`, `broken`, `blocked`, `unchecked`) vem dos blocos da ferramenta, nunca do texto do modelo.
3. **Julgamento semântico:** o modelo recebe metadados e o resumo de cada página e devolve só `verdict` e `explanation`, validados por `ReferenceJudgementSchema`.
4. **Mesclagem:** link que não abriu sempre resulta em `unreachable`; sem link ou sem verificação, no máximo `uncertain`.

## 11.6 Eventos e interface

| Evento | Quando |
| --- | --- |
| `status` | Mudança de etapa ("Buscando trechos relevantes", "Abrindo 12 links") |
| `context` | Trechos escolhidos pelo BM25, com caminho, linhas e score |
| `delta` | Fragmento de texto |
| `result` | Saída estruturada validada |
| `switch` | Troca de modelo na fila: a UI apaga o que o anterior escreveu |
| `done` | Fim, com uso de tokens e o provedor e modelo que responderam |

`useAiStream` acumula os deltas e aplica uma vez por quadro (`requestAnimationFrame`), mantém as 10 últimas mensagens como histórico e permite cancelar. O Markdown passa por `marked` e DOMPurify em `MarkdownContent` antes de virar HTML. Cada resposta mostra "Respondido por Gemini (Google), gemini-flash-lite-latest".

### 11.6.1 Diálogo "Usar a minha própria IA"

- Lista ordenada de modelos: principal e reservas, cada um com Provedor, Modelo (lista ao vivo) e Chave de API.
- Reserva nova nasce com o provedor do principal e herda a chave dele ("Chave já preenchida no modelo 1", com "Usar outra chave").
- Trocar o provedor de um item zera modelo e chave. Colar uma chave de outro provedor troca o provedor do item.
- Chave salva reabre vazia com "Chave salva (AIzaSy...a1b2). Deixe vazio para manter."
- "Salvar" confere todas as chaves e modelos no provedor antes de gravar.
- "Limpar configuração" pede um segundo clique.
- Layout de formulário longo em modal (`08-responsividade.md`): cabeçalho e rodapé fixos, só o meio rola.

## 11.7 Onde a configuração fica

| Situação | Armazenamento | Observação |
| --- | --- | --- |
| Com login | `users/{uid}/private/ai` no Firestore | Só o dono lê e grava (regras). Vale em todos os dispositivos |
| Sem login (modo demonstração) | `localStorage` deste navegador | Leitura e escrita em `try/catch`; sem armazenamento, vale até recarregar |

## 11.8 Segurança e privacidade

- A chave do usuário nunca vai para o build, para logs nem para servidores do OverDocTeX; só para a API do provedor escolhido.
- Qualquer script malicioso na página poderia ler a chave (vale para toda aplicação BYOK no navegador). Por isso: Markdown sempre sanitizado, nenhum `dangerouslySetInnerHTML` fora de `MarkdownContent`, e a recomendação, no diálogo, de usar chave com limite de gastos.
- No nível gratuito da API do Gemini, o Google pode usar o conteúdo enviado para melhorar os produtos dele. O diálogo avisa isso.
- Conteúdo do documento e de páginas externas entra delimitado e marcado como dado (proteção contra injeção de prompt).

## 11.9 Testes

| Teste | Onde | O que cobre |
| --- | --- | --- |
| Unitário com API simulada | `tests/unit/ai-engine.test.ts` (`npm test`) | Cabeçalhos do navegador, fallback de recusa, stream, structured output e repetição de JSON inválido, `web_fetch` com `pause_turn`, mesclagem de referências, troca na fila em 429, herança de chave, pausa, verificação de chave |
| Real com Gemini | Rodado manualmente com a chave do usuário em 31/10/2026 | Chat (0,6 s), sumário estruturado (1,3 s), verificação de referências com `urlContext` (2,8 s, link quebrado detectado) e fila com modelo inexistente na frente |

OpenAI não foi testada com chave real; o adaptador segue a API Responses documentada e compila contra o SDK oficial.

## 11.10 Como adicionar um provedor

1. Implementar `AiProvider` em `src/lib/ai/providers/<nome>.ts`, com verificação de chave e listagem de modelos. O modelo padrão vai em `providers/defaults.ts`.
2. Registrar em `PROVIDERS` (`providers/index.ts`) com rótulo, modelo padrão, catálogo, link da chave e reconhecimento do formato da chave. `verifyKey`, `listModels` e `create` chamam o módulo por `import()` dinâmico (função `lazy`): nenhum arquivo fora de `providers/` importa um provedor diretamente, senão o SDK volta para o pacote do editor.
3. Incluir o id em `AiModelConfigSchema` (`schemas.ts`) e em `UserAiConfigDoc` (`shared/firestore/types.ts`).
4. Cobrir em `tests/unit/` com respostas simuladas no formato do provedor.
5. Atualizar este documento e `02-tecnologias.md`.
