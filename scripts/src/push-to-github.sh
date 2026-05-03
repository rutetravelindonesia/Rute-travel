#!/bin/bash
# Push perubahan dari Replit ke GitHub otomatis
set -e

TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN}"
REPO="https://${TOKEN}@github.com/rutetravelindonesia/Rute-travel.git"

cd /home/runner/workspace

# Konfigurasi git
git config user.email "admin@rute.app"
git config user.name "RUTE Travel"

# Set remote github (update jika sudah ada)
if git remote get-url github &>/dev/null; then
  git remote set-url github "$REPO"
else
  git remote add github "$REPO"
fi

# Ambil branch utama dari GitHub
git fetch github main --no-tags 2>/dev/null || git fetch github master --no-tags 2>/dev/null || true

# Push ke GitHub
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
git push github "HEAD:main" --force 2>&1

echo "✓ Berhasil push ke GitHub (branch: main)"
