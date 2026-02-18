import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PassBox — Zero-Knowledge Secrets Management',
  description: 'Securely store and manage passwords, API keys, and tokens with end-to-end encryption.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
