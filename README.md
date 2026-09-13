# Использование

## PHP — HTTP

```php
<?php

function liveLog(string $event, string $message, array $data = []): void
{
    $room = rawurlencode('backend');
    $curl = curl_init("http://localhost:8081/api/logs?room={$room}");

    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode([
            'event' => $event,
            'message' => $message,
            'data' => $data,
        ], JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
    ]);

    curl_exec($curl);
    curl_close($curl);
}

liveLog('request.received', 'Получен запрос');
liveLog('database.query', 'Выполнен SQL', ['userId' => 42]);
liveLog('response.sent', 'Отправлен ответ');
```

## JavaScript — WebSocket

```js
const url = new URL('ws://localhost:8081/api/logs')
url.searchParams.set('room', 'frontend')

const socket = new WebSocket(url)

function liveLog(event, message, data = {}) {
  socket.send(JSON.stringify({ event, message, data }))
}

socket.addEventListener('open', () => {
  liveLog('request.received', 'Получен запрос')
  liveLog('database.query', 'Выполнен SQL', { userId: 42 })
  liveLog('response.sent', 'Отправлен ответ')
})
```
