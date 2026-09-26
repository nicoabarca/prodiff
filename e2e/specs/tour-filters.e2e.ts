import { $, browser, expect } from "@wdio/globals";

const NAME = "Loan applications (sample)";
const popoverTitle = () => $(".driver-popover-title");

describe("filters tour", () => {
  before(async () => {
    await $("button=Try the sample project").click();
    await expect(browser).toHaveUrl(expect.stringContaining("/statistics"), { wait: 30_000 });
  });

  it("starts the first time the Filters view opens", async () => {
    await $('[data-tour="nav-filters"]').click();
    await expect(popoverTitle()).toHaveText("Groups");
  });

  it("waits on the action step until Slow cases is applied", async () => {
    for (let step = 0; step < 4; step++) await $(".driver-popover-next-btn").click();
    await expect(popoverTitle()).toHaveText("Apply it");
    await expect($(".driver-popover-next-btn")).not.toBeDisplayed();

    await $('[data-tour-key="Slow cases"] [data-tour="apply-group"]').click();
    await expect(popoverTitle()).toHaveText("Next: compare Groups", { wait: 30_000 });
    await expect($('[data-tour-key="Slow cases"] [data-tour="apply-group"]')).not.toBeExisting();
  });

  it("does not start again once finished", async () => {
    await $(".driver-popover-next-btn").click();
    await expect($(".driver-popover")).not.toBeExisting();
    await $('[data-tour="nav-statistics"]').click();
    await $('[data-tour="nav-filters"]').click();
    await expect($(".driver-popover")).not.toBeExisting();
  });

  after(async () => {
    await $("a=Projects").click();
    await $(`button[aria-label='Delete ${NAME}']`).click();
    await $("button=Delete").click();
  });
});
