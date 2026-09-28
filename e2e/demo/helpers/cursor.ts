import { browser } from "@wdio/globals";
import type { ChainablePromiseElement } from "webdriverio";

type Target = ChainablePromiseElement;

const CURSOR_ID = "demo-cursor";
const GLIDE_MS = 450;

const pause = (ms: number) => browser.pause(ms);

/**
 * Adds a drawn pointer to the page. WebDriver clicks never move the real pointer, so a
 * recording shows this one gliding to each target instead. It sits on `body`, above
 * everything, and ignores pointer events, so it survives client-side navigation and
 * never intercepts a click.
 */
export async function installCursor(): Promise<void> {
  await browser.execute(
    (id, glideMs) => {
      if (document.getElementById(id)) return;
      const cursor = document.createElement("div");
      cursor.id = id;
      cursor.style.cssText = [
        "position:fixed",
        "left:0",
        "top:0",
        "z-index:2147483647",
        "pointer-events:none",
        `transition:transform ${glideMs}ms cubic-bezier(0.45,0,0.2,1)`,
        `transform:translate(${innerWidth / 2}px,${innerHeight + 40}px)`
      ].join(";");
      cursor.innerHTML = `
        <div data-ripple style="position:absolute;left:-1.1rem;top:-1.1rem;width:2.2rem;height:2.2rem;border-radius:50%;background:rgba(59,130,246,0.35);transform:scale(0);opacity:0"></div>
        <svg width="22" height="22" viewBox="0 0 24 24" style="position:absolute;left:-3px;top:-2px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35))">
          <path d="M4 2 L4 19 L8.5 14.8 L11.6 21.6 L14.6 20.3 L11.5 13.6 L17.6 13.4 Z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>`;
      document.body.appendChild(cursor);
    },
    CURSOR_ID,
    GLIDE_MS
  );
}

/** Glides the pointer to the centre of `target`, scrolling it into view when it is outside. */
export async function moveTo(target: Target): Promise<void> {
  await target.waitForDisplayed();
  if (!(await target.isDisplayed({ withinViewport: true }))) {
    await target.scrollIntoView({ block: "center", inline: "center" });
  }
  await browser.execute(
    (el, id) => {
      const rect = el.getBoundingClientRect();
      const cursor = document.getElementById(id);
      if (cursor) {
        cursor.style.transform = `translate(${rect.left + rect.width / 2}px,${rect.top + rect.height / 2}px)`;
      }
    },
    (await target.getElement()) as unknown as HTMLElement,
    CURSOR_ID
  );
  await pause(GLIDE_MS + 50);
}

/** Glides to `target`, shows a press ripple, then clicks it. */
export async function click(target: Target): Promise<void> {
  await moveTo(target);
  await browser.execute((id) => {
    const ripple = document.querySelector<HTMLElement>(`#${id} [data-ripple]`);
    ripple?.animate(
      [
        { transform: "scale(0.2)", opacity: 1 },
        { transform: "scale(1)", opacity: 0 }
      ],
      { duration: 450, easing: "ease-out" }
    );
  }, CURSOR_ID);
  await pause(100);
  await target.click();
}
