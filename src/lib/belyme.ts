// Constantes, types et règles métier du restaurant Belymechoui (Sébénicoro, Bamako).

export type Dish = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  image_url: string | null;
  is_active: boolean;
};

export type DailyMenu = {
  id: string;
  day_of_week: number;
  dish_id: string;
  is_special_today: boolean;
  stock_quantity: number;
};

export type MenuEntry = DailyMenu & { dish: Dish };

export type CartLine = {
  dish_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  special_note: string;
};

export const RESTAURANT = {
  name: "Belymechoui",
  phone: "+22370000000", // À remplacer par le numéro réel
  whatsapp: "22370000000", // Numéro WhatsApp au format international sans "+"
  address: "Sébénicoro, Bamako, Mali",
  hours: "Tous les jours — 11h00 à 23h30",
  // Embed Google Maps de la fiche établissement réelle (place_id), pour un itinéraire exact.
  mapsEmbedUrl:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3893.952089964744!2d-8.061970925876908!3d12.585409287695631!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xe51cd17d3d5e705%3A0xd5def496e7029c3!2sBely%20Mechoui!5e0!3m2!1sfr!2sml!4v1787857840825!5m2!1sfr!2sml",
} as const;

export const DAYS = [
  { value: 1, label: "Lundi", short: "Lun" },
  { value: 2, label: "Mardi", short: "Mar" },
  { value: 3, label: "Mercredi", short: "Mer" },
  { value: 4, label: "Jeudi", short: "Jeu" },
  { value: 5, label: "Vendredi", short: "Ven" },
  { value: 6, label: "Samedi", short: "Sam" },
  { value: 7, label: "Dimanche", short: "Dim" },
] as const;

/** Zone de livraison gérée par l'admin (quartier + frais), stockée en base. */
export type DeliveryZone = {
  id: string;
  name: string;
  fee: number;
  is_active: boolean;
  sort_order: number;
};

// Catégories de la carte (utilisées par le back-office)
export const MENU_CATEGORIES = [
  "Méchoui",
  "Grillades",
  "Plats locaux",
  "Plats internationaux",
  "Accompagnements",
  "Boissons",
  "Desserts",
] as const;

export const PAYMENT_METHODS = [
  { value: "orange_money", label: "Orange Money" },
  { value: "wave", label: "Wave" },
  { value: "especes", label: "Espèces à la livraison" },
] as const;

export const ORDER_STATUSES = ["En préparation", "En livraison", "Livré", "Annulé"] as const;

export const HAPPY_HOUR_START = 21; // 21h
export const HAPPY_HOUR_DISCOUNT = 0.25; // -25 %

/** Jour ISO courant (1 = lundi … 7 = dimanche). */
export function currentDayOfWeek(date = new Date()): number {
  return date.getDay() === 0 ? 7 : date.getDay();
}

/** Module anti-gaspillage : réduction automatique à partir de 21h. */
export function isHappyHour(date = new Date()): boolean {
  return date.getHours() >= HAPPY_HOUR_START;
}

/** Prix affiché : applique la remise anti-gaspillage le cas échéant. */
export function effectivePrice(price: number, happyHour = isHappyHour()): number {
  return happyHour ? Math.round(price * (1 - HAPPY_HOUR_DISCOUNT)) : price;
}

export function formatFCFA(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} FCFA`;
}

export type StockState = "available" | "low" | "out";

export function stockState(quantity: number): StockState {
  if (quantity <= 0) return "out";
  if (quantity <= 5) return "low";
  return "available";
}

export const STOCK_LABEL: Record<StockState, string> = {
  available: "Disponible",
  low: "Dernières portions",
  out: "Rupture de stock",
};

/** Temps de préparation dynamique en fonction des commandes actives. */
export function preparationTime(activeOrders: number): number {
  return 20 + Math.min(60, activeOrders * 5);
}

export function deliveryFee(zones: DeliveryZone[], zone: string | null): number {
  return zones.find((z) => z.name === zone)?.fee ?? 0;
}

/** Récapitulatif WhatsApp structuré. */
export function buildWhatsAppMessage(input: {
  orderNumber: number | string;
  customerName: string;
  phone: string;
  deliveryType: string;
  zone: string | null;
  paymentMethod: string;
  lines: CartLine[];
  total: number;
  note?: string;
  trackingCode?: string;
}): string {
  const payment =
    PAYMENT_METHODS.find((p) => p.value === input.paymentMethod)?.label ?? input.paymentMethod;
  const items = input.lines
    .map(
      (l) =>
        `• ${l.quantity} x ${l.name} — ${formatFCFA(l.unit_price * l.quantity)}${
          l.special_note ? `\n   (note : ${l.special_note})` : ""
        }`,
    )
    .join("\n");

  return [
    `*Nouvelle commande Belymechoui #${input.orderNumber}*`,
    ``,
    `👤 Client : ${input.customerName}`,
    `📞 Téléphone : ${input.phone}`,
    `🛵 Mode : ${input.deliveryType === "livraison" ? `Livraison — ${input.zone}` : "À emporter"}`,
    `💳 Paiement : ${payment}`,
    input.note ? `📝 Note : ${input.note}` : "",
    ``,
    `*Détail :*`,
    items,
    ``,
    `*TOTAL : ${formatFCFA(input.total)}*`,
    input.trackingCode ? `\n🔎 Code de suivi : ${input.trackingCode}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function whatsappUrl(message: string): string {
  return `https://wa.me/${RESTAURANT.whatsapp}?text=${encodeURIComponent(message)}`;
}
