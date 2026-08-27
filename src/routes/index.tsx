import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { CartProvider } from "@/lib/cart-context";
import { SiteHeader } from "@/components/belyme/SiteHeader";
import { Hero } from "@/components/belyme/Hero";
import { MenuSection } from "@/components/belyme/MenuSection";
import { CartSheet } from "@/components/belyme/CartSheet";
import { EventBooking } from "@/components/belyme/EventBooking";
import { ContactSection } from "@/components/belyme/ContactSection";
import { fetchActiveOrders } from "@/lib/menu-api";
import { RESTAURANT } from "@/lib/belyme";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Belymechoui — Méchoui premium & grillades à Sébénicoro, Bamako" },
      {
        name: "description",
        content:
          "Restaurant Belymechoui à Sébénicoro (Bamako) : méchoui premium, grillades traditionnelles et plats locaux. Menu du jour, commande en ligne, livraison et précommande de méchoui entier.",
      },
      { property: "og:title", content: "Belymechoui — Méchoui premium à Sébénicoro, Bamako" },
      {
        property: "og:description",
        content:
          "Méchoui cuit aux braises, grillades et plats locaux. Commandez à emporter ou en livraison à Sébénicoro.",
      },
      { property: "og:type", content: "restaurant.restaurant" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [cartOpen, setCartOpen] = useState(false);
  const { data: activeOrders = 0 } = useQuery({
    queryKey: ["active-orders"],
    queryFn: fetchActiveOrders,
    refetchInterval: 60_000,
  });

  return (
    <CartProvider>
      <SiteHeader onOpenCart={() => setCartOpen(true)} />
      <main>
        <Hero activeOrders={activeOrders} />
        <MenuSection />
        <EventBooking />
        <ContactSection />
      </main>
      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" />
            <span className="font-display tracking-widest uppercase">Belymechoui</span>
          </p>
          <p>
            {RESTAURANT.address} · {RESTAURANT.hours}
          </p>
        </div>
      </footer>
      <CartSheet open={cartOpen} onOpenChange={setCartOpen} />
    </CartProvider>
  );
}
