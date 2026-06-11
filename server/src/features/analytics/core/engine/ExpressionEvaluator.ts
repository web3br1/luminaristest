/**
 * Expression Evaluator
 *
 * A safe expression evaluator for numeric formulas.
 * Supports: +, -, *, /, parentheses, variables, and numeric literals.
 * No function calls, no property access, no unsafe constructs.
 */

const TOKEN_REGEX = /\s*([A-Za-z_][A-Za-z0-9_]*|\d*\.\d+|\d+|[()*/+\-])\s*/g;

type Token = { type: 'number' | 'var' | 'op' | 'lparen' | 'rparen'; value: string };

const rpnCache = new Map<string, Token[]>();

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  // Reset regex state
  TOKEN_REGEX.lastIndex = 0;

  while ((match = TOKEN_REGEX.exec(expression)) !== null) {
    if (match.index !== lastIndex) {
      throw new Error(`Invalid token near: '${expression.slice(lastIndex, match.index)}'`);
    }
    const v = match[1];
    if (!isNaN(Number(v))) {
      tokens.push({ type: 'number', value: v });
    } else if (v === '+' || v === '-' || v === '*' || v === '/') {
      tokens.push({ type: 'op', value: v });
    } else if (v === '(') {
      tokens.push({ type: 'lparen', value: v });
    } else if (v === ')') {
      tokens.push({ type: 'rparen', value: v });
    } else {
      tokens.push({ type: 'var', value: v });
    }
    lastIndex = TOKEN_REGEX.lastIndex;
  }

  if (lastIndex !== expression.length) {
    throw new Error(`Invalid expression syntax near: '${expression.slice(lastIndex)}'`);
  }
  return tokens;
}

function precedence(op: string): number {
  switch (op) {
    case '*':
    case '/':
      return 2;
    case '+':
    case '-':
      return 1;
    default:
      return 0;
  }
}

function toRPN(tokens: Token[]): Token[] {
  const output: Token[] = [];
  const ops: Token[] = [];

  for (const t of tokens) {
    if (t.type === 'number' || t.type === 'var') {
      output.push(t);
    } else if (t.type === 'op') {
      while (
        ops.length > 0 &&
        ops[ops.length - 1].type === 'op' &&
        precedence(ops[ops.length - 1].value) >= precedence(t.value)
      ) {
        output.push(ops.pop() as Token);
      }
      ops.push(t);
    } else if (t.type === 'lparen') {
      ops.push(t);
    } else if (t.type === 'rparen') {
      while (ops.length > 0 && ops[ops.length - 1].type !== 'lparen') {
        output.push(ops.pop() as Token);
      }
      if (ops.length === 0 || ops[ops.length - 1].type !== 'lparen') {
        throw new Error('Mismatched parentheses');
      }
      ops.pop();
    }
  }

  while (ops.length > 0) {
    const op = ops.pop() as Token;
    if (op.type === 'lparen' || op.type === 'rparen') {
      throw new Error('Mismatched parentheses');
    }
    output.push(op);
  }

  return output;
}

/**
 * Evaluates a mathematical expression with variables.
 *
 * @param expression The expression string (e.g., "sales - expenses")
 * @param variables Object mapping variable names to values
 * @returns The calculated result
 */
export function evaluateExpression(
  expression: string,
  variables: Record<string, number>
): number {
  let rpn = rpnCache.get(expression);
  if (!rpn) {
    rpn = toRPN(tokenize(expression));
    rpnCache.set(expression, rpn);
  }

  const stack: number[] = [];

  for (const t of rpn) {
    if (t.type === 'number') {
      stack.push(Number(t.value));
    } else if (t.type === 'var') {
      const val = variables[t.value];
      if (typeof val !== 'number' || !isFinite(val)) {
        stack.push(0);
      } else {
        stack.push(val);
      }
    } else if (t.type === 'op') {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) {
        throw new Error('Invalid expression: missing operands');
      }
      switch (t.value) {
        case '+':
          stack.push(a + b);
          break;
        case '-':
          stack.push(a - b);
          break;
        case '*':
          stack.push(a * b);
          break;
        case '/':
          stack.push(b === 0 ? 0 : a / b);
          break;
        default:
          throw new Error(`Unsupported operator: ${t.value}`);
      }
    }
  }

  if (stack.length !== 1) {
    throw new Error('Invalid expression: remaining stack not singular');
  }

  const result = stack[0];
  return isFinite(result) ? result : 0;
}

