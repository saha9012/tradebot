// server-items.js
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3001;

app.use(bodyParser.json());
// Отдаём статические файлы из папки public
app.use(express.static(path.join(__dirname, "public")));

const ITEMS_FILE = path.join(__dirname, "items.json");

function loadItems() {
  if (!fs.existsSync(ITEMS_FILE)) return [];
  try {
    const raw = fs.readFileSync(ITEMS_FILE);
    return JSON.parse(raw);
  } catch (e) {
    console.error("Error reading items.json:", e);
    return [];
  }
}

function saveItems(items) {
  fs.writeFileSync(ITEMS_FILE, JSON.stringify(items, null, 2));
}

// GET /items
app.get("/items", (req, res) => {
  res.json(loadItems());
});

// POST /items
app.post("/items", (req, res) => {
  const items = loadItems();
  const newItem = { id: Date.now(), ...req.body };
  items.push(newItem);
  saveItems(items);
  res.json(newItem);
});

// PUT /items/:id
app.put("/items/:id", (req, res) => {
  const id = parseInt(req.params.id);
  let items = loadItems();
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  items[idx] = { ...items[idx], ...req.body };
  saveItems(items);
  res.json(items[idx]);
});

// DELETE /items/:id
app.delete("/items/:id", (req, res) => {
  const id = parseInt(req.params.id);
  let items = loadItems();
  items = items.filter(i => i.id !== id);
  saveItems(items);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Items server running on http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/items.html to manage items`);
});
