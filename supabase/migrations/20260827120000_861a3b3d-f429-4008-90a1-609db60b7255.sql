-- SUIVI DE COMMANDE SANS COMPTE : code public + fonction de lecture dédiée.

-- Colonnes de suivi sur orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NOT NULL DEFAULT now();

-- Génère un code de 10 caractères, alphabet sans 0/O/1/I/L pour éviter les confusions.
CREATE OR REPLACE FUNCTION public.generate_tracking_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  _alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  _code text;
BEGIN
  LOOP
    SELECT string_agg(substr(_alphabet, (floor(random() * length(_alphabet)) + 1)::int, 1), '')
    INTO _code
    FROM generate_series(1, 10);

    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE tracking_code = _code);
  END LOOP;
  RETURN _code;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tracking_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tracking_code IS NULL THEN
    NEW.tracking_code := public.generate_tracking_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_tracking_code ON public.orders;
CREATE TRIGGER orders_set_tracking_code
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_tracking_code();

-- Backfill des commandes existantes (créées avant cette migration).
UPDATE public.orders SET tracking_code = public.generate_tracking_code() WHERE tracking_code IS NULL;

ALTER TABLE public.orders ALTER COLUMN tracking_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_code_key ON public.orders (tracking_code);

-- Met à jour status_updated_at à chaque changement de statut.
CREATE OR REPLACE FUNCTION public.touch_status_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_touch_status_updated_at ON public.orders;
CREATE TRIGGER orders_touch_status_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.touch_status_updated_at();

-- TRACK ORDER (public, lecture par code uniquement — pas d'accès direct à la table)
CREATE OR REPLACE FUNCTION public.track_order(_code text)
RETURNS TABLE (
  order_number bigint,
  status text,
  status_updated_at timestamptz,
  created_at timestamptz,
  order_type text,
  delivery_type text,
  delivery_zone text,
  total_amount integer,
  customer_first_name text,
  items jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    o.order_number,
    o.status,
    o.status_updated_at,
    o.created_at,
    o.order_type,
    o.delivery_type,
    o.delivery_zone,
    o.total_amount,
    split_part(trim(o.customer_name), ' ', 1),
    coalesce(
      (SELECT jsonb_agg(jsonb_build_object(
          'dish_name', oi.dish_name,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price
        ))
       FROM public.order_items oi
       WHERE oi.order_id = o.id),
      '[]'::jsonb
    )
  FROM public.orders o
  WHERE o.tracking_code = upper(_code)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.track_order(text) TO anon, authenticated;

-- PLACE ORDER : renvoie désormais le code de suivi généré à l'insertion,
-- pour que le client puisse l'afficher juste après la commande.
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
