const KEYWORDS = new Set(['int', 'float', 'char', 'void', 'double', 'if', 'else', 'for', 'while', 'do', 'return', 'break', 'continue', 'struct', 'typedef', 'switch', 'case', 'default']);
const OPERATORS = new Set(['==', '!=', '<=', '>=', '<<', '>>', '++', '--', '+=', '-=', '*=', '/=', '&&', '||', '=', '<', '>', '!', '+', '-', '*', '/', '%', '&', '|', '^', '~']);
const DELIMITERS = new Set(['{', '}', '(', ')', '[', ']', ';', ',', ':']);

function lex(src) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;

  while (i < src.length) {
    if (src[i] === '\n') { line++; col=1; i++; continue; }
    if (/\s/.test(src[i])) { col++; i++; continue; }

    if (src[i] === '/' && src[i+1] === '/') {
      while (i < src.length && src[i] !== '\n') { i++; col++; }
      continue;
    }
    if (src[i] === '/' && src[i+1] === '*') {
      i += 2; col += 2;
      while (i < src.length && !(src[i] === '*' && src[i+1] === '/')) {
        if (src[i] === '\n') { line++; col=1; } else { col++; }
        i++;
      }
      i += 2; col += 2;
      continue;
    }

    const startPos = i;
    const startCol = col;

    if (src[i] === '#') {
      let v = '';
      while (i < src.length && src[i] !== '\n') { v += src[i++]; col++; }
      tokens.push({ type: 'PREPROCESSOR', value: v.trim(), pos: startPos, line, col: startCol });
      continue;
    }

    if (src[i] === '"') {
      let v = src[i++]; col++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') { v += src[i++]; col++; }
        v += src[i++]; col++;
      }
      if (i < src.length) { v += src[i++]; col++; }
      tokens.push({ type: 'STRING', value: v, pos: startPos, line, col: startCol });
      continue;
    }

    if (src[i] === "'") {
      let v = src[i++]; col++;
      while (i < src.length && src[i] !== "'") {
        if (src[i] === '\\') { v += src[i++]; col++; }
        v += src[i++]; col++;
      }
      if (i < src.length) { v += src[i++]; col++; }
      tokens.push({ type: 'CHAR', value: v, pos: startPos, line, col: startCol });
      continue;
    }

    if (/\d/.test(src[i])) {
      let v = '';
      let isFloat = false;
      while (i < src.length && /[\d.eE+-]/.test(src[i])) {
        if (src[i] === '.') isFloat = true;
        v += src[i++]; col++;
      }
      tokens.push({ type: isFloat ? 'FLOAT_LITERAL' : 'NUMBER', value: v, pos: startPos, line, col: startCol });
      continue;
    }

    if (/[a-zA-Z_]/.test(src[i])) {
      let v = '';
      while (i < src.length && /[a-zA-Z_0-9]/.test(src[i])) { v += src[i++]; col++; }
      if (KEYWORDS.has(v)) tokens.push({ type: 'KEYWORD', value: v, pos: startPos, line, col: startCol });
      else tokens.push({ type: 'IDENT', value: v, pos: startPos, line, col: startCol });
      continue;
    }

    let matchedOp = false;
    for (const op of ['==', '!=', '<=', '>=', '<<', '>>', '++', '--', '+=', '-=', '*=', '/=', '&&', '||']) {
      if (src.substring(i, i + 2) === op) {
        tokens.push({ type: 'OP', value: op, pos: startPos, line, col: startCol });
        i += 2; col += 2;
        matchedOp = true;
        break;
      }
    }
    if (matchedOp) continue;

    if ('=<>!+-*/%&|^~'.includes(src[i])) {
      tokens.push({ type: 'OP', value: src[i++], pos: startPos, line, col: startCol });
      continue;
    }

    if (DELIMITERS.has(src[i])) {
      tokens.push({ type: 'DELIMITER', value: src[i++], pos: startPos, line, col: startCol });
      continue;
    }

    throw { message: `Lexical Error: Unexpected character '${src[i]}'`, line, col };
  }
  
  tokens.push({ type: 'EOF', value: '', pos: i, line, col });
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    this.uid = 0;
    this.steps = [];
    this.steps = [];
    this.stack = [];
    this.errors = [];
  }

  freshId() { return this.uid++; }
  peek() { return this.pos < this.tokens.length ? this.tokens[this.pos] : this.tokens[this.tokens.length - 1]; }
  advance() { 
    const t = this.peek();
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }
  addStep(desc, nodeLabel) {
    this.steps.push({ desc, nodeLabel, tokenIdx: Math.max(0, this.pos - 1), stack: [...this.stack] });
  }
  expect(type, val) {
    const t = this.peek();
    if (t.type === type && (!val || t.value === val)) {
      this.advance();
      this.addStep(`Matched ${type} '${t.value}'`, t.value);
      return t;
    }
    const expected = val ? `'${val}'` : type;
    throw { message: `Syntax Error: Expected ${expected} but got '${t.value}'`, line: t.line, col: t.col };
  }

  parse() {
    this.stack.push('Program');
    this.addStep('Start Program', null);
    const body = [];
    while (this.peek().type !== 'EOF') {
      try {
        const decl = this.parseDeclOrStmt();
        if (decl) body.push(decl);
      } catch(e) {
        this.errors.push(e);
        // Fallback: Just consume one token to prevent infinite loop and continue
        this.advance();
      }
    }
    this.stack.pop();
    this.addStep('Finished Program', null);
    if (this.errors.length > 0) throw this.errors[0]; // Propagate first error for fatal fail
    return { id: this.freshId(), type: 'Program', label: 'Program', children: body };
  }

  parseDeclOrStmt() {
    let t = this.peek();
    if (t.type === 'PREPROCESSOR') {
      this.advance();
      return { id: this.freshId(), type: 'Preprocessor', label: t.value, children: [], line: t.line };
    }
    if (t.type === 'KEYWORD' && ['int', 'float', 'char', 'void', 'double', 'struct'].includes(t.value)) {
      return this.parseDecl();
    }
    return this.parseStmt();
  }

  parseDecl() {
    this.stack.push('Decl');
    const typeTok = this.advance();
    let isPtr = false;
    if (this.peek().value === '*') {
      isPtr = true;
      this.advance();
    }
    const idTok = this.expect('IDENT');
    if (!idTok) return null;

    if (this.peek().value === '(') {
      // Function
      this.expect('DELIMITER', '(');
      const params = [];
      while (this.peek().value !== ')' && this.peek().type !== 'EOF') {
        const pType = this.expect('KEYWORD');
        let pIsPtr = false;
        if (this.peek().value === '*') { pIsPtr = true; this.advance(); }
        const pId = this.expect('IDENT');
        let isArr = false;
        if (this.peek().value === '[') {
           this.advance(); this.expect('DELIMITER', ']'); isArr = true;
        }
        params.push({ id: this.freshId(), type: 'Param', label: `${pType.value}${pIsPtr?'*':''}${isArr?'[]':''} ${pId.value}`, dataType: pType.value, name: pId.value, isPtr, isArr, line: pId.line });
        if (this.peek().value === ',') this.advance();
        else break;
      }
      this.expect('DELIMITER', ')');
      let body = null;
      if (this.peek().value === '{') {
        body = this.parseBlock();
      } else {
        this.expect('DELIMITER', ';');
      }
      this.stack.pop();
      return { id: this.freshId(), type: 'FunctionDecl', label: `func ${idTok.value}()`, dataType: typeTok.value, name: idTok.value, isPtr, line: idTok.line, children: [...params, body].filter(Boolean) };
    } else {
      // Variable(s)
      const vars = [];
      let currentId = idTok;
      let currentIsPtr = isPtr;
      
      while (true) {
        let isArr = false;
        let arrSize = null;
        if (this.peek().value === '[') {
          this.advance();
          if (this.peek().type === 'NUMBER') {
            arrSize = this.advance().value;
          }
          this.expect('DELIMITER', ']');
          isArr = true;
        }

        let init = null;
        if (this.peek().value === '=') {
          this.advance();
          init = this.parseExpr();
        }
        
        vars.push({ id: this.freshId(), type: 'VarDecl', label: `${typeTok.value}${currentIsPtr?'*':''} ${currentId.value}${isArr?'[]':''}`, dataType: typeTok.value, name: currentId.value, isPtr: currentIsPtr, isArr, arrSize, line: currentId.line, children: init ? [init] : [] });

        if (this.peek().value === ',') {
          this.advance();
          currentIsPtr = false;
          if (this.peek().value === '*') { currentIsPtr = true; this.advance(); }
          currentId = this.expect('IDENT');
        } else {
          break;
        }
      }
      this.expect('DELIMITER', ';');
      this.stack.pop();
      if (vars.length === 1) return vars[0];
      return { id: this.freshId(), type: 'MultiVarDecl', label: `Vars (${typeTok.value})`, children: vars };
    }
  }

  parseStmt() {
    this.stack.push('Stmt');
    const t = this.peek();
    let res = null;

    if (t.value === '{') {
      res = this.parseBlock();
    } else if (t.type === 'KEYWORD') {
      if (t.value === 'if') {
        this.advance(); this.expect('DELIMITER', '(');
        const cond = this.parseExpr();
        this.expect('DELIMITER', ')');
        const cons = this.parseStmt();
        const alts = [];
        let alt = null;
        while (this.peek().value === 'else') {
          this.advance();
          if (this.peek().value === 'if') {
            this.advance(); this.expect('DELIMITER', '(');
            const eCond = this.parseExpr();
            this.expect('DELIMITER', ')');
            const eCons = this.parseStmt();
            alts.push({ id: this.freshId(), type: 'ElseIf', label: 'else if', children: [eCond, eCons] });
          } else {
            alt = this.parseStmt();
            break;
          }
        }
        res = { id: this.freshId(), type: 'IfStmt', label: 'if', children: [cond, cons, ...alts, alt].filter(Boolean), line: t.line };
      }
      else if (t.value === 'while') {
        this.advance(); this.expect('DELIMITER', '(');
        const cond = this.parseExpr();
        this.expect('DELIMITER', ')');
        const body = this.parseStmt();
        res = { id: this.freshId(), type: 'WhileStmt', label: 'while', children: [cond, body].filter(Boolean), line: t.line };
      }
      else if (t.value === 'do') {
        this.advance();
        const body = this.parseStmt();
        this.expect('KEYWORD', 'while');
        this.expect('DELIMITER', '(');
        const cond = this.parseExpr();
        this.expect('DELIMITER', ')');
        this.expect('DELIMITER', ';');
        res = { id: this.freshId(), type: 'DoWhileStmt', label: 'do-while', children: [body, cond], line: t.line };
      }
      else if (t.value === 'for') {
        this.advance(); this.expect('DELIMITER', '(');
        let init = null;
        if (this.peek().value !== ';') {
          if (['int','float','char'].includes(this.peek().value)) init = this.parseDecl();
          else { init = this.parseExpr(); this.expect('DELIMITER', ';'); }
        } else { this.advance(); }
        
        let cond = null;
        if (this.peek().value !== ';') cond = this.parseExpr();
        this.expect('DELIMITER', ';');
        
        let inc = null;
        if (this.peek().value !== ')') inc = this.parseExpr();
        this.expect('DELIMITER', ')');
        
        const body = this.parseStmt();
        res = { id: this.freshId(), type: 'ForStmt', label: 'for', children: [init, cond, inc, body].filter(Boolean), line: t.line };
      }
      else if (t.value === 'switch') {
        this.advance(); this.expect('DELIMITER', '(');
        const cond = this.parseExpr();
        this.expect('DELIMITER', ')');
        this.expect('DELIMITER', '{');
        const cases = [];
        while(this.peek().value !== '}' && this.peek().type !== 'EOF') {
          if (this.peek().value === 'case') {
            this.advance();
            const val = this.parseExpr();
            this.expect('DELIMITER', ':');
            const stmts = [];
            while(this.peek().value !== 'case' && this.peek().value !== 'default' && this.peek().value !== '}') {
              stmts.push(this.parseDeclOrStmt());
            }
            cases.push({ id: this.freshId(), type: 'Case', label: `case`, children: [val, {id: this.freshId(), type:'Block', label:'{...}', children:stmts}] });
          } else if (this.peek().value === 'default') {
            this.advance(); this.expect('DELIMITER', ':');
            const stmts = [];
            while(this.peek().value !== 'case' && this.peek().value !== '}') {
              stmts.push(this.parseDeclOrStmt());
            }
            cases.push({ id: this.freshId(), type: 'Default', label: `default`, children: [{id: this.freshId(), type:'Block', label:'{...}', children:stmts}] });
          } else {
            this.advance();
          }
        }
        this.expect('DELIMITER', '}');
        res = { id: this.freshId(), type: 'SwitchStmt', label: 'switch', children: [cond, ...cases], line: t.line };
      }
      else if (t.value === 'return') {
        this.advance();
        const expr = this.peek().value !== ';' ? this.parseExpr() : null;
        this.expect('DELIMITER', ';');
        res = { id: this.freshId(), type: 'ReturnStmt', label: 'return', children: expr ? [expr] : [], line: t.line };
      }
      else if (['break', 'continue'].includes(t.value)) {
        this.advance(); this.expect('DELIMITER', ';');
        res = { id: this.freshId(), type: t.value === 'break' ? 'BreakStmt' : 'ContinueStmt', label: t.value, children: [], line: t.line };
      }
    }
    
    if (!res) {
      const expr = this.parseExpr();
      if (this.peek().value === ';') {
        this.advance();
      } else if (this.peek().type !== 'EOF') {
        // We only enforce semicolons strictly if it's not the end of the file/block
        if (this.peek().value !== '}') {
          this.expect('DELIMITER', ';');
        }
      }
      res = expr;
    }
    this.stack.pop();
    return res;
  }

  parseBlock() {
    this.stack.push('Block');
    this.expect('DELIMITER', '{');
    const stmts = [];
    while (this.peek().value !== '}' && this.peek().type !== 'EOF') {
      const s = this.parseDeclOrStmt();
      if (s) stmts.push(s);
    }
    this.expect('DELIMITER', '}');
    this.stack.pop();
    return { id: this.freshId(), type: 'Block', label: '{...}', children: stmts };
  }

  parseExpr() { return this.parseAssign(); }

  parseAssign() {
    let left = this.parseLogicalOr();
    if (this.peek().type === 'OP' && ['=', '+=', '-=', '*=', '/='].includes(this.peek().value)) {
      const op = this.advance();
      const right = this.parseAssign();
      return { id: this.freshId(), type: 'AssignExpr', label: op.value, children: [left, right], line: op.line };
    }
    return left;
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.peek().value === '||') {
      const op = this.advance();
      left = { id: this.freshId(), type: 'BinaryExpr', label: op.value, children: [left, this.parseLogicalAnd()], line: op.line };
    }
    return left;
  }
  parseLogicalAnd() {
    let left = this.parseEquality();
    while (this.peek().value === '&&') {
      const op = this.advance();
      left = { id: this.freshId(), type: 'BinaryExpr', label: op.value, children: [left, this.parseEquality()], line: op.line };
    }
    return left;
  }
  parseEquality() {
    let left = this.parseRelational();
    while (['==', '!='].includes(this.peek().value)) {
      const op = this.advance();
      left = { id: this.freshId(), type: 'BinaryExpr', label: op.value, children: [left, this.parseRelational()], line: op.line };
    }
    return left;
  }
  parseRelational() {
    let left = this.parseAddSub();
    while (['<', '<=', '>', '>='].includes(this.peek().value)) {
      const op = this.advance();
      left = { id: this.freshId(), type: 'BinaryExpr', label: op.value, children: [left, this.parseAddSub()], line: op.line };
    }
    return left;
  }
  parseAddSub() {
    let left = this.parseMulDiv();
    while (['+', '-'].includes(this.peek().value)) {
      const op = this.advance();
      left = { id: this.freshId(), type: 'BinaryExpr', label: op.value, children: [left, this.parseMulDiv()], line: op.line };
    }
    return left;
  }
  parseMulDiv() {
    let left = this.parseUnary();
    while (['*', '/', '%'].includes(this.peek().value)) {
      const op = this.advance();
      left = { id: this.freshId(), type: 'BinaryExpr', label: op.value, children: [left, this.parseUnary()], line: op.line };
    }
    return left;
  }
  parseUnary() {
    if (['!', '-', '++', '--', '&', '*'].includes(this.peek().value)) {
      const op = this.advance();
      return { id: this.freshId(), type: 'UnaryExpr', label: op.value, children: [this.parseUnary()], line: op.line };
    }
    return this.parsePostfix();
  }
  parsePostfix() {
    let left = this.parsePrimary();
    while (true) {
      if (this.peek().value === '++' || this.peek().value === '--') {
        const op = this.advance();
        left = { id: this.freshId(), type: 'UnaryExpr', label: op.value + '(post)', children: [left], line: op.line };
      } else if (this.peek().value === '[') {
        this.advance();
        const idx = this.parseExpr();
        this.expect('DELIMITER', ']');
        left = { id: this.freshId(), type: 'ArrayAccess', label: '[]', children: [left, idx], line: left.line };
      } else {
        break;
      }
    }
    return left;
  }
  parsePrimary() {
    const t = this.peek();

    if (['NUMBER', 'FLOAT_LITERAL', 'STRING', 'CHAR'].includes(t.type)) {
      this.advance();
      return { id: this.freshId(), type: 'Literal', label: t.value, children: [], val: t.value, dataType: t.type, line: t.line };
    }

    if (t.type === 'IDENT') {
      this.advance();
      if (this.peek().value === '(') {
        this.advance();
        const args = [];
        while (this.peek().value !== ')' && this.peek().type !== 'EOF') {
          args.push(this.parseExpr());
          if (this.peek().value === ',') this.advance();
        }
        this.expect('DELIMITER', ')');
        return { id: this.freshId(), type: 'CallExpr', label: `${t.value}()`, name: t.value, children: args, line: t.line };
      }
      return { id: this.freshId(), type: 'Identifier', label: t.value, name: t.value, children: [], line: t.line };
    }

    if (t.value === '(') {
      this.advance();
      const expr = this.parseExpr();
      this.expect('DELIMITER', ')');
      return expr;
    }

    throw { message: `Syntax Error: Unexpected token '${t.value}'`, line: t.line, col: t.col };
  }
}

