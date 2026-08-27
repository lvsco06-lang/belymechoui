import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";

type Props = {
  src: string | null;
  alt: string;
  /** Assombrit l'image quand le plat n'est plus disponible. */
  dimmed?: boolean;
  /** Ratio du cadre. 4/3 correspond au format natif des photos de téléphone. */
  ratio?: "4/3" | "1/1" | "3/2";
  className?: string;
};

const RATIOS = {
  "4/3": "aspect-[4/3]",
  "1/1": "aspect-square",
  "3/2": "aspect-[3/2]",
} as const;

/**
 * Cadre d'image à ratio constant.
 *
 * Le conteneur impose le ratio, l'image le remplit en `object-cover` :
 * le cadrage reste donc identique quelle que soit la largeur de la carte,
 * et l'image n'est jamais déformée. Un plat sans photo occupe exactement
 * la même place, ce qui garde toutes les cartes alignées.
 */
export function DishImage({ src, alt, dimmed = false, ratio = "4/3", className = "" }: Props) {
  const [echec, setEchec] = useState(false);
  const cadre = `relative w-full overflow-hidden bg-muted ${RATIOS[ratio]} ${className}`;

  if (!src || echec) {
    return (
      <div className={cadre} role="img" aria-label={`${alt} — photo indisponible`}>
        <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-muted to-card">
          <UtensilsCrossed className="h-7 w-7 text-muted-foreground/40 sm:h-9 sm:w-9" aria-hidden />
        </div>
      </div>
    );
  }

  return (
    <div className={cadre}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setEchec(true)}
        className={`absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 motion-reduce:transition-none group-hover:scale-[1.04] ${
          dimmed ? "opacity-45 grayscale" : ""
        }`}
      />
    </div>
  );
}
