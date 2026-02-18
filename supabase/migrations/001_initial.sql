-- PassBox Database Schema
-- Zero-knowledge secrets management platform


-- ─── Organizations ───────────────────────────────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Organization Members ────────────────────────────
create table org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  unique(org_id, user_id)
);

-- ─── User Encryption Keys ───────────────────────────
-- Stores public key + encrypted private key (encrypted client-side)
-- Server NEVER has access to plaintext private key or master key
create table user_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  public_key text not null,
  encrypted_private_key text not null,
  encrypted_master_key_recovery text,
  key_derivation_salt text not null,
  key_derivation_params jsonb not null default '{"iterations":3,"memory":65536,"parallelism":4}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Vaults ──────────────────────────────────────────
create table vaults (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  description text,
  encrypted_key text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Vault Members ───────────────────────────────────
create table vault_members (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_vault_key text not null,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(vault_id, user_id)
);

-- ─── Secrets ─────────────────────────────────────────
-- Only encrypted blobs stored. Server cannot decrypt.
create table secrets (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  name text not null,
  encrypted_value text not null,
  description text,
  tags text[] not null default '{}',
  version int not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(vault_id, name)
);

-- ─── Secret Versions ─────────────────────────────────
create table secret_versions (
  id uuid primary key default gen_random_uuid(),
  secret_id uuid not null references secrets(id) on delete cascade,
  version int not null,
  encrypted_value text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- ─── Service Tokens ──────────────────────────────────
-- For CI/CD pipelines and AI agents
create table service_tokens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  vault_ids uuid[] not null default '{}',
  permissions text[] not null default '{}',
  encrypted_master_key text not null,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ─── Audit Logs ──────────────────────────────────────
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid,
  token_id uuid,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ─── Indexes ─────────────────────────────────────────
create index idx_org_members_user on org_members(user_id);
create index idx_org_members_org on org_members(org_id);
create index idx_user_keys_user on user_keys(user_id);
create index idx_vaults_org on vaults(org_id);
create index idx_vaults_created_by on vaults(created_by);
create index idx_vault_members_user on vault_members(user_id);
create index idx_vault_members_vault on vault_members(vault_id);
create index idx_secrets_vault on secrets(vault_id);
create index idx_secrets_vault_name on secrets(vault_id, name);
create index idx_secret_versions_secret on secret_versions(secret_id);
create index idx_service_tokens_hash on service_tokens(token_hash);
create index idx_service_tokens_user on service_tokens(user_id);
create index idx_audit_org_time on audit_logs(org_id, created_at desc);
create index idx_audit_user_time on audit_logs(user_id, created_at desc);

-- ─── Row Level Security ──────────────────────────────
alter table organizations enable row level security;
alter table org_members enable row level security;
alter table user_keys enable row level security;
alter table vaults enable row level security;
alter table vault_members enable row level security;
alter table secrets enable row level security;
alter table secret_versions enable row level security;
alter table service_tokens enable row level security;
alter table audit_logs enable row level security;

-- ─── RLS Policies ────────────────────────────────────

-- User keys: users can only access their own
create policy "user_keys_own" on user_keys
  for all using (auth.uid() = user_id);

-- Organizations: visible to members
create policy "org_select_member" on organizations
  for select using (
    id in (select org_id from org_members where user_id = auth.uid())
  );

create policy "org_insert" on organizations
  for insert with check (true);

create policy "org_update_admin" on organizations
  for update using (
    id in (select org_id from org_members where user_id = auth.uid() and role in ('owner', 'admin'))
  );

-- Org members: visible to org members, manageable by admin+
create policy "org_members_select" on org_members
  for select using (
    org_id in (select org_id from org_members om where om.user_id = auth.uid())
  );

create policy "org_members_insert_admin" on org_members
  for insert with check (
    org_id in (select org_id from org_members where user_id = auth.uid() and role in ('owner', 'admin'))
    or not exists (select 1 from org_members where org_id = org_members.org_id)
  );

-- Vaults: visible to vault members
create policy "vaults_select_member" on vaults
  for select using (
    id in (select vault_id from vault_members where user_id = auth.uid())
  );

create policy "vaults_insert" on vaults
  for insert with check (auth.uid() = created_by);

create policy "vaults_update_admin" on vaults
  for update using (
    id in (select vault_id from vault_members where user_id = auth.uid() and role in ('owner', 'admin'))
  );

create policy "vaults_delete_owner" on vaults
  for delete using (
    id in (select vault_id from vault_members where user_id = auth.uid() and role = 'owner')
  );

-- Vault members: visible to vault members
create policy "vault_members_select" on vault_members
  for select using (
    vault_id in (select vault_id from vault_members vm where vm.user_id = auth.uid())
  );

create policy "vault_members_insert_admin" on vault_members
  for insert with check (
    vault_id in (select vault_id from vault_members where user_id = auth.uid() and role in ('owner', 'admin'))
  );

create policy "vault_members_update_admin" on vault_members
  for update using (
    vault_id in (select vault_id from vault_members where user_id = auth.uid() and role in ('owner', 'admin'))
  );

create policy "vault_members_delete_admin" on vault_members
  for delete using (
    vault_id in (select vault_id from vault_members where user_id = auth.uid() and role in ('owner', 'admin'))
  );

-- Secrets: accessible to vault members
create policy "secrets_select" on secrets
  for select using (
    vault_id in (select vault_id from vault_members where user_id = auth.uid())
  );

create policy "secrets_insert" on secrets
  for insert with check (
    vault_id in (select vault_id from vault_members where user_id = auth.uid() and role in ('owner', 'admin', 'member'))
  );

create policy "secrets_update" on secrets
  for update using (
    vault_id in (select vault_id from vault_members where user_id = auth.uid() and role in ('owner', 'admin', 'member'))
  );

create policy "secrets_delete" on secrets
  for delete using (
    vault_id in (select vault_id from vault_members where user_id = auth.uid() and role in ('owner', 'admin'))
  );

-- Secret versions: readable by vault members
create policy "secret_versions_select" on secret_versions
  for select using (
    secret_id in (
      select s.id from secrets s
      join vault_members vm on vm.vault_id = s.vault_id
      where vm.user_id = auth.uid()
    )
  );

create policy "secret_versions_insert" on secret_versions
  for insert with check (
    secret_id in (
      select s.id from secrets s
      join vault_members vm on vm.vault_id = s.vault_id
      where vm.user_id = auth.uid() and vm.role in ('owner', 'admin', 'member')
    )
  );

-- Service tokens: users manage their own
create policy "service_tokens_own" on service_tokens
  for all using (user_id = auth.uid());

-- Audit logs: visible to org admins
create policy "audit_select_admin" on audit_logs
  for select using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "audit_insert" on audit_logs
  for insert with check (true);

-- ─── Updated_at trigger ──────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger organizations_updated_at before update on organizations
  for each row execute function update_updated_at();

create trigger user_keys_updated_at before update on user_keys
  for each row execute function update_updated_at();

create trigger vaults_updated_at before update on vaults
  for each row execute function update_updated_at();

create trigger secrets_updated_at before update on secrets
  for each row execute function update_updated_at();
