/**
 * The Sample Project's Event Log: synthetic loan applications with a story the
 * tours point at. Rejected applications loop through "Request documents" more
 * often and take longer, arrive through a broker more often, and ask for larger
 * amounts. Some are rejected right after the completeness check, a Variant no
 * approved application follows. Region carries no difference at all.
 *
 * The output is a pure function of `SAMPLE_SEED`, so regenerating it rewrites
 * `src-tauri/resources/sample-project/loan-applications.csv` byte for byte.
 */

export const SAMPLE_SEED = 20260926;
export const SAMPLE_CASES = 500;

export const SAMPLE_HEADER = [
  "Case ID",
  "Activity",
  "Timestamp",
  "Resource",
  "Loan type",
  "Amount",
  "Channel",
  "Region",
  "Outcome"
] as const;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const FIRST_SUBMISSION = Date.UTC(2025, 0, 6, 8);
const SUBMISSION_WINDOW_DAYS = 175;

const CLERKS = ["Ana", "Ben", "Chen", "Dana"];
const ANALYSTS = ["Eli", "Farah"];
const MANAGER = "Gil";

/** Mulberry32: a small seeded generator returning floats in [0, 1). */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Weighted<T> {
  value: T;
  weight: number;
}

function pickWeighted<T>(random: () => number, options: Weighted<T>[]): T {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let roll = random() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll < 0) return option.value;
  }
  return options[options.length - 1].value;
}

function pick<T>(random: () => number, values: T[]): T {
  return values[Math.floor(random() * values.length)];
}

function between(random: () => number, low: number, high: number): number {
  return low + random() * (high - low);
}

const pad = (value: number) => String(value).padStart(2, "0");

/** `YYYY-MM-DD HH:mm:ss`, in UTC. */
function formatTimestamp(ms: number): string {
  const date = new Date(ms);
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}

type LoanType = "Personal" | "Auto" | "Mortgage" | "Business";

const AMOUNT_RANGE: Record<LoanType, [number, number]> = {
  Personal: [2_000, 20_000],
  Auto: [8_000, 40_000],
  Mortgage: [80_000, 400_000],
  Business: [20_000, 150_000]
};

interface Case {
  id: string;
  loanType: LoanType;
  amount: number;
  channel: string;
  region: string;
  outcome: "Approved" | "Rejected";
}

interface Event {
  activity: string;
  at: number;
  resource: string;
}

function sampleCase(random: () => number, index: number): Case {
  const loanType = pickWeighted<LoanType>(random, [
    { value: "Personal", weight: 45 },
    { value: "Auto", weight: 25 },
    { value: "Mortgage", weight: 20 },
    { value: "Business", weight: 10 }
  ]);
  const [low, high] = AMOUNT_RANGE[loanType];
  const amount = Math.round(between(random, low, high) / 100) * 100;
  const channel = pickWeighted(random, [
    { value: "Online", weight: 50 },
    { value: "Branch", weight: 30 },
    { value: "Broker", weight: 20 }
  ]);
  const region = pick(random, ["North", "South", "East", "West"]);

  let rejection = 0.2;
  if (channel === "Broker") rejection += 0.3;
  if (loanType === "Mortgage" || loanType === "Business") rejection += 0.15;
  const outcome = random() < rejection ? "Rejected" : "Approved";

  return {
    id: `L${String(index + 1).padStart(4, "0")}`,
    loanType,
    amount,
    channel,
    region,
    outcome
  };
}

/** How many times a case asks for missing documents. */
function documentRounds(random: () => number, rejected: boolean): number {
  return rejected
    ? pickWeighted(random, [
        { value: 0, weight: 10 },
        { value: 1, weight: 40 },
        { value: 2, weight: 35 },
        { value: 3, weight: 15 }
      ])
    : pickWeighted(random, [
        { value: 0, weight: 80 },
        { value: 1, weight: 20 }
      ]);
}

function trace(random: () => number, loan: Case, submittedAt: number): Event[] {
  const rejected = loan.outcome === "Rejected";
  const events: Event[] = [];
  let at = submittedAt;
  const step = (activity: string, resource: string, lowHours: number, highHours: number) => {
    at += Math.round(between(random, lowHours, highHours) * 60) * 60_000;
    events.push({ activity, at, resource });
  };

  events.push({
    activity: "Submit application",
    at,
    resource: loan.channel === "Online" ? "Portal" : pick(random, CLERKS)
  });
  step("Check completeness", pick(random, CLERKS), 2, 24);

  if (rejected && random() < 0.3) {
    step("Reject application", pick(random, CLERKS), 1, 8);
    return events;
  }

  const rounds = documentRounds(random, rejected);
  for (let round = 0; round < rounds; round++) {
    step("Request documents", pick(random, CLERKS), 1, 6);
    const [low, high] = rejected ? [3, 10] : [1, 4];
    step("Receive documents", pick(random, CLERKS), low * 24, high * 24);
  }

  step("Assess credit", pick(random, ANALYSTS), 4, 48);
  if (loan.amount > 50_000) step("Manual review", MANAGER, 24, 72);

  if (rejected) {
    step("Reject application", pick(random, ANALYSTS), 4, 48);
    return events;
  }
  step("Approve application", pick(random, ANALYSTS), 4, 24);
  step("Send offer", pick(random, CLERKS), 1, 8);
  step("Sign contract", pick(random, CLERKS), 24, 7 * 24);
  return events;
}

/** The whole log as CSV text, one row per event, ordered by case and time. */
export function generateSampleLog(seed = SAMPLE_SEED, cases = SAMPLE_CASES): string {
  const random = rng(seed);
  const rows: string[] = [SAMPLE_HEADER.join(",")];
  for (let index = 0; index < cases; index++) {
    const loan = sampleCase(random, index);
    const submittedAt =
      FIRST_SUBMISSION +
      Math.floor(random() * SUBMISSION_WINDOW_DAYS) * DAY_MS +
      Math.floor(random() * 9) * HOUR_MS;
    for (const event of trace(random, loan, submittedAt)) {
      rows.push(
        [
          loan.id,
          event.activity,
          formatTimestamp(event.at),
          event.resource,
          loan.loanType,
          loan.amount.toFixed(2),
          loan.channel,
          loan.region,
          loan.outcome
        ].join(",")
      );
    }
  }
  return `${rows.join("\n")}\n`;
}
