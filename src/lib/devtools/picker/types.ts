export type PickerMode = "ask" | "do";

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

/** A component the element renders inside: `<tag>` written at `location`. */
export interface ComponentUse {
  tag: string;
  location: SourceLocation;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementContext {
  tag: string;
  source: SourceLocation | null;
  sourceIsAncestor: boolean;
  components: ComponentUse[];
  selector: string;
  attributes: Record<string, string>;
  text: string;
  rect: Rect;
  html: string;
}

/** A target the picker can switch a selection to: the outermost element of one source file's markup. */
export interface Crumb {
  element: Element;
  label: string;
}

export interface InboxSession {
  id: string;
  project: string;
  cwd: string;
  startedAt: number;
  matches: boolean;
}

export interface InboxMessage {
  text: string;
  meta: Record<string, string>;
}
