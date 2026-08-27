import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { useCart } from "@/lib/cart-context";
import { fetchDeliveryZones, placeOrder } from "@/lib/menu-api";
import { PAYMENT_METHODS, buildWhatsAppMessage, deliveryFee, formatFCFA, whatsappUrl } from "@/lib/belyme";
import { formatCode, rememberCode } from "@/lib/order-tracking";

export function CartSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { lines, subtotal, setQuantity, setNote, remove, clear } = useCart();
  const queryClient = useQueryClient();

  const { data: zones = [] } = useQuery({
    queryKey: ["delivery-zones"],
    queryFn: fetchDeliveryZones,
  });

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryType, setDeliveryType] = useState<"emporter" | "livraison">("emporter");
  const [zone, setZone] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("orange_money");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const first = zones[0];
    if (!zone && first) setZone(first.name);
  }, [zone, zones]);

  const fee = deliveryType === "livraison" ? deliveryFee(zones, zone) : 0;
  const total = subtotal + fee;

  async function handleCheckout() {
    if (!customerName.trim() || !phone.trim()) {
      toast.error("Merci d'indiquer votre nom et votre téléphone");
      return;
    }
    if (lines.length === 0) {
      toast.error("Votre panier est vide");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Enregistrement dans la base + décrémentation automatique du stock
      const order = await placeOrder({
        customerName,
        phone,
        deliveryType,
        zone: deliveryType === "livraison" ? zone : null,
        paymentMethod,
        lines,
      });

      // 2. Simulation du paiement Mobile Money
      if (paymentMethod !== "especes") {
        const label = PAYMENT_METHODS.find((p) => p.value === paymentMethod)?.label;
        toast.info(
          `Demande de paiement ${label} envoyée au ${phone} — validez sur votre téléphone (simulation).`,
        );
      }

      // 3. Récapitulatif WhatsApp
      const message = buildWhatsAppMessage({
        orderNumber: order.order_number,
        customerName,
        phone,
        deliveryType,
        zone: deliveryType === "livraison" ? zone : null,
        paymentMethod,
        lines,
        total: order.total_amount + fee,
        trackingCode: order.tracking_code,
      });
      window.open(whatsappUrl(message), "_blank", "noopener,noreferrer");

      // 4. Mémorisation locale pour retrouver le suivi sans ressaisir le code
      rememberCode(order.tracking_code, order.order_number);

      toast.success(`Commande #${order.order_number} enregistrée !`, {
        description: `Votre code de suivi : ${formatCode(order.tracking_code)}`,
        duration: 15000,
      });
      clear();
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ["menu"] });
      void queryClient.invalidateQueries({ queryKey: ["active-orders"] });
    } catch (error) {
      console.error(error);
      toast.error("La commande n'a pas pu être enregistrée. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-xl text-sand">Votre commande</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-4 px-4 pb-4">
          {lines.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Votre panier est vide. Ajoutez un plat depuis le menu du jour.
            </p>
          )}

          {lines.map((line) => (
            <div key={line.dish_id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-sand">{line.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFCFA(line.unit_price)}</p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Retirer ${line.name}`}
                  onClick={() => remove(line.dish_id)}
                >
                  <Trash2 className="h-4 w-4 text-ember" />
                </Button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Diminuer"
                  onClick={() => setQuantity(line.dish_id, line.quantity - 1)}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="w-8 text-center text-sm">{line.quantity}</span>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Augmenter"
                  onClick={() => setQuantity(line.dish_id, line.quantity + 1)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <span className="ml-auto text-sm text-primary">
                  {formatFCFA(line.unit_price * line.quantity)}
                </span>
              </div>
              <Textarea
                value={line.special_note}
                onChange={(e) => setNote(line.dish_id, e.target.value)}
                placeholder="Note spéciale (bien cuit, sans piment…)"
                className="mt-2 min-h-9 text-sm"
                rows={2}
              />
            </div>
          ))}

          {lines.length > 0 && (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="name">Nom</Label>
                  <Input
                    id="name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Votre nom"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Téléphone</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+223 …"
                    inputMode="tel"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(["emporter", "livraison"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDeliveryType(mode)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      deliveryType === mode
                        ? "border-primary bg-bronze text-primary-foreground"
                        : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {mode === "emporter" ? "À emporter" : "Livraison"}
                  </button>
                ))}
              </div>

              {deliveryType === "livraison" && (
                <div>
                  <Label>Zone de livraison</Label>
                  <Select value={zone} onValueChange={setZone}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir un quartier" />
                    </SelectTrigger>
                    <SelectContent>
                      {zones.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Aucune zone de livraison configurée.
                        </div>
                      )}
                      {zones.map((z) => (
                        <SelectItem key={z.id} value={z.name}>
                          {z.name} — {formatFCFA(z.fee)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Paiement</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <dl className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <dt>Sous-total</dt>
                  <dd>{formatFCFA(subtotal)}</dd>
                </div>
                {fee > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <dt>Livraison ({zone})</dt>
                    <dd>{formatFCFA(fee)}</dd>
                  </div>
                )}
                <div className="flex justify-between text-base text-sand">
                  <dt>Total</dt>
                  <dd className="text-primary">{formatFCFA(total)}</dd>
                </div>
              </dl>

              <Button
                onClick={handleCheckout}
                disabled={submitting}
                className="w-full bg-ember-gradient text-ember-foreground shadow-ember"
              >
                {submitting ? "Envoi…" : "Valider et confirmer sur WhatsApp"}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
