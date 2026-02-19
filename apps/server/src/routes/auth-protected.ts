import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { Errors } from '../lib/errors.js';

type AuthEnv = {
  Variables: {
    userId: string;
  };
};

const authProtected = new Hono<AuthEnv>();

// ─── Get User Keys ─────────────────────────────────
authProtected.get('/keys', async (c) => {
  const userId = c.get('userId');
  const supabase = getSupabaseAdmin();

  const { data: keys, error } = await supabase
    .from('user_keys')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !keys) {
    throw Errors.notFound('User keys');
  }

  return c.json({
    success: true,
    data: {
      publicKey: keys.public_key,
      encryptedPrivateKey: keys.encrypted_private_key,
      encryptedMasterKeyRecovery: keys.encrypted_master_key_recovery,
      keyDerivationSalt: keys.key_derivation_salt,
      keyDerivationParams: keys.key_derivation_params,
    },
  });
});

// ─── Setup Keys (for OAuth users) ─────────────────
const setupKeysSchema = z.object({
  publicKey: z.string().max(10_000),
  encryptedPrivateKey: z.string().max(10_000),
  encryptedMasterKeyRecovery: z.string().max(10_000),
  keyDerivationSalt: z.string().max(1_000),
  keyDerivationParams: z.object({
    iterations: z.number().int().min(1).max(100),
    memory: z.number().int().min(1024).max(1_048_576),
    parallelism: z.number().int().min(1).max(16),
  }),
});

authProtected.post('/setup-keys', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const data = setupKeysSchema.parse(body);
  const supabase = getSupabaseAdmin();

  // Prevent overwriting existing keys
  const { data: existingKeys } = await supabase
    .from('user_keys')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (existingKeys) {
    throw Errors.conflict('Encryption keys already exist for this user');
  }

  // Store encryption keys
  await supabase.from('user_keys').insert({
    user_id: userId,
    public_key: data.publicKey,
    encrypted_private_key: data.encryptedPrivateKey,
    encrypted_master_key_recovery: data.encryptedMasterKeyRecovery,
    key_derivation_salt: data.keyDerivationSalt,
    key_derivation_params: data.keyDerivationParams,
  });

  // Create personal organization if none exists
  const { data: existingMembership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  let orgId = existingMembership?.org_id;

  if (!orgId) {
    const { data: org } = await supabase
      .from('organizations')
      .insert({ name: 'Personal', slug: `personal-${userId.slice(0, 8)}` })
      .select()
      .single();

    if (org) {
      await supabase.from('org_members').insert({
        org_id: org.id,
        user_id: userId,
        role: 'owner',
      });
      orgId = org.id;
    }
  }

  return c.json({
    success: true,
    data: { orgId },
  }, 201);
});

// ─── Change Password ─────────────────────────────────
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine(p => /[a-z]/.test(p), 'Password must contain a lowercase letter')
  .refine(p => /[A-Z]/.test(p), 'Password must contain an uppercase letter')
  .refine(p => /[0-9]/.test(p), 'Password must contain a number');

const changePasswordSchema = z.object({
  newPassword: passwordSchema,
  encryptedPrivateKey: z.string().max(10_000),
  encryptedMasterKeyRecovery: z.string().max(10_000),
  keyDerivationSalt: z.string().max(1_000),
  keyDerivationParams: z.object({
    iterations: z.number().int().min(1).max(100),
    memory: z.number().int().min(1024).max(1_048_576),
    parallelism: z.number().int().min(1).max(16),
  }),
});

