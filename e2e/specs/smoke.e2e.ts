import { $, browser, expect } from "@wdio/globals";

describe("smoke", () => {
  it("opens on the project list", async () => {
    await expect(browser).toHaveUrl(expect.stringContaining("/app/projects"));
  });

  it("shows the empty state with no Projects", async () => {
    await expect($("h1=Projects")).toBeDisplayed();
    await expect($("//*[normalize-space(text())='No projects']")).toBeDisplayed();
    await expect($("button=New project")).toBeDisplayed();
  });
});
