# Arcala Insight — Documentação Completa da Plataforma

> Atualizado em julho de 2026. Este documento substitui e expande o `ARCALA_INSIGHT_ESTADO_DO_PROJETO.md` anterior, incorporando a reestruturação de backend feita nesta sessão. Cole este arquivo inteiro na primeira mensagem de qualquer novo chat, ou adicione como Project Knowledge.

---

## 1. O que é

SaaS de mentoria executiva em português, construído em torno da **Metodologia GUIA** — um framework proprietário de 12 semanas, 4 fases (**G**estar Acordo → **U**nir Diagnóstico e Visão → **I**mplementar Microplanos → **A**ferir e Ajustar), combinando o modelo GROW de coaching com OKRs, perfil comportamental DISC, radar de competências, feedback 360° e microplanos semanais.

A metodologia foi validada na prática antes da existência da plataforma — aplicação informal e não remunerada gerou impacto real em múltiplos mentorados, levando um diretor de empresa a pedir escala para um programa multi-mentor/multi-mentorado, com líderes da empresa como mentores e coordenadores/especialistas como mentorados. A plataforma está sendo construída para sustentar essa escala, além de comercialização B2B e B2C mais ampla no mercado brasileiro.

**Link público:** `luizarcala-tech.github.io/mentoriaguia`
**Admin:** `luizarcala@outlook.com`

---

## 2. Arquitetura técnica

```
Navegador (localStorage — cache otimista)
        ↕
  camada persist() / sync queue
        ↕
Supabase (PostgreSQL — fonte oficial)
        ↕
Edge Function ai-proxy → API Anthropic (Claude)
```

| Componente | Detalhe |
|---|---|
| Frontend | Single-file HTML (`index.html`, ~10.600 linhas), hospedado no GitHub Pages |
| Backend | Supabase (PostgreSQL + API REST via PostgREST) |
| IA | Claude, acessado via Edge Function `ai-proxy` — a chave da Anthropic nunca fica no código-cliente |
| Repositório | `github.com/luizarcala-tech/mentoriaguia` — branches `main` (desenvolvimento) e `stable` (o que o GitHub Pages publica) |
| Deploy | `./deploy.sh "mensagem"` — valida sintaxe, roda a suíte de testes, e só então publica em `main` e `stable` |
| Auditoria | `./audit.sh` — mesma validação, pensada para rodar sem supervisão (agente, cron, CI) |

### 2.1 Princípio de dados: "backend forte, local é cache"

Desde a reestruturação desta sessão, **toda escrita de dado de pessoa passa por replicação no Supabase.** O padrão de escrita é:

1. Grava local (`localStorage`) — resposta imediata na tela
2. Tenta replicar no Supabase via `persist()`
3. Se a rede falhar, a operação **fica numa fila** (`sync_queue`) em vez de ser perdida — nunca falha em silêncio
4. Um badge âmbar na topbar mostra pendências; clicar nele abre um diagnóstico visual com causa provável e ação recomendada, sem precisar de console do navegador
5. A fila é reenviada automaticamente a cada login

Dois guardrails estruturais impedem regressão desse princípio (ver seção 6).

---

## 3. Metodologia GUIA — as 4 fases

| Fase | Nome | Semanas | Objetivo | Instrumentos |
|---|---|---|---|---|
| **G** | Gestar Acordo | 1 | Alinhar escopo, metas e papéis | Kick-off, definição de objetivo, Termo de Mentoria com assinatura dupla (mentee + mentor) |
| **U** | Unir Diagnóstico e Visão | 2–3 | Diagnóstico 360° e visão de futuro | Perfil DISC (natural + adaptado), Radar de Competências, Feedback 360°, SWOT Pessoal, Visão de Futuro, Mapa de Objetivos (BSC) |
| **I** | Implementar Microplanos | 4–9 | Converter visão em ação semanal | OKRs quebrados em microplanos, sessões GROW semanais (50 min), Kanban compartilhado |
| **A** | Aferir e Ajustar | 10–12 | Medir progresso e selar aprendizados | Revisão de KRs, NPS de mentoria, Entrevista de Aprendizado |

