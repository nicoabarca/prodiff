import { $, $$, browser, expect } from "@wdio/globals";

const NAME = "Loan applications (sample)";
const field = () => $('[data-tour="compare-groups"]');
const popover = () => $('[data-slot="popover-content"]');
const rows = () => $$('[data-slot="popover-content"] button[aria-current]');

describe("saved comparisons", () => {
  before(async () => {
    await $("button*=sample").click();
    await expect(browser).toHaveUrl(expect.stringContaining("/statistics"), { wait: 30_000 });
    await $('[data-tour="nav-tree"]').click();
    await expect(field()).toHaveText(expect.stringContaining("Rejected"), { wait: 30_000 });
    await browser.keys("Escape");
    await expect($(".driver-popover")).not.toBeExisting();
  });

  it("opens on a new draft of what is compared and saves it", async () => {
    await field().click();
    await expect(popover()).toHaveText(expect.stringContaining("No saved comparisons yet."));
    await $("button=Save & compare").click();
    await expect(popover()).not.toBeExisting();

    await field().click();
    await expect(rows()).toBeElementsArrayOfSize(1);
    await expect(rows()[0]).toHaveText(expect.stringContaining("In use"));
    await expect(rows()[0]).toHaveAttribute("aria-current", "true");
    await expect($("button=Comparing")).toBeDisplayed();
  });

  it("saves a second one and compares it", async () => {
    await $("button*=New comparison").click();
    await $("button=Save & compare").click();
    await expect(popover()).not.toBeExisting();
    await expect(field()).toHaveText(expect.stringContaining("only 1 group selected"));
  });

  it("switches back to a Saved Comparison without saving again", async () => {
    await field().click();
    await expect(rows()).toBeElementsArrayOfSize(2);
    await expect(rows()[1]).toHaveText(expect.stringContaining("In use"));
    await rows()[0].click();
    await $("button=Compare").click();
    await expect(popover()).not.toBeExisting();
    await expect(field()).toHaveText(expect.stringContaining("Compare groups"));
  });

  it("keeps the popover open while a side is changed", async () => {
    await field().click();
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
    await expect(rows()[0]).toHaveAttribute("aria-current", "true");
    await $("button=Delete").click();
    await expect(rows()).toBeElementsArrayOfSize(1);
    await expect(popover()).not.toHaveText(expect.stringContaining("In use"));
    await browser.keys("Escape");
    await expect(popover()).not.toBeExisting();
    await expect(field()).toHaveText(expect.stringContaining("Compare groups"));
  });

  after(async () => {
    await $("a=Projects").click();
    await $(`button[aria-label='Delete ${NAME}']`).click();
    await $("button=Delete").click();
  });
});
