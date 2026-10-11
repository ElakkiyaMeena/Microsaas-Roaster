#!/usr/bin/env bash
# One-command VPS deploy (Ubuntu/Debian). Run from the repo root on the server:
#   bash deploy/deploy.sh
# First run: installs Docker if missing, creates .env (asks for DOMAIN + OPENAI_API_KEY,
# generates SECRET_KEY + DB_PASSWORD), then builds and starts the HTTPS stack.
# Later runs: git pull + rebuild, keeping the existing .env.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sudo sh
fi

# Reuse an existing Traefik on 443 (e.g. Hostinger n8n template); otherwise run our own Caddy.
if sudo ss -ltnp 2>/dev/null | grep -E ':443 ' | grep -q traefik; then
  echo "==> Traefik detected on :443, routing through it"
  COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.traefik.yml)
else
  COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
fi
if [ "$(id -u)" -ne 0 ] && ! docker info >/dev/null 2>&1; then
  COMPOSE=(sudo "${COMPOSE[@]}")
fi

# Set KEY=VALUE in .env, replacing an existing line or appending.
set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value//|/\\|}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

if [ ! -f .env ]; then
  echo "==> Creating .env"
  read -rp "Domain pointing to this server (e.g. roaster.example.com): " domain
  read -rsp "OpenAI API key (sk-...): " openai_key; echo
  [ -n "$domain" ] && [ -n "$openai_key" ] || { echo "Domain and OpenAI key are required"; exit 1; }

  cp .env.example .env
  chmod 600 .env
  set_env ENVIRONMENT production
  set_env DOMAIN "$domain"
  set_env OPENAI_API_KEY "$openai_key"
  set_env SECRET_KEY "$(openssl rand -hex 32)"
  set_env DB_PASSWORD "$(openssl rand -hex 24)"
  set_env FRONTEND_URL "https://$domain"
  set_env BACKEND_URL "https://$domain"
  set_env ALLOWED_ORIGINS "https://$domain"
  set_env ROAST_LANGUAGE chennai
  set_env ROAST_TARGET coder
  echo "    .env written. Edit it later for GOOGLE_CLIENT_ID/SECRET, ROASTS_PER_DAY, etc."
else
  echo "==> Using existing .env"
  if [ -d .git ]; then git pull --ff-only; fi
fi

if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then
  echo "==> Opening ports 80/443 in ufw"
  sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
fi

echo "==> Building and starting containers"
"${COMPOSE[@]}" up -d --build --remove-orphans

domain="$(grep '^DOMAIN=' .env | cut -d= -f2-)"
echo "==> Waiting for https://$domain/health (the first certificate can take a minute)"
for _ in $(seq 1 30); do
  if curl -fsS "https://$domain/health" >/dev/null 2>&1; then
    echo "Live at https://$domain"
    exit 0
  fi
  sleep 5
done
echo "Not reachable yet. Check DNS (A record -> this server) and logs:"
echo "  ${COMPOSE[*]} logs --tail=100"
exit 1
