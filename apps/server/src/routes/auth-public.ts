import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { Errors } from '../lib/errors.js';

const authPublic = new Hono();

// ─── Shared Schema ────────────────────────────────
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine(p => /[a-z]/.test(p), 'Password must contain a lowercase letter')
  .refine(p => /[A-Z]/.test(p), 'Password must contain an uppercase letter')
  .refine(p => /[0-9]/.test(p), 'Password must contain a number');

// ─── Register ──────────────────────────────────────
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

authPublic.post('/register', async (c) => {
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

authPublic.post('/login', async (c) => {
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
authPublic.post('/refresh', async (c) => {
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

// ─── Recovery Info (Public) ───────────────────────
const recoveryInfoSchema = z.object({
  email: z.string().email().max(320),
});

authPublic.post('/recovery-info', async (c) => {
  const body = await c.req.json();
  const data = recoveryInfoSchema.parse(body);
  const supabase = getSupabaseAdmin();

  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users?.users?.find(u => u.email === data.email);

  if (!user) {
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

authPublic.post('/recover', async (c) => {
  const body = await c.req.json();
  const data = recoverSchema.parse(body);
  const supabase = getSupabaseAdmin();

  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users?.users?.find(u => u.email === data.email);

  if (!user) {
    throw Errors.badRequest('Recovery failed. Please check your details and try again.');
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    password: data.newPassword,
  });

  if (updateError) {
    throw Errors.internal('Failed to update password');
  }

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

export { authPublic };
