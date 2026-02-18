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
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine(p => /[a-z]/.test(p), 'Password must contain a lowercase letter')
  .refine(p => /[A-Z]/.test(p), 'Password must contain an uppercase letter')
  .refine(p => /[0-9]/.test(p), 'Password must contain a number');

const registerSchema = z.object({
  email: z.string().email().max(320),
  password: passwordSchema,
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
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
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
      user: {
        id: signIn.user.id,
        email: signIn.user.email,
        emailVerified: !!signIn.user.email_confirmed_at,
      },
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
  name: z.string().min(1).max(100),
  vaultIds: z.array(z.string().uuid()).max(50).optional(),
  permissions: z.array(z.enum(['read', 'write', 'list', 'delete'])),
  expiresAt: z.string().max(100).optional(),
  encryptedMasterKey: z.string().max(10_000),
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

// ─── Recovery Info (Public) ───────────────────────
// Returns encrypted recovery data so the client can attempt recovery.
// The encrypted blobs are useless without the recovery key (zero-knowledge).
const recoveryInfoSchema = z.object({
  email: z.string().email().max(320),
});

auth.post('/recovery-info', async (c) => {
  const body = await c.req.json();
  const data = recoveryInfoSchema.parse(body);
  const supabase = getSupabaseAdmin();

  // Look up user by email
  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users?.users?.find(u => u.email === data.email);

  if (!user) {
    // Generic error to prevent user enumeration
    throw Errors.badRequest('Recovery failed. Please check your email and try again.');
  }

  const { data: keys } = await supabase
    .from('user_keys')
    .select('encrypted_master_key_recovery, encrypted_private_key, public_key')
    .eq('user_id', user.id)
    .single();

  if (!keys || !keys.encrypted_master_key_recovery) {
    throw Errors.badRequest('Recovery failed. Please check your email and try again.');
  }

  return c.json({
    success: true,
    data: {
      encryptedMasterKeyRecovery: keys.encrypted_master_key_recovery,
      encryptedPrivateKey: keys.encrypted_private_key,
      publicKey: keys.public_key,
    },
  });
});

// ─── Recover Account (Public) ─────────────────────
// After client decrypts master key with recovery key, re-encrypts everything
// with new password and submits here.
const recoverSchema = z.object({
  email: z.string().email().max(320),
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

auth.post('/recover', async (c) => {
  const body = await c.req.json();
  const data = recoverSchema.parse(body);
  const supabase = getSupabaseAdmin();

  // Find user
  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users?.users?.find(u => u.email === data.email);

  if (!user) {
    throw Errors.badRequest('Recovery failed. Please check your details and try again.');
  }

  // Update Supabase Auth password
  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    password: data.newPassword,
  });

  if (updateError) {
    throw Errors.internal('Failed to update password');
  }

  // Update user keys with new encryption
  const { error: keysError } = await supabase
    .from('user_keys')
    .update({
      encrypted_private_key: data.encryptedPrivateKey,
      encrypted_master_key_recovery: data.encryptedMasterKeyRecovery,
      key_derivation_salt: data.keyDerivationSalt,
      key_derivation_params: data.keyDerivationParams,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);

  if (keysError) {
    throw Errors.internal('Failed to update keys');
  }

  return c.json({
    success: true,
    data: { message: 'Account recovered successfully. Please log in with your new password.' },
  });
});

export { auth };