**Resultado pretendido**, ao longo das 5 dimensões do compass da metodologia: Propósito → Posicionamento → Competências → Estratégia → Protagonismo.

### 3.1 Papéis

- **Mentorado:** protagonista do processo — executa, traz desafios, pratica vulnerabilidade
- **Mentor:** guia — desenha o processo, provoca, conecta, avalia; nunca substitui a autoria do mentorado
- **Admin:** gestão de usuários, matching, empresas, treinamento de mentores, ROI

---

## 4. Banco de dados — 18 tabelas

O schema completo está versionado em `supabase_schema.sql`, idempotente (`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS`).

### 4.1 Tabelas base (já existiam ou foram criadas nesta sessão)

| Tabela | Papel |
|---|---|
| `users` | Cadastro, papel, empresa, plano, fase atual |
| `registrations` | Cadastros pendentes de aprovação |
| `cycles` | Ciclos de mentoria, assinaturas do termo, competências do ciclo |
| `peer360_responses` | Respostas do feedback 360° por token |
| `mentor_observations` | Observações do mentor — `instrument` + `target_id` + `kind` sustentam observação por instrumento e comentário em card do Kanban |
| `phase_releases` | Liberação de fase por mentorado (`g_released`, `u_released`, `i_released`, `a_released`) |
| `mentee_progress` | Progresso agregado do mentorado |
| `mapa_objetivos` | Mapa BSC (4 perspectivas) |

### 4.2 Tabelas tipadas — agregáveis via SQL (ROI, People Analytics)

| Tabela | Séries / campos-chave |
|---|---|
| `checkpoints` | energia, conquista, bloqueio — pulso semanal, streak, digest do mentor |
| `diario` | mood, texto — **nunca exposto ao mentor**, decisão de produto deliberada |
| `competencia_scores` | 4 séries por competência/ciclo: `score_auto`, `score_mentor`, `score_360`, `score_aferido` |
| `disc_profiles` | D/I/S/C, esforço percentual, `tipo` natural (travado) ou adaptado (por ciclo) |
| `nps_registros` | score 0–10, comentário |
| `key_results` | objetivo, KR, meta, atingido |
| `training_progress` | certificação de mentores por aula |

### 4.3 Tabela genérica versionada

`instrument_data (mentee_email, cycle_id, instrument, payload jsonb, version, is_current, updated_by, created_at)`

Cobre SWOT, Visão de Futuro, GROW, microplano/Kanban, Fase A, Termo de Mentoria, radar de competências. **Cada save cria uma nova versão** — a anterior vira `is_current=false`, nunca é apagada. É o mecanismo de "conhecimento acumulado": o SWOT do ciclo 1 continua consultável no ciclo 3.

### 4.4 Suporte e auditoria

`empresas` (B2B) e `audit_log` (trilha de quem mudou o quê — pré-requisito para múltiplas empresas no mesmo banco).

### 4.5 Segurança — estado atual

Row Level Security está **ativo com uma política permissiva** (`anon_all`) em todas as 18 tabelas, aplicada para destravar a escrita depois que o Supabase criou as tabelas novas com RLS ligado e sem política. Isso nivela as tabelas novas ao mesmo padrão que `users`/`diario`/`peer360_responses` já tinham.

**Risco conhecido e aceito para o piloto atual:** a anon key está no HTML público. Qualquer pessoa com essa chave lê e escreve em qualquer tabela, incluindo diário de bordo e respostas 360°. **Bloqueador explícito antes de qualquer B2B multi-empresa** — exige migrar login para Supabase Auth e trocar `anon_all` por políticas baseadas em `auth.uid()`.

---

## 5. Funcionalidades por área

### 5.1 Mentorado
Onboarding, Termo de Mentoria com assinatura dupla, DISC (natural travado + adaptado por ciclo com esforço %), Radar de Competências (banco de 20 + customizadas, máx. 7/ciclo), Feedback 360° por token, SWOT, Visão de Futuro, Mapa de Objetivos BSC, Kanban, sessões GROW, Diário de Bordo (privado), Checkpoint Semanal com streak, upload de currículo (extração client-side via pdf.js, injetado como contexto em toda chamada de IA).

