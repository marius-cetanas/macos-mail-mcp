import { describe, it, expect } from "vitest";
import { intakeSummary } from "../../scripts/pr-intake.mjs";

describe("intakeSummary", () => {
  it("says nothing is held for a same-repository branch", () => {
    const s = intakeSummary({ isFork: false });
    expect(s).toContain("CI runs normally");
    expect(s).not.toContain("Approve and run");
  });

  it("names the contributor when the pull request comes from a fork", () => {
    const s = intakeSummary({ isFork: true, author: "dessyd" });
    expect(s).toContain("Awaiting maintainer approval");
    expect(s).toContain("@dessyd");
    expect(s).toContain("Approve and run");
  });

  /**
   * The point of the message: an unapproved fork pull request shows no failing check, because the
   * checks never report at all. Saying only "awaiting approval" would leave the reader wondering
   * why the pull request is also blocked.
   */
  it("explains that absent checks read as failing ones", () => {
    expect(intakeSummary({ isFork: true, author: "x" })).toContain("absent rather than pending");
  });

  it("reads properly when the payload carries no author", () => {
    const s = intakeSummary({ isFork: true });
    expect(s).toContain("an outside contributor");
    expect(s).not.toContain("@undefined");
  });
});
