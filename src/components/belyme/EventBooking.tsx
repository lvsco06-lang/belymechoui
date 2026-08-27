import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchMenuForDay, placeOrder } from "@/lib/menu-api";
import {
  buildWhatsAppMessage,
  currentDayOfWeek,
  formatFCFA,
  whatsappUrl,
  type MenuEntry,
} from "@/lib/belyme";
import { formatCode, rememberCode } from "@/lib/order-tracking";

/** Précommande de méchoui entier / événements : crée une commande prioritaire. */
export function EventBooking() {
  const { data: menu = [] } = useQuery({
    queryKey: ["menu", currentDayOfWeek()],
    queryFn: () => fetchMenuForDay(currentDayOfWeek()),
  });

  const mechouiOptions: MenuEntry[] = menu.filter((m) => m.dish.category === "Méchoui");

  const [dishId, setDishId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState("15");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selected = mechouiOptions.find((m) => m.dish.id === dishId);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !name.trim() || !phone.trim() || !date) {
      toast.error("Merci de compléter la formule, vos coordonnées et la date de l'événement");
      return;
    }
    setSubmitting(true);
    try {
      const order = await placeOrder({
        customerName: name,
        phone,
        deliveryType: "emporter",
        zone: null,
        paymentMethod: "especes",
        orderType: "evenement",
        eventDate: date,
        notes: `Événement ${guests} personnes. ${notes}`.trim(),
        lines: [
          {
            dish_id: selected.dish.id,
            name: selected.dish.name,
            unit_price: selected.dish.price,
            quantity: 1,
            special_note: `Date : ${date} — ${guests} personnes`,
          },
        ],
      });

      const message = buildWhatsAppMessage({
        orderNumber: order.order_number,
        customerName: name,
        phone,
        deliveryType: "emporter",
        zone: null,
        paymentMethod: "especes",
        lines: [
          {
            dish_id: selected.dish.id,
            name: `${selected.dish.name} (événement du ${date}, ${guests} pers.)`,
            unit_price: selected.dish.price,
            quantity: 1,
            special_note: notes,
          },
        ],
        total: order.total_amount,
        note: "Précommande prioritaire événement",
        trackingCode: order.tracking_code,
      });
      window.open(whatsappUrl(message), "_blank", "noopener,noreferrer");

      rememberCode(order.tracking_code, order.order_number);

      toast.success(`Précommande #${order.order_number} enregistrée !`, {
        description: `Votre code de suivi : ${formatCode(order.tracking_code)}`,
        duration: 15000,
      });
      setNotes("");
    } catch (error) {
      console.error(error);
      toast.error("La précommande n'a pas pu être enregistrée.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="evenements" className="border-y border-border bg-card/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2">
        <div>
          <p className="flex items-center gap-2 text-xs tracking-[0.3em] text-primary uppercase">
            <PartyPopper className="h-4 w-4" /> Événements
          </p>
          <h2 className="mt-3 font-display text-3xl text-sand md:text-4xl">
            Précommandez un méchoui entier
          </h2>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            Baptêmes, mariages, Tabaski, réunions d'entreprise : nous préparons votre agneau entier
            ou demi-agneau, livré chaud, avec accompagnements traditionnels. Précommande conseillée
            48 heures à l'avance.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
            <li>• Agneau sélectionné, cuisson lente aux braises</li>
            <li>• Service traiteur et découpe sur place possible</li>
            <li>• Devis immédiat par WhatsApp</li>
          </ul>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-bronze"
        >
          <div>
            <Label>Formule</Label>
            <Select value={dishId} onValueChange={setDishId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir une formule méchoui" />
              </SelectTrigger>
              <SelectContent>
                {mechouiOptions.map((m) => (
                  <SelectItem key={m.dish.id} value={m.dish.id}>
                    {m.dish.name} — {formatFCFA(m.dish.price)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ev-name">Nom</Label>
              <Input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ev-phone">Téléphone</Label>
              <Input
                id="ev-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
              />
            </div>
            <div>
              <Label htmlFor="ev-date">Date de l'événement</Label>
              <Input
                id="ev-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ev-guests">Nombre de convives</Label>
              <Input
                id="ev-guests"
                type="number"
                min={5}
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="ev-notes">Précisions</Label>
            <Textarea
              id="ev-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Lieu, heure de service, accompagnements…"
            />
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-bronze text-primary-foreground"
          >
            {submitting ? "Envoi…" : "Envoyer ma précommande"}
          </Button>
        </form>
      </div>
    </section>
  );
}
