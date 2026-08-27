// Rapport quotidien exportable (CSV) : commandes, revenu, dépenses et mouvements de stock.
import { supabase } from "@/integrations/supabase/client";
import { formatFCFA } from "./belyme";
import { fetchExpensesBetween, fetchFinanceStats, type Expense, type FinanceStats } from "./finance";
import { fetchStockMovementsBetween, type StockMovement } from "./stock";

export type DailyReportOrder = {
  order_number: number;
  tracking_code: string;
  customer_name: string;
  customer_phone: string;
  delivery_type: string;
  delivery_zone: string | null;
  payment_method: string;
  status: string;
  total_amount: number;
  created_at: string;
  items_summary: string;
};

export type DailyReport = {
  date: string; // yyyy-mm-dd, borne du jour couvert
  orders: DailyReportOrder[];
  revenueOfDay: number;
  expensesOfDay: Expense[];
  expensesTotalOfDay: number;
  netOfDay: number;
  stats: FinanceStats;
  movements: StockMovement[];
};

/** Bornes [début, fin[ du jour `date` (yyyy-mm-dd), en UTC — le restaurant est à Bamako (UTC+0). */
function dayBounds(date: string): { startIso: string; endIso: string } {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export async function fetchDailyReport(date: string): Promise<DailyReport> {
  const { startIso, endIso } = dayBounds(date);

  const [ordersRes, stats, movements, expensesOfDay] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "order_number, tracking_code, customer_name, customer_phone, delivery_type, delivery_zone, payment_method, status, total_amount, created_at, order_items(dish_name, quantity, unit_price)",
      )
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: true }),
    fetchFinanceStats(),
    fetchStockMovementsBetween(startIso, endIso),
    fetchExpensesBetween(date, date),
  ]);

  if (ordersRes.error) throw ordersRes.error;

  const orders: DailyReportOrder[] = (ordersRes.data ?? []).map((o) => ({
    order_number: o.order_number,
    tracking_code: o.tracking_code,
    customer_name: o.customer_name,
    customer_phone: o.customer_phone,
    delivery_type: o.delivery_type,
    delivery_zone: o.delivery_zone,
    payment_method: o.payment_method,
    status: o.status,
    total_amount: o.total_amount,
    created_at: o.created_at,
    items_summary: (o.order_items ?? [])
      .map((it: { dish_name: string; quantity: number }) => `${it.quantity}x ${it.dish_name}`)
      .join("; "),
  }));

  const revenueOfDay = orders
    .filter((o) => o.status !== "Annulé")
    .reduce((sum, o) => sum + o.total_amount, 0);

  const expensesTotalOfDay = expensesOfDay.reduce((sum, e) => sum + e.amount, 0);

  return {
    date,
    orders,
    revenueOfDay,
    expensesOfDay,
    expensesTotalOfDay,
    netOfDay: revenueOfDay - expensesTotalOfDay,
    stats,
    movements,
  };
}

/** Échappe une valeur pour un champ CSV (virgules, guillemets, retours à la ligne). */
function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(values: (string | number)[]): string {
  return values.map(csvField).join(",");
}

export function buildReportCsv(report: DailyReport): string {
  const lines: string[] = [];

  lines.push(csvRow([`Rapport Belymechoui — ${report.date}`]));
  lines.push("");
  lines.push(csvRow(["Résumé du jour"]));
  lines.push(csvRow(["CA du jour", formatFCFA(report.revenueOfDay)]));
  lines.push(csvRow(["Dépenses du jour", formatFCFA(report.expensesTotalOfDay)]));
  lines.push(csvRow(["Bénéfice net du jour", formatFCFA(report.netOfDay)]));
  lines.push(csvRow(["Commandes du jour", report.orders.length]));
  lines.push("");
  lines.push(csvRow(["Résumé glissant (à date)"]));
  lines.push(csvRow(["CA cette semaine", formatFCFA(report.stats.revenueWeek)]));
  lines.push(csvRow(["Dépenses cette semaine", formatFCFA(report.stats.expensesWeek)]));
  lines.push(csvRow(["Net cette semaine", formatFCFA(report.stats.netWeek)]));
  lines.push(csvRow(["CA ce mois", formatFCFA(report.stats.revenueMonth)]));
  lines.push(csvRow(["Dépenses ce mois", formatFCFA(report.stats.expensesMonth)]));
  lines.push(csvRow(["Net ce mois", formatFCFA(report.stats.netMonth)]));
  lines.push("");

  lines.push(csvRow(["Commandes"]));
  lines.push(
    csvRow([
      "Heure",
      "N°",
      "Code de suivi",
      "Client",
      "Téléphone",
      "Mode",
      "Paiement",
      "Statut",
      "Total (FCFA)",
      "Articles",
    ]),
  );
  for (const o of report.orders) {
    lines.push(
      csvRow([
        new Date(o.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        o.order_number,
        o.tracking_code,
        o.customer_name,
        o.customer_phone,
        o.delivery_type === "livraison" ? `Livraison — ${o.delivery_zone ?? ""}` : "À emporter",
        o.payment_method,
        o.status,
        o.total_amount,
        o.items_summary,
      ]),
    );
  }
  lines.push("");

  lines.push(csvRow(["Dépenses / achats"]));
  lines.push(csvRow(["Catégorie", "Libellé", "Montant (FCFA)", "Quantité", "Unité", "Fournisseur", "Note"]));
  for (const e of report.expensesOfDay) {
    lines.push(
      csvRow([
        e.category,
        e.label,
        e.amount,
        e.quantity ?? "",
        e.unit ?? "",
        e.supplier ?? "",
        e.note ?? "",
      ]),
    );
  }
  lines.push("");

  lines.push(csvRow(["Mouvements de stock"]));
  lines.push(csvRow(["Heure", "Plat", "Variation", "Raison", "Note"]));
  for (const m of report.movements) {
    lines.push(
      csvRow([
        new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        m.dish_name,
        m.change > 0 ? `+${m.change}` : String(m.change),
        m.reason,
        m.note ?? "",
      ]),
    );
  }

  return lines.join("\n");
}

/** Déclenche le téléchargement du CSV dans le navigateur. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
