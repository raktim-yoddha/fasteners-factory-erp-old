# Testing

Explains verification strategy; rules live in `AGENTS.md`.

## Automated checks

| Command | Evidence |
|---|---|
| `pnpm typecheck` | Strict TypeScript and import configuration compile. |
| `pnpm lint` | ESLint checks application, scripts and tests. |
| `pnpm test` | Vitest runs repository contract/release tests and focused UI tests. |
| `pnpm build` | Vite builds `dist` and generates the service worker/manifest. |

CI runs all four commands on Ubuntu. Unit tests use JSDOM only where a browser DOM is required; repository
scripts remain Node-environment tests.

## Manual L1 evidence

Before TASK-0001 is `DONE`, record the deployed Cloudflare Pages URL and test results for Windows 11 Chrome
and Android Chrome: installation, standalone launch, update prompt and offline cached-shell behavior.

## Fixtures and data

L1 contains no business records. Every later fixture is fictional and labelled `SAMPLE`; no real factory or
customer data enters automated tests.
