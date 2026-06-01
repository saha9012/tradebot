const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Статика (будем отдавать index.html)
app.use(express.static(path.join(__dirname, 'public')));

// Тестовый эндпоинт
app.get('/api/ping', (req, res) => {
    res.json({ message: 'Бот работает!' });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
});
