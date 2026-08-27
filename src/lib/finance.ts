// Traçabilité de l'argent du restaurant : revenu, dépenses (achats) et bénéfice net.
import { supabase } from "@/integrations/supabase/client";

export const EXPENSE_CATEGORIES = [
  "Ingrédients",
  "Personnel",
  "Loyer",
  "Équipement",
  "Transport",
  "Énergie",
  "Autre",
] as const;

export type FinanceStats = {
  revenueToday: number;
  revenueWeek: number;
  revenueMonth: number;
  ordersToday: number;
  ordersWeek: number;
  ordersMonth: number;
  expensesToday: number;
  expensesWeek: number;
  expensesMonth: number;
  netToday: number;
  netWeek: number;
  netMonth: number;
};

export async function fetchFinanceStats(): Promise<FinanceStats> {
  const { data, error } = await supabase.rpc("admin_finance_stats");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    revenueToday: row?.revenue_today ?? 0,
    revenueWeek: row?.revenue_week ?? 0,
    revenueMonth: row?.revenue_month ?? 0,
    ordersToday: row?.orders_today ?? 0,
    ordersWeek: row?.orders_week ?? 0,
    ordersMonth: row?.orders_month ?? 0,
    expensesToday: row?.expenses_today ?? 0,
    expensesWeek: row?.expenses_week ?? 0,
    expensesMonth: row?.expenses_month ?? 0,
    netToday: row?.net_today ?? 0,
    netWeek: row?.net_week ?? 0,
    netMonth: row?.net_month ?? 0,
  };
}

export type Expense = {
  id: string;
  category: string;
  label: string;
  amount: number;
  quantity: number | null;
  unit: string | null;
  supplier: string | null;
  paid_at: string;
  note: string | null;
  created_at: string;
};

export type ExpenseInput = {
  category: string;
  label: string;
  amount: number;
  quantity?: number | null;
  unit?: string | null;
  supplier?: string | null;
  paidAt?: string; // yyyy-mm-dd, défaut : aujourd'hui côté base
  note?: string | null;
};

export async function fetchExpenses(limit = 30): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as Expense[];
}

/** Dépenses payées entre deux dates (yyyy-mm-dd), bornes incluses — pour le rapport quotidien. */
export async function fetchExpensesBetween(startDate: string, endDate: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .gte("paid_at", startDate)
    .lte("paid_at", endDate)
    .order("paid_at", { ascending: true });
  if (error) throw error;
  return data as Expense[];
}

export async function addExpense(input: ExpenseInput): Promise<void> {
  const { error } = await supabase.from("expenses").insert({
    category: input.category,
    label: input.label,
    amount: input.amount,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    supplier: input.supplier ?? null,
    ...(input.paidAt ? { paid_at: input.paidAt } : {}),
    note: input.note ?? null,
  });
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}
