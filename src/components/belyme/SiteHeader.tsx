import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Flame, Menu, Phone, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useCart } from "@/lib/cart-context";
import { RESTAURANT } from "@/lib/belyme";
import { ThemeToggle } from "@/components/belyme/ThemeToggle";

/** Une seule source pour les deux navigations : rien ne peut diverger.
 *  Le back-office (/admin) reste accessible en direct mais n'est pas
 *  annoncé aux visiteurs. */
const LIENS = [
  { type: "ancre", href: "#menu", label: "Menu du jour" },
  { type: "ancre", href: "#evenements", label: "Méchoui entier" },
  { type: "ancre", href: "#contact", label: "Nous trouver" },
  { type: "route", to: "/suivi", label: "Suivre ma commande" },
] as const;

export function SiteHeader({ onOpenCart }: { onOpenCart: () => void }) {
  const { count } = useCart();
  const [menuOuvert, setMenuOuvert] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <Flame className="h-6 w-6 text-primary" aria-hidden="true" />
          <span className="font-display text-bronze text-base tracking-widest uppercase sm:text-lg">
            Belymechoui
          </span>
        </Link>

        {/* Navigation large écran */}
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {LIENS.map((l) =>
            l.type === "ancre" ? (
              <a key={l.href} href={l.href} className="transition-colors hover:text-primary">
                {l.label}
              </a>
            ) : (
              <Link key={l.to} to={l.to} className="transition-colors hover:text-primary">
                {l.label}
              </Link>
            ),
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle />

          <Button asChild variant="ghost" size="icon" aria-label="Appeler le restaurant">
            <a href={`tel:${RESTAURANT.phone}`}>
              <Phone className="h-5 w-5" />
            </a>
          </Button>

          <Button
            onClick={onOpenCart}
            className="relative bg-bronze px-3 text-primary-foreground sm:px-4"
          >
            <ShoppingBag className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Panier</span>
            {count > 0 && (
              <span className="ml-1 rounded-full bg-ember px-2 py-0.5 text-xs text-ember-foreground sm:ml-2">
                {count}
              </span>
            )}
          </Button>

          {/* Menu mobile : masque des md, ou la nav ci-dessus prend le relais */}
          <Sheet open={menuOuvert} onOpenChange={setMenuOuvert}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Ouvrir le menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-72 border-border bg-background">
              <SheetHeader>
                <SheetTitle className="font-display text-bronze tracking-widest uppercase">
                  Belymechoui
                </SheetTitle>
              </SheetHeader>

              <nav className="mt-8 flex flex-col">
                {LIENS.map((l) =>
                  l.type === "ancre" ? (
                    <a
                      key={l.href}
                      href={l.href}
                      onClick={() => setMenuOuvert(false)}
                      className="border-b border-border/50 py-3 text-sand transition-colors hover:text-primary"
                    >
                      {l.label}
                    </a>
                  ) : (
                    <Link
                      key={l.to}
                      to={l.to}
                      onClick={() => setMenuOuvert(false)}
                      className="border-b border-border/50 py-3 text-sand transition-colors hover:text-primary"
                    >
                      {l.label}
                    </Link>
                  ),
                )}
              </nav>

              <Button
                asChild
                className="mt-8 w-full bg-ember-gradient text-ember-foreground shadow-ember"
              >
                <a href={`tel:${RESTAURANT.phone}`}>
                  <Phone className="mr-2 h-4 w-4" /> Appeler le restaurant
                </a>
              </Button>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
