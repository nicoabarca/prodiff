export interface Project {
  id: string;
  name: string;
  fileName: string;
  events: number;
  cases: number;
  activities: number;
  variants: number;
  createdAt: string;
  timespan: string;
}

export const mockProjects: Project[] = [
  {
    id: "p-1",
    name: "Order to Cash",
    fileName: "o2c_events.csv",
    events: 148230,
    cases: 12043,
    activities: 18,
    variants: 214,
    createdAt: "2026-07-02",
    timespan: "Jan 2025 – Jun 2026"
  },
  {
    id: "p-2",
    name: "Purchase Requisitions",
    fileName: "p2p_export.xes",
    events: 52310,
    cases: 4820,
    activities: 12,
    variants: 96,
    createdAt: "2026-07-09",
    timespan: "Mar 2025 – May 2026"
  },
  {
    id: "p-3",
    name: "Helpdesk Tickets",
    fileName: "helpdesk_2026.csv",
    events: 33915,
    cases: 3102,
    activities: 9,
    variants: 61,
    createdAt: "2026-07-16",
    timespan: "Feb 2025 – Jul 2026"
  }
];
