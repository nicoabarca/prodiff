import { $, browser, expect } from "@wdio/globals";

const TYPED = "Rejected after a second review by the credit committee";
const STORED = TYPED.slice(0, 40).trimEnd();

async function closeTour() {
  if (await $(".driver-popover").isExisting()) await browser.keys("Escape");
  await expect($(".driver-popover")).not.toBeExisting();
}

describe("long names", () => {
  before(async () => {
    await $("button*=sample").click();
    await expect(browser).toHaveUrl(expect.stringContaining("/statistics"), { wait: 30_000 });
    await closeTour();
  });

  it("caps a Group name at 40 characters and counts them", async () => {
    await $('[data-tour="nav-filters"]').click();
    await closeTour();
    const card = $('[data-tour="group-card"][data-tour-key="Rejected"]');
    await card.$('button[aria-label="Rename group"]').click();
    const input = card.$('input[aria-label="Group name"]');
    await input.clearValue();
    await input.addValue(TYPED);
    await expect(input).toHaveAttribute("maxlength", "40");
    await expect(card).toHaveText(expect.stringContaining("/40"));
    await browser.keys("Enter");
    await expect($(`[data-tour="group-card"][data-tour-key="${STORED}"]`)).toBeDisplayed();
  });

  it("shows the whole name in a tooltip where it is cut", async () => {
    await $('[data-tour="nav-statistics"]').click();
    await closeTour();
    const cut = $(`span[tabindex="0"]=${STORED}`);
    await expect(cut).toBeExisting({ wait: 30_000 });
    await browser.execute((text) => {
      const spans = [...document.querySelectorAll<HTMLElement>('span[tabindex="0"]')];
      spans.find((span) => span.textContent === text)?.focus();
    }, STORED);
    await expect($('[data-slot="tooltip-content"]')).toHaveText(expect.stringContaining(STORED));
  });
});
