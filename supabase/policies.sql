-- =====================================================================
-- PSMS Row Level Security + Storage policies (run SECOND)
-- =====================================================================
do $$ declare t text; begin
  foreach t in array array['profiles','customers','employees','services','service_pricing','quantity_discounts','orders','order_items',
    'order_files','payments','expense_categories','expenses','inventory','inventory_transactions','material_usage_rules',
    'notifications','business_settings','activity_logs'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- drop old versions so the script can be re-run
do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies
           where (schemaname = 'public') or (schemaname = 'storage' and tablename = 'objects' and policyname like 'psms_%') loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.app_role() in ('admin','cashier','staff'));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.app_role() = 'admin') with check (id = auth.uid() or public.app_role() = 'admin');

-- customers
create policy customers_select on public.customers for select to authenticated
  using (public.app_role() in ('admin','cashier','staff') or user_id = auth.uid());
create policy customers_insert on public.customers for insert to authenticated
  with check (public.app_role() in ('admin','cashier'));
create policy customers_update on public.customers for update to authenticated
  using (public.app_role() in ('admin','cashier') or user_id = auth.uid())
  with check (public.app_role() in ('admin','cashier') or user_id = auth.uid());
create policy customers_delete on public.customers for delete to authenticated using (public.app_role() = 'admin');

-- employees (admin only)
create policy employees_all on public.employees for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- services / pricing / discounts: readable by any signed-in user, writable by admin
create policy services_select on public.services for select to authenticated using (true);
create policy services_write on public.services for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy pricing_select on public.service_pricing for select to authenticated using (true);
create policy pricing_write on public.service_pricing for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy qd_select on public.quantity_discounts for select to authenticated using (true);
create policy qd_write on public.quantity_discounts for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- orders: created only through the create-order function
create policy orders_select on public.orders for select to authenticated using (
  public.app_role() in ('admin','cashier')
  or (public.app_role() = 'staff' and assigned_to = auth.uid())
  or customer_id in (select id from public.customers where user_id = auth.uid()));
create policy orders_update on public.orders for update to authenticated
  using (public.app_role() in ('admin','cashier')) with check (public.app_role() in ('admin','cashier'));
create policy orders_delete on public.orders for delete to authenticated using (public.app_role() = 'admin');

-- order items / files inherit order visibility (the sub-select is itself subject to orders RLS)
create policy items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy items_write on public.order_items for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy files_select on public.order_files for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy files_insert on public.order_files for insert to authenticated
  with check (uploaded_by = auth.uid() and exists (select 1 from public.orders o where o.id = order_id));
create policy files_delete on public.order_files for delete to authenticated using (public.app_role() = 'admin');

-- payments: created only through process-payment function
create policy payments_select on public.payments for select to authenticated using (
  public.app_role() in ('admin','cashier')
  or (public.app_role() = 'customer' and exists (select 1 from public.orders o where o.id = order_id)));

-- expenses (admin only)
create policy expcat_all on public.expense_categories for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy expenses_all on public.expenses for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- inventory
create policy inventory_select on public.inventory for select to authenticated
  using (public.app_role() in ('admin','cashier','staff'));
create policy inventory_write on public.inventory for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy invtx_select on public.inventory_transactions for select to authenticated using (public.app_role() = 'admin');
create policy mur_all on public.material_usage_rules for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- notifications
create policy notif_select on public.notifications for select to authenticated
  using (public.app_role() = any (target_roles) or target_user = auth.uid());
create policy notif_update on public.notifications for update to authenticated
  using (public.app_role() = any (target_roles) or target_user = auth.uid())
  with check (public.app_role() = any (target_roles) or target_user = auth.uid());

-- settings: readable by everyone (login page shows the business name), writable by admin
create policy settings_select on public.business_settings for select to anon, authenticated using (true);
create policy settings_write on public.business_settings for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- activity logs
create policy logs_select on public.activity_logs for select to authenticated using (public.app_role() = 'admin');
create policy logs_insert on public.activity_logs for insert to authenticated with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Storage buckets + policies
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
 ('order-files','order-files', false, 26214400, array['application/pdf','application/msword',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/tiff']),
 ('expense-receipts','expense-receipts', false, 10485760, array['application/pdf','image/jpeg','image/png']),
 ('branding','branding', true, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Files live under  <order_id>/<file>. Access follows the visibility of that order.
create policy psms_orderfiles_select on storage.objects for select to authenticated using (
  bucket_id = 'order-files' and exists (select 1 from public.orders o where o.id::text = (storage.foldername(name))[1]));
create policy psms_orderfiles_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'order-files' and exists (select 1 from public.orders o where o.id::text = (storage.foldername(name))[1]));
create policy psms_orderfiles_delete on storage.objects for delete to authenticated using (
  bucket_id = 'order-files' and public.app_role() = 'admin');
create policy psms_expreceipts_all on storage.objects for all to authenticated
  using (bucket_id = 'expense-receipts' and public.app_role() = 'admin')
  with check (bucket_id = 'expense-receipts' and public.app_role() = 'admin');
create policy psms_branding_write on storage.objects for all to authenticated
  using (bucket_id = 'branding' and public.app_role() = 'admin')
  with check (bucket_id = 'branding' and public.app_role() = 'admin');
