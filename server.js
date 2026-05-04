const express = require('express');
const fs      = require('fs');
const path    = require('path');
const cors    = require('cors');

const app  = express();
const PORT = 3000;

// ── Database setup (flat-file JSON) ──────────────────────────────────
let DB_DIR  = path.join(__dirname, 'database');
let DB_FILE = path.join(DB_DIR, 'history.json');

try {
  if (!fs.existsSync(DB_DIR))  fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf-8');
} catch (e) {
  // If we can't write to __dirname (e.g., Vercel read-only filesystem), fallback to /tmp
  DB_DIR = path.join('/tmp', 'database');
  DB_FILE = path.join(DB_DIR, 'history.json');
  if (!fs.existsSync(DB_DIR))  fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf-8');
}

// ── Middleware ────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(__dirname));

// ── DB Helpers ───────────────────────────────────────────────────────
function readDB() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error("Failed to write to DB:", e);
  }
}

function nextId(entries) {
  if (!entries.length) return 1;
  return Math.max(...entries.map(e => e.id)) + 1;
}

// ── Compiler Import ──────────────────────────────────────────────────
const { compileFull, lex, parse } = require('./compiler');

// ══════════════════════════════════════════════════════════════════════
//  6-PHASE COMPILER ROUTES
// ══════════════════════════════════════════════════════════════════════

// Full compilation pipeline (used by index.html — 6 phase view)
app.post('/compile', (req, res) => {
  try {
    const code = req.body.code || '';
    const result = compileFull(code);

    // Save to history (non-blocking, errors silenced)
    try {
      const entries = readDB();
      entries.push({
        id:        nextId(entries),
        type:      'compile',
        input:     { expression: code.substring(0, 200) },
        output:    { tokenCount: result.tokens?.length || 0 },
        timestamp: Date.now()
      });
      writeDB(entries);
    } catch (e) { /* ignore db errors */ }

    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error.message || String(error),
      line: error.line,
      col: error.col
    });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  EXPRESSION ANALYZER ROUTES (used by compiler-viz.html)
// ══════════════════════════════════════════════════════════════════════

app.post('/tokenize', (req, res) => {
  try {
    const tokens = lex(req.body.code || req.body.expression || '');
    res.json({ ok: true, tokens });
  } catch (error) {
    res.status(400).json({ error: error.message || String(error), pos: error.pos });
  }
});

app.post('/parse', (req, res) => {
  try {
    const code = req.body.code || req.body.expression || '';
    const tokens = lex(code);
    const ast = parse(tokens);
    res.json({ ok: true, tokens, ast });
  } catch (error) {
    res.status(400).json({ error: error.message || String(error), pos: error.pos });
  }
});

app.post('/steps', (req, res) => {
  try {
    const code = req.body.code || req.body.expression || '';
    const tokens = lex(code);
    const ast = parse(tokens);
    res.json({ ok: true, tokens, ast, steps: ast.steps || [] });
  } catch (error) {
    res.status(400).json({ error: error.message || String(error), pos: error.pos });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  DATABASE / HISTORY API
// ══════════════════════════════════════════════════════════════════════

app.get('/api/history', (req, res) => {
  const entries = readDB();
  entries.sort((a, b) => b.timestamp - a.timestamp);
  res.json(entries);
});

app.post('/api/history', (req, res) => {
  const { input, output } = req.body;
  if (!input || !input.expression) {
    return res.status(400).json({ error: 'Expression is required' });
  }
  const entries = readDB();
  const record = {
    id:        nextId(entries),
    input,
    output,
    timestamp: Date.now()
  };
  entries.push(record);
  writeDB(entries);
  res.status(201).json(record);
});

app.delete('/api/history/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  let entries = readDB();
  const before = entries.length;
  entries = entries.filter(e => e.id !== id);
  if (entries.length === before) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  writeDB(entries);
  res.json({ success: true });
});

app.delete('/api/history', (req, res) => {
  writeDB([]);
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════════
//  HEALTH CHECK
// ══════════════════════════════════════════════════════════════════════
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: Date.now() });
});

// ══════════════════════════════════════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n  ⬡ CompilerViz server running at:`);
  console.log(`    → http://localhost:${PORT}               (6-Phase C Compiler)`);
  console.log(`    → http://localhost:${PORT}/compiler-viz.html  (Syntax Analyzer)`);
  console.log(`    → http://localhost:${PORT}/database-viewer.html (Database)\n`);
});

// Export the app for Vercel Serverless Functions
module.exports = app;
