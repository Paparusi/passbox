'use client';

import Link from 'next/link';
import { useState } from 'react';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'For individual developers and side projects',
    features: [
      '3 vaults',
      '50 secrets per vault',
      '2 members per vault',
      '7-day audit log',
      '1 service token',
      'CLI + SDK + MCP',
      'E2E encryption',
      'Community support',
    ],
    cta: 'Get Started',
    href: '/register',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$12',
    period: '/user/month',
    description: 'For professional developers and small teams',
    features: [
      'Unlimited vaults',
      'Unlimited secrets',
      'Unlimited members',
      '90-day audit log',
      '50 service tokens',
      'Secret rotation',
      'Webhooks',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    href: '/register?plan=pro',
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    name: 'Team',
    price: '$28',
    period: '/user/month',
    description: 'For growing teams with advanced security needs',
    features: [
      'Everything in Pro',
      'SSO (SAML, OIDC)',
      'Custom RBAC roles',
      'Secret scanning',
      'IP allowlisting',
      '1-year audit log',
      '99.9% SLA',
      'Dedicated support',
    ],
    cta: 'Start Free Trial',
    href: '/register?plan=team',
    highlighted: false,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For organizations with compliance requirements',
    features: [
      'Everything in Team',
      'Self-hosted option',
      'SCIM provisioning',
      'HSM integration',
      'SOC 2 / HIPAA reports',
      'Unlimited audit retention',
      'Custom integrations',
      'Dedicated engineer',
    ],
    cta: 'Contact Sales',
    href: 'mailto:hello@passbox.dev',
    highlighted: false,
  },
];

const comparison = [
  { feature: 'Vaults', free: '3', pro: 'Unlimited', team: 'Unlimited', enterprise: 'Unlimited' },
  { feature: 'Secrets per vault', free: '50', pro: 'Unlimited', team: 'Unlimited', enterprise: 'Unlimited' },
  { feature: 'Members per vault', free: '2', pro: 'Unlimited', team: 'Unlimited', enterprise: 'Unlimited' },
  { feature: 'Service tokens', free: '1', pro: '50', team: 'Unlimited', enterprise: 'Unlimited' },
  { feature: 'E2E encryption', free: 'Yes', pro: 'Yes', team: 'Yes', enterprise: 'Yes' },
  { feature: 'CLI + SDK + MCP', free: 'Yes', pro: 'Yes', team: 'Yes', enterprise: 'Yes' },
  { feature: 'Audit log retention', free: '7 days', pro: '90 days', team: '1 year', enterprise: 'Unlimited' },
  { feature: 'Secret rotation', free: '-', pro: 'Yes', team: 'Yes', enterprise: 'Yes' },
  { feature: 'Webhooks', free: '-', pro: 'Yes', team: 'Yes', enterprise: 'Yes' },
  { feature: 'SSO (SAML/OIDC)', free: '-', pro: '-', team: 'Yes', enterprise: 'Yes' },
  { feature: 'Secret scanning', free: '-', pro: '-', team: 'Yes', enterprise: 'Yes' },
  { feature: 'IP allowlisting', free: '-', pro: '-', team: 'Yes', enterprise: 'Yes' },
  { feature: 'Self-hosted', free: 'Yes', pro: 'Yes', team: 'Yes', enterprise: 'Yes' },
  { feature: 'SLA', free: '-', pro: '-', team: '99.9%', enterprise: 'Custom' },
  { feature: 'Support', free: 'Community', pro: 'Priority', team: 'Dedicated', enterprise: 'Dedicated engineer' },
];

const faqs = [
  {
    q: 'Can I self-host PassBox for free?',
    a: 'Yes! PassBox is MIT licensed. You can self-host the entire platform for free, including all features. Cloud pricing only applies to our managed hosting.',
  },
  {
    q: 'What happens when I hit a limit on the free plan?',
    a: 'You\'ll receive a clear error message telling you which limit was reached and what plan to upgrade to. Your existing data is never affected.',
  },
  {
    q: 'Can I switch plans at any time?',
    a: 'Yes. Upgrades take effect immediately, and downgrades take effect at the end of your billing period. No data is ever lost when changing plans.',
  },
  {
    q: 'Do you offer a free trial?',
    a: 'Yes, Pro and Team plans come with a 14-day free trial. No credit card required to start.',
  },
  {
    q: 'Is my data encrypted?',
    a: 'Always. PassBox uses zero-knowledge E2E encryption (AES-256-GCM + Argon2id + X25519). We never see your plaintext secrets, regardless of plan.',
  },
  {
    q: 'How does the MCP server work with billing?',
    a: 'The MCP server is included in all plans. On the free plan, it respects the same vault/secret limits. AI agents interact with your secrets without ever seeing raw values.',
  },
];

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl flex items-center justify-between h-14 px-4">
          <Link href="/" className="text-lg font-bold">
            Pass<span className="text-primary">Box</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sign In
            </Link>
            <Link href="/register" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-4xl text-center px-4 pt-16 pb-12">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Simple, transparent <span className="text-primary">pricing</span>
          </h1>
          <p className="text-lg text-muted-foreground mt-4 max-w-2xl mx-auto">
            Start free. Scale as you grow. Self-host for free forever with MIT license.
          </p>
        </section>

        {/* Plan Cards */}
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-xl border p-6 flex flex-col ${
                  plan.highlighted
                    ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                    : 'border-border bg-card'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                    {plan.badge}
                  </span>
                )}
                <div className="mb-4">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    {plan.period && (
                      <span className="text-sm text-muted-foreground">{plan.period}</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <svg className="h-4 w-4 text-primary mt-0.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                      </svg>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors ${
                    plan.highlighted
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'border border-border hover:bg-muted'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* Comparison Table */}
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <h2 className="text-2xl font-bold text-center mb-8">Feature comparison</h2>
          <div className="border border-border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">Feature</th>
                  <th className="text-center text-sm font-medium px-4 py-3">Free</th>
                  <th className="text-center text-sm font-medium text-primary px-4 py-3">Pro</th>
                  <th className="text-center text-sm font-medium px-4 py-3">Team</th>
                  <th className="text-center text-sm font-medium px-4 py-3">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row, i) => (
                  <tr key={row.feature} className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                    <td className="px-4 py-2.5 text-sm font-medium">{row.feature}</td>
                    <td className="px-4 py-2.5 text-sm text-center text-muted-foreground">{row.free}</td>
                    <td className="px-4 py-2.5 text-sm text-center">{row.pro}</td>
                    <td className="px-4 py-2.5 text-sm text-center text-muted-foreground">{row.team}</td>
                    <td className="px-4 py-2.5 text-sm text-center text-muted-foreground">{row.enterprise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 pb-20">
          <h2 className="text-2xl font-bold text-center mb-8">Frequently asked questions</h2>
          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-border rounded-lg">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left hover:bg-muted/30 transition-colors"
                >
                  <span>{faq.q}</span>
                  <svg
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M4.22 6.22a.75.75 0 011.06 0L8 8.94l2.72-2.72a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 7.28a.75.75 0 010-1.06z" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-3 text-sm text-muted-foreground">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>PassBox &middot; MIT License</span>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <a href="https://github.com/Paparusi/passbox" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
            <a href="https://www.npmjs.com/package/pabox" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">npm</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
