import { $, browser, expect } from "@wdio/globals";

const NAME = "Loan applications (sample)";

describe("sample project", () => {
  it("creates the Sample Project from the first-run screen and opens it", async () => {
    await $("button*=sample").click();
    await expect(browser).toHaveUrl(expect.stringContaining("/statistics"), { wait: 30_000 });
    await expect($(`//*[normalize-space(text())='${NAME}']`)).toBeDisplayed();
  });

  it("starts the Statistics tour, which Next steps through and Escape closes", async () => {
    await expect($(".driver-popover-title")).toHaveText("Groups side by side");
    await $(".driver-popover-next-btn").click();
    await expect($(".driver-popover-title")).toHaveText("The figures");
    await browser.keys("Escape");
    await expect($(".driver-popover")).not.toBeExisting();
  });

  it("lists it and hides the sample card while it exists", async () => {
    await $("a=Projects").click();
    await expect($(`//*[normalize-space(text())='${NAME}']`)).toBeDisplayed();
    await expect($("button[aria-label='Try the sample project']")).not.toBeExisting();
  });

  it("offers it again once deleted", async () => {
    await $(`button[aria-label='Delete ${NAME}']`).click();
    await $("button=Delete").click();
    await expect($("//*[normalize-space(text())='No projects']")).toBeDisplayed();
    await expect($("button=Try the sample project")).toBeDisplayed();
  });
});
