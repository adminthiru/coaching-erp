#!/usr/bin/env bash
# Builds three self-contained, uploadable folders:
#
#   deploy/erp/          static site — upload the contents to any static host
#   deploy/super-admin/  static site — upload the contents to any static host
#   deploy/api/          Node app    — upload, `npm install`, `npm start`
#
# The frontends read their API address from config.js at runtime, so one build
# works for any environment. Stop the dev servers first: `next build` shares the
# .next folder with `next dev`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/deploy"
cd "$ROOT"

rm -rf "$OUT"
mkdir -p "$OUT"

echo "▸ Building ERP"
npm run build -w @acadia/erp
cp -R apps/erp/out "$OUT/erp"

echo "▸ Building Super Admin"
npm run build -w @acadia/super-admin
cp -R apps/super-admin/out "$OUT/super-admin"

echo "▸ Building API"
npm run db:generate
npm run build -w @acadia/api
API="$OUT/api"
mkdir -p "$API/prisma"
cp -R apps/api/dist "$API/dist"
cp apps/api/prisma/schema.prisma "$API/prisma/"
cp -R apps/api/prisma/migrations "$API/prisma/migrations"

# The shared packages ship as TypeScript source inside the monorepo. Compile them
# to CommonJS so the API runs on any Node ≥ 20 without the workspace.
for pkg in types utils validation; do
  npx tsc "packages/$pkg/src/index.ts" \
    --outDir "$API/vendor/$pkg" --module commonjs --moduleResolution node \
    --target ES2023 --preserveSymlinks --esModuleInterop --skipLibCheck --declaration false
done
node - "$API" <<'EOF'
const fs = require('fs');
const path = require('path');
const api = process.argv[2];
const src = require(path.resolve('apps/api/package.json'));
const vendorDeps = { types: {}, utils: {}, validation: { '@acadia/types': 'file:../types', zod: src.dependencies.zod } };
for (const [name, deps] of Object.entries(vendorDeps)) {
  fs.writeFileSync(path.join(api, 'vendor', name, 'package.json'), JSON.stringify(
    { name: `@acadia/${name}`, version: '0.1.0', private: true, main: 'index.js', dependencies: deps }, null, 2));
}
const deps = { ...src.dependencies };
for (const name of Object.keys(vendorDeps)) deps[`@acadia/${name}`] = `file:./vendor/${name}`;
deps.prisma = src.devDependencies.prisma; // needed on the host for generate + migrate
fs.writeFileSync(path.join(api, 'package.json'), JSON.stringify({
  name: 'acadia-api',
  version: src.version,
  private: true,
  engines: { node: '>=20' },
  scripts: {
    postinstall: 'prisma generate',
    start: 'node dist/main.js',
    'db:deploy': 'prisma migrate deploy',
  },
  dependencies: deps,
}, null, 2));
EOF

# Secrets are never copied — the host supplies them (env vars or its own .env).
cp .env.example "$API/.env.example"

cat > "$API/README.md" <<'EOF'
# Acadia API — deployment

Requires Node 20+ and a PostgreSQL database.

```bash
npm install            # also runs `prisma generate`
cp .env.example .env   # or set the same variables in your host's dashboard
npm run db:deploy      # apply database migrations (safe to re-run)
npm start              # listens on $PORT, else $API_PORT, else 4000
```

Required: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (32+ chars,
`openssl rand -base64 48`), and `CORS_ORIGINS` set to the ERP and Super Admin
site addresses, comma-separated. Health check: `GET /api/health`.
EOF

echo
echo "✓ deploy/ ready:"
echo "    deploy/erp          → set window.ACADIA_API_URL in config.js, upload contents"
echo "    deploy/super-admin  → set window.ACADIA_API_URL in config.js, upload contents"
echo "    deploy/api          → see deploy/api/README.md"
