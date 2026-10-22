CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Projeler Tablosu
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY,
  code varchar(50) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  timezone varchar(50) NOT NULL DEFAULT 'Europe/Istanbul',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Mahaller (Locations / Restrooms) Tablosu
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  code varchar(60) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  building varchar(120) NOT NULL DEFAULT 'Ana Bina',
  token varchar(120) NOT NULL UNIQUE,
  tolerance_minutes int NOT NULL DEFAULT 15,
  schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_supervisor_id varchar(120),
  current_supervisor_name varchar(120),
  backup_supervisor_id varchar(120),
  backup_supervisor_name varchar(120),
  status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS locations_token_idx ON locations(token);
CREATE INDEX IF NOT EXISTS locations_code_idx ON locations(code);

-- Geriye dönük view (varsa eski sorgular için)
CREATE OR REPLACE VIEW restrooms AS
  SELECT id, name, building, created_at FROM locations;

-- 3. Sürümlü Checklist Şablonları
CREATE TABLE IF NOT EXISTS checklist_templates (
  id uuid PRIMARY KEY,
  version_tag varchar(50) NOT NULL DEFAULT 'v1.2',
  title varchar(120) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Checklist Maddeleri
CREATE TABLE IF NOT EXISTS checklist_items (
  id uuid PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  item_order int NOT NULL,
  item_text varchar(255) NOT NULL
);

-- 5. Temizlik Beyan Kayıtları (Cleaning Records)
CREATE TABLE IF NOT EXISTS cleaning_records (
  id uuid PRIMARY KEY,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  staff_user_id varchar(120) NOT NULL,
  staff_name varchar(120) NOT NULL,
  planned_slot varchar(20) NOT NULL,
  actual_time varchar(20) NOT NULL,
  sla_status varchar(30) NOT NULL DEFAULT 'ON_TIME',
  diff_minutes int NOT NULL DEFAULT 0,
  tasks_confirmed boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cleaning_records_location_created_idx
  ON cleaning_records(location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cleaning_records_created_idx
  ON cleaning_records(created_at DESC);

-- 6. Şef Saha Denetimleri (Supervisor Audits)
CREATE TABLE IF NOT EXISTS supervisor_audits (
  id uuid PRIMARY KEY,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  supervisor_id varchar(120) NOT NULL,
  supervisor_name varchar(120) NOT NULL,
  template_id uuid REFERENCES checklist_templates(id) ON DELETE SET NULL,
  template_version varchar(50) NOT NULL DEFAULT 'v1.2',
  is_approved boolean NOT NULL,
  checklist_json jsonb NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supervisor_audits_location_created_idx
  ON supervisor_audits(location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS supervisor_audits_created_idx
  ON supervisor_audits(created_at DESC);

-- 7. Kapalı Çevrim Olaylar (Incidents)
CREATE TABLE IF NOT EXISTS incidents (
  id varchar(60) PRIMARY KEY,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  status varchar(30) NOT NULL DEFAULT 'OPEN',
  issues_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  signal_count int NOT NULL DEFAULT 1,
  current_sup_id varchar(120),
  current_sup_name varchar(120),
  backup_sup_id varchar(120),
  backup_sup_name varchar(120),
  assigned_staff_id varchar(120),
  assigned_staff_name varchar(120),
  is_escalated boolean NOT NULL DEFAULT false,
  time varchar(20) NOT NULL,
  resolved_at varchar(20),
  resolved_at_utc timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS incidents_location_idx ON incidents(location_id);
CREATE INDEX IF NOT EXISTS incidents_status_idx ON incidents(status);
CREATE INDEX IF NOT EXISTS incidents_created_idx ON incidents(created_at DESC);

-- 8. Bildirim İletim Logları (Notification Dispatch)
CREATE TABLE IF NOT EXISTS notification_dispatch (
  id uuid PRIMARY KEY,
  incident_id varchar(60) NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  recipient_user_id varchar(120) NOT NULL,
  recipient_name varchar(120) NOT NULL,
  channel varchar(50) NOT NULL DEFAULT 'WebPush / InApp',
  status varchar(30) NOT NULL DEFAULT 'DELIVERED',
  sent_time_utc timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_dispatch_incident_idx
  ON notification_dispatch(incident_id);

-- 9. Ziyaretçi Geri Bildirimleri (Survey Feedbacks)
CREATE TABLE IF NOT EXISTS survey_feedbacks (
  id uuid PRIMARY KEY,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  rating varchar(20) NOT NULL,
  issues_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  client_hash varchar(128),
  time varchar(20) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS survey_feedbacks_location_created_idx
  ON survey_feedbacks(location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS survey_feedbacks_created_idx
  ON survey_feedbacks(created_at DESC);

-- 10. Denetim İzi (Audit Trail)
CREATE TABLE IF NOT EXISTS audit_trail (
  id uuid PRIMARY KEY,
  timestamp varchar(20) NOT NULL,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  action varchar(60) NOT NULL,
  user_role varchar(60) NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_trail_created_idx ON audit_trail(created_at DESC);

-- 11. Push Abonelikleri
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY,
  endpoint varchar(2048) NOT NULL UNIQUE,
  keys jsonb NOT NULL,
  supervisor_id varchar(120) NOT NULL
);

-- 12. Sistem Kullanıcıları (App Users)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  full_name varchar(120) NOT NULL,
  username varchar(60) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  role varchar(30) NOT NULL DEFAULT 'employee',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);

