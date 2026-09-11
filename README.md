# Live logs

Минималистичный WebSocket-сервер для просмотра логов по комнатам в браузере.
Сообщения хранятся только в оперативной памяти и исчезают после перезапуска.

## Запуск

```bash
docker compose up --build
```

Интерфейс: <http://localhost:8081>

Демонстрация передачи позиции мыши: <http://localhost:8081/mouse.html>
Комнату можно выбрать параметром, например `mouse.html?room=demo`.

## Отправка логов

Подключите приложение к комнате и отправляйте обычные строки:

```text
ws://localhost:8081/api/logs?room=backend
```

Пример для браузера или приложения с WebSocket API:

```js
const logs = new WebSocket('ws://localhost:8081/api/logs?room=backend')

logs.addEventListener('open', () => {
  logs.send('Сервер запущен')
  logs.send(JSON.stringify({ userId: 42, action: 'login' }))
})
```

Комната создаётся при подключении. В памяти остаются последние 500 сообщений
каждой комнаты. Значение можно изменить через `ROOM_HISTORY_SIZE` в
`compose.yaml`.

## Локальная разработка

В двух терминалах:

```bash
npm run server
```

```bash
npm run dev
```