function analyzeSemantics(ast) {
  const symbolTable = [];
  const errors = [];
  let scopeId = 0;
  
  function traverse(node, currentScope) {
    if (!node) return;

    if (node.type === 'FunctionDecl') {
      symbolTable.push({ name: node.name, entityType: 'Function', dataType: node.dataType, scope: currentScope === 0 ? 'Global' : 'Local', line: node.line });
      const newScope = ++scopeId;
      node.children.forEach(c => traverse(c, newScope));
      return;
    }
    
    if (node.type === 'VarDecl') {
      if (symbolTable.find(s => s.name === node.name && s.scope === (currentScope === 0 ? 'Global' : 'Local'))) {
        errors.push({ msg: `Variable '${node.name}' is already declared in this scope.`, line: node.line });
      } else {
        symbolTable.push({ name: node.name, entityType: node.isArr ? 'Array' : (node.isPtr ? 'Pointer' : 'Variable'), dataType: node.dataType, scope: currentScope === 0 ? 'Global' : 'Local', line: node.line });
      }
    }

    if (node.type === 'Param') {
      symbolTable.push({ name: node.name, entityType: 'Parameter', dataType: node.dataType, scope: currentScope === 0 ? 'Global' : 'Local', line: node.line });
    }

    if (node.type === 'Identifier') {
      const exists = symbolTable.find(s => s.name === node.name);
      if (!exists) {
        errors.push({ msg: `Undeclared identifier '${node.name}'.`, line: node.line });
      }
    }
    
    if (node.type === 'CallExpr') {
      const exists = symbolTable.find(s => s.name === node.name && s.entityType === 'Function');
      if (!exists && !['printf', 'scanf'].includes(node.name)) {
        errors.push({ msg: `Undeclared function '${node.name}'.`, line: node.line });
      } else if (exists && exists.children) {
         // rough arg check
      }
    }
    
    if (node.type === 'AssignExpr') {
       // very rough type check
       const left = node.children[0];
       const right = node.children[1];
       if (left.type === 'Identifier' && right.type === 'Literal') {
          const sym = symbolTable.find(s => s.name === left.name);
          if (sym && sym.dataType === 'int' && right.dataType === 'FLOAT_LITERAL') {
             errors.push({ msg: `Type mismatch: Assigning float to int '${left.name}'.`, line: node.line });
          }
       }
    }

    let nextScope = currentScope;
    if (node.type === 'Block') nextScope = ++scopeId;

    if (node.children) node.children.forEach(c => traverse(c, nextScope));
  }

  traverse(ast, 0);
  return { symbolTable, semanticErrors: errors };
}

