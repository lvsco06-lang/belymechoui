// Rapport quotidien exportable en PDF — mise en page professionnelle pour envoi au propriétaire.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { RESTAURANT } from "./belyme";
import type { DailyReport } from "./report";

/**
 * `formatFCFA` (locale fr-FR) sépare les milliers par une espace fine
 * insécable (U+202F) : la police standard "helvetica" des PDF ne la
 * connaît pas et affiche un caractère parasite à la place. On regroupe
 * donc les milliers nous-mêmes avec une espace ASCII normale.
 */
function formatFCFA(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const grouped = Math.abs(Math.round(amount))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped} FCFA`;
}

type RGB = [number, number, number];

const COLOR = {
  bronze: [124, 74, 36] as RGB,
  gold: [193, 155, 92] as RGB,
  ember: [176, 68, 45] as RGB,
  green: [47, 125, 79] as RGB,
  textDark: [43, 33, 24] as RGB,
  muted: [120, 108, 96] as RGB,
  zebra: [246, 239, 226] as RGB,
  border: [222, 208, 186] as RGB,
  white: [255, 255, 255] as RGB,
};

const MARGIN = 14;

function formatDateFr(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function withLastAutoTable(doc: jsPDF): number {
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  return finalY ?? MARGIN;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 18) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function sectionTitle(doc: jsPDF, text: string, y: number): number {
  y = ensureSpace(doc, y, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...COLOR.bronze);
  doc.text(text, MARGIN, y);
  doc.setDrawColor(...COLOR.gold);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y + 1.8, doc.internal.pageSize.getWidth() - MARGIN, y + 1.8);
  return y + 8;
}

function statBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  valueColor: RGB = COLOR.textDark,
): void {
  doc.setDrawColor(...COLOR.border);
  doc.setFillColor(...COLOR.white);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.muted);
  doc.text(label.toUpperCase(), x + 4, y + 7, { maxWidth: w - 8 });

  // Réduit la taille tant que la valeur déborde de la carte, pour ne jamais chevaucher le cadre.
  const maxTextWidth = w - 8;
  let fontSize = 13;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  while (fontSize > 8 && doc.getTextWidth(value) > maxTextWidth) {
    fontSize -= 1;
    doc.setFontSize(fontSize);
  }
  doc.setTextColor(...valueColor);
  doc.text(value, x + 4, y + 16);
}

export function buildReportPdf(report: DailyReport): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Bandeau d'en-tête
  doc.setFillColor(...COLOR.bronze);
  doc.rect(0, 0, pageWidth, 30, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...COLOR.white);
  doc.text(RESTAURANT.name, MARGIN, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR.gold);
  doc.text(`Rapport quotidien — ${formatDateFr(report.date)}`, MARGIN, 23);
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.white);
  doc.text(RESTAURANT.address, pageWidth - MARGIN, 12, { align: "right" });
  doc.text(RESTAURANT.phone, pageWidth - MARGIN, 17, { align: "right" });

  let y = 42;

  // Résumé du jour (4 cartes)
  const netColor = report.netOfDay >= 0 ? COLOR.green : COLOR.ember;
  const boxW = (pageWidth - MARGIN * 2 - 9) / 4;
  const boxes: [string, string, RGB][] = [
    ["Chiffre d'affaires", formatFCFA(report.revenueOfDay), COLOR.textDark],
    ["Dépenses", formatFCFA(report.expensesTotalOfDay), COLOR.ember],
    ["Bénéfice net", formatFCFA(report.netOfDay), netColor],
    ["Commandes", String(report.orders.length), COLOR.textDark],
  ];
  boxes.forEach(([label, value, color], i) => {
    statBox(doc, MARGIN + i * (boxW + 3), y, boxW, 20, label, value, color);
  });
  y += 28;

  // Résumé glissant (à date)
  y = sectionTitle(doc, "Résumé glissant (à date)", y);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Période", "CA", "Dépenses", "Net"]],
    body: [
      ["Cette semaine", formatFCFA(report.stats.revenueWeek), formatFCFA(report.stats.expensesWeek), formatFCFA(report.stats.netWeek)],
      ["Ce mois", formatFCFA(report.stats.revenueMonth), formatFCFA(report.stats.expensesMonth), formatFCFA(report.stats.netMonth)],
    ],
    theme: "grid",
    styles: { fontSize: 9, textColor: COLOR.textDark, lineColor: COLOR.border, cellPadding: 2.5 },
    headStyles: { fillColor: COLOR.bronze, textColor: COLOR.white, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" } },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        const raw = data.row.raw as string[];
        const negative = raw[3]?.trim().startsWith("-");
        data.cell.styles.textColor = negative ? COLOR.ember : COLOR.green;
      }
    },
  });
  y = withLastAutoTable(doc) + 12;

  // Commandes du jour
  y = sectionTitle(doc, `Commandes du jour (${report.orders.length})`, y);
  if (report.orders.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...COLOR.muted);
    doc.text("Aucune commande ce jour-là.", MARGIN, y);
    y += 8;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Heure", "N°", "Client", "Téléphone", "Mode", "Paiement", "Statut", "Total", "Articles"]],
      body: report.orders.map((o) => [
        new Date(o.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        `#${o.order_number}`,
        o.customer_name,
        o.customer_phone,
        o.delivery_type === "livraison" ? `Livraison — ${o.delivery_zone ?? ""}` : "À emporter",
        o.payment_method,
        o.status,
        formatFCFA(o.total_amount),
        o.items_summary,
      ]),
      theme: "striped",
      styles: { fontSize: 7.5, textColor: COLOR.textDark, cellPadding: 2 },
      headStyles: { fillColor: COLOR.bronze, textColor: COLOR.white, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: COLOR.zebra },
      columnStyles: { 7: { halign: "right" } },
    });
    y = withLastAutoTable(doc) + 12;
  }

  // Dépenses / achats
  y = sectionTitle(doc, `Dépenses & achats du jour (${report.expensesOfDay.length})`, y);
  if (report.expensesOfDay.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...COLOR.muted);
    doc.text("Aucune dépense enregistrée ce jour-là.", MARGIN, y);
    y += 8;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Catégorie", "Libellé", "Montant", "Quantité", "Fournisseur"]],
      body: report.expensesOfDay.map((e) => [
        e.category,
        e.label,
        formatFCFA(e.amount),
        e.quantity ? `${e.quantity} ${e.unit ?? ""}`.trim() : "—",
        e.supplier ?? "—",
      ]),
      theme: "striped",
      styles: { fontSize: 8, textColor: COLOR.textDark, cellPadding: 2 },
      headStyles: { fillColor: COLOR.bronze, textColor: COLOR.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLOR.zebra },
      columnStyles: { 2: { halign: "right", textColor: COLOR.ember, fontStyle: "bold" } },
    });
    y = withLastAutoTable(doc) + 12;
  }

  // Mouvements de stock
  y = sectionTitle(doc, `Mouvements de stock (${report.movements.length})`, y);
  if (report.movements.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...COLOR.muted);
    doc.text("Aucun mouvement de stock ce jour-là.", MARGIN, y);
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Heure", "Plat", "Variation", "Raison", "Note"]],
      body: report.movements.map((m) => [
        new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        m.dish_name,
        m.change > 0 ? `+${m.change}` : String(m.change),
        m.reason,
        m.note ?? "",
      ]),
      theme: "striped",
      styles: { fontSize: 8, textColor: COLOR.textDark, cellPadding: 2 },
      headStyles: { fillColor: COLOR.bronze, textColor: COLOR.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLOR.zebra },
      columnStyles: { 2: { halign: "right" } },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 2) {
          const negative = String(data.cell.raw).trim().startsWith("-");
          data.cell.styles.textColor = negative ? COLOR.ember : COLOR.green;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
  }

  // Pied de page (numérotation + date de génération) sur chaque page
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, pageHeight - 12, pageWidth - MARGIN, pageHeight - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR.muted);
    doc.text(
      `${RESTAURANT.name} — Rapport confidentiel, usage interne`,
      MARGIN,
      pageHeight - 7,
    );
    doc.text(`Page ${i} / ${pageCount}`, pageWidth - MARGIN, pageHeight - 7, { align: "right" });
  }

  return doc;
}

export function downloadReportPdf(report: DailyReport, filename: string): void {
  buildReportPdf(report).save(filename);
}
