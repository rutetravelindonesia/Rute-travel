#!/bin/bash
set -o pipefail

GITHUB_REPO="https://github.com/rutetravelindonesia/Rute-travel.git"

echo "=== Push ke GitHub (fresh history) ==="
echo "Masukkan Personal Access Token GitHub:"
read -rs GITHUB_TOKEN
echo ""

REMOTE_URL="https://${GITHUB_TOKEN}@github.com/rutetravelindonesia/Rute-travel.git"

# Bersihkan lock file
rm -f .git/config.lock .git/index.lock 2>/dev/null

# Hapus remote lama
git remote remove github 2>/dev/null || true
git remote add github "$REMOTE_URL"

# Buat orphan branch (history bersih, tanpa commit lama yang berisi token)
git checkout --orphan fresh-push
git add -A
git commit -m "Initial commit — RUTE Travel App" 2>&1 | tail -1

# Push sebagai main ke GitHub
echo "Mengirim kode ke GitHub..."
if git push github fresh-push:main --force 2>&1 | sed "s/${GITHUB_TOKEN}/***HIDDEN***/g"; then
  echo ""
  echo "✅ Berhasil! Kode sudah ada di:"
  echo "   $GITHUB_REPO"
else
  echo ""
  echo "❌ Gagal push."
fi

# Kembali ke branch main asli dan hapus branch sementara
git checkout main
git branch -D fresh-push 2>/dev/null || true

# Hapus token dari remote
git remote remove github 2>/dev/null || true
echo "✓ Selesai"
