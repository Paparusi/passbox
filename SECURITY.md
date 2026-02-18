# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in PassBox, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

### How to Report

1. Email: Open a private security advisory at [GitHub Security Advisories](https://github.com/Paparusi/passbox/security/advisories/new)
2. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix release**: As soon as possible, depending on severity

### Scope

The following are in scope:

- Authentication and authorization bypasses
- Encryption implementation flaws
- Key derivation weaknesses
- Data leakage (plaintext secrets exposed to server)
- SQL injection, XSS, CSRF
- RLS policy bypasses in Supabase
- Dependency vulnerabilities with exploitable impact

### Cryptography

PassBox uses audited cryptographic libraries from the [noble](https://paulmillr.com/noble/) family:

- `@noble/hashes` — Argon2id key derivation
- `@noble/ciphers` — AES-256-GCM symmetric encryption
- `@noble/curves` — X25519 key exchange

These libraries are audited by [Cure53](https://cure53.de/) and have zero dependencies. If you find an issue with our usage of these libraries (not the libraries themselves), please report it.

## Security Design

PassBox follows a zero-knowledge architecture:

- Master password never leaves the client
- All secrets are encrypted client-side before transmission
- The server stores only encrypted blobs
- Key derivation uses Argon2id (memory-hard, resistant to GPU/ASIC attacks)
- Vault keys are wrapped with X25519 for sharing

For more details, see the [Architecture section](README.md) in the README.
