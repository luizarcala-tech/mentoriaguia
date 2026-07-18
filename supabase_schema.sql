-- ===================================================================
-- ARCALA INSIGHT - SCHEMA COMPLETO SUPABASE
--
-- Cria as tabelas que faltam e adiciona as colunas que faltam nas
-- que ja existem. Idempotente: pode ser rodado quantas vezes quiser.
--
-- Rodar no SQL Editor do painel Supabase (New query > colar > Run).
-- ===================================================================


-- -------------------------------------------------------------------
-- BLOCO 1 - TABELAS BASE
-- CREATE primeiro (caso nao existam), ALTER depois (caso existam mas
-- sem alguma coluna). Essa ordem cobre os dois cenarios.
-- -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS name              text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email             text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role              text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active            boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan              text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phase             text DEFAULT 'G';
ALTER TABLE users ADD COLUMN IF NOT EXISTS week              integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password          text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mentor_id         text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS empresa_id        text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo             text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created           text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS curriculo_texto   text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS curriculo_arquivo text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS curriculo_data    text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT now();

-- E-mail unico: exigido pelo upsert on_conflict=email do app
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(email);


CREATE TABLE IF NOT EXISTS registrations (
  id text PRIMARY KEY
);
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS name       text;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS email      text;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS plan       text;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS goal       text;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS role       text;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS status     text DEFAULT 'pending';
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS date       text;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS decided_at timestamptz;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();


CREATE TABLE IF NOT EXISTS cycles (
  id text PRIMARY KEY
);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS mentee_email  text;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS name          text;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS status        text DEFAULT 'active';
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS started_at    text;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS ends_at       text;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS competencias  jsonb DEFAULT '[]'::jsonb;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS questions_360 jsonb DEFAULT '[]'::jsonb;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS signatures    jsonb DEFAULT '{}'::jsonb;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS aditivos      jsonb DEFAULT '[]'::jsonb;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS frozen_at     text;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS frozen_by     text;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS created_at    timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_cycles_mentee ON cycles(mentee_email);


CREATE TABLE IF NOT EXISTS peer360_responses (
  id bigserial PRIMARY KEY
);
ALTER TABLE peer360_responses ADD COLUMN IF NOT EXISTS token           text;
ALTER TABLE peer360_responses ADD COLUMN IF NOT EXISTS mentee_email    text;
ALTER TABLE peer360_responses ADD COLUMN IF NOT EXISTS cycle_id        text;
ALTER TABLE peer360_responses ADD COLUMN IF NOT EXISTS avaliador       text;
ALTER TABLE peer360_responses ADD COLUMN IF NOT EXISTS avaliador_email text;
ALTER TABLE peer360_responses ADD COLUMN IF NOT EXISTS relacao         text;
ALTER TABLE peer360_responses ADD COLUMN IF NOT EXISTS scores          jsonb;
ALTER TABLE peer360_responses ADD COLUMN IF NOT EXISTS obs             text;
ALTER TABLE peer360_responses ADD COLUMN IF NOT EXISTS done            boolean DEFAULT false;
ALTER TABLE peer360_responses ADD COLUMN IF NOT EXISTS sent_at         timestamptz DEFAULT now();
ALTER TABLE peer360_responses ADD COLUMN IF NOT EXISTS responded_at    timestamptz;
CREATE INDEX IF NOT EXISTS idx_peer360_mentee ON peer360_responses(mentee_email);
CREATE UNIQUE INDEX IF NOT EXISTS uq_peer360_token ON peer360_responses(token);


