#!/usr/bin/env bash
set -euo pipefail

# One-command deploy for NoteMind (Cloudflare Origin Certs)
# Usage:
#   bash deploy/deploy.sh <domain>
# Example:
#   bash deploy/deploy.sh notemind.tech

DOMAIN="${1:-${DOMAIN:-}}"

if [ -z "${DOMAIN}" ]; then
  echo "Usage: bash deploy/deploy.sh <domain>"
  echo "Example: bash deploy/deploy.sh notemind.tech"
  exit 1
fi

API_DOMAIN="api.${DOMAIN}"
WWW_DOMAIN="www.${DOMAIN}"

COMPOSE="docker compose"
NGINX_CONF="deploy/nginx.conf"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

render_nginx() {
  cat > "${NGINX_CONF}" <<EOF
upstream notemind_backend {
    server backend:3001;
    keepalive 32;
}

limit_req_zone \$binary_remote_addr zone=api_per_ip:10m rate=20r/s;
limit_req_zone \$binary_remote_addr zone=auth_per_ip:10m rate=10r/m;

real_ip_header CF-Connecting-IP;
real_ip_recursive on;
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;

server {
    listen 80;
    server_name ${DOMAIN} ${WWW_DOMAIN} ${API_DOMAIN};

    location ~* ^/(wp-admin|wp-login\\.php|xmlrpc\\.php|wordpress|setup/setup\\.php|app_dev\\.php|down\\.html|scripts/(deploy|db)\\.sh|key\\.pem|backup/database\\.zip|install\\.sql)$ {
        return 444;
    }

    location ~ /\\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~* \\.(env|ini|log|sql|bak|old|swp|pem|sh)$ {
        return 404;
        access_log off;
        log_not_found off;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN} ${WWW_DOMAIN};

    ssl_certificate /etc/ssl/cloudflare/origin.pem;
    ssl_certificate_key /etc/ssl/cloudflare/origin-key.pem;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location ~* ^/(wp-admin|wp-login\\.php|xmlrpc\\.php|wordpress|setup/setup\\.php|app_dev\\.php|down\\.html|scripts/(deploy|db)\\.sh|key\\.pem|backup/database\\.zip|install\\.sql)$ {
        return 444;
    }

    location ~ /\\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~* \\.(env|ini|log|sql|bak|old|swp|pem|sh)$ {
        return 404;
        access_log off;
        log_not_found off;
    }

    location / {
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 360s;
        proxy_send_timeout 360s;
        proxy_pass http://notemind_backend;
    }
}

server {
    listen 443 ssl http2;
    server_name ${API_DOMAIN};

    ssl_certificate /etc/ssl/cloudflare/origin.pem;
    ssl_certificate_key /etc/ssl/cloudflare/origin-key.pem;

    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    client_max_body_size 50m;

    location ~* ^/(wp-admin|wp-login\\.php|xmlrpc\\.php|wordpress|setup/setup\\.php|app_dev\\.php|down\\.html|scripts/(deploy|db)\\.sh|key\\.pem|backup/database\\.zip|install\\.sql)$ {
        return 444;
    }

    location ~ /\\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~* \\.(env|ini|log|sql|bak|old|swp|pem|sh)$ {
        return 404;
        access_log off;
        log_not_found off;
    }

    location ~* ^/auth/(login|register|forgot-password|reset-password)$ {
        limit_req zone=auth_per_ip burst=20 nodelay;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 360s;
        proxy_send_timeout 360s;
        rewrite ^(.*)$ /api\$1 break;
        proxy_pass http://notemind_backend;
    }

    location / {
        limit_req zone=api_per_ip burst=120 nodelay;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 360s;
        proxy_send_timeout 360s;
        rewrite ^(.*)$ /api\$1 break;
        proxy_pass http://notemind_backend;
    }
}
EOF
}

smoke_check() {
  echo "[5/5] Running smoke checks"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "https://${DOMAIN}" >/dev/null && echo "OK: https://${DOMAIN}"
    curl -fsS "https://${API_DOMAIN}/api/health" >/dev/null && echo "OK: https://${API_DOMAIN}/api/health"
  else
    echo "curl not found. Skipping smoke checks."
  fi
}

require_cmd docker

mkdir -p certs server/data server/uploads server/exports server/logs

if [ ! -f .env ]; then
  echo "Missing .env in project root. Create it before deploy."
  exit 1
fi

if [ ! -f certs/origin.pem ] || [ ! -f certs/origin-key.pem ]; then
  echo "Missing Cloudflare Origin Certificate."
  echo "Place origin.pem and origin-key.pem in certs/ directory."
  exit 1
fi

echo "[1/5] Building backend image"
$COMPOSE build backend

echo "[2/5] Writing Nginx config"
render_nginx

echo "[3/5] Starting backend + nginx"
$COMPOSE up -d --force-recreate backend nginx

echo "[4/5] Waiting for services..."
sleep 5

smoke_check

echo ""
echo "Deploy completed."
echo "Frontend: https://${DOMAIN}"
echo "API:      https://${API_DOMAIN}"
