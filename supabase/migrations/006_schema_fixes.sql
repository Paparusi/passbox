-- ══════════════════════════════════════════════════════════════════════
-- Migration 006: Schema fixes from security audit
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. Enable RLS on waitlist ──────────────────────────────────────────
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "waitlist_insert_public" ON waitlist
  FOR INSERT WITH CHECK (true);
-- SELECT/DELETE/UPDATE default-deny for authenticated users (service role only)

-- ── 2. Subscription write policies (explicit deny for normal roles) ────
CREATE POLICY "subscriptions_insert_deny" ON subscriptions
  FOR INSERT WITH CHECK (false);
CREATE POLICY "subscriptions_update_deny" ON subscriptions
  FOR UPDATE USING (false);
CREATE POLICY "subscriptions_delete_deny" ON subscriptions
  FOR DELETE USING (false);

-- ── 3. Audit log FK constraints ───────────────────────────────────────
ALTER TABLE audit_logs
  ADD CONSTRAINT fk_audit_logs_user
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE audit_logs
  ADD CONSTRAINT fk_audit_logs_token
  FOREIGN KEY (token_id) REFERENCES service_tokens(id) ON DELETE SET NULL;

-- ── 4. Fix created_by FKs to use SET NULL on user deletion ───────────
-- vaults
ALTER TABLE vaults DROP CONSTRAINT IF EXISTS vaults_created_by_fkey;
ALTER TABLE vaults ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE vaults ADD CONSTRAINT vaults_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- vault_members.granted_by
ALTER TABLE vault_members DROP CONSTRAINT IF EXISTS vault_members_granted_by_fkey;
ALTER TABLE vault_members ADD CONSTRAINT vault_members_granted_by_fkey
  FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- environments
ALTER TABLE environments DROP CONSTRAINT IF EXISTS environments_created_by_fkey;
ALTER TABLE environments ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE environments ADD CONSTRAINT environments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- webhooks
ALTER TABLE webhooks DROP CONSTRAINT IF EXISTS webhooks_created_by_fkey;
ALTER TABLE webhooks ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE webhooks ADD CONSTRAINT webhooks_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 5. Add updated_at to tables missing it ────────────────────────────
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE TRIGGER webhooks_updated_at BEFORE UPDATE ON webhooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE rotation_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE TRIGGER rotation_configs_updated_at BEFORE UPDATE ON rotation_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- subscriptions: has column but no trigger
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 6. Fix subscriptions nullable columns ────────────────────────────
ALTER TABLE subscriptions ALTER COLUMN cancel_at_period_end SET NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN updated_at SET NOT NULL;

-- ── 7. Fix waitlist nullable columns ─────────────────────────────────
ALTER TABLE waitlist ALTER COLUMN source SET NOT NULL;
ALTER TABLE waitlist ALTER COLUMN created_at SET NOT NULL;

-- ── 8. Missing indexes ────────────────────────────────────────────────
-- (vault_id, name) for routes that omit environment_id
CREATE INDEX IF NOT EXISTS idx_secrets_vault_name ON secrets(vault_id, name);

-- Default environment lookup (very hot path)
-- Also enforces single-default-per-vault at DB level
CREATE UNIQUE INDEX IF NOT EXISTS idx_environments_vault_default
  ON environments(vault_id) WHERE is_default = true;

-- Subscription status filter (admin stats)
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Audit log filters
CREATE INDEX IF NOT EXISTS idx_audit_resource_type ON audit_logs(resource_type)
  WHERE resource_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

-- Service token org lookup
CREATE INDEX IF NOT EXISTS idx_service_tokens_org ON service_tokens(org_id)
  WHERE org_id IS NOT NULL;

-- ── 9. secret_versions uniqueness ────────────────────────────────────
ALTER TABLE secret_versions ADD CONSTRAINT secret_versions_secret_version_key
  UNIQUE(secret_id, version);

-- ── 10. permissions CHECK constraint ─────────────────────────────────
ALTER TABLE service_tokens ADD CONSTRAINT service_tokens_permissions_valid
  CHECK (permissions <@ ARRAY['read','write','list','delete']::text[]);

