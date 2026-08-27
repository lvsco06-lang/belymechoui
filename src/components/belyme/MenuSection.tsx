import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DishImage } from "@/components/belyme/Dishimage";
import { supabase } from "@/integrations/supabase/client";
import { fetchMenuForDay } from "@/lib/menu-api";
import { useCart } from "@/lib/cart-context";
import {
  DAYS,
  STOCK_LABEL,
  currentDayOfWeek,
  effectivePrice,
  formatFCFA,
  isHappyHour,
  stockState,
  type MenuEntry,
} from "@/lib/belyme";

const STOCK_STYLES = {
  available: "bg-primary/15 text-primary border-primary/40",
  low: "bg-ember/20 text-ember border-ember/50",
  out: "bg-muted text-muted-foreground border-border",
} as const;

export function MenuSection() {
  const [day, setDay] = useState(() => currentDayOfWeek());
  const queryClient = useQueryClient();
  const { add } = useCart();
  const happyHour = isHappyHour();

  const { data: menu = [], isLoading } = useQuery({
    queryKey: ["menu", day],
    queryFn: () => fetchMenuForDay(day),
  });

  // Temps réel : la disponibilité se met à jour sans rafraîchir la page.
  useEffect(() => {
    const channel = supabase
      .channel("daily_menus_public")
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_menus" }, () => {
        queryClient.invalidateQueries({ queryKey: ["menu"] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const special = useMemo(() => menu.find((m) => m.is_special_today), [menu]);
  const categories = useMemo(() => {
    const groups = new Map<string, MenuEntry[]>();
    for (const entry of menu) {
      if (entry.id === special?.id) continue;
      const list = groups.get(entry.dish.category) ?? [];
      list.push(entry);
      groups.set(entry.dish.category, list);
    }
    return [...groups.entries()];
  }, [menu, special]);

  function addToCart(entry: MenuEntry) {
    if (entry.stock_quantity <= 0) {
      toast.error(`${entry.dish.name} est en rupture de stock`);
      return;
    }
    add({
      dish_id: entry.dish.id,
      name: entry.dish.name,
      unit_price: effectivePrice(entry.dish.price, happyHour),
    });
    toast.success(`${entry.dish.name} ajouté au panier`);
  }

  return (
    <section id="menu" className="mx-auto max-w-6xl px-4 py-16">
      <header className="mb-8">
        <p className="text-xs tracking-[0.3em] text-primary uppercase">Carte vivante</p>
        <h2 className="mt-2 font-display text-3xl text-sand md:text-4xl">Le menu par jour</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Disponibilités mises à jour en direct depuis nos cuisines.
        </p>
      </header>

      <div className="mb-8 flex gap-2 overflow-x-auto pb-2">
        {DAYS.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => setDay(d.value)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
              day === d.value
                ? "border-primary bg-bronze text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {d.label}
            {d.value === currentDayOfWeek() && (
              <span className="ml-2 text-[10px] tracking-wider uppercase">aujourd'hui</span>
            )}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-muted-foreground">Chargement du menu…</p>}

      {special && (
        <article className="group mb-10 overflow-hidden rounded-xl border border-primary/40 bg-card p-4 shadow-bronze sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <DishImage
              src={special.dish.image_url}
              alt={special.dish.name}
              ratio="1/1"
              dimmed={special.stock_quantity <= 0}
              className="w-24 shrink-0 rounded-lg sm:w-32"
            />
            <div className="min-w-64 flex-1">
              <p className="flex items-center gap-2 text-xs tracking-[0.25em] text-primary uppercase">
                <Crown className="h-4 w-4" /> Plat du jour spécial méchoui
              </p>
              <h3 className="mt-3 font-display text-2xl text-sand">{special.dish.name}</h3>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                {special.dish.description}
              </p>
              <div className="mt-4 flex items-center gap-3">
                <Badge
                  variant="outline"
                  className={STOCK_STYLES[stockState(special.stock_quantity)]}
                >
                  {STOCK_LABEL[stockState(special.stock_quantity)]}
                </Badge>
                <PriceTag price={special.dish.price} happyHour={happyHour} />
              </div>
            </div>
            <Button
              onClick={() => addToCart(special)}
              disabled={special.stock_quantity <= 0}
              className="bg-ember-gradient text-ember-foreground shadow-ember"
            >
              <Plus className="mr-1 h-4 w-4" /> Ajouter
            </Button>
          </div>
        </article>
      )}

      <div className="space-y-10">
        {categories.map(([category, entries]) => (
          <div key={category}>
            <h3 className="mb-4 font-display text-xl text-primary">{category}</h3>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {entries.map((entry) => {
                const state = stockState(entry.stock_quantity);
                return (
                  <article
                    key={entry.id}
                    className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
                  >
                    <div className="relative">
                      <DishImage
                        src={entry.dish.image_url}
                        alt={entry.dish.name}
                        dimmed={state === "out"}
                      />
                      <Badge
                        variant="outline"
                        className={`absolute top-2 right-2 backdrop-blur-sm ${STOCK_STYLES[state]}`}
                      >
                        {STOCK_LABEL[state]}
                      </Badge>
                    </div>

                    <div className="flex flex-1 flex-col p-3 sm:p-4">
                      <h4 className="line-clamp-2 font-display text-sm leading-snug text-sand sm:text-lg">
                        {entry.dish.name}
                      </h4>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:mt-2 sm:text-sm">
                        {entry.dish.description}
                      </p>

                      <div className="mt-auto flex flex-col gap-2 pt-3 sm:flex-row sm:items-center sm:justify-between sm:pt-4">
                        <PriceTag price={entry.dish.price} happyHour={happyHour} />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={state === "out"}
                          onClick={() => addToCart(entry)}
                          className="w-full border-primary/50 hover:bg-accent sm:w-auto"
                        >
                          <Plus className="mr-1 h-4 w-4" /> Ajouter
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PriceTag({ price, happyHour }: { price: number; happyHour: boolean }) {
  const final = effectivePrice(price, happyHour);
  return (
    <p className="text-sm">
      {happyHour && (
        <span className="mr-2 text-muted-foreground line-through">{formatFCFA(price)}</span>
      )}
      <span className="font-medium text-primary">{formatFCFA(final)}</span>
    </p>
  );
}