### 5.2 Mentor
Dashboard por mentorado, Digest Semanal automático (alerta quem está sem checkpoint há 7+ dias ou com energia baixa), "IA GUIA ✦ Preparar Sessão", liberação de fases, resumo semanal por e-mail.

**Em desenvolvimento — painel twin:** visão consolidada e somente-leitura de cada instrumento do mentorado (sem editar o que o mentorado preencheu), com espaço de observação por instrumento, calibração de competências como 4ª série (`score_mentor`), e comentários em cards específicos do Kanban. Diário de Bordo fica fora do escopo de observação, por decisão de produto. Infraestrutura de backend já pronta (`mentor_observations` com `instrument`/`target_id`/`kind`); interface ainda não construída.

### 5.3 Admin
CRUD de usuários com sincronização e remoção de duplicatas, aprovação de cadastros, associação mentor↔mentorado, gestão de empresas, 4 análises agregadas via IA (saúde do funil, riscos de retenção, tendências, relatório RH), Dashboard ROI, gestão de treinamento de mentores (6 aulas + prova com gabarito), painel de Atualizações & Deploy com a suíte de testes embutida.

### 5.4 Design
"Obsidian Executive" — dark, glassmorphism, dourado (`#e8b84b`) como cor de assinatura. Fontes: Instrument Serif (títulos), DM Sans (corpo), JetBrains Mono (números/código).

---

## 6. Qualidade — suíte de testes e guardrails

**110 testes de lógica, 0 falhas** (`node tests.js`), organizados em categorias:

- **S00–S06** — auditoria estrutural (análise estática do HTML/JS real, sem stubs):
  - S00: todo `getElementById` aponta para elemento que existe
  - S01: nenhuma função duplicada
  - S02: prova de proficiência exige explicação para reflexão crítica
  - S03: toda escrita em `users` passa por `sanitizeUserPayload`
  - **S04:** nenhum dado de mentorado é gravado em chave global — impede vazamento entre usuários
  - **S05:** todo instrumento com escrita local também replica no Supabase — impede funcionalidade nova nascer só em cache
  - **S06:** nenhum campo atribuído antes de `sbPatchUser` fica fora da whitelist — impede escrita que sai vazia em silêncio
- **I / J** — testes isolados e de jornada completa (login, competências, DISC, 360°, checkpoint, diário, digest, sincronização, dedup, currículo, prova de treinamento)
- **K** — persistência: fila de sincronização, isolamento de dados por mentorado, versionamento de instrumentos
- **P** — regras de negócio de plataforma: streak, treinamento de mentor, aprovação de cadastro, limpeza de duplicatas, isolamento de DISC

**Regra de ouro do projeto:** ao corrigir um bug relatado, escrever um teste que reproduza o bug exato, provar que ele falha com o código antigo, só então corrigir.

### 6.1 Rotinas de automação

- **`deploy.sh`** — valida sintaxe + roda suíte completa → bloqueia o deploy se qualquer teste falhar → commita `index.html`, `tests.js`, `audit.sh` e o próprio `deploy.sh` juntos (correção desta sessão: antes só commitava `index.html`, deixando a suíte real do repositório desatualizada por 3 deploys seguidos) → push em `main` e merge/push em `stable`
- **`audit.sh`** — mesma validação, pensada para ser chamada por um agente sem supervisão linha a linha (Claude Code, cron, CI). Código de saída `0` = tudo verde, `1` = há problema real
- **Rotina diária opcional** — cron local chamando `claude -p` em modo `--permission-mode dontAsk`, que audita, corrige bugs simples (com teste de regressão) e publica sozinha; qualquer coisa que toque schema, RLS ou autenticação é escalada para revisão humana em vez de corrigida automaticamente

---

## 7. Histórico de bugs resolvidos (para não repetir)

