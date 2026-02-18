-- Subscriptions / billing
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  plan text not null default 'free' check (plan in ('free', 'pro', 'team', 'enterprise')),
  status text not null default 'active' check (status in ('active', 'canceled', 'past_due', 'trialing')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_subscriptions_user on subscriptions(user_id);
create index idx_subscriptions_stripe_customer on subscriptions(stripe_customer_id);

alter table subscriptions enable row level security;

-- Users can read their own subscription
create policy "users_own_subscription" on subscriptions
  for select using (user_id = auth.uid());

-- Waitlist for cloud hosted version
create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text default 'website',
  created_at timestamptz default now()
);

create index idx_waitlist_email on waitlist(email);
