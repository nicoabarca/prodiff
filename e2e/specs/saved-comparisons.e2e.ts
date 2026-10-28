import { $, $$, browser, expect } from "@wdio/globals";

const NAME = "Loan applications (sample)";
const field = () => $('[data-tour="compare-groups"]');
const popover = () => $('[data-slot="popover-content"]');
const rows = () => $$('[data-slot="popover-content"] button[aria-current]');
const edits = () => $$('[data-slot="popover-content"] button[aria-label="Edit comparison"]');

/** Picks a Group in one of the editor's two selects, with the keyboard. */
async function pick(side: 0 | 1, name: string) {
  await browser.execute((index) => {
    document
      .querySelectorAll<HTMLElement>('[data-slot="popover-content"] [data-slot="select-trigger"]')
      [index].focus();
  }, side);
  await browser.keys("Enter");
  await expect($('[data-slot="select-content"]')).toBeDisplayed();
  const items = await browser.execute(() =>
    [...document.querySelectorAll('[data-slot="select-item"]')].map(
      (item) => item.textContent?.replace(/\s+/g, " ").trim() ?? ""
    )
  );
  const position = items.findIndex((text) => text.includes(name));
  if (position < 0) throw new Error(`No "${name}" in the select: ${items.join(" | ")}`);
  for (let i = 0; i < items.length; i++) await browser.keys("ArrowUp");
  for (let i = 0; i < position; i++) await browser.keys("ArrowDown");
  await browser.keys("Enter");
  await expect($('[data-slot="select-content"]')).not.toBeExisting();
}

/** Clicks the editor's primary button, whichever label it carries. */
async function confirm() {
  for (const label of ["Save & compare", "Compare", "Comparing"]) {
    const button = $(`button=${label}`);
    if (await button.isExisting()) return button.click();
  }
  throw new Error("No primary button in the comparison editor");
}

describe("saved comparisons", () => {
  before(async () => {
    await $("button*=sample").click();
    await expect(browser).toHaveUrl(expect.stringContaining("/statistics"), { wait: 30_000 });
    await $('[data-tour="nav-tree"]').click();
    await expect(field()).toHaveText(expect.stringContaining("Rejected"), { wait: 30_000 });
    await browser.keys("Escape");
    await expect($(".driver-popover")).not.toBeExisting();
  });

  it("opens on the list alone and saves a new draft of what is compared", async () => {
    await field().click();
    await expect(popover()).toHaveText(expect.stringContaining("No saved comparisons yet."));
    await expect($("button=Save & compare")).not.toBeExisting();
    await $("button*=New comparison").click();
    await $("button=Save & compare").click();
    await expect(popover()).not.toBeExisting();

    await field().click();
    await expect(rows()).toBeElementsArrayOfSize(1);
    await expect(rows()[0]).toHaveText(expect.stringContaining("In use"));
    await expect(rows()[0]).toHaveAttribute("aria-current", "false");
    await expect($("button=Comparing")).not.toBeExisting();
  });

  it("saves a second one and compares it", async () => {
    await $("button*=New comparison").click();
    await $("button=Save & compare").click();
    await expect(popover()).not.toBeExisting();
    await expect(field()).toHaveText(expect.stringContaining("only 1 group selected"));
  });

  it("switches back to a Saved Comparison in one click", async () => {
    await field().click();
    await expect(rows()).toBeElementsArrayOfSize(2);
    await expect(rows()[1]).toHaveText(expect.stringContaining("In use"));
    await rows()[0].click();
    await expect(popover()).not.toBeExisting();
    await expect(field()).toHaveText(expect.stringContaining("Compare groups"));
  });

  it("shows the Event Log alone in one click", async () => {
    await field().click();
    await $('[data-slot="popover-content"]').$("button*=Event Log").click();
    await expect(popover()).not.toBeExisting();
    await expect(field()).toHaveText(expect.stringContaining("only 1 group selected"));

    await field().click();
    await rows()[0].click();
    await expect(field()).toHaveText(expect.stringContaining("Compare groups"));
  });

  it("keeps the popover open while a side is changed", async () => {
    await field().click();
    await edits()[0].click();
    await expect(rows()[0]).toHaveAttribute("aria-current", "true");
    await expect($("button=Comparing")).toBeDisplayed();
    await browser.execute(() => {
      const against = document.querySelectorAll<HTMLElement>(
        '[data-slot="popover-content"] [data-slot="select-trigger"]'
      )[1];
      against.focus();
    });
    await browser.keys("Enter");
    await expect($('[data-slot="select-content"]')).toBeDisplayed();
    await browser.keys("ArrowUp");
    await browser.keys("ArrowUp");
    await browser.keys("Enter");
    await expect($('[data-slot="select-content"]')).not.toBeExisting();
    await expect($("button=Save & compare")).toBeDisplayed();
    await browser.keys("Escape");
    await expect(popover()).not.toBeExisting();
    await expect(field()).toHaveText(expect.stringContaining("Compare groups"));
  });

  it("deletes a Saved Comparison and keeps comparing the same Groups", async () => {
    await field().click();
    await edits()[0].click();
    await $("button=Delete").click();
    await expect(rows()).toBeElementsArrayOfSize(1);
    await expect($("button=Save & compare")).not.toBeExisting();
    await expect(popover()).not.toHaveText(expect.stringContaining("In use"));
    await browser.keys("Escape");
    await expect(popover()).not.toBeExisting();
    await expect(field()).toHaveText(expect.stringContaining("Compare groups"));
  });

  it("says what a contained pair removes before and after comparing", async () => {
    await field().click();
    await $("button*=New comparison").click();
    await pick(0, "Event Log");
    await pick(1, "Approved");
    await expect(popover()).toHaveText(
      expect.stringContaining("Every Approved case is also in Event Log."),
      { wait: 30_000 }
    );
    await confirm();
    await expect(popover()).not.toBeExisting();
    await expect($("p*=removed from Event Log")).toBeDisplayed({ wait: 30_000 });
  });

  it("opens the cases a contained pair removed from the outer side", async () => {
    const chips = $$('button[aria-label*="cases removed from"]');
    await expect(chips).toBeElementsArrayOfSize(1);
    const chip = chips[0];
    await expect(chip).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/removed from Event Log$/)
    );
    await expect(chip).toHaveText(expect.stringMatching(/^\u2212[\d,]+$/));
    await chip.click();
    const card = $('[data-slot="hover-card-content"]');
    await expect(card).toHaveText(
      expect.stringContaining("Every Approved case is also in Event Log.")
    );
    await card.$("button*=View removed cases").click();
    const table = $('[data-tour="event-data-table"]');
    await expect(table).toHaveText(expect.stringContaining("removed cases, also in Approved"), {
      wait: 30_000
    });
    await expect(table.$("tbody tr")).toBeDisplayed({ wait: 30_000 });
    await browser.keys("Escape");
    await expect(table).not.toBeExisting();
  });

  it("says nothing extra for a disjoint pair", async () => {
    await field().click();
    await $("button*=New comparison").click();
    await pick(1, "Rejected");
    await pick(0, "Approved");
    await expect(popover()).toHaveText(expect.stringContaining("Groups don't share common cases"), {
      wait: 30_000
    });
    await confirm();
    await expect(popover()).not.toBeExisting();
    await expect($("p*=removed from")).not.toBeExisting();
  });

  after(async () => {
    await $("a=Projects").click();
    await $(`button[aria-label='Delete ${NAME}']`).click();
    await $("button=Delete").click();
  });
});
