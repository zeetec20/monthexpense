import { describe, it, expect } from "vitest";
import { buildSuggestedTitle } from "../../src/parser/title";

const input = (
  merchantName: string | null,
  time: string | null,
  category: string | null = null,
) => {
  return { merchant: { name: merchantName }, transaction: { time }, metadata: { category } };
};

describe("buildSuggestedTitle", () => {
  it("returns null when there's no merchant name", () => {
    expect(buildSuggestedTitle(input(null, "12:00"))).toBeNull();
  });

  it("falls back to a generic title when there's no parseable time", () => {
    expect(buildSuggestedTitle(input("Solaria", null))).toBe("Expense at Solaria");
    expect(buildSuggestedTitle(input("Solaria", "garbled"))).toBe("Expense at Solaria");
  });

  it("buckets morning hours as Breakfast and formats 12h time (food_snack falls through to meal-period)", () => {
    expect(buildSuggestedTitle(input("Solaria", "10:26:06", "food_snack"))).toBe(
      "Breakfast at Solaria on 10:26am",
    );
  });

  it("buckets midday hours as Lunch", () => {
    expect(buildSuggestedTitle(input("Solaria", "12:30", "food_snack"))).toBe(
      "Lunch at Solaria on 12:30pm",
    );
  });

  it("buckets evening hours as Dinner, formats pm correctly", () => {
    expect(buildSuggestedTitle(input("Solaria", "19:00", "food_snack"))).toBe(
      "Dinner at Solaria on 07:00pm",
    );
  });

  it("buckets late hours as Late night snack", () => {
    expect(buildSuggestedTitle(input("Solaria", "23:15", "food_snack"))).toBe(
      "Late night snack at Solaria on 11:15pm",
    );
  });

  it("uses a fixed 'Expense' label for 'other', not meal-period phrasing (it's the not-food catch-all)", () => {
    expect(buildSuggestedTitle(input("Toko Larisabadi", "00:00", "other"))).toBe(
      "Expense at Toko Larisabadi on 12:00am",
    );
  });

  it("falls back to meal-period phrasing when category is omitted/unclassified", () => {
    expect(buildSuggestedTitle(input("Solaria", "12:30", null))).toBe(
      "Lunch at Solaria on 12:30pm",
    );
  });

  it("uses a fixed label for grocery regardless of time of day", () => {
    expect(buildSuggestedTitle(input("Indomaret", "16:04", "grocery"))).toBe(
      "Groceries at Indomaret on 04:04pm",
    );
  });

  it("uses a fixed label for bill/tax payment", () => {
    expect(buildSuggestedTitle(input("PLN", "09:00", "bills"))).toBe(
      "Bill payment at PLN on 09:00am",
    );
  });

  it("uses a fixed label for transportation", () => {
    expect(buildSuggestedTitle(input("Shell", "14:15", "transportation"))).toBe(
      "Transportation at Shell on 02:15pm",
    );
  });

  it("uses a fixed label for entertainment", () => {
    expect(buildSuggestedTitle(input("Cinema XXI", "19:30", "entertainment"))).toBe(
      "Entertainment at Cinema XXI on 07:30pm",
    );
  });

  it("still uses the category label even without a parseable time", () => {
    expect(buildSuggestedTitle(input("Indomaret", null, "grocery"))).toBe("Groceries at Indomaret");
  });

  // No merchant (common for voice — "taxi 50 ribu" names no place) falls
  // back to the one named item instead of staying null.
  it("falls back to the single item's name when there's no merchant", () => {
    expect(
      buildSuggestedTitle({
        merchant: { name: null },
        transaction: { time: null },
        metadata: { category: null },
        items: [{ name: "Taxi" }],
      }),
    ).toBe("Expense: Taxi");
  });

  it("still applies category/time phrasing to the item-name fallback", () => {
    expect(
      buildSuggestedTitle({
        merchant: { name: null },
        transaction: { time: "12:30" },
        metadata: { category: "food_snack" },
        items: [{ name: "Nasi Goreng" }],
      }),
    ).toBe("Lunch: Nasi Goreng on 12:30pm");
  });

  it("stays null when there's no merchant and more than one item (ambiguous which to name)", () => {
    expect(
      buildSuggestedTitle({
        merchant: { name: null },
        transaction: { time: null },
        metadata: { category: null },
        items: [{ name: "Kopi" }, { name: "Roti" }],
      }),
    ).toBeNull();
  });
});
