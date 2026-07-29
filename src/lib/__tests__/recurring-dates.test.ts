import { describe, it, expect } from "vitest";
import { nextChargeDate } from "../recurring-dates";
describe("nextChargeDate", () => {
  it("jan 31 -> feb", () => {
    expect(nextChargeDate({ interval_type: "monthly", billing_day: 31 }, new Date(2026, 0, 31))).toBe("2026-02-28");
  });
  it("feb 29 leap", () => {
    expect(nextChargeDate({ interval_type: "monthly", billing_day: 29 }, new Date(2024, 1, 29))).toBe("2024-03-29");
  });
  it("dec 31 -> jan next year", () => {
    expect(nextChargeDate({ interval_type: "monthly", billing_day: 31 }, new Date(2025, 11, 31))).toBe("2026-01-31");
  });
  it("yearly", () => {
    expect(nextChargeDate({ interval_type: "yearly", billing_day: 15 }, new Date(2025, 6, 15))).toBe("2026-07-15");
  });
});
