# ⬡ CompilerViz — Interactive Syntax Analysis Explorer

A full-stack educational tool that visualises the **lexical analysis** and **syntax analysis** phases of a compiler, with animated ASTs, step-by-step parse tracing, and a live REST API.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start
# → http://localhost:3000

# (optional) Auto-reload during development
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## 📡 API Endpoints

All endpoints accept `POST` with `Content-Type: application/json`.

### `POST /tokenize`
Runs the lexer and returns the token stream.

**Request:**
```json
{ "expression": "a + b * c" }
```

**Response:**
```json
{
  "ok": true,
  "tokens": [
    { "type": "IDENT",  "value": "a", "pos": 0 },
    { "type": "OP",     "value": "+", "pos": 2 },
    { "type": "IDENT",  "value": "b", "pos": 4 },
    { "type": "OP",     "value": "*", "pos": 6 },
    { "type": "IDENT",  "value": "c", "pos": 8 }
  ]
}
```

---

### `POST /parse`
Runs the full parser and returns both the **AST** and **Parse Tree** as structured JSON.

**Request:**
```json
{ "expression": "a + b * c", "mode": "precedence" }
```
- `mode`: `"precedence"` (default) | `"naive"` (left-to-right, no precedence)

**Response:**
```json
{
  "ok": true,
  "tokens": [...],
  "ast": {
    "id": 4, "kind": "op", "label": "+", "prec": "low (1)",
    "children": [
      { "id": 0, "kind": "var", "label": "a", "children": [] },
      { "id": 3, "kind": "op", "label": "*", "prec": "high (2)",
        "children": [
          { "id": 1, "kind": "var", "label": "b", "children": [] },
          { "id": 2, "kind": "var", "label": "c", "children": [] }
        ]
      }
    ]
  },
  "parseTree": { ... }
}
```

---

### `POST /steps`
Returns the full step-by-step parse trace with call-stack snapshots at each step.

**Request:**
```json
{ "expression": "a + b * c", "mode": "precedence" }
```

**Response:**
```json
{
  "ok": true,
  "totalSteps": 12,
  "tokens": [...],
  "steps": [
    {
      "desc": "Entering expression parser",
      "nodeLabel": null,
      "tokenIdx": 0,
      "stack": ["parseExpr"]
    },
    {
      "desc": "Parsing additive level  (+ −)  — lower precedence",
      "nodeLabel": null,
      "tokenIdx": 0,
      "stack": ["parseExpr", "parseAddSub"]
    },
    ...
  ]
}
```

---

### `GET /health`
Server health check.

```json
{ "status": "ok", "ts": 1716000000000 }
```

---

## 🏗️ Project Structure

```
compiler-viz/
├── server/
│   ├── index.js       ← Express server + route handlers
│   └── compiler.js    ← Lexer, recursive-descent parser, AST builder
├── public/
│   └── index.html     ← Full React-less SPA frontend (D3.js tree viz)
├── package.json
└── README.md
```

---

## ✨ Features

| Feature | Status |
|---------|--------|
| Lexical analysis with token types | ✅ |
| Recursive-descent parser (operator precedence) | ✅ |
| Naive LR parser (no precedence, for comparison) | ✅ |
| AST view (groups stripped) | ✅ |
| Parse Tree view (groups retained) | ✅ |
| Animated node-by-node tree reveal | ✅ |
| Step-by-step parse walkthrough | ✅ |
| Live call stack per parse step | ✅ |
| Real-time token update as you type | ✅ |
| Error position underline in input | ✅ |
| Hover tooltips (type, value, role, precedence) | ✅ |
| Inorder / Preorder / Postorder traversal | ✅ |
| D3.js zoom + pan | ✅ |
| Dark / Light theme | ✅ |
| API activity log panel | ✅ |
| REST API (`/tokenize`, `/parse`, `/steps`) | ✅ |
| Mobile responsive layout | ✅ |

---

## 🔤 Supported Syntax

| Element | Examples |
|---------|---------|
| Variables | `a`, `foo`, `myVar` |
| Numbers | `42`, `3.14` |
| Operators | `+`  `−`  `*`  `/` |
| Grouping | `(a + b) * c` |

---

## 🛠 Tech Stack

- **Backend:** Node.js + Express
- **Frontend:** Vanilla JS + D3.js (no framework, no build step)
- **Parser:** Hand-written recursive descent (no parser-generator libraries)
