# Security policy

> ¿Español? Ver [SECURITY.es.md](SECURITY.es.md).

## Supported versions

| Version | Security support |
|---|---|
| Latest beta (`0.1.0-beta.x`) | ✅ Receives fixes |
| Older (`V1.x`, private betas) | ❌ Not supported, please upgrade |

## Reporting a vulnerability

**Do not open a public issue** for vulnerabilities. Do not publish tokens, credentials, personal data or proof-of-concept exploits that could put other users at risk.

Use one of these private channels:

1. **GitHub private advisories**: <https://github.com/iDontrixss/KindyrLauncher/security/advisories/new>
2. **Email**: `KindyrSupport@gmail.com` with subject `[SECURITY] short description`

Include: impact, affected version, minimal reproduction steps and known mitigation if any. Do not include third-party data.

## What to expect

- Acknowledgement within ~7 days.
- If confirmed, the fix ships in the next beta with public credit to the reporter (unless anonymity is requested).
- We will never ask for credentials or tokens by email.

## Security model

What the design guarantees and is audited before every release:

- The renderer never receives Microsoft access tokens.
- Persistent credentials require OS-level secure encryption.
- ZIP contents can never be written outside their destination.
- Navigations and windows keep `contextIsolation`, sandbox and `nodeIntegration` disabled.
- URLs opened or downloaded via IPC are validated in the main process.

For your personal data, see the [Privacy Policy](legal/PRIVACY.en.md).
