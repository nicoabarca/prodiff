import { $, browser, expect } from "@wdio/globals";

describe("smoke", () => {
  it("opens on the project list", async () => {
    await expect(browser).toHaveUrl(expect.stringContaining("/app/projects"));
  });

  it("offers the sample project with no Projects", async () => {
    await expect($("button*=sample")).toBeDisplayed();
  });
});