function generateTAC(ast) {
  const tac = [];
  let tCount = 0, lCount = 0;

  function newTemp() { return `t${++tCount}`; }
  function newLabel() { return `L${++lCount}`; }

  function gen(node) {
    if (!node) return '';
    if (node.type === 'Literal') return node.val;
    if (node.type === 'Identifier') return node.name;
    
    if (node.type === 'AssignExpr') {
      const left = gen(node.children[0]);
      const right = gen(node.children[1]);
      tac.push(`${left} ${node.label} ${right}`);
      return left;
    }
    if (node.type === 'BinaryExpr') {
      const left = gen(node.children[0]);
      const right = gen(node.children[1]);
      const t = newTemp();
      tac.push(`${t} = ${left} ${node.label} ${right}`);
      return t;
    }
    if (node.type === 'UnaryExpr') {
      const inner = gen(node.children[0]);
      const t = newTemp();
      tac.push(`${t} = ${node.label} ${inner}`);
      return t;
    }
    if (node.type === 'VarDecl' && node.children.length > 0) {
      const right = gen(node.children[0]);
      tac.push(`${node.name} = ${right}`);
      return '';
    }
    if (node.type === 'MultiVarDecl') {
      node.children.forEach(gen);
      return '';
    }
    if (node.type === 'FunctionDecl') {
      tac.push(`func begin ${node.name}`);
      node.children.forEach(gen);
      tac.push(`func end ${node.name}`);
      return '';
    }
    if (node.type === 'IfStmt') {
      const cond = gen(node.children[0]);
      const lTrue = newLabel(), lEnd = newLabel();
      tac.push(`if ${cond} goto ${lTrue}`);
      let hasElse = node.children.length > 2;
      const lFalse = hasElse ? newLabel() : lEnd;
      if (hasElse) tac.push(`goto ${lFalse}`);
      tac.push(`${lTrue}:`);
      gen(node.children[1]);
      if (hasElse) {
        tac.push(`goto ${lEnd}`);
        tac.push(`${lFalse}:`);
        gen(node.children[2]);
      }
      tac.push(`${lEnd}:`);
      return '';
    }
    if (node.type === 'WhileStmt') {
      const lStart = newLabel(), lEnd = newLabel();
      tac.push(`${lStart}:`);
      const cond = gen(node.children[0]);
      tac.push(`ifFalse ${cond} goto ${lEnd}`);
      gen(node.children[1]);
      tac.push(`goto ${lStart}`);
      tac.push(`${lEnd}:`);
      return '';
    }
    if (node.type === 'ForStmt') {
      const lStart = newLabel(), lEnd = newLabel();
      gen(node.children[0]);
      tac.push(`${lStart}:`);
      if (node.children[1]) {
        const cond = gen(node.children[1]);
        tac.push(`ifFalse ${cond} goto ${lEnd}`);
      }
      gen(node.children[3]);
      gen(node.children[2]);
      tac.push(`goto ${lStart}`);
      tac.push(`${lEnd}:`);
      return '';
    }
    if (node.type === 'ReturnStmt') {
      if (node.children.length > 0) tac.push(`return ${gen(node.children[0])}`);
      else tac.push(`return`);
      return '';
    }
    if (node.type === 'CallExpr') {
      const args = node.children.map(gen);
      args.forEach(a => tac.push(`param ${a}`));
      const t = newTemp();
      tac.push(`${t} = call ${node.name}, ${args.length}`);
      return t;
    }
    if (node.type === 'ArrayAccess') {
      const arr = gen(node.children[0]);
      const idx = gen(node.children[1]);
      const t = newTemp();
      tac.push(`${t} = ${arr}[${idx}]`);
      return t;
    }
    if (node.children) node.children.forEach(gen);
    return '';
  }
  gen(ast);
  return tac;
}

