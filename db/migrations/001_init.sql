-- Schéma initial de TerriScope.
CREATE EXTENSION IF NOT EXISTS postgis;

-- Rôle sans connexion : l'API l'endosse pour toute requête sur les données clientes.
-- Il n'est pas propriétaire des tables, la Row Level Security s'applique donc à lui.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'terriscope_app') THEN
    CREATE ROLE terriscope_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

CREATE TABLE plans (
  code                text PRIMARY KEY CHECK (code IN ('free','pro','business','enterprise')),
  name                text NOT NULL,
  max_members         integer,
  max_datasets        integer,
  max_features        integer,
  monthly_analyses    integer,
  can_import          boolean NOT NULL,
  can_share           boolean NOT NULL
);
-- NULL signifie « sans limite ». Limites provisoires, à confirmer avec la grille tarifaire.
INSERT INTO plans VALUES
  ('free',       'Free',       1,    0,    0,       10,   false, false),
  ('pro',        'Pro',        1,    20,   50000,   500,  true,  false),
  ('business',   'Business',   10,   100,  250000,  5000, true,  true),
  ('enterprise', 'Enterprise', NULL, NULL, NULL,    NULL, true,  true);

CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('owner','analyst','viewer')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE TABLE sessions (
  token_hash       text PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at       timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE subscriptions (
  organization_id  uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  plan_code        text NOT NULL REFERENCES plans(code),
  status           text NOT NULL CHECK (status IN ('trialing','active','canceled')),
  trial_ends_at    timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE usage_events (
  id               bigserial PRIMARY KEY,
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_events_org_idx ON usage_events (organization_id, kind, created_at);

CREATE TABLE invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount_cents     integer NOT NULL CHECK (amount_cents >= 0),
  currency         text NOT NULL DEFAULT 'MAD',
  status           text NOT NULL CHECK (status IN ('test','draft','paid','void')),
  issued_at        timestamptz NOT NULL DEFAULT now()
);

-- Référentiel commun, en lecture seule pour l'application.
CREATE TABLE admin_areas (
  id          bigserial PRIMARY KEY,
  level       text NOT NULL CHECK (level IN ('region','province','commune')),
  code        text NOT NULL UNIQUE,
  name_fr     text NOT NULL,
  name_ar     text,
  parent_id   bigint REFERENCES admin_areas(id),
  geom        geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX admin_areas_geom_idx ON admin_areas USING gist (geom);

CREATE TABLE datasets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  kind             text NOT NULL CHECK (kind IN ('service','competitor','candidate','population')),
  source           text NOT NULL,
  source_date      date NOT NULL,
  is_demo          boolean NOT NULL DEFAULT false,
  feature_count    integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX datasets_org_idx ON datasets (organization_id);

CREATE TABLE features (
  id               bigserial PRIMARY KEY,
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  dataset_id       uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  name             text NOT NULL,
  population       double precision CHECK (population >= 0),
  households       double precision CHECK (households >= 0),
  territory        text,
  geom             geometry(Point, 4326) NOT NULL
);
CREATE INDEX features_dataset_idx ON features (dataset_id);
CREATE INDEX features_geog_idx ON features USING gist ((geom::geography));

CREATE TABLE projects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE scenarios (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE analyses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scenario_id      uuid REFERENCES scenarios(id) ON DELETE SET NULL,
  kind             text NOT NULL,
  parameters       jsonb NOT NULL,
  method_version   text NOT NULL,
  dataset_ids      uuid[] NOT NULL,
  result           jsonb NOT NULL,
  created_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analyses_org_idx ON analyses (organization_id, created_at DESC);
CREATE TABLE reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  analysis_id      uuid REFERENCES analyses(id) ON DELETE SET NULL,
  title            text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shares (
  token_hash       text PRIMARY KEY,
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_id        uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  expires_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Isolation par organisation sur toutes les données clientes.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subscriptions','usage_events','invoices','datasets','features','projects','scenarios','analyses','reports','shares'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY org_isolation ON %I TO terriscope_app
      USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
      WITH CHECK (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)$p$, t);
    -- Le propriétaire n'accède à ces tables que pour créer un compte et lors des migrations.
    EXECUTE format('CREATE POLICY owner_access ON %I TO CURRENT_USER USING (true) WITH CHECK (true)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO terriscope_app', t);
  END LOOP;
END $$;
GRANT SELECT ON plans, admin_areas TO terriscope_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO terriscope_app;
