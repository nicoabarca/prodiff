import { toast } from "svelte-sonner";
import { analyzeTimestampColumns } from "$lib/event-log/invokers/analyze-timestamp-columns";
import type { ColumnType, ResponseTimestampColumnReport } from "$lib/event-log/invokers/types";
import type { FormatCheck } from "$lib/event-log/types";
import {
  checkFromReport,
  formatCheckDetail,
  formatCheckMessage,
  patternUnresolved
} from "$lib/event-log/utils/format-check";
import {
  FORMAT_CATALOG,
  inferFormat,
  type FormatInference
} from "$lib/event-log/utils/timestamp-format";

export interface TimestampDeclaration {
  column: string;
  pattern: string | null;
}

type Analyze = (
  path: string,
  columns: string[],
  patterns: string[]
) => Promise<ResponseTimestampColumnReport[]>;

interface Notifications {
  error(description: string): void;
  warning(column: string, check: FormatCheck): void;
}

interface Options {
  analyze?: Analyze;
  notifications?: Notifications;
  debounce?: number;
}

const TOAST_DURATION = 12000;

const toastNotifications: Notifications = {
  error(description) {
    toast.error("Couldn't check the timestamp format", {
      description,
      duration: TOAST_DURATION
    });
  },
  warning(column, check) {
    toast.warning(formatCheckMessage(column, check), {
      description: formatCheckDetail(check, { total: true }),
      duration: TOAST_DURATION
    });
  }
};

export class TimestampFormats {
  inference = $state<Record<string, FormatInference>>({});
  patterns = $state<Record<string, string>>({});
  checks = $state<Record<string, FormatCheck>>({});
  checkingColumns = $state<string[]>([]);

  #analyze: Analyze;
  #notifications: Notifications;
  #debounce: number;
  #columns: { name: string; dtype: ColumnType }[] = [];
  #rows: string[][] = [];
  #checked = new Map<string, string>();
  #chosen = new Set<string>();
  #lastChosen: string | null = null;
  #signature = "";
  #generation = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: Options = {}) {
    this.#analyze = options.analyze ?? analyzeTimestampColumns;
    this.#notifications = options.notifications ?? toastNotifications;
    this.#debounce = options.debounce ?? 400;
  }

  seed(columns: { name: string; dtype: ColumnType }[], rows: string[][]) {
    this.reset();
    this.#columns = columns;
    this.#rows = rows;

    const inference: Record<string, FormatInference> = {};
    const patterns: Record<string, string> = {};
    columns.forEach((column, index) => {
      const result = inferFormat(rows.map((row) => row[index] ?? ""));
      inference[column.name] = result;
      if (result.pattern) patterns[column.name] = result.pattern;
    });
    this.inference = inference;
    this.patterns = patterns;
  }

  reset() {
    clearTimeout(this.#timer);
    this.#generation += 1;
    this.#columns = [];
    this.#rows = [];
    this.#checked.clear();
    this.#chosen.clear();
    this.#lastChosen = null;
    this.#signature = "";
    this.inference = {};
    this.patterns = {};
    this.checks = {};
    this.checkingColumns = [];
  }

  values(column: string): string[] {
    const index = this.#columns.findIndex(({ name }) => name === column);
    return index === -1 ? [] : this.#rows.map((row) => row[index] ?? "");
  }

  choose(column: string, pattern: string) {
    this.patterns = { ...this.patterns, [column]: pattern };
    this.#chosen.add(column);
    this.#lastChosen = pattern;
  }

  applyTo(columns: string[], pattern: string) {
    const patterns = { ...this.patterns };
    for (const column of columns) {
      patterns[column] = pattern;
      this.#chosen.add(column);
    }
    this.patterns = patterns;
    this.#lastChosen = pattern;
  }

  isChecking(column: string): boolean {
    return this.checkingColumns.includes(column);
  }

  isUnresolved(column: string, pattern: string): boolean {
    return patternUnresolved(pattern, this.checks[column]);
  }

  sync(path: string | null, declarations: TimestampDeclaration[]) {
    if (!path) return;

    if (this.#lastChosen) {
      const patterns = { ...this.patterns };
      let changed = false;
      for (const { column } of declarations) {
        if (this.#chosen.has(column) || patterns[column] === this.#lastChosen) continue;
        patterns[column] = this.#lastChosen;
        changed = true;
      }
      if (changed) {
        this.patterns = patterns;
        return;
      }
    }

    const signature = JSON.stringify([path, declarations]);
    if (signature === this.#signature) return;
    this.#signature = signature;

    const pending = declarations.filter(
      ({ column, pattern }) => this.#checked.get(column) !== (pattern ?? "")
    );
    this.#generation += 1;
    clearTimeout(this.#timer);
    this.checkingColumns = pending.map(({ column }) => column);
    if (pending.length === 0) return;

    const generation = this.#generation;
    this.#timer = setTimeout(() => void this.#run(path, pending, generation), this.#debounce);
  }

  async #run(path: string, pending: TimestampDeclaration[], generation: number) {
    const catalog = pending.some(({ pattern }) => !pattern) ? FORMAT_CATALOG : [];
    const requested = pending.flatMap(({ pattern }) => (pattern ? [pattern] : []));
    const patterns = [...new Set([...catalog, ...requested])];

    let reports: ResponseTimestampColumnReport[];
    try {
      reports = await this.#analyze(
        path,
        pending.map(({ column }) => column),
        patterns
      );
    } catch (error) {
      if (generation !== this.#generation) return;
      this.checkingColumns = [];
      this.#signature = "";
      this.#notifications.error(String(error));
      return;
    }
    if (generation !== this.#generation) return;

    const checks = { ...this.checks };
    const adopted: Record<string, string> = {};
    for (const declaration of pending) {
      const report = reports.find(({ column }) => column === declaration.column);
      const pattern = declaration.pattern ?? report?.best;
      if (!pattern) continue;

      const check = report
        ? checkFromReport(report, pattern)
        : { pattern, rows: 0, missing: 0, failed: 0, sample: null };
      checks[declaration.column] = check;
      this.#checked.set(declaration.column, pattern);
      if (!declaration.pattern) adopted[declaration.column] = pattern;
      if (check.failed > 0) this.#notifications.warning(declaration.column, check);
    }

    this.checks = checks;
    this.checkingColumns = [];
    if (Object.keys(adopted).length > 0) {
      this.patterns = { ...this.patterns, ...adopted };
    }
  }
}
