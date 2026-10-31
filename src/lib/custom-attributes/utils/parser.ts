import {
  AGGREGATE_FUNCTIONS,
  type AggregateFunction,
  type BinaryOperator,
  type Formula
} from "$lib/custom-attributes/invokers/types";

/**
 * The formula language: number columns in brackets, decimal numbers, `+ - * /`,
 * unary minus, parentheses and function calls. A `]` inside a column name is
 * written `]]`. A call is one token from its lowercase name to its `(`, so
 * `sum (` reads the same as `sum(`.
 *
 *   sum     := product (("+" | "-") product)*
 *   product := unary (("*" | "/") unary)*
 *   unary   := "-" unary | atom
 *   atom    := number | "[" name "]" | "(" sum ")" | call
 *   call    := aggregate "(" "[" name "]" ")" | ("count" | "duration") "(" ")"
 *
 * `at` is the character offset the error points at.
 */
export const FUNCTIONS = [...AGGREGATE_FUNCTIONS, "count", "duration"] as const;
export type FunctionName = (typeof FUNCTIONS)[number];

export function isAggregate(name: FunctionName): name is AggregateFunction {
  return (AGGREGATE_FUNCTIONS as readonly string[]).includes(name);
}

function isFunction(name: string): name is FunctionName {
  return (FUNCTIONS as readonly string[]).includes(name);
}

export type ParseResult = { ok: true; formula: Formula } | { ok: false; error: string; at: number };

export type Token =
  | { kind: "column"; name: string; at: number; end: number }
  | { kind: "number"; value: number; at: number; end: number }
  | { kind: "operator"; op: BinaryOperator; at: number; end: number }
  | { kind: "function"; name: FunctionName; at: number; end: number }
  | { kind: "open"; at: number; end: number }
  | { kind: "close"; at: number; end: number };

class FormulaError extends Error {
  constructor(
    message: string,
    readonly at: number
  ) {
    super(message);
  }
}

const OPERATORS: Record<string, BinaryOperator> = { "+": "+", "-": "-", "*": "*", "/": "/" };

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (/\s/.test(char)) {
      i++;
    } else if (char === "[") {
      const start = i;
      let name = "";
      i++;
      for (;;) {
        if (i >= text.length) throw new FormulaError("Close the column name with ]", start);
        if (text[i] === "]") {
          if (text[i + 1] === "]") {
            name += "]";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        name += text[i];
        i++;
      }
      if (name.trim() === "") throw new FormulaError("Name a column between the brackets", start);
      tokens.push({ kind: "column", name, at: start, end: i });
    } else if (/[A-Za-z_]/.test(char)) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*(\()?/.exec(text.slice(i))!;
      const [whole, name, open] = match;
      const lower = name.toLowerCase();
      if (!isFunction(lower)) {
        throw new FormulaError(
          `${name} is not a function. Use ${FUNCTIONS.slice(0, -1).join(", ")} or ${FUNCTIONS.at(-1)}`,
          i
        );
      }
      if (lower !== name) throw new FormulaError(`Write ${lower} in lowercase`, i);
      if (!open) throw new FormulaError(`Call ${name} with parentheses, as in ${example(name)}`, i);
      tokens.push({ kind: "function", name, at: i, end: i + whole.length });
      i += whole.length;
    } else if (/[0-9]/.test(char)) {
      const match = /^[0-9]+(\.[0-9]+)?/.exec(text.slice(i))!;
      tokens.push({ kind: "number", value: Number(match[0]), at: i, end: i + match[0].length });
      i += match[0].length;
    } else if (char in OPERATORS) {
      tokens.push({ kind: "operator", op: OPERATORS[char], at: i, end: i + 1 });
      i++;
    } else if (char === "(") {
      tokens.push({ kind: "open", at: i, end: i + 1 });
      i++;
    } else if (char === ")") {
      tokens.push({ kind: "close", at: i, end: i + 1 });
      i++;
    } else {
      throw new FormulaError(`"${char}" is not part of a formula`, i);
    }
  }
  return tokens;
}

/** How a call to `name` is written, for messages. */
function example(name: FunctionName): string {
  return isAggregate(name) ? `${name}([column])` : `${name}()`;
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly length: number
  ) {}

  parse(): Formula {
    if (this.tokens.length === 0) throw new FormulaError("Write a formula", 0);
    const formula = this.sum();
    const next = this.peek();
    if (next) {
      const message = next.kind === "close" ? "This ) has no matching (" : "Add an operator here";
      throw new FormulaError(message, next.at);
    }
    return formula;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private operator(ops: BinaryOperator[]): BinaryOperator | null {
    const token = this.peek();
    if (token?.kind === "operator" && ops.includes(token.op)) {
      this.index++;
      return token.op;
    }
    return null;
  }

  private sum(): Formula {
    let left = this.product();
    for (let op = this.operator(["+", "-"]); op; op = this.operator(["+", "-"])) {
      left = { kind: "binary", op, left, right: this.product() };
    }
    return left;
  }

  private product(): Formula {
    let left = this.unary();
    for (let op = this.operator(["*", "/"]); op; op = this.operator(["*", "/"])) {
      left = { kind: "binary", op, left, right: this.unary() };
    }
    return left;
  }

  private unary(): Formula {
    if (this.operator(["-"])) return { kind: "negate", operand: this.unary() };
    return this.atom();
  }

  private atom(): Formula {
    const token = this.peek();
    if (!token) throw new FormulaError("The formula ends too early", this.length);
    this.index++;
    switch (token.kind) {
      case "column":
        return { kind: "column", name: token.name };
      case "number":
        return { kind: "number", value: token.value };
      case "function":
        return this.call(token.name, token.at);
      case "open": {
        const inner = this.sum();
        const close = this.peek();
        if (close?.kind !== "close") {
          throw new FormulaError("Close this ( with )", token.at);
        }
        this.index++;
        return inner;
      }
      default:
        throw new FormulaError("Expected a column, a number, a function or ( here", token.at);
    }
  }

  /** The rest of a call whose `name(` token starts at `at`. */
  private call(name: FunctionName, at: number): Formula {
    if (!isAggregate(name)) {
      this.closeCall(at, `${name}() takes no column`);
      return name === "count" ? { kind: "count" } : { kind: "duration" };
    }
    const argument = this.peek();
    if (argument?.kind !== "column") {
      throw new FormulaError(`${name}() needs one column, like ${example(name)}`, at);
    }
    this.index++;
    this.closeCall(at, `${name}() takes exactly one column, like ${example(name)}`);
    return { kind: "aggregate", fn: name, column: argument.name };
  }

  private closeCall(at: number, message: string) {
    const close = this.peek();
    if (close?.kind !== "close") throw new FormulaError(message, close?.at ?? at);
    this.index++;
  }
}

export function parseFormula(text: string): ParseResult {
  try {
    const formula = new Parser(tokenize(text), text.length).parse();
    return { ok: true, formula };
  } catch (error) {
    if (error instanceof FormulaError) return { ok: false, error: error.message, at: error.at };
    throw error;
  }
}
