-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');

-- USER ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "users read own roles" ON public.user_roles
FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- DISHES
CREATE TABLE public.dishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Grillades',
  price integer NOT NULL DEFAULT 0,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dishes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dishes TO authenticated;
GRANT ALL ON public.dishes TO service_role;
ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads active dishes" ON public.dishes FOR SELECT TO anon USING (is_active);
CREATE POLICY "authenticated reads dishes" ON public.dishes FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage dishes" ON public.dishes FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- DAILY MENUS
CREATE TABLE public.daily_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  dish_id uuid NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
  is_special_today boolean NOT NULL DEFAULT false,
  stock_quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day_of_week, dish_id)
);
GRANT SELECT ON public.daily_menus TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_menus TO authenticated;
GRANT ALL ON public.daily_menus TO service_role;
ALTER TABLE public.daily_menus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads daily menus" ON public.daily_menus FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated reads daily menus" ON public.daily_menus FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage daily menus" ON public.daily_menus FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ORDERS
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number bigint GENERATED ALWAYS AS IDENTITY,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  delivery_type text NOT NULL DEFAULT 'emporter',
  delivery_zone text,
  total_amount integer NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'especes',
  status text NOT NULL DEFAULT 'En préparation',
  order_type text NOT NULL DEFAULT 'standard',
  event_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read orders" ON public.orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins update orders" ON public.orders FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ORDER ITEMS
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  dish_id uuid REFERENCES public.dishes(id) ON DELETE SET NULL,
  dish_name text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 1,
  unit_price integer NOT NULL DEFAULT 0,
  special_note text
);
GRANT SELECT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read order items" ON public.order_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ACTIVE ORDERS COUNT (public, for dynamic prep time)
CREATE OR REPLACE FUNCTION public.active_orders_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.orders WHERE status = 'En préparation';
$$;
GRANT EXECUTE ON FUNCTION public.active_orders_count() TO anon, authenticated;

-- PLACE ORDER (public checkout: insert order + items, decrement stock)
CREATE OR REPLACE FUNCTION public.place_order(
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
RETURNS TABLE (order_id uuid, order_number bigint, total_amount integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _item jsonb;
  _total integer := 0;
  _oid uuid;
  _onum bigint;
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
  RETURNING id, orders.order_number INTO _oid, _onum;

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

  RETURN QUERY SELECT _oid, _onum, _total;
END;
$$;
GRANT EXECUTE ON FUNCTION public.place_order(text,text,text,text,text,jsonb,text,date,text) TO anon, authenticated;

-- REALTIME
ALTER TABLE public.daily_menus REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_menus;

-- SEED DISHES
INSERT INTO public.dishes (name, description, category, price, is_active) VALUES
('Méchoui Royal (part)','Agneau entier rôti lentement aux braises, épices sahéliennes, pain traditionnel.','Méchoui',9000,true),
('Demi-Méchoui','Une demi-carcasse d''agneau rôtie, idéale pour 6 à 8 personnes.','Méchoui',85000,true),
('Méchoui Entier','Agneau entier pour vos événements, 15 à 20 personnes. Sur précommande.','Méchoui',160000,true),
('Côtelettes d''agneau grillées','Côtelettes marinées au charbon de bois, sauce yassa maison.','Grillades',7500,true),
('Poulet braisé Bamako','Poulet fermier braisé, sauce piquante, attiéké ou frites.','Grillades',5500,true),
('Brochettes de bœuf','Brochettes tendres marinées, oignons braisés et moutarde.','Grillades',4000,true),
('Capitaine grillé du Niger','Poisson capitaine entier grillé, citron et alloco.','Grillades',8500,true),
('Tiep Dieune','Riz au poisson traditionnel, légumes du marché.','Plats locaux',4500,true),
('Mafé de bœuf','Sauce arachide onctueuse, riz parfumé.','Plats locaux',4000,true),
('Riz gras Belymechoui','Riz gras au mouton, spécialité de la maison.','Plats locaux',5000,true),
('Burger Braise','Steak haché maison, cheddar fondu, sauce braise, frites.','International',6000,true),
('Pâtes fruits de mer','Tagliatelles crémeuses aux crevettes et calamars.','International',7000,true),
('Salade Sahel','Crudités fraîches, avocat, vinaigrette au gingembre.','Entrées',3000,true),
('Jus de bissap','Hibiscus frais, menthe et gingembre.','Boissons',1000,true),
('Jus de gingembre','Gingembre pressé maison, bien frais.','Boissons',1000,true);

-- SEED DAILY MENUS (tous les jours, avec un spécial méchoui)
INSERT INTO public.daily_menus (day_of_week, dish_id, is_special_today, stock_quantity)
SELECT d.day, x.id,
  (x.name = 'Méchoui Royal (part)'),
  CASE WHEN x.category = 'Boissons' THEN 60 WHEN x.name = 'Méchoui Entier' THEN 2 ELSE 12 + (d.day * 2) END
FROM generate_series(1,7) AS d(day)
CROSS JOIN public.dishes x;