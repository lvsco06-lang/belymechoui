-- ZONES DE LIVRAISON GÉRÉES PAR L'ADMIN (quartier + frais), au lieu d'être codées en dur.

CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  fee integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.delivery_zones TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_zones TO authenticated;
GRANT ALL ON public.delivery_zones TO service_role;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public reads active delivery zones" ON public.delivery_zones;
CREATE POLICY "public reads active delivery zones" ON public.delivery_zones
FOR SELECT TO anon USING (is_active);

DROP POLICY IF EXISTS "authenticated reads delivery zones" ON public.delivery_zones;
CREATE POLICY "authenticated reads delivery zones" ON public.delivery_zones
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admins manage delivery zones" ON public.delivery_zones;
CREATE POLICY "admins manage delivery zones" ON public.delivery_zones
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Reprend les zones codées en dur jusqu'ici, pour ne rien casser au déploiement.
INSERT INTO public.delivery_zones (name, fee, sort_order)
VALUES
  ('Sébénicoro Centre', 500, 1),
  ('Sébénicoro Extension', 750, 2),
  ('Badalabougou', 1500, 3),
  ('Kalaban Coura', 1500, 4),
  ('Lafiabougou', 1250, 5),
  ('Djicoroni Para', 1250, 6),
  ('Hamdallaye ACI 2000', 2000, 7),
  ('Baco Djicoroni', 1500, 8)
ON CONFLICT (name) DO NOTHING;
