import { $, $$, browser, expect } from "@wdio/globals";

const field = () => $('[data-tour="compare-groups"]');
const popover = () => $('[data-slot="popover-content"]');
const triggers = () => $$('[data-slot="popover-content"] [data-slot="select-trigger"]');

async function pick(side: 0 | 1, name: string) {
  await triggers()[side].click();
  await $(`[data-slot="select-item"]*=${name}`).click();
  await expect($('[data-slot="select-content"]')).not.toBeExisting();
}

describe("disjoint comparisons", () => {
  before(async () => {
    await $("button*=sample").click();
    await expect(browser).toHaveUrl(expect.stringContaining("/statistics"), { wait: 30_000 });
    await $('[data-tour="nav-tree"]').click();
    await expect(field()).toHaveText(expect.stringContaining("Rejected"), { wait: 30_000 });
    await browser.keys("Escape");
    await expect($(".driver-popover")).not.toBeExisting();
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
    await $("button=Save & compare").click();
    await expect(popover()).not.toBeExisting();
    await expect($("p*=removed from Event Log")).toBeDisplayed({ wait: 30_000 });
  });

  it("says nothing extra for a disjoint pair", async () => {
    await field().click();
    await $("button*=New comparison").click();
    await pick(0, "Approved");
    await pick(1, "Rejected");
    await expect(popover()).toHaveText(expect.stringContaining("Groups don't share common cases"), {
      wait: 30_000
    });
    await $("button=Save & compare").click();
    await expect(popover()).not.toBeExisting();
    await expect($("p*=removed from")).not.toBeExisting();
  });
});
