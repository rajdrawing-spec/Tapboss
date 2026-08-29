#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${1:-$ROOT/tapboss-hostinger-package}"
ARCHIVE="${OUT}.tar.gz"

rm -rf "$OUT" "$ARCHIVE"
mkdir -p "$OUT"

cd "$ROOT"
tar \
  --exclude='./node_modules' \
  --exclude='./.git' \
  --exclude='./.cache' \
  --exclude='./.local' \
  --exclude='./screenshots' \
  --exclude='*/node_modules' \
  --exclude='*/node_modules/*' \
  --exclude='*/.replit-artifact' \
  --exclude='*/.replit-artifact/*' \
  --exclude='./.replit' \
  --exclude='./replit.nix' \
  --exclude='*/dist' \
  --exclude='*/dist/*' \
  --exclude='./artifacts/*/.browser-profiles' \
  --exclude='./data' \
  --exclude='./.env' \
  --exclude='./.env.*' \
  --exclude='*.tsbuildinfo' \
  -cf - \
  package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.json \
  artifacts lib scripts deploy/hostinger \
  | tar -xf - -C "$OUT"

cp deploy/hostinger/.env.example "$OUT/.env.example"
tar -czf "$ARCHIVE" -C "$(dirname "$OUT")" "$(basename "$OUT")"
echo "Created $ARCHIVE"