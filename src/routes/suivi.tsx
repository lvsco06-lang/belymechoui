import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChefHat, CircleCheck, PackageX, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFCFA } from "@/lib/belyme";
import { ThemeToggle } from "@/components/belyme/ThemeToggle";
import {
  TRACK_STEPS,
  formatCode,
  isValidCode,
  normalizeCode,
  readCodes,
  stepIndex,
  timeAgo,
  trackOrder,
} from "@/lib/order-tracking";

type Recherche = { code?: string };

export const Route = createFileRoute("/suivi")({
  validateSearch: (search: Record<string, unknown>): Recherche =>
    typeof search["code"] === "string" ? { code: search["code"] } : {},
  head: () => ({
    meta: [
      { title: "Suivre ma commande — Belymechoui" },
      {
        name: "description",
        content:
          "Suivez l'avancement de votre commande Belymechoui avec votre code de suivi, sans créer de compte.",
      },
    ],
  }),
  component: SuiviPage,
});

const ICONES = [ChefHat, Truck, CircleCheck];

function SuiviPage() {
  const { code } = Route.useSearch();
  const navigate = useNavigate({ from: "/suivi" });
  const [saisie, setSaisie] = useState(code ?? "");
  const recents = readCodes();

  // Si aucun code dans l'URL, on propose le dernier utilisé sur cet appareil.
  useEffect(() => {
    const dernier = recents[0];
    if (!code && dernier) setSaisie(formatCode(dernier.code));
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const actif = code && isValidCode(code) ? normalizeCode(code) : null;

  const {
    data: commande,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["suivi", actif],
    queryFn: () => trackOrder(actif as string),
    enabled: Boolean(actif),
    // Le Realtime de Supabase respecte la RLS : un visiteur anonyme ne reçoit
    // aucun événement sur `orders`. On interroge donc régulièrement.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  function rechercher() {
    if (!isValidCode(saisie)) return;
    void navigate({ search: { code: normalizeCode(saisie) } });
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Retour au menu
        </Link>
        <ThemeToggle />
      </div>

      <header className="mt-6 mb-8">
        <p className="text-xs tracking-[0.3em] text-primary uppercase">Suivi</p>
        <h1 className="mt-2 font-display text-3xl text-sand">Où en est ma commande ?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Entrez le code reçu à la validation de votre commande. Aucun compte n'est nécessaire.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && rechercher()}
          placeholder="Ex. NA3QP-65B95"
          aria-label="Code de suivi"
          autoComplete="off"
          spellCheck={false}
          className="font-mono tracking-widest uppercase"
        />
        <Button
          onClick={rechercher}
          disabled={!isValidCode(saisie)}
          className="bg-ember-gradient text-ember-foreground shadow-ember"
        >
          <Search className="mr-1 h-4 w-4" /> Suivre
        </Button>
      </div>

      {saisie.length > 0 && !isValidCode(saisie) && (
        <p className="mt-2 text-xs text-muted-foreground">
          Le code comporte 10 caractères. Les tirets et la casse n'ont pas d'importance.
        </p>
      )}

      {recents.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Commandes récentes :</span>
          {recents.map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => void navigate({ search: { code: r.code } })}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
            >
              #{r.orderNumber}
            </button>
          ))}
        </div>
      )}

      <div className="mt-8">
        {isLoading && actif && <p className="text-muted-foreground">Recherche en cours…</p>}

        {isError && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            Le suivi est momentanément indisponible. Réessayez dans un instant.
          </p>
        )}

        {actif && !isLoading && !isError && !commande && (
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="font-display text-lg text-sand">Aucune commande pour ce code</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Vérifiez le code reçu à la validation. Il comporte 10 caractères, sans les lettres O,
              I ni L.
            </p>
          </div>
        )}

        {commande && <Resultat commande={commande} code={actif as string} />}
      </div>
    </main>
  );
}

function Resultat({
  commande,
  code,
}: {
  commande: NonNullable<Awaited<ReturnType<typeof trackOrder>>>;
  code: string;
}) {
  const etape = stepIndex(commande.status);
  const annulee = etape === -1;

  return (
    <article className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl text-sand">Commande #{commande.order_number}</h2>
        <span className="font-mono text-xs tracking-widest text-muted-foreground">
          {formatCode(code)}
        </span>
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        Bonjour {commande.customer_first_name} — commande passée {timeAgo(commande.created_at)}.
      </p>

      {annulee ? (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <PackageX className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Commande annulée</p>
            <p className="text-sm text-muted-foreground">
              Contactez-nous si cela vous semble être une erreur.
            </p>
          </div>
        </div>
      ) : (
        <ol className="mt-6 space-y-0">
          {TRACK_STEPS.map((label, i) => {
            const Icone = ICONES[i] ?? ChefHat;
            const faite = i <= etape;
            const courante = i === etape;
            return (
              <li key={label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      faite
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icone className="h-4 w-4" />
                  </span>
                  {i < TRACK_STEPS.length - 1 && (
                    <span
                      className={`w-px flex-1 ${i < etape ? "bg-primary/50" : "bg-border"}`}
                      aria-hidden
                    />
                  )}
                </div>
                <div className={`pb-6 ${i === TRACK_STEPS.length - 1 ? "pb-0" : ""}`}>
                  <p className={faite ? "text-sand" : "text-muted-foreground"}>{label}</p>
                  {courante && (
                    <p className="text-xs text-primary">
                      Mis à jour {timeAgo(commande.status_updated_at)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-6 border-t border-border pt-4">
        <p className="text-xs tracking-widest text-muted-foreground uppercase">Détail</p>
        <ul className="mt-3 space-y-2">
          {commande.items.map((it, i) => (
            <li key={`${it.dish_name}-${i}`} className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">
                {it.quantity} × {it.dish_name}
              </span>
              <span className="shrink-0 text-sand">{formatFCFA(it.unit_price * it.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-border pt-3">
          <span className="text-sm">
            {commande.delivery_type === "livraison"
              ? `Livraison — ${commande.delivery_zone || "zone à confirmer"}`
              : "À emporter"}
          </span>
          <span className="font-medium text-primary">{formatFCFA(commande.total_amount)}</span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Le total n'inclut pas les frais de livraison éventuels.
        </p>
      </div>
    </article>
  );
}