function optimizeTAC(tac) {
  let opt = [];
  let folded = 0, elim = 0;
  
  // Pass 1: Constant Folding
  for (let i = 0; i < tac.length; i++) {
    let line = tac[i];
    const match = line.match(/^(t\d+) = (\d+(?:\.\d+)?) ([+\-*/]) (\d+(?:\.\d+)?)$/);
    if (match) {
      const [_, t, left, op, right] = match;
      const l = parseFloat(left), r = parseFloat(right);
      let res = 0;
      if (op==='+') res = l+r;
      if (op==='-') res = l-r;
      if (op==='*') res = l*r;
      if (op==='/') res = Math.floor(l/r);
      opt.push({ old: line, new: `${t} = ${res}`, type: 'folded', varOpt: t });
      folded++;
    } else {
      opt.push({ old: line, new: line, type: 'same' });
    }
  }

  // Pass 2: Dead Code Elimination
  const usedVars = new Set();
  for (let i = 0; i < opt.length; i++) {
    const line = opt[i].new;
    // Extract variables used on the right hand side or in commands
    const rhsMatch1 = line.match(/^[^=]+ = (.+)$/);
    if (rhsMatch1) {
       const rhsTokens = rhsMatch1[1].match(/[a-zA-Z_]\w*/g) || [];
       rhsTokens.forEach(v => usedVars.add(v));
    }
    const otherMatch = line.match(/^(?:param|return|if|ifFalse) ([a-zA-Z_]\w*)/);
    if (otherMatch) {
       usedVars.add(otherMatch[1]);
    }
    // Extract variables used in array access left-side of assignment (e.g., arr[i] = x)
    // Though currently generated TAC only does t = arr[idx] which is handled above.
  }

  // Eliminate unused assignments
  for (let i = opt.length - 1; i >= 0; i--) {
    const line = opt[i].new;
    const assignMatch = line.match(/^(t\d+|[a-zA-Z_]\w*) =/);
    if (assignMatch) {
      const dest = assignMatch[1];
      // Only eliminate temporaries that are completely unused for safety, 
      // or user variables if we are brave. Let's stick to temporaries (tX) for safe DCE.
      if (dest.startsWith('t') && !usedVars.has(dest)) {
        opt[i].type = 'eliminated';
        opt[i].varOpt = dest;
        opt[i].new = `; Eliminated dead assignment to ${dest}`;
        elim++;
      }
    }
  }

  return { optTac: opt, stats: { folded, elim } };
}

