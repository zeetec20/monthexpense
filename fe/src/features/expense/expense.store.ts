import { useCallback, useState } from "react";
import { z } from "zod";
import {
  expenseSchema,
  type Expense,
  type ExpenseInput,
  type ExpenseSource,
} from "./expense.schema";
import { deleteImage } from "@/lib/image/image-store";
import { scopedKey, migrateLegacyKey } from "@/lib/account-scope";

// Exported so sync.store.ts's connect() can pass it to claimAccountSlot.
export const STORAGE_KEY = "expense-notes.expenses.v1";
const storedListSchema = z.array(expenseSchema);

// Exported (not just used by the hook below) so the persistence logic can be
// unit-tested without mounting a component.
export function readAll(): Expense[] {
  try {
    migrateLegacyKey(STORAGE_KEY);
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return [];
    return storedListSchema.parse(JSON.parse(raw));
  } catch {
    // ponytail: corrupt/foreign localStorage data just resets the list, never crashes the app
    return [];
  }
}

export function writeAll(expenses: Expense[]) {
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(expenses));
}

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>(() => readAll());

  const addExpense = useCallback((input: ExpenseInput, source: ExpenseSource) => {
    const entry: Expense = {
      ...input,
      id: crypto.randomUUID(),
      source,
      createdAt: new Date().toISOString(),
    };
    setExpenses((prev) => {
      const next = [entry, ...prev];
      writeAll(next);
      return next;
    });
    return entry;
  }, []);

  const removeExpense = useCallback((id: string) => {
    setExpenses((prev) => {
      const removed = prev.find((e) => e.id === id);
      if (removed?.receiptImageId) void deleteImage(removed.receiptImageId);
      const next = prev.filter((e) => e.id !== id);
      writeAll(next);
      return next;
    });
  }, []);

  const updateExpense = useCallback((id: string, patch: Partial<ExpenseInput>) => {
    let updated: Expense | undefined;
    setExpenses((prev) => {
      const next = prev.map((e) => {
        if (e.id !== id) return e;
        updated = { ...e, ...patch };
        return updated;
      });
      writeAll(next);
      return next;
    });
    return updated;
  }, []);

  return { expenses, addExpense, removeExpense, updateExpense, setExpenses };
}
