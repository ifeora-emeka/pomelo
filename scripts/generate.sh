#!/bin/bash
set -e

echo "[Kallo] Cleaning existing temp/ directory..."
rm -rf temp
mkdir -p temp

echo "[Kallo] Running CLI to create test-app inside temp/..."
node packages/cli/dist/bin.js create temp/test-app --template ecommerce

# Ensure temp/* is present in pnpm-workspace.yaml
if ! grep -q "temp/\*" pnpm-workspace.yaml; then
  echo "[Kallo] Adding temp/* to pnpm-workspace.yaml..."
  echo "  - \"temp/*\"" >> pnpm-workspace.yaml
fi

echo "[Kallo] Installing workspace dependencies..."
pnpm install

echo "[Kallo] Building the scaffolded test-app..."
pnpm --filter test-app build

echo "--------------------------------------------------------"
echo "Success! Kallo test-app generated at temp/test-app"
echo "To run the app, execute:"
echo "  pnpm --filter test-app start"
echo "--------------------------------------------------------"