function generateAssembly(tac) {
  const asm = [];
  asm.push(".text");
  asm.push(".globl main");
  
  let regs = ['eax', 'ebx', 'ecx', 'edx'];
  let regIdx = 0;
  function getReg() { return regs[regIdx++ % 4]; }

  for (let item of tac) {
    let line = typeof item === 'string' ? item : item.new;
    if (line.startsWith('func begin')) { asm.push({ inst: `${line.split(' ')[2]}:`, tac: line }); asm.push({ inst: `  push rbp\n  mov rbp, rsp`, tac: line }); continue; }
    if (line.startsWith('func end')) { asm.push({ inst: `  pop rbp\n  ret`, tac: line }); continue; }
    if (line.endsWith(':')) { asm.push({ inst: line, tac: line }); continue; }
    if (line.startsWith('return')) {
      const val = line.split(' ')[1];
      if (val) asm.push({ inst: `  mov eax, ${val}`, tac: line });
      asm.push({ inst: `  pop rbp\n  ret`, tac: line });
      continue;
    }
    const assign = line.match(/^([a-zA-Z0-9_]+) = (.+)$/);
    if (assign) {
      const dest = assign[1];
      const right = assign[2];
      const bin = right.match(/^([a-zA-Z0-9_.]+) ([+\-*/]) ([a-zA-Z0-9_.]+)$/);
      if (bin) {
        const r = getReg();
        asm.push({ inst: `  mov ${r}, ${bin[1]}\n  add ${r}, ${bin[3]}\n  mov ${dest}, ${r}`, tac: line }); // simplified
      } else if (right.startsWith('call')) {
        const fn = right.split(' ')[1].replace(',','');
        asm.push({ inst: `  call ${fn}\n  mov ${dest}, eax`, tac: line });
      } else {
        asm.push({ inst: `  mov ${dest}, ${right}`, tac: line });
      }
      continue;
    }
    if (line.startsWith('param')) { asm.push({ inst: `  push ${line.split(' ')[1]}`, tac: line }); continue; }
    if (line.startsWith('goto')) { asm.push({ inst: `  jmp ${line.split(' ')[1]}`, tac: line }); continue; }
    if (line.startsWith('if ')) {
      const p = line.split(' ');
      asm.push({ inst: `  cmp ${p[1]}, 1\n  je ${p[3]}`, tac: line });
      continue;
    }
    if (line.startsWith('ifFalse ')) {
      const p = line.split(' ');
      asm.push({ inst: `  cmp ${p[1]}, 0\n  je ${p[3]}`, tac: line });
      continue;
    }
  }
  return asm;
}