-- ── 11. Vault deletion cascade for service_token vault_ids array ──────
CREATE OR REPLACE FUNCTION clean_service_token_vault_ids()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE service_tokens
  SET vault_ids = array_remove(vault_ids, OLD.id)
  WHERE OLD.id = ANY(vault_ids);
  RETURN OLD;
END;
$$;

CREATE TRIGGER vault_deleted_clean_tokens
  AFTER DELETE ON vaults
  FOR EACH ROW EXECUTE FUNCTION clean_service_token_vault_ids();

-- ── 12. Fix environments/webhooks/rotation_configs RLS to use helpers ─

-- environments
DROP POLICY IF EXISTS "environments_select" ON environments;
DROP POLICY IF EXISTS "environments_insert" ON environments;
DROP POLICY IF EXISTS "environments_update" ON environments;
DROP POLICY IF EXISTS "environments_delete" ON environments;

CREATE POLICY "environments_select" ON environments
  FOR SELECT USING (vault_id IN (SELECT get_user_vault_ids(auth.uid())));
CREATE POLICY "environments_insert" ON environments
  FOR INSERT WITH CHECK (
    get_user_vault_role(auth.uid(), vault_id) IN ('owner', 'admin', 'member')
  );
CREATE POLICY "environments_update" ON environments
  FOR UPDATE USING (
    get_user_vault_role(auth.uid(), vault_id) IN ('owner', 'admin')
  );
CREATE POLICY "environments_delete" ON environments
  FOR DELETE USING (
    is_default = false AND
    get_user_vault_role(auth.uid(), vault_id) IN ('owner', 'admin')
  );

-- webhooks
DROP POLICY IF EXISTS "webhooks_select" ON webhooks;
DROP POLICY IF EXISTS "webhooks_insert" ON webhooks;
DROP POLICY IF EXISTS "webhooks_update" ON webhooks;
DROP POLICY IF EXISTS "webhooks_delete" ON webhooks;

CREATE POLICY "webhooks_select" ON webhooks
  FOR SELECT USING (vault_id IN (SELECT get_user_vault_ids(auth.uid())));
CREATE POLICY "webhooks_insert" ON webhooks
  FOR INSERT WITH CHECK (
    get_user_vault_role(auth.uid(), vault_id) IN ('owner', 'admin')
  );
CREATE POLICY "webhooks_update" ON webhooks
  FOR UPDATE USING (
    get_user_vault_role(auth.uid(), vault_id) IN ('owner', 'admin')
  );
CREATE POLICY "webhooks_delete" ON webhooks
  FOR DELETE USING (
    get_user_vault_role(auth.uid(), vault_id) IN ('owner', 'admin')
  );

-- rotation_configs
DROP POLICY IF EXISTS "rotation_configs_select" ON rotation_configs;
DROP POLICY IF EXISTS "rotation_configs_insert" ON rotation_configs;
DROP POLICY IF EXISTS "rotation_configs_update" ON rotation_configs;
DROP POLICY IF EXISTS "rotation_configs_delete" ON rotation_configs;

CREATE POLICY "rotation_configs_select" ON rotation_configs
  FOR SELECT USING (
    secret_id IN (
      SELECT s.id FROM secrets s
      WHERE s.vault_id IN (SELECT get_user_vault_ids(auth.uid()))
    )
  );
CREATE POLICY "rotation_configs_insert" ON rotation_configs
  FOR INSERT WITH CHECK (
    secret_id IN (
      SELECT s.id FROM secrets s
      WHERE get_user_vault_role(auth.uid(), s.vault_id) IN ('owner', 'admin')
    )
  );
CREATE POLICY "rotation_configs_update" ON rotation_configs
  FOR UPDATE USING (
    secret_id IN (
      SELECT s.id FROM secrets s
      WHERE get_user_vault_role(auth.uid(), s.vault_id) IN ('owner', 'admin')
    )
  );
CREATE POLICY "rotation_configs_delete" ON rotation_configs
  FOR DELETE USING (
    secret_id IN (
      SELECT s.id FROM secrets s
      WHERE get_user_vault_role(auth.uid(), s.vault_id) IN ('owner', 'admin')
    )
  );
