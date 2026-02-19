-- PassBox Migration 005: Webhooks & Secret Rotation
-- Adds webhook notifications and secret rotation configuration

-- ─── Webhooks Table ────────────────────────────────
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  signing_secret TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_triggered_at TIMESTAMPTZ,
  UNIQUE(vault_id, name)
);

CREATE INDEX idx_webhooks_vault ON webhooks(vault_id);

-- ─── Rotation Configs Table ────────────────────────
CREATE TABLE rotation_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_id UUID NOT NULL REFERENCES secrets(id) ON DELETE CASCADE UNIQUE,
  interval_hours INT NOT NULL DEFAULT 720,
  last_rotated_at TIMESTAMPTZ,
  next_rotation_at TIMESTAMPTZ,
  webhook_id UUID REFERENCES webhooks(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rotation_configs_secret ON rotation_configs(secret_id);
CREATE INDEX idx_rotation_configs_next ON rotation_configs(next_rotation_at) WHERE enabled = true;

-- ─── RLS ───────────────────────────────────────────
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rotation_configs ENABLE ROW LEVEL SECURITY;

-- Webhooks: visible to vault members
CREATE POLICY "webhooks_select" ON webhooks
  FOR SELECT USING (
    vault_id IN (SELECT vault_id FROM vault_members WHERE user_id = auth.uid())
  );

CREATE POLICY "webhooks_insert" ON webhooks
  FOR INSERT WITH CHECK (
    vault_id IN (
      SELECT vault_id FROM vault_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "webhooks_update" ON webhooks
  FOR UPDATE USING (
    vault_id IN (
      SELECT vault_id FROM vault_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "webhooks_delete" ON webhooks
  FOR DELETE USING (
    vault_id IN (
      SELECT vault_id FROM vault_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Rotation configs: accessible via secret's vault membership
CREATE POLICY "rotation_configs_select" ON rotation_configs
  FOR SELECT USING (
    secret_id IN (
      SELECT s.id FROM secrets s
      JOIN vault_members vm ON vm.vault_id = s.vault_id
      WHERE vm.user_id = auth.uid()
    )
  );

CREATE POLICY "rotation_configs_insert" ON rotation_configs
  FOR INSERT WITH CHECK (
    secret_id IN (
      SELECT s.id FROM secrets s
      JOIN vault_members vm ON vm.vault_id = s.vault_id
      WHERE vm.user_id = auth.uid() AND vm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "rotation_configs_update" ON rotation_configs
  FOR UPDATE USING (
    secret_id IN (
      SELECT s.id FROM secrets s
      JOIN vault_members vm ON vm.vault_id = s.vault_id
      WHERE vm.user_id = auth.uid() AND vm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "rotation_configs_delete" ON rotation_configs
  FOR DELETE USING (
    secret_id IN (
      SELECT s.id FROM secrets s
      JOIN vault_members vm ON vm.vault_id = s.vault_id
      WHERE vm.user_id = auth.uid() AND vm.role IN ('owner', 'admin')
    )
  );
