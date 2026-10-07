#!/usr/bin/env bash
set -euo pipefail

# One-command deploy for NoteMinds behind Cloudflare (origin certificate, SSL mode Full strict).
# Run from the repo root on the VPS:
#   bash deploy/deploy.sh notemind.tech
# Needs: docker (with compose v2), .env (from .env.example), certs/origin.pem + certs/origin-key.pem.

DOMAIN="${1:-${DOMAIN:-}}"
if [ -z "${DOMAIN}" ]; then
  echo "Usage: bash deploy/deploy.sh <domain>   (e.g. notemind.tech)"
  exit 1
fi

command -v docker >/dev/null 2>&1 || { echo "Missing required command: docker"; exit 1; }

if [ ! -f .env ]; then
  echo "Missing .env in the repo root. Copy .env.example to .env and fill it in."
  exit 1
fi

if [ ! -f certs/origin.pem ] || [ ! -f certs/origin-key.pem ]; then
  echo "Missing Cloudflare Origin Certificate: place origin.pem and origin-key.pem in certs/."
  exit 1
fi

echo "[1/3] Building images"
docker compose build

echo "[2/3] Starting api + nginx (nginx waits for the api healthcheck)"
docker compose up -d --wait

echo "[3/3] Smoke checks"
if command -v curl >/dev/null 2>&1; then
  curl -fsS "https://${DOMAIN}/" >/dev/null && echo "OK: https://${DOMAIN}/"
  curl -fsS "https://${DOMAIN}/api/health" && echo "  <- https://${DOMAIN}/api/health"
else
  echo "curl not found; skipping smoke checks."
fi

echo "Deployed: https://${DOMAIN}"
