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

## Управление

```bash
docker compose logs -f
docker compose down
git pull
docker compose up -d --build
```
