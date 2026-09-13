# Установка

Нужны Git, Docker и Docker Compose.

## Запуск

```bash
git clone git@github.com:zephyr-m/myWS.git
cd myWS
docker compose up -d --build
```

Откройте <http://localhost:8081>.

## Домен `ws.local` на NixOS

```bash
sudo ./scripts/setup-nixos.sh
```

Скрипт создаст резервную копию `configuration.nix`, добавит домен и nginx-прокси, затем выполнит `nixos-rebuild switch`.

После настройки откройте <http://ws.local>.

## Временный публичный адрес

```bash
nix-shell -p cloudflared --run 'cloudflared tunnel --url http://127.0.0.1:8081'
```

Адрес `trycloudflare.com` действует, пока команда продолжает работать.

## Управление

```bash
docker compose logs -f
docker compose down
git pull
docker compose up -d --build
```
