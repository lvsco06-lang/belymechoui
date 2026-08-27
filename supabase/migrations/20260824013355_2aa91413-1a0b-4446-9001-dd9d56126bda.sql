CREATE POLICY "admins read dish images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'dish-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins upload dish images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'dish-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins update dish images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'dish-images' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'dish-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins delete dish images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'dish-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));