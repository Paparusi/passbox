-- PassBox Migration 004: Environments
-- Adds environment support (dev / staging / production) to vaults

-- ─── Environments Table ────────────────────────────
CREATE TABLE environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(vault_id, name)
);

CREATE INDEX idx_environments_vault ON environments(vault_id);

-- ─── Add environment_id to secrets ─────────────────
ALTER TABLE secrets ADD COLUMN environment_id UUID REFERENCES environments(id) ON DELETE CASCADE;

-- ─── Create default "development" environment for every existing vault ──
INSERT INTO environments (vault_id, name, is_default, created_by)
SELECT id, 'development', true, created_by FROM vaults;

-- ─── Backfill existing secrets with default environment ──
UPDATE secrets SET environment_id = (
  SELECT e.id FROM environments e
  WHERE e.vault_id = secrets.vault_id AND e.is_default = true
);

-- ─── Make environment_id NOT NULL ──────────────────
ALTER TABLE secrets ALTER COLUMN environment_id SET NOT NULL;

-- ─── Update unique constraint: same name allowed in different environments ──
ALTER TABLE secrets DROP CONSTRAINT secrets_vault_id_name_key;
ALTER TABLE secrets ADD CONSTRAINT secrets_vault_env_name_key UNIQUE(vault_id, environment_id, name);

CREATE INDEX idx_secrets_environment ON secrets(environment_id);

-- ─── RLS for environments ──────────────────────────
ALTER TABLE environments ENABLE ROW LEVEL SECURITY;

-- Environments: visible to vault members
CREATE POLICY "environments_select" ON environments
  FOR SELECT USING (
    vault_id IN (SELECT vault_id FROM vault_members WHERE user_id = auth.uid())
  );

-- Environments: creatable by vault members (not viewers)
CREATE POLICY "environments_insert" ON environments
  FOR INSERT WITH CHECK (
    vault_id IN (
      SELECT vault_id FROM vault_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );

-- Environments: updatable by admin+
CREATE POLICY "environments_update" ON environments
  FOR UPDATE USING (
    vault_id IN (
      SELECT vault_id FROM vault_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Environments: deletable by admin+ (only non-default)
CREATE POLICY "environments_delete" ON environments
  FOR DELETE USING (
    is_default = false AND
    vault_id IN (
      SELECT vault_id FROM vault_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ─── updated_at trigger ───────────────────────────
CREATE TRIGGER environments_updated_at BEFORE UPDATE ON environments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