-- Observacoes do mentor. instrument/target_id/kind sustentam o painel
-- twin: observacao por instrumento e comentario em card do Kanban.
CREATE TABLE IF NOT EXISTS mentor_observations (
  id bigserial PRIMARY KEY
);
ALTER TABLE mentor_observations ADD COLUMN IF NOT EXISTS mentor_email text;
ALTER TABLE mentor_observations ADD COLUMN IF NOT EXISTS mentee_email text;
ALTER TABLE mentor_observations ADD COLUMN IF NOT EXISTS cycle_id     text;
ALTER TABLE mentor_observations ADD COLUMN IF NOT EXISTS phase        text;
ALTER TABLE mentor_observations ADD COLUMN IF NOT EXISTS instrument   text;
ALTER TABLE mentor_observations ADD COLUMN IF NOT EXISTS target_id    text DEFAULT 'none';
ALTER TABLE mentor_observations ADD COLUMN IF NOT EXISTS kind         text DEFAULT 'observacao';
ALTER TABLE mentor_observations ADD COLUMN IF NOT EXISTS text         text;
ALTER TABLE mentor_observations ADD COLUMN IF NOT EXISTS created_at   timestamptz DEFAULT now();
ALTER TABLE mentor_observations ADD COLUMN IF NOT EXISTS updated_at   timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_obs_mentee ON mentor_observations(mentee_email);


-- Liberacao de fases. Colunas booleanas por fase: e o formato que o
-- app ja envia hoje (g_released, u_released, i_released, a_released).
CREATE TABLE IF NOT EXISTS phase_releases (
  id bigserial PRIMARY KEY
);
ALTER TABLE phase_releases ADD COLUMN IF NOT EXISTS mentee_email text;
ALTER TABLE phase_releases ADD COLUMN IF NOT EXISTS mentor_email text;
ALTER TABLE phase_releases ADD COLUMN IF NOT EXISTS g_released   boolean DEFAULT false;
ALTER TABLE phase_releases ADD COLUMN IF NOT EXISTS u_released   boolean DEFAULT false;
ALTER TABLE phase_releases ADD COLUMN IF NOT EXISTS i_released   boolean DEFAULT false;
ALTER TABLE phase_releases ADD COLUMN IF NOT EXISTS a_released   boolean DEFAULT false;
ALTER TABLE phase_releases ADD COLUMN IF NOT EXISTS updated_at   timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_rel_mentee ON phase_releases(mentee_email);


CREATE TABLE IF NOT EXISTS mentee_progress (
  id bigserial PRIMARY KEY
);
ALTER TABLE mentee_progress ADD COLUMN IF NOT EXISTS mentee_email text;
ALTER TABLE mentee_progress ADD COLUMN IF NOT EXISTS progress     jsonb DEFAULT '{}'::jsonb;
ALTER TABLE mentee_progress ADD COLUMN IF NOT EXISTS updated_at   timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_prog_mentee ON mentee_progress(mentee_email);


CREATE TABLE IF NOT EXISTS mapa_objetivos (
  id bigserial PRIMARY KEY
);
ALTER TABLE mapa_objetivos ADD COLUMN IF NOT EXISTS mentee_email text;
ALTER TABLE mapa_objetivos ADD COLUMN IF NOT EXISTS cycle_id     text;
ALTER TABLE mapa_objetivos ADD COLUMN IF NOT EXISTS visao        text;
ALTER TABLE mapa_objetivos ADD COLUMN IF NOT EXISTS data         jsonb DEFAULT '{}'::jsonb;
ALTER TABLE mapa_objetivos ADD COLUMN IF NOT EXISTS updated_at   timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_mapa_mentee ON mapa_objetivos(mentee_email);


-- -------------------------------------------------------------------
-- BLOCO 2 - TABELAS TIPADAS (dados agregaveis: ROI, People Analytics)
-- -------------------------------------------------------------------

