import { test, expect } from "bun:test";
import { isCountedExpense, upcomingScheduleItems } from "./schedule";
import type { Expense } from "./expense.schema";

const base: Expense = {
  id: "1",
  title: "Test",
  amount: 10000,
  currency: "IDR",
  date: "2026-08-20",
  source: "manual",
  createdAt: "2026-08-20T00:00:00.000Z",
};

test("isCountedExpense is true for a normal (unflagged) expense", () => {
  expect(isCountedExpense(base)).toBe(true);
});

test("isCountedExpense is true for a scheduled bill, paid or not", () => {
  expect(isCountedExpense({ ...base, scheduleType: "scheduled", paid: false })).toBe(true);
  expect(isCountedExpense({ ...base, scheduleType: "scheduled", paid: true })).toBe(true);
});

test("isCountedExpense is true for an unsettled debt, false once settled", () => {
  expect(isCountedExpense({ ...base, scheduleType: "debt", settled: false })).toBe(true);
  expect(isCountedExpense({ ...base, scheduleType: "debt", settled: true })).toBe(false);
});

test("upcomingScheduleItems only includes unpaid scheduled / unsettled debt", () => {
  const today = new Date(2026, 7, 20); // 20 Aug 2026
  const items: Expense[] = [
    { ...base, id: "a", scheduleType: "scheduled", paid: false, date: "2026-08-22" },
    { ...base, id: "b", scheduleType: "scheduled", paid: true, date: "2026-08-21" }, // excluded, already paid
    { ...base, id: "c", scheduleType: "debt", settled: false, date: "2026-08-25" },
    { ...base, id: "d", scheduleType: "debt", settled: true, date: "2026-08-23" }, // excluded, settled
    { ...base, id: "e", date: "2026-08-24" }, // excluded, plain Harian expense
  ];
  const result = upcomingScheduleItems(items, today);
  expect(result.map((r) => r.expense.id)).toEqual(["a", "c"]);
});

test("upcomingScheduleItems sorts soonest/most-overdue first and reports negative daysUntil for overdue items", () => {
  const today = new Date(2026, 7, 20);
  const items: Expense[] = [
    { ...base, id: "future", scheduleType: "scheduled", paid: false, date: "2026-08-25" },
    { ...base, id: "overdue", scheduleType: "scheduled", paid: false, date: "2026-08-15" },
    { ...base, id: "today", scheduleType: "debt", settled: false, date: "2026-08-20" },
  ];
  const result = upcomingScheduleItems(items, today);
  expect(result.map((r) => r.expense.id)).toEqual(["overdue", "today", "future"]);
  expect(result[0]!.daysUntil).toBe(-5);
  expect(result[1]!.daysUntil).toBe(0);
  expect(result[2]!.daysUntil).toBe(5);
});
