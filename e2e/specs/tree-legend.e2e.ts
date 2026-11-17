import { $, $$, browser, expect } from "@wdio/globals";

const legend = () => $("//div[div[normalize-space(text())='What the tree shows']]");
const legendButton = () => $("button*=Legend");
const display = () => $("button*=Display");
const popover = () => $('[data-slot="popover-content"]');

async function segment(group: string, label: string) {
  await popover().$(`[aria-label="${group}"]`).$(`button*=${label}`).click();
}

describe("tree legend and Display", () => {
  before(async () => {
    await $("button*=sample").click();
    await expect(browser).toHaveUrl(expect.stringContaining("/statistics"), { wait: 30_000 });
    await $('[data-tour="nav-tree"]').click();
    await expect($('[data-tour="tree-node"]')).toBeExisting({ wait: 60_000 });
    await browser.keys("Escape");
    await expect($(".driver-popover")).not.toBeExisting();
  });

  it("opens on the Legend button, and the panel follows the Display settings", async () => {
    await expect(legend()).not.toBeExisting();
    await legendButton().click();
    await expect(legend()).toHaveText(expect.stringContaining("Cases at this step"));
    await expect(legend()).toHaveText(expect.stringContaining("Line width = cases"));
    await expect(legend()).toHaveText(expect.stringContaining("Start"));

    await display().click();
    await segment("Figure under the name", "% of group");
    await segment("Edge width", "Uniform");
    await expect(legend()).toHaveText(expect.stringContaining("Share of the group's cases"));
    await expect(legend()).not.toHaveText(expect.stringContaining("Line width = cases"));
    await expect(display()).toHaveText(expect.stringContaining("% of group"));
    await expect($$(".svelte-flow__edge")).not.toBeElementsArrayOfSize(0);
  });

  it("offers the attributes the tree was built with, and resets", async () => {
    await segment("Figure under the name", "Attribute");
    await segment("Statistic", "Median");
    await expect(legend()).toHaveText(expect.stringContaining("Median"));
    await expect(display()).toHaveText(expect.stringContaining("Median"));

    await popover().$("button=Reset to defaults").click();
    await expect(legend()).toHaveText(expect.stringContaining("Cases at this step"));
    await expect(legend()).toHaveText(expect.stringContaining("Line width = cases"));
  });

  it("says what a focus fades", async () => {
    const groups = popover().$('[aria-label="Emphasize steps taken by"]');
    await groups.$("button*=Shared").click();
    await expect(legend()).toHaveText(
      expect.stringContaining("Faded: steps not taken by both groups")
    );
    await expect($('[data-tour="tree-node"].opacity-25')).toBeExisting();
  });
});