function compileFull(src) {
  const t0 = performance.now();
  let tokens = [];
  let lexError = null;
  try { tokens = lex(src); } catch(e) { lexError = e; }
  const t1 = performance.now();

  let ast = null, steps = [], parseError = null;
  if (!lexError && tokens.length) {
    try {
      const parser = new Parser(tokens);
      ast = parser.parse();
      steps = parser.steps;
    } catch(e) { parseError = e; }
  }
  const t2 = performance.now();

  let symbolTable = [], semanticErrors = [];
  if (ast) {
    const sem = analyzeSemantics(ast);
    symbolTable = sem.symbolTable;
    semanticErrors = sem.semanticErrors;
  }
  const t3 = performance.now();

  let tac = [];
  if (ast && !parseError) {
    tac = generateTAC(ast);
  }
  const t4 = performance.now();

  let optResult = { optTac: [], stats: { folded:0, elim:0 } };
  if (tac.length) {
    optResult = optimizeTAC(tac);
  }
  const t5 = performance.now();

  let assembly = [];
  if (optResult.optTac.length) {
    assembly = generateAssembly(optResult.optTac);
  }
  const t6 = performance.now();

  return {
    tokens,
    ast,
    steps,
    symbolTable,
    semanticErrors,
    tac,
    optResult,
    assembly,
    errors: [lexError, parseError].filter(Boolean).map(e => ({ msg: e.message, line: e.line, col: e.col })),
    timings: { lex: t1-t0, parse: t2-t1, sem: t3-t2, icg: t4-t3, opt: t5-t4, asm: t6-t5 }
  };
}

module.exports = { compileFull, lex, parse: (toks) => new Parser(toks).parse() };
