#!/usr/bin/env bash
# АвтоХаб: веб-приложение на своём сервере — один раз, от root, на Ubuntu/Debian с Docker.
#   bash setup.sh                 — адрес https://<IP-через-дефисы>.sslip.io
#   AUTOHUB_HOST=app.example.ru bash setup.sh   — свой домен (A-запись уже на этот сервер)
# Ставит контейнер Caddy (HTTPS по Let's Encrypt) на порты 80/443 и пользователя autohub-deploy,
# чей SSH-ключ может только заливать файлы в /srv/autohub/site. В конце печатает секреты для GitHub.
set -euo pipefail
DIR=/srv/autohub; U=autohub-deploy
[ "$(id -u)" = 0 ] || { echo "Запустите от root: sudo bash setup.sh"; exit 1; }
IP=$(curl -fsS4 --max-time 10 https://api.ipify.org || hostname -I | awk '{print $1}')
HOST="${AUTOHUB_HOST:-${IP//./-}.sslip.io}"
PORT=$(sshd -T 2>/dev/null | awk '$1=="port"{print $2; exit}'); PORT=${PORT:-22}

# 80 и 443 нужны Caddy для сертификата. Заняты другим контейнером или nginx — остановка, без изменений
if ss -ltnH '( sport = :80 or sport = :443 )' | grep -q . && ! docker ps --format '{{.Names}}' | grep -qx autohub-web; then
  echo "Порт 80 или 443 уже занят:"; ss -ltnp '( sport = :80 or sport = :443 )'; docker ps --format '{{.Names}}  {{.Image}}  {{.Ports}}'
  echo; echo "Ничего не изменено. Пришлите этот вывод — подключу АвтоХаб к уже работающему веб-серверу."; exit 1
fi

apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq rsync curl >/dev/null
id "$U" >/dev/null 2>&1 || useradd -m -s /bin/sh "$U"
install -d -o "$U" -g "$U" -m 755 "$DIR/site"
[ -f "$DIR/site/index.html" ] || echo '<!doctype html><meta charset="utf-8"><title>АвтоХаб</title><p>АвтоХаб скоро будет здесь.</p>' > "$DIR/site/index.html"
cat > "$DIR/Caddyfile" <<'CADDY'
# АвтоХаб: веб-приложение (PWA) на своём сервере. Caddy сам получает и продлевает HTTPS-сертификат Let's Encrypt.
# {$AUTOHUB_HOST} — адрес сайта: по умолчанию <IP-через-дефисы>.sslip.io (задаёт setup.sh), можно свой домен.
{$AUTOHUB_HOST} {
	root * /srv
	encode zstd gzip

	# Оболочка приложения и сервис-воркер — всегда свежие: иначе обновление не дойдёт до установленных копий
	@shell path / /index.html /sw.js /manifest.webmanifest
	header @shell Cache-Control "no-cache"
	@manifest path /manifest.webmanifest
	header @manifest Content-Type "application/manifest+json"

	header {
		X-Content-Type-Options "nosniff"
		Referrer-Policy "no-referrer"
		Permissions-Policy "camera=(self), geolocation=(self), microphone=()"
		-Server
	}
	file_server
}
CADDY

# rrsync: ключ GitHub Actions работает только как rsync в папку сайта — без входа в систему
RR=$(command -v rrsync || true)
if [ -z "$RR" ]; then
  for f in /usr/share/doc/rsync/scripts/rrsync.gz /usr/share/doc/rsync/scripts/rrsync; do
    [ -f "$f" ] || continue
    case "$f" in *.gz) gunzip -c "$f" > /usr/local/bin/rrsync ;; *) cp "$f" /usr/local/bin/rrsync ;; esac
    chmod 755 /usr/local/bin/rrsync; RR=/usr/local/bin/rrsync; break
  done
fi
[ -n "$RR" ] || { echo "Не найден rrsync (входит в пакет rsync)"; exit 1; }
[ -f "$DIR/deploy_key" ] || ssh-keygen -q -t ed25519 -N "" -C "github-actions-autohub" -f "$DIR/deploy_key"
chmod 600 "$DIR/deploy_key"
install -d -o "$U" -g "$U" -m 700 "/home/$U/.ssh"
echo "command=\"$RR $DIR/site\",restrict $(cat "$DIR/deploy_key.pub")" > "/home/$U/.ssh/authorized_keys"
chown "$U:$U" "/home/$U/.ssh/authorized_keys"; chmod 600 "/home/$U/.ssh/authorized_keys"

command -v ufw >/dev/null && ufw status | grep -q "Status: active" && { ufw allow 80/tcp; ufw allow 443/tcp; ufw allow 443/udp; } >/dev/null || true

# Проверить конфигурацию до запуска: ошибка — остановка, работающий контейнер не трогаем
docker run --rm -e AUTOHUB_HOST="$HOST" -v "$DIR/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2.8.4 \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null || { echo "Ошибка в $DIR/Caddyfile"; exit 1; }
docker rm -f autohub-web >/dev/null 2>&1 || true
docker run -d --name autohub-web --restart unless-stopped \
  -p 80:80 -p 443:443 -p 443:443/udp -e AUTOHUB_HOST="$HOST" \
  -v "$DIR/site:/srv:ro" -v "$DIR/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v autohub-caddy-data:/data -v autohub-caddy-config:/config caddy:2.8.4 >/dev/null

KH=$( [ "$PORT" = 22 ] && echo "$IP" || echo "[$IP]:$PORT" )
cat <<OUT

Готово. Адрес приложения (сертификат появится в течение минуты): https://$HOST

Секреты для GitHub — github.com/pazzia/Auto → Settings → Secrets and variables → Actions → New repository secret:

AUTOHUB_SERVER_HOST
$IP

AUTOHUB_SERVER_PORT
$PORT

AUTOHUB_SERVER_URL
https://$HOST

AUTOHUB_SERVER_KNOWN_HOSTS
$KH $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)

AUTOHUB_SERVER_SSH_KEY  (всё, включая строки BEGIN и END)
$(cat "$DIR/deploy_key")
OUT
