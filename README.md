# Использование

## PHP — HTTP

```php
<?php

$room = rawurlencode('backend');
$curl = curl_init("http://localhost:8081/api/logs?room={$room}");

curl_setopt_array($curl, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => 'Любое сообщение',
    CURLOPT_HTTPHEADER => ['Content-Type: text/plain; charset=utf-8'],
    CURLOPT_RETURNTRANSFER => true,
]);

curl_exec($curl);
curl_close($curl);
```

## JavaScript — WebSocket

```js
const url = new URL('ws://localhost:8081/api/logs')
url.searchParams.set('room', 'frontend')

const socket = new WebSocket(url)

socket.addEventListener('open', () => {
  socket.send('Любое сообщение')
})
```