authProtected.post('/change-password', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const data = changePasswordSchema.parse(body);
  const supabase = getSupabaseAdmin();

  // Update Supabase auth password (works for email users; harmless for OAuth users)
  await supabase.auth.admin.updateUserById(userId, {
    password: data.newPassword,
  });

  // Update encryption keys
  const { error: keysError } = await supabase
    .from('user_keys')
    .update({
      encrypted_private_key: data.encryptedPrivateKey,
      encrypted_master_key_recovery: data.encryptedMasterKeyRecovery,
      key_derivation_salt: data.keyDerivationSalt,
      key_derivation_params: data.keyDerivationParams,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (keysError) {
    throw Errors.internal('Failed to update encryption keys');
  }

  return c.json({ success: true, data: { message: 'Password changed successfully' } });
});

// ─── Delete Account ──────────────────────────────────
authProtected.delete('/account', async (c) => {
  const userId = c.get('userId');
  const supabase = getSupabaseAdmin();

  // Delete in order: secrets → vault_members → vaults → service_tokens → audit_logs → user_keys → org_members → subscriptions
  // Get user's owned vaults
  const { data: memberships } = await supabase
    .from('vault_members')
    .select('vault_id')
    .eq('user_id', userId);

  const vaultIds = memberships?.map(m => m.vault_id) || [];

  if (vaultIds.length > 0) {
    // Delete secret versions and secrets in those vaults
    await supabase.from('secret_versions').delete().in('secret_id',
      supabase.from('secrets').select('id').in('vault_id', vaultIds) as any
    );
    await supabase.from('secrets').delete().in('vault_id', vaultIds);
    await supabase.from('vault_members').delete().in('vault_id', vaultIds);
    await supabase.from('vaults').delete().in('id', vaultIds);
  }

  // Delete remaining vault memberships (shared vaults)
  await supabase.from('vault_members').delete().eq('user_id', userId);

  // Delete service tokens
  await supabase.from('service_tokens').delete().eq('user_id', userId);

  // Delete audit logs
  await supabase.from('audit_logs').delete().eq('user_id', userId);

  // Delete user keys
  await supabase.from('user_keys').delete().eq('user_id', userId);

  // Delete org memberships and empty orgs
  const { data: userOrgs } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId);

  await supabase.from('org_members').delete().eq('user_id', userId);

  // Clean up empty orgs
  if (userOrgs) {
    for (const { org_id } of userOrgs) {
      const { count } = await supabase
        .from('org_members')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', org_id);
      if (count === 0) {
        await supabase.from('organizations').delete().eq('id', org_id);
      }
    }
  }

  // Delete subscription
  await supabase.from('subscriptions').delete().eq('user_id', userId);

  // Delete Supabase auth user
  await supabase.auth.admin.deleteUser(userId);

  return c.json({ success: true, data: { message: 'Account deleted successfully' } });
});

// ─── Service Tokens (List) ──────────────────────────
authProtected.get('/service-tokens', async (c) => {
  const userId = c.get('userId');
  const supabase = getSupabaseAdmin();

  const { data: tokens } = await supabase
    .from('service_tokens')
    .select('id, name, token_prefix, vault_ids, permissions, expires_at, created_at, last_used_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return c.json({ success: true, data: tokens || [] });
});

// ─── Service Token (Create) ────────────────────────
const createTokenSchema = z.object({
  name: z.string().min(1).max(100),
  vaultIds: z.array(z.string().uuid()).max(50).optional(),
  permissions: z.array(z.enum(['read', 'write', 'list', 'delete'])),
  expiresAt: z.string().max(100).optional(),
  encryptedMasterKey: z.string().max(10_000),
});

authProtected.post('/service-token', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const data = createTokenSchema.parse(body);
  const supabase = getSupabaseAdmin();

  // Generate token
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const rawToken = 'pb_' + Array.from(tokenBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Hash for storage
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(rawToken),
  );
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Get user's org
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  const { data: tokenRecord, error } = await supabase
    .from('service_tokens')
    .insert({
      name: data.name,
      token_hash: tokenHash,
      token_prefix: rawToken.slice(0, 11),
      user_id: userId,
      org_id: membership?.org_id,
      vault_ids: data.vaultIds || [],
      permissions: data.permissions,
      encrypted_master_key: data.encryptedMasterKey,
      expires_at: data.expiresAt || null,
    })
    .select()
    .single();

  if (error) {
    throw Errors.internal(error.message);
  }

  return c.json({
    success: true,
    data: {
      token: rawToken, // Only shown once
      serviceToken: tokenRecord,
    },
  }, 201);
});

// ─── Service Token (Delete) ────────────────────────
authProtected.delete('/service-token/:id', async (c) => {
  const userId = c.get('userId');
  const tokenId = c.req.param('id');
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from('service_tokens')
    .delete()
    .eq('id', tokenId)
    .eq('user_id', userId);

  if (error) {
    throw Errors.notFound('Service token');
  }

  return c.json({ success: true });
});

export { authProtected };
