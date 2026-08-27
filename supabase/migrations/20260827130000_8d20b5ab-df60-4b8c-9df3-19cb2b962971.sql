-- GESTION DE STOCK (historique des mouvements) + STATISTIQUES DE REVENU.

-- MOUVEMENTS DE STOCK
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_menu_id uuid REFERENCES public.daily_menus(id) ON DELETE SET NULL,
  dish_id uuid REFERENCES public.dishes(id) ON DELETE SET NULL,
  change integer NOT NULL,
  reason text NOT NULL DEFAULT 'ajustement',
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read stock movements" ON public.stock_movements;
CREATE POLICY "admins read stock movements" ON public.stock_movements
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS stock_movements_created_at_idx ON public.stock_movements (created_at DESC);

-- Journalise automatiquement tout changement de stock_quantity, qu'il vienne
-- d'une vente (place_order) ou d'une modification manuelle en back-office.
-- La raison "vente" est posée via un paramètre de session le temps de la
-- transaction ; sans ce paramètre, on part du principe qu'il s'agit d'un
-- ajustement manuel.
CREATE OR REPLACE FUNCTION public.log_stock_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _reason text := coalesce(nullif(current_setting('belyme.stock_change_reason', true), ''), 'ajustement');
BEGIN
  INSERT INTO public.stock_movements (daily_menu_id, dish_id, change, reason, created_by)
  VALUES (NEW.id, NEW.dish_id, NEW.stock_quantity - OLD.stock_quantity, _reason, auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS daily_menus_log_stock_change ON public.daily_menus;
CREATE TRIGGER daily_menus_log_stock_change
AFTER UPDATE ON public.daily_menus
FOR EACH ROW
WHEN (OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity)
EXECUTE FUNCTION public.log_stock_movement();

-- PLACE ORDER : marque désormais ses décréments de stock comme des ventes.
DROP FUNCTION IF EXISTS public.place_order(text,text,text,text,text,jsonb,text,date,text);

CREATE FUNCTION public.place_order(
  _customer_name text,
  _customer_phone text,
  _delivery_type text,
  _delivery_zone text,
  _payment_method text,
  _items jsonb,
  _order_type text DEFAULT 'standard',
  _event_date date DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS TABLE (order_id uuid, order_number bigint, total_amount integer, tracking_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _item jsonb;
  _total integer := 0;
  _oid uuid;
  _onum bigint;
  _tcode text;
  _price integer;
  _qty integer;
  _dish_id uuid;
  _today smallint := EXTRACT(ISODOW FROM (now() AT TIME ZONE 'UTC'))::smallint;
BEGIN
  IF coalesce(trim(_customer_name),'') = '' OR coalesce(trim(_customer_phone),'') = '' THEN
    RAISE EXCEPTION 'Nom et téléphone obligatoires';
  END IF;
  IF jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Panier vide';
  END IF;

  PERFORM set_config('belyme.stock_change_reason', 'vente', true);

  INSERT INTO public.orders (customer_name, customer_phone, delivery_type, delivery_zone,
    total_amount, payment_method, order_type, event_date, notes)
  VALUES (left(trim(_customer_name),120), left(trim(_customer_phone),40),
    coalesce(_delivery_type,'emporter'), _delivery_zone, 0,
    coalesce(_payment_method,'especes'), coalesce(_order_type,'standard'), _event_date, left(_notes, 500))
  RETURNING id, orders.order_number, orders.tracking_code INTO _oid, _onum, _tcode;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _dish_id := (_item->>'dish_id')::uuid;
    _qty := greatest(1, coalesce((_item->>'quantity')::int, 1));
    SELECT d.price INTO _price FROM public.dishes d WHERE d.id = _dish_id AND d.is_active;
    IF _price IS NULL THEN
      RAISE EXCEPTION 'Plat indisponible';
    END IF;
    -- Happy hour anti-gaspillage : -25% à partir de 21h (heure de Bamako = UTC)
    IF EXTRACT(HOUR FROM (now() AT TIME ZONE 'UTC')) >= 21 THEN
      _price := (_price * 0.75)::int;
    END IF;
    _total := _total + (_price * _qty);
    INSERT INTO public.order_items (order_id, dish_id, dish_name, quantity, unit_price, special_note)
    SELECT _oid, _dish_id, d.name, _qty, _price, left(_item->>'special_note', 300)
    FROM public.dishes d WHERE d.id = _dish_id;

    UPDATE public.daily_menus
      SET stock_quantity = greatest(0, stock_quantity - _qty), updated_at = now()
      WHERE dish_id = _dish_id AND day_of_week = _today;
  END LOOP;

  UPDATE public.orders SET total_amount = _total WHERE id = _oid;

  RETURN QUERY SELECT _oid, _onum, _total, _tcode;
END;
$$;
GRANT EXECUTE ON FUNCTION public.place_order(text,text,text,text,text,jsonb,text,date,text) TO anon, authenticated;

-- STATISTIQUES DE REVENU (aujourd'hui / cette semaine / ce mois).
-- SECURITY INVOKER (par défaut) : s'appuie sur la policy RLS "admins read
-- orders" déjà en place, donc renvoie 0 pour un compte non-admin plutôt que
-- de fuiter des montants.
CREATE OR REPLACE FUNCTION public.admin_revenue_stats()
RETURNS TABLE (
  revenue_today numeric,
  revenue_week numeric,
  revenue_month numeric,
  orders_today bigint,
  orders_week bigint,
  orders_month bigint
)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    coalesce(sum(total_amount) FILTER (WHERE created_at >= date_trunc('day', now())), 0),
    coalesce(sum(total_amount) FILTER (WHERE created_at >= date_trunc('week', now())), 0),
    coalesce(sum(total_amount) FILTER (WHERE created_at >= date_trunc('month', now())), 0),
    count(*) FILTER (WHERE created_at >= date_trunc('day', now())),
    count(*) FILTER (WHERE created_at >= date_trunc('week', now())),
    count(*) FILTER (WHERE created_at >= date_trunc('month', now()))
  FROM public.orders
  WHERE status <> 'Annulé';
$$;

GRANT EXECUTE ON FUNCTION public.admin_revenue_stats() TO authenticated;