-- Checkpoint semanal: pulso de energia, streak, digest do mentor
CREATE TABLE IF NOT EXISTS checkpoints (
  id           text PRIMARY KEY,
  mentee_email text NOT NULL,
  cycle_id     text,
  date         text NOT NULL,
  week         integer,
  phase        text,
  energia      integer,
  conquista    text,
  bloqueio     text,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checkpoints_mentee ON checkpoints(mentee_email);
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkpoints_dia ON checkpoints(mentee_email, date);


-- Diario de bordo: NAO exposto ao mentor (decisao de produto)
CREATE TABLE IF NOT EXISTS diario (
  id           text PRIMARY KEY,
  mentee_email text NOT NULL,
  cycle_id     text,
  date         text NOT NULL,
  time         text,
  phase        text,
  mood         integer,
  texto        text,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diario_mentee ON diario(mentee_email);


-- Competencias: 4 series por competencia por ciclo
CREATE TABLE IF NOT EXISTS competencia_scores (
  id            text PRIMARY KEY,
  mentee_email  text NOT NULL,
  cycle_id      text,
  competencia   text NOT NULL,
  score_auto    numeric,
  score_mentor  numeric,
  score_360     numeric,
  score_aferido numeric,
  mentor_email  text,
  calibrado_em  timestamptz,
  frozen        boolean DEFAULT false,
  updated_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_mentee ON competencia_scores(mentee_email);
CREATE UNIQUE INDEX IF NOT EXISTS uq_comp_ciclo
  ON competencia_scores(mentee_email, cycle_id, competencia);


-- DISC: natural (travado) e adaptado (por ciclo), com esforco percentual
CREATE TABLE IF NOT EXISTS disc_profiles (
  id           text PRIMARY KEY,
  mentee_email text NOT NULL,
  cycle_id     text,
  tipo         text NOT NULL,
  d            numeric,
  i            numeric,
  s            numeric,
  c            numeric,
  perfil       text,
  esforco      jsonb DEFAULT '{}'::jsonb,
  raw          jsonb DEFAULT '{}'::jsonb,
  locked       boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_disc_mentee ON disc_profiles(mentee_email);


CREATE TABLE IF NOT EXISTS nps_registros (
  id           text PRIMARY KEY,
  mentee_email text NOT NULL,
  cycle_id     text,
  score        integer,
  comment      text,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nps_mentee ON nps_registros(mentee_email);


CREATE TABLE IF NOT EXISTS key_results (
  id           text PRIMARY KEY,
  mentee_email text NOT NULL,
  cycle_id     text,
  objetivo     text,
  kr           text,
  meta         text,
  atingido     numeric,
  done         boolean DEFAULT false,
  updated_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kr_mentee ON key_results(mentee_email);


CREATE TABLE IF NOT EXISTS training_progress (
  id         text PRIMARY KEY,
  user_email text NOT NULL,
  lesson_id  integer,
  completed  boolean DEFAULT false,
  score      numeric,
  answers    jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_training ON training_progress(user_email, lesson_id);


-- -------------------------------------------------------------------
-- BLOCO 3 - TABELA GENERICA VERSIONADA
-- Instrumentos qualitativos: swot, vf, grow, microplano, fase_a,
-- termo_mentoria, comp_radar, inicio_ciclo.
-- Cada save cria uma nova versao. Historico acumulado, nada e perdido.
-- -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS instrument_data (
  id           text PRIMARY KEY,
  mentee_email text NOT NULL,
  cycle_id     text,
  instrument   text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  version      integer DEFAULT 1,
  is_current   boolean DEFAULT true,
  updated_by   text,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_instr_lookup
  ON instrument_data(mentee_email, instrument, cycle_id);
CREATE INDEX IF NOT EXISTS idx_instr_current
  ON instrument_data(mentee_email, instrument) WHERE is_current;


CREATE TABLE IF NOT EXISTS empresas (
  id         text PRIMARY KEY,
  nome       text NOT NULL,
  setor      text,
  cnpj       text,
  contato    text,
  ativa      boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);


-- Trilha de auditoria: quem mudou o que (necessario para B2B)
CREATE TABLE IF NOT EXISTS audit_log (
  id         bigserial PRIMARY KEY,
  actor      text,
  action     text,
  entity     text,
  entity_id  text,
  meta       jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);


-- ===================================================================
-- BLOCO 4 - RLS
-- ATENCAO: a plataforma hoje usa a anon key sem autenticacao JWT real.
-- Habilitar RLS com politicas restritivas QUEBRARA o app ate que a
-- autenticacao Supabase Auth seja implementada.
-- As linhas abaixo estao COMENTADAS de proposito.
-- NAO descomente antes de migrar o login para Supabase Auth.
-- ===================================================================

-- ALTER TABLE checkpoints        ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE diario             ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE competencia_scores ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE disc_profiles      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE instrument_data    ENABLE ROW LEVEL SECURITY;


-- ===================================================================
-- VERIFICACAO - rode depois para conferir o resultado
-- ===================================================================
-- SELECT table_name, count(*) AS colunas
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
-- GROUP BY table_name ORDER BY table_name;