1. Template literals aninhados quebravam telas silenciosamente
2. `// AUTH SYSTEM` como âncora de refatoração causava perda de funções vizinhas
3. `loadAllUsers` sobrescrevia edições locais com dados stale — corrigido com merge "local-wins"
4. Funções de sync engoliam erros silenciosamente — agora retornam `true`/`false` honestamente
5. `approveReg` nunca sincronizava com Supabase
6. Chamadas assíncronas sem `await` causavam corrida de UI
7. Mocks de teste com `text()` não batendo com `json()` mascaravam bugs nos próprios testes
8. `sbUpsertUser` sem `on_conflict=email` permitia e-mail duplicado
9. Colunas no código sem coluna correspondente no Supabase (`PGRST204`) — resolvido com `sanitizeUserPayload` + teste estrutural S03
10. **SWOT, Visão de Futuro, GROW, Kanban, Fase A e DISC gravavam em chave global** — mentor e mentorado (ou dois mentorados no mesmo navegador) misturavam dados entre si. Corrigido com escopo `chave__email__ciclo` + guardrail S04
11. **Metade das tabelas do Supabase não existiam de fato** (`cycles` entre elas) — a plataforma rodava inteiramente em `localStorage`, com escritas falhando em silêncio. Descoberto ao tentar aplicar o schema; corrigido com `CREATE TABLE IF NOT EXISTS` em vez de assumir existência
12. **RLS bloqueava as tabelas novas** sem nenhuma política — corrigido com política `anon_all` explícita (ver risco de segurança na seção 4.5)
13. **`calculateStreak` não quebrava corretamente ao pular uma semana** — contava sequência inteira mesmo com buraco no meio. Corrigido com regressão de teste (P02)
14. **`saveDISCProfile` tentava gravar em `users.disc_natural`/`disc_adaptado`**, campos nunca whitelisted — o PATCH saía sempre vazio, silenciosamente. Removido; `disc_profiles` é a única fonte agora
15. **`deploy.sh` só commitava `index.html`** — 3 deploys seguidos publicaram a plataforma sem versionar a suíte de testes real, deixando qualquer sessão nova com uma suíte desatualizada sem perceber

---

## 8. O que ainda está pendente

- **Painel twin do mentor** — infraestrutura de backend pronta, interface não construída
- **Migração para Supabase Auth + RLS restritivo** — bloqueador explícito antes de B2B multi-empresa
- **E-mail transacional real** — hoje é só `mailto`
- **Migração de dados antigos** — o que estava só em `localStorage` antes da reestruturação de backend não subiu retroativamente; só dados preenchidos a partir de agora vão ao Supabase
- **Migrar de single-file HTML (10.600+ linhas)** para estrutura modular — teto de manutenibilidade tranquila se aproximando
- **Fase A (Aferir)** merece o mesmo nível de polimento que G/U/I receberam
- **Certificação de mentores** — `checkMentorCertification()` existe, falta o fluxo de emissão
- **Scaling do programa** — formação de mentores (mindset, simulação com feedback, calibração pós-sessão), certificação/licenciamento, três A/B tests prioritários (duração do kick-off, autodiagnóstico síncrono vs. assíncrono, frequência de aferição)

---

## 9. Credenciais e acesso (referência rápida)

| Item | Valor |
|---|---|
| Repo | `github.com/luizarcala-tech/mentoriaguia` |
| Branches | `main` (dev) / `stable` (produção) |
| Supabase | `pzpbtbbbwbjzlghducxs.supabase.co` |
| Edge Function IA | `ai-proxy` — **Enforce JWT Verification desativado**, senão o Supabase rejeita a chamada |
| Admin | `luizarcala@outlook.com` |
| Deploy | `./deploy.sh "mensagem"` |
| Auditoria | `./audit.sh` (sem publicar) / `./audit.sh --deploy "mensagem"` (audita e publica se passar) |

Tokens e chaves não são reproduzidos aqui de propósito — vivem em `~/.arcala_env` (fora do repositório) ou na sessão de trabalho ativa, nunca em arquivo versionado.
