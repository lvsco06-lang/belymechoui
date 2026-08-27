-- JOURNAL DE DÉPENSES (achats, personnel, loyer, etc.) + STATISTIQUES FINANCIÈRES
-- (revenu, dépenses, bénéfice net) sur aujourd'hui / cette semaine / ce mois.

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'Ingrédients',
  label text NOT NULL,
  amount integer NOT NULL,
  quantity numeric,
  unit text,
  supplier text,
  paid_at date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage expenses" ON public.expenses;
CREATE POLICY "admins manage expenses" ON public.expenses
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS expenses_paid_at_idx ON public.expenses (paid_at DESC);

-- Remplace admin_revenue_stats() : mêmes chiffres de revenu, plus les dépenses
-- et le bénéfice net (revenu - dépenses) sur les mêmes périodes.
DROP FUNCTION IF EXISTS public.admin_revenue_stats();

CREATE OR REPLACE FUNCTION public.admin_finance_stats()
RETURNS TABLE (
  revenue_today numeric,
  revenue_week numeric,
  revenue_month numeric,
  orders_today bigint,
  orders_week bigint,
  orders_month bigint,
  expenses_today numeric,
  expenses_week numeric,
  expenses_month numeric,
  net_today numeric,
  net_week numeric,
  net_month numeric
)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH rev AS (
    SELECT
      coalesce(sum(total_amount) FILTER (WHERE created_at >= date_trunc('day', now())), 0) AS today,
      coalesce(sum(total_amount) FILTER (WHERE created_at >= date_trunc('week', now())), 0) AS week,
      coalesce(sum(total_amount) FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS month,
      count(*) FILTER (WHERE created_at >= date_trunc('day', now())) AS orders_today,
      count(*) FILTER (WHERE created_at >= date_trunc('week', now())) AS orders_week,
      count(*) FILTER (WHERE created_at >= date_trunc('month', now())) AS orders_month
    FROM public.orders
    WHERE status <> 'Annulé'
  ),
  exp AS (
    SELECT
      coalesce(sum(amount) FILTER (WHERE paid_at >= date_trunc('day', now())::date), 0) AS today,
      coalesce(sum(amount) FILTER (WHERE paid_at >= date_trunc('week', now())::date), 0) AS week,
      coalesce(sum(amount) FILTER (WHERE paid_at >= date_trunc('month', now())::date), 0) AS month
    FROM public.expenses
  )
  SELECT
    rev.today, rev.week, rev.month,
    rev.orders_today, rev.orders_week, rev.orders_month,
    exp.today, exp.week, exp.month,
    rev.today - exp.today, rev.week - exp.week, rev.month - exp.month
  FROM rev, exp;
$$;

GRANT EXECUTE ON FUNCTION public.admin_finance_stats() TO authenticated;
