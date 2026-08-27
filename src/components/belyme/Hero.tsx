import { Clock, MapPin, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/hero-mechoui.jpg";
import { RESTAURANT, preparationTime, isHappyHour } from "@/lib/belyme";

export function Hero({ activeOrders }: { activeOrders: number }) {
  const prep = preparationTime(activeOrders);

  return (
    <section className="relative isolate overflow-hidden">
      <img
        src={heroImage}
        alt="Méchoui d'agneau entier rôti sur braises au restaurant Belymechoui à Sébénicoro"
        width={1600}
        height={1008}
        className="absolute inset-0 h-full w-full object-cover opacity-70"
      />
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "var(--gradient-night)" }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-6xl px-4 pt-24 pb-20 md:pt-36 md:pb-28">
        <p className="mb-4 flex items-center gap-2 text-xs tracking-[0.35em] text-primary uppercase">
          <Flame className="h-4 w-4" /> Sébénicoro · Bamako
        </p>
        <h1 className="max-w-2xl font-display text-4xl leading-tight text-sand md:text-6xl">
          Le méchoui premium, cuit lentement sur braises vives
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
          Grillades traditionnelles, plats locaux et cuisine internationale. Commandez à emporter ou
          en livraison à Sébénicoro et alentours, en quelques secondes.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="bg-bronze text-primary-foreground shadow-bronze">
            <a href="#menu">Voir le menu du jour</a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-primary/50 text-foreground hover:bg-accent"
          >
            <a href="#evenements">Précommander un méchoui entier</a>
          </Button>
        </div>

        <dl className="mt-10 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-card/70 p-4 backdrop-blur">
            <dt className="flex items-center gap-2 text-xs text-muted-foreground uppercase">
              <Clock className="h-3.5 w-3.5" /> Préparation
            </dt>
            <dd className="mt-1 text-lg text-sand">~ {prep} min</dd>
          </div>
          <div className="rounded-lg border border-border/70 bg-card/70 p-4 backdrop-blur">
            <dt className="text-xs text-muted-foreground uppercase">Horaires</dt>
            <dd className="mt-1 text-sm text-sand">{RESTAURANT.hours}</dd>
          </div>
          <div className="rounded-lg border border-border/70 bg-card/70 p-4 backdrop-blur">
            <dt className="flex items-center gap-2 text-xs text-muted-foreground uppercase">
              <MapPin className="h-3.5 w-3.5" /> Adresse
            </dt>
            <dd className="mt-1 text-sm text-sand">{RESTAURANT.address}</dd>
          </div>
        </dl>

        {isHappyHour() && (
          <p className="mt-6 inline-block rounded-full bg-ember-gradient px-4 py-2 text-sm text-ember-foreground shadow-ember">
            Happy Hour anti-gaspillage : -25 % sur les portions restantes après 21h
          </p>
        )}
      </div>
    </section>
  );
}
