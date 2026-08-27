GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.active_orders_count() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.place_order(text, text, text, text, text, jsonb, text, date, text) TO authenticated, anon, service_role;