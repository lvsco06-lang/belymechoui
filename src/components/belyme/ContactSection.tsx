import { Clock, MapPin, Phone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RESTAURANT, whatsappUrl } from "@/lib/belyme";

export function ContactSection() {
  return (
    <section id="contact" className="mx-auto max-w-6xl px-4 py-16">
      <p className="text-xs tracking-[0.3em] text-primary uppercase">Nous trouver</p>
      <h2 className="mt-2 font-display text-3xl text-sand md:text-4xl">Sébénicoro, Bamako</h2>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
            <MapPin className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="text-sand">Adresse</p>
              <p className="text-sm text-muted-foreground">{RESTAURANT.address}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
            <Clock className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="text-sand">Horaires</p>
              <p className="text-sm text-muted-foreground">{RESTAURANT.hours}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="bg-bronze text-primary-foreground">
              <a href={`tel:${RESTAURANT.phone}`}>
                <Phone className="mr-2 h-4 w-4" /> Appeler
              </a>
            </Button>
            <Button asChild variant="outline" className="border-primary/50">
              <a
                href={whatsappUrl("Bonjour Belymechoui, je souhaite des informations.")}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
              </a>
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <iframe
            title="Localisation du restaurant Belymechoui à Sébénicoro, Bamako"
            src={RESTAURANT.mapsEmbedUrl}
            loading="lazy"
            className="h-72 w-full lg:h-full"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </section>
  );
}
