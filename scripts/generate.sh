#!/bin/bash
set -e

echo "[Kallo] Cleaning existing examples/ directory..."
rm -rf examples
mkdir -p examples

echo "[Kallo] Running CLI to create test-app inside examples/..."
node packages/cli/dist/bin.js create examples/test-app

# Ensure examples/* is present in pnpm-workspace.yaml
if ! grep -q "examples/\*" pnpm-workspace.yaml; then
  echo "[Kallo] Adding examples/* to pnpm-workspace.yaml..."
  echo "  - \"examples/*\"" >> pnpm-workspace.yaml
fi

echo "[Kallo] Installing workspace dependencies..."
pnpm install

echo "[Kallo] Building the scaffolded test-app..."
pnpm --filter test-app build

echo "--------------------------------------------------------"
echo "Success! Kallo test-app generated at examples/test-app"
echo "To run the app, execute:"
echo "  pnpm --filter test-app start"
echo "--------------------------------------------------------"
