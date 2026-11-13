-- =====================================================================
-- PSMS RESET  (run FIRST, only if an older version is already installed)
-- =====================================================================
-- !! DESTRUCTIVE !!  Deletes every PSMS table and ALL its data (orders, payments,
-- customers, prices, inventory, settings, logs) plus the old functions, triggers,
-- sequences and storage policies, so schema.sql can be run on a clean slate.
-- Take a backup first if anything in the old database matters
-- (Supabase > Database > Backups, or export the tables as CSV).
--
-- Run order for a clean reinstall:
--   00_reset.sql -> schema.sql -> policies.sql -> seed.sql
-- =====================================================================

-- 1. Trigger on the Supabase auth table (lives outside the public schema)
drop trigger if exists on_auth_user_created on auth.users;

-- 2. Storage policies created by PSMS (the three buckets themselves are kept;
--    policies.sql re-creates/updates them. Supabase does not allow deleting
--    buckets or files with plain SQL - use Storage > Empty bucket if needed.)
do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects' and policyname like 'psms\_%' loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

-- 3. Tables (CASCADE also removes their policies, triggers, indexes, FKs)
drop table if exists
  public.activity_logs,
  public.notifications,
  public.material_usage_rules,
  public.inventory_transactions,
  public.inventory,
  public.expenses,
  public.expense_categories,
  public.payments,
  public.order_files,
  public.order_items,
  public.orders,
  public.quantity_discounts,
  public.service_pricing,
  public.services,
  public.employees,
  public.customers,
  public.profiles,
  public.business_settings
cascade;

-- 4. Functions (every overload, by name)
do $$ declare f record; begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      'set_updated_at','app_role','handle_new_user','guard_profile_update','orders_before','orders_after',
      'next_order_no','calc_line','create_order','record_payment','inventory_move','deduct_for_order',
      'staff_update_job','refresh_alerts','dashboard_stats','sales_series','owner_exists','claim_owner'])
  loop
    execute 'drop function if exists ' || f.sig || ' cascade';
  end loop;
end $$;

-- 5. Sequences
drop sequence if exists public.customer_seq, public.order_seq, public.receipt_seq;

-- 6. OPTIONAL - old login accounts.
-- Existing accounts in Supabase Auth are NOT removed above. They would have no profile row
-- after the reset, and the owner e-mail you choose in the new setup screen would be rejected as
-- "already registered". To start completely clean, either delete them in
-- Authentication > Users, or uncomment the next line:
-- delete from auth.users;
