import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { Errors } from '../lib/errors.js';

type AuthEnv = {
  Variables: {
    userId: string;
  };
};

const auth = new Hono<AuthEnv>();

// ─── Register ──────────────────────────────────────
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  publicKey: z.string(),
  encryptedPrivateKey: z.string(),
  encryptedMasterKeyRecovery: z.string(),
  keyDerivationSalt: z.string(),
  keyDerivationParams: z.object({
    iterations: z.number(),
    memory: z.number(),
    parallelism: z.number(),
  }),
});

auth.post('/register', async (c) => {
  const body = await c.req.json();
  const data = registerSchema.parse(body);
  const supabase = getSupabaseAdmin();

  // Create user in Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
  });

  if (authError) {
    throw Errors.conflict(authError.message);
  }

  const userId = authData.user.id;

  // Create personal organization
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
  }

  // Store user encryption keys
  await supabase.from('user_keys').insert({
    user_id: userId,
    public_key: data.publicKey,
    encrypted_private_key: data.encryptedPrivateKey,
    encrypted_master_key_recovery: data.encryptedMasterKeyRecovery,
    key_derivation_salt: data.keyDerivationSalt,
    key_derivation_params: data.keyDerivationParams,
  });

  // Sign in to get tokens
  const { data: session, error: signInError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: data.email,
  });

  // Generate session directly
  const { data: signIn } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });

  return c.json({
    success: true,
    data: {
      user: { id: userId, email: data.email },
      session: signIn?.session ? {
        accessToken: signIn.session.access_token,
        refreshToken: signIn.session.refresh_token,
        expiresAt: new Date(signIn.session.expires_at! * 1000).toISOString(),
      } : null,
      orgId: org?.id,
    },
  }, 201);
});

// ─── Login ─────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

auth.post('/login', async (c) => {
  const body = await c.req.json();
  const data = loginSchema.parse(body);
  const supabase = getSupabaseAdmin();

  const { data: signIn, error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });

  if (error || !signIn.session) {
    throw Errors.unauthorized();
  }

  // Fetch user keys for client-side decryption
  const { data: keys } = await supabase
    .from('user_keys')
    .select('*')
    .eq('user_id', signIn.user.id)
    .single();

  return c.json({
    success: true,
    data: {
      user: { id: signIn.user.id, email: signIn.user.email },
      session: {
        accessToken: signIn.session.access_token,
        refreshToken: signIn.session.refresh_token,
        expiresAt: new Date(signIn.session.expires_at! * 1000).toISOString(),
      },
      keys: keys ? {
        publicKey: keys.public_key,
        encryptedPrivateKey: keys.encrypted_private_key,
        keyDerivationSalt: keys.key_derivation_salt,
        keyDerivationParams: keys.key_derivation_params,
      } : null,
    },
  });
});

// ─── Refresh Token ─────────────────────────────────
auth.post('/refresh', async (c) => {
  const { refreshToken } = await c.req.json();
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session) {
    throw Errors.unauthorized();
  }

  return c.json({
    success: true,
    data: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: new Date(data.session.expires_at! * 1000).toISOString(),
    },
  });
});

// ─── Service Token (Create) ────────────────────────
const createTokenSchema = z.object({
  name: z.string().min(1),
  vaultIds: z.array(z.string().uuid()).optional(),
  permissions: z.array(z.enum(['read', 'write', 'list', 'delete'])),
  expiresAt: z.string().optional(),
  encryptedMasterKey: z.string(),
});

auth.post('/service-token', async (c) => {
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
auth.delete('/service-token/:id', async (c) => {
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

// ─── Get User Keys ─────────────────────────────────
auth.get('/keys', async (c) => {
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

export { auth };
