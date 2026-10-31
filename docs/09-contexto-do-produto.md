# 09. Contexto do produto

## 1. Visão

Uma plataforma web (PWA) para escrever documentos LaTeX e revisá-los como se revisa código: versões congeladas, comentários ancorados no ponto exato do PDF, threads de discussão com resolução e um diff visual que mostra, no próprio PDF, o que entrou e o que saiu entre uma versão e outra. Um assistente de IA ajuda a escrever, reorganizar e verificar referências usando o próprio conteúdo do projeto como contexto.

A plataforma não tem servidor próprio nem IA própria: é um app estático com Firebase, e **a IA é sempre a do usuário**, configurada com a chave dele (Claude, OpenAI ou Gemini, inclusive chave gratuita).

A interface une os painéis clássicos de editores LaTeX online (árvore de arquivos, código e PDF lado a lado) com uma experiência limpa e centrada em IA, com um painel "pergunte qualquer coisa" sempre à mão.

## 2. Problema

- A revisão de textos acadêmicos e técnicos ainda circula como PDF anotado por e-mail, sem saber em qual versão cada comentário foi feito.
- O autor corrige, mas o revisor não consegue ver com facilidade o que mudou desde a última leitura.
- Comentários em PDF se perdem quando o texto muda de página.
- Ferramentas de IA genéricas não conhecem o resto do documento nem verificam se as referências existem.

## 3. Personas

| Persona | Objetivo | Acesso |
| --- | --- | --- |
| **Autora** (ex.: mestranda) | Escrever, pedir revisão, responder e corrigir | Dona do projeto |
| **Coautor** | Editar capítulos e responder threads | Editor |
| **Leitor interno** | Acompanhar sem editar | Viewer |
| **Revisor** (ex.: orientador, banca, editor de periódico) | Ler a versão congelada, comentar, desenhar, aprovar ou pedir mudanças | Não é membro; recebe acesso por convite ao documento principal e, se o autor quiser, aos secundários |

## 4. Proposta de valor

1. **Versões imutáveis na fila de revisão:** o revisor comenta sobre a versão 1.0 exatamente como foi enviada, enquanto a autora já trabalha na 1.1.
2. **Comentários estilo Pull Request:** selecionar um trecho no PDF, comentar, discutir em thread e marcar como corrigido para a próxima versão.
3. **Pins com desenho livre:** circular um erro em um gráfico e deixar um comentário espacial.
4. **Diff visual no PDF:** um PDF recompilado com o texto removido em vermelho e o inserido em verde, com as quebras de linha refeitas.
5. **IA contextual com a sua chave:** reescrita, paráfrase, rascunhos baseados nos capítulos, reorganização de tópicos, sumário e auditoria de referências com teste real dos links, com modelos de reserva quando um atinge o limite.
6. **Projeto portátil:** exportar tudo em .zip e importar .zip, arquivos ou pastas inteiras do dispositivo.

## 5. Escopo da primeira versão

Dentro:

- Login com Google e e-mail/senha.
- Projetos com múltiplos arquivos e documentos (principal e secundários).
- Editor Monaco com realce LaTeX, compilação e PDF ao lado.
- Snapshots, convite por e-mail, revisão com comentários em texto e pins com desenho.
- Threads com resposta, resolução e reabertura; pendências entre rodadas.
- Diff visual entre snapshots.
- Assistente de IA com as sete tarefas do contrato (`chat`, `rewriteText`, `paraphrase`, `generateDraft`, `reorganizeTopics`, `updateToc`, `checkReferences`), sempre com a chave do próprio usuário e fila de modelos de reserva.
- Exportação do projeto em .zip e importação de .zip, arquivos avulsos ou pastas, para a raiz ou uma pasta interna, sobrescrevendo ou mantendo os dois arquivos (`nome-1`).
- PWA instalável, utilizável em celular a partir de 360px.

Fora (por enquanto):

- Edição simultânea com cursores de várias pessoas (o modelo de arquivos permite adicionar Yjs depois).
- Integração com Git, Overleaf ou Zotero.
- Modelos de periódicos e conversão para Word.
- Edição offline com sincronização de conflitos (offline é leitura e edição local com o cache do Firestore).

## 6. Glossário

| Termo | Significado |
| --- | --- |
| **Projeto** | Conjunto de arquivos, documentos, versões e revisões |
| **Arquivo** | Nó da árvore (`.tex`, `.bib`, imagem, pasta) no rascunho vivo |
| **Documento** | Ponto de entrada compilável com PDF próprio; o **principal** é o padrão do revisor, os **secundários** dependem de concessão |
| **Rascunho** | Estado atual e mutável dos arquivos |
| **Snapshot** ou **versão** | Cópia imutável do código e dos PDFs em um momento (1.0, 1.1, ...) |
| **Revisão** | Rodada de revisão sobre um snapshot, com número sequencial (#1, #2) |
| **Fila de revisão** | Sequência ordenada de revisões do projeto |
| **Grant** | Concessão de leitura de um snapshot (e de documentos específicos) a um revisor |
| **Thread** | Comentário ancorado mais as respostas |
| **Âncora de texto** | Trecho selecionado no PDF (geometria, citação e posição) |
| **Pin** | Comentário espacial em um ponto da página, opcionalmente com desenho livre |
| **Diff visual** | PDF recompilado com marcações de inserção e remoção |
| **Corrigido para a próxima versão** | Resolução de thread que será carimbada com o id do próximo snapshot |

## 7. Métricas de sucesso

- Tempo entre "Solicitar revisão" e o revisor abrir o PDF.
- Percentual de threads resolvidas por rodada.
- Número de rodadas até a aprovação.
- Uso do diff visual por revisão (indica se o revisor confia na comparação).
- Tempo até o primeiro token da IA (meta: menos de 2 segundos) e taxa de saídas estruturadas inválidas (meta: abaixo de 1%).

## 8. Roteiro

| Fase | Entregas |
| --- | --- |
| 1. Fundação (este repositório) | Arquitetura sem servidor, modelo de dados, regras, layout responsivo, IA do usuário com fila de reserva, importação e exportação, CI e deploy |
| 2. Editor completo | biblatex com Biber e hifenização em português na compilação (já entregues: BibTeX na compilação com estilo ABNT do abnTeX2, lista e criação de projetos, login obrigatório, salvamento automático, compilação no navegador com Siglum, visualizador pdf.js, navegação SyncTeX, criar, renomear e excluir arquivos, documentos secundários, membros e convites de coautoria) |
| 3. Revisão | Refinos de uso (já entregues: threads levadas entre rodadas com reancoragem, versões congeladas, convite do revisor por link de e-mail, ReviewPage com comentário em trecho, pins com desenho livre, threads, resolução, aprovação, notificações e "Abrir no código") |
| 4. Diff | Refinos de uso (já entregues: diff dentro dos argumentos de comandos de texto, diff por palavra do código e do texto das páginas, diff visual em PDF recompilado com degradação, cache e "Próxima alteração") |
| 5. Refino | Histórico das conversas de IA, ícones PNG do PWA, métricas |
