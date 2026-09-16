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

## Telegram

Создайте `.env` рядом с `compose.yaml` по образцу `.env.example`:

```dotenv
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Заполните токен и ID чата, затем выполните `docker compose up -d --build`.
Для личного чата сначала начните диалог с ботом. Для группы добавьте бота
и разрешите ему отправлять сообщения.

В настройках событий включите Telegram только для нужных событий.
Переключатель относится к конечной комнате после маршрутизации, независимо
от Ленты и Push. Все события изначально выключены. История не рассылается;
новые сообщения и каждый повтор отправляются даже при закрытом браузере.

Очередь до 200 сообщений хранится в памяти и теряется при перезапуске.
Отправка — не чаще раза в 3,1 секунды, до трёх попыток при временных ошибках;
при сетевом таймауте повторная попытка может доставить дубликат.
Длинные сообщения сокращаются. Ошибки и размер очереди видны на странице
настроек событий. Проверки без настоящего бота: `node scripts/tests/telegram.mjs`.

Лимиты: https://core.telegram.org/bots/api#sendmessage и
https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this
