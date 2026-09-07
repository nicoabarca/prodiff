import { checkCaseColumns } from "$lib/event-log/invokers/check-case-columns";
import type { ResponseCaseColumnViolation } from "$lib/event-log/invokers/types";

type Check = (
  sourcePath: string,
  caseColumn: string,
  columns: string[]
) => Promise<ResponseCaseColumnViolation[]>;

interface Options {
  check?: Check;
  debounce?: number;
}

/**
 * Whether the columns declared case-scoped with `require_constant` hold up over
 * the whole file, which the 300-row preview cannot answer.
 */
export class CaseColumnChecks {
  violations = $state<ResponseCaseColumnViolation[]>([]);
  checking = $state(false);
  error = $state<string | null>(null);

  #check: Check;
  #debounce: number;
  #signature = "";
  #generation = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: Options = {}) {
    this.#check = options.check ?? checkCaseColumns;
    this.#debounce = options.debounce ?? 400;
  }

  reset() {
    clearTimeout(this.#timer);
    this.#generation += 1;
    this.#signature = "";
    this.violations = [];
    this.checking = false;
    this.error = null;
  }

  violation(column: string): ResponseCaseColumnViolation | null {
    return this.violations.find((v) => v.column === column) ?? null;
  }

  /** A failed check leaves the answer unknown, so it does not hold the user back. */
  get settled(): boolean {
    return !this.checking && this.violations.length === 0;
  }

  sync(path: string | null, caseColumn: string | null, columns: string[]) {
    const signature = JSON.stringify([path, caseColumn, columns]);
    if (signature === this.#signature) return;
    this.#signature = signature;
    this.#generation += 1;
    clearTimeout(this.#timer);

    if (!path || !caseColumn || columns.length === 0) {
      this.violations = [];
      this.checking = false;
      this.error = null;
      return;
    }

    this.checking = true;
    this.error = null;
    const generation = this.#generation;
    this.#timer = setTimeout(
      () => void this.#run(path, caseColumn, columns, generation),
      this.#debounce
    );
  }

  async #run(path: string, caseColumn: string, columns: string[], generation: number) {
    try {
      const violations = await this.#check(path, caseColumn, columns);
      if (generation !== this.#generation) return;
      this.violations = violations;
      this.checking = false;
    } catch (error) {
      if (generation !== this.#generation) return;
      this.violations = [];
      this.checking = false;
      this.error = String(error);
    }
  }
}
