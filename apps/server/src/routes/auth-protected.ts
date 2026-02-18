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
