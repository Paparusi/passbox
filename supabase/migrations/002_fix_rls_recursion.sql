-- Fix infinite recursion in RLS policies
-- Problem: policies on vault_members/org_members reference themselves

-- Helper functions (SECURITY DEFINER bypasses RLS)
create or replace function get_user_vault_ids(uid uuid)
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select vault_id from vault_members where user_id = uid;
$$;

create or replace function get_user_vault_role(uid uuid, vid uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from vault_members where user_id = uid and vault_id = vid limit 1;
$$;

create or replace function get_user_org_ids(uid uuid)
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select org_id from org_members where user_id = uid;
$$;

create or replace function get_user_org_role(uid uuid, oid uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from org_members where user_id = uid and org_id = oid limit 1;
$$;

-- Drop old broken policies
drop policy if exists "vault_members_select" on vault_members;
drop policy if exists "vault_members_insert_admin" on vault_members;
drop policy if exists "vault_members_update_admin" on vault_members;
drop policy if exists "vault_members_delete_admin" on vault_members;

drop policy if exists "org_members_select" on org_members;
drop policy if exists "org_members_insert_admin" on org_members;

drop policy if exists "org_select_member" on organizations;
drop policy if exists "org_update_admin" on organizations;

drop policy if exists "vaults_select_member" on vaults;
drop policy if exists "vaults_update_admin" on vaults;
drop policy if exists "vaults_delete_owner" on vaults;

drop policy if exists "secrets_select" on secrets;
drop policy if exists "secrets_insert" on secrets;
drop policy if exists "secrets_update" on secrets;
drop policy if exists "secrets_delete" on secrets;

drop policy if exists "secret_versions_select" on secret_versions;
drop policy if exists "secret_versions_insert" on secret_versions;

drop policy if exists "audit_select_admin" on audit_logs;

-- Recreate policies using helper functions (no recursion)

-- Vault members: use direct user_id check for own rows
create policy "vault_members_select" on vault_members
  for select using (user_id = auth.uid() or vault_id in (select get_user_vault_ids(auth.uid())));

create policy "vault_members_insert_admin" on vault_members
  for insert with check (
    get_user_vault_role(auth.uid(), vault_id) in ('owner', 'admin')
  );

create policy "vault_members_update_admin" on vault_members
  for update using (
    get_user_vault_role(auth.uid(), vault_id) in ('owner', 'admin')
  );

create policy "vault_members_delete_admin" on vault_members
  for delete using (
    get_user_vault_role(auth.uid(), vault_id) in ('owner', 'admin')
  );

-- Org members
create policy "org_members_select" on org_members
  for select using (user_id = auth.uid() or org_id in (select get_user_org_ids(auth.uid())));

create policy "org_members_insert_admin" on org_members
  for insert with check (
    get_user_org_role(auth.uid(), org_id) in ('owner', 'admin')
    or not exists (select 1 from org_members where org_id = org_members.org_id)
  );

-- Organizations
create policy "org_select_member" on organizations
  for select using (id in (select get_user_org_ids(auth.uid())));

create policy "org_update_admin" on organizations
  for update using (get_user_org_role(auth.uid(), id) in ('owner', 'admin'));

-- Vaults
create policy "vaults_select_member" on vaults
  for select using (id in (select get_user_vault_ids(auth.uid())));

create policy "vaults_update_admin" on vaults
  for update using (get_user_vault_role(auth.uid(), id) in ('owner', 'admin'));

create policy "vaults_delete_owner" on vaults
  for delete using (get_user_vault_role(auth.uid(), id) = 'owner');

-- Secrets
create policy "secrets_select" on secrets
  for select using (vault_id in (select get_user_vault_ids(auth.uid())));

create policy "secrets_insert" on secrets
  for insert with check (
    get_user_vault_role(auth.uid(), vault_id) in ('owner', 'admin', 'member')
  );

create policy "secrets_update" on secrets
  for update using (
    get_user_vault_role(auth.uid(), vault_id) in ('owner', 'admin', 'member')
  );

create policy "secrets_delete" on secrets
  for delete using (
    get_user_vault_role(auth.uid(), vault_id) in ('owner', 'admin')
  );

-- Secret versions
create policy "secret_versions_select" on secret_versions
  for select using (
    secret_id in (
      select s.id from secrets s
      where s.vault_id in (select get_user_vault_ids(auth.uid()))
    )
  );

create policy "secret_versions_insert" on secret_versions
  for insert with check (
    secret_id in (
      select s.id from secrets s
      where get_user_vault_role(auth.uid(), s.vault_id) in ('owner', 'admin', 'member')
    )
  );

-- Audit logs
create policy "audit_select_admin" on audit_logs
  for select using (
    org_id in (
      select oid from (
        select get_user_org_ids(auth.uid()) as oid
      ) sub
      where get_user_org_role(auth.uid(), oid) in ('owner', 'admin')
    )
  );
