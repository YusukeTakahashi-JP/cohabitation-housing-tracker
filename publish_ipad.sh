#!/usr/bin/env bash
# Bundles the latest PKB housing data, Maisoku images, and PDFs into docs/ for GitHub Pages (iPad 24/7 access)
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PKB_ROOT="${PKB_ROOT:-$(cd "$APP_DIR/../Grimoire-pkb" && pwd)}"

echo "📦 Bundling static assets for iPad / GitHub Pages into $APP_DIR/docs ..."
rm -rf "$APP_DIR/docs"
mkdir -p "$APP_DIR/docs/data" "$APP_DIR/docs/images" "$APP_DIR/docs/pdfs"

cp "$APP_DIR/public/index.html" "$APP_DIR/docs/index.html"
cp "$APP_DIR/public/app.js" "$APP_DIR/docs/app.js"
cp "$PKB_ROOT/04_resources/housing_data/housing_db.json" "$APP_DIR/docs/data/housing_db.json"
cp "$PKB_ROOT/06_storage/housing/images/"* "$APP_DIR/docs/images/" 2>/dev/null || true
cp "$PKB_ROOT/06_storage/housing/maisoku/"* "$APP_DIR/docs/pdfs/" 2>/dev/null || true
touch "$APP_DIR/docs/.nojekyll"

echo "✅ Static bundle ready in $APP_DIR/docs !"
if [[ "${1:-}" == "--push" ]]; then
  cd "$APP_DIR"
  git add .
  git commit -m "Update iPad dashboard data and Maisoku images" || true
  git push origin HEAD
  echo "🚀 Pushed to GitHub Pages!"
fi
