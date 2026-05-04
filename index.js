const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { lex, parse } = require('./compiler');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static(__dirname));

// MongoDB connection
mongoose.connect('mongodb://127.0.0.1:27017/compilerviz')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const ParseSchema = new mongoose.Schema({
  expression: String,
  tokens: Array,
  ast: Object,
  timestamp: { type: Date, default: Date.now }
});
const ParseRun = mongoose.model('ParseRun', ParseSchema);

app.post('/tokenize', (req, res) => {
  try {
    const tokens = lex(req.body.code || '');
    res.json({ tokens });
  } catch (error) {
    res.status(400).json({ error: error.message || error, pos: error.pos });
  }
});

app.post('/compile', async (req, res) => {
  try {
    const code = req.body.code || '';
    const { compileFull } = require('./compiler');
    const result = compileFull(code);
    
    // Attempt save to DB
    try {
      const run = new ParseRun({
        expression: code,
        tokens: result.tokens,
        ast: result.ast
      });
      await run.save();
    } catch(e) {}
    
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || error, line: error.line, col: error.col });
  }
});

app.post('/steps', (req, res) => {
  try {
    const tokens = lex(req.body.code || '');
    const { steps } = parse(tokens);
    res.json({ steps });
  } catch (error) {
    res.status(400).json({ error: error.message || error, pos: error.pos });
  }
});

app.get('/history', async (req, res) => {
  try {
    const history = await ParseRun.find().sort({ timestamp: -1 });
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/history/:id', async (req, res) => {
  try {
    await ParseRun.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
