-- =====================================================================
-- NOTIFICATION UPDATE  (run once in Supabase > SQL Editor; safe to re-run)
--  * Customers now get a notification for every step: approved, printing, ready, completed, cancelled, payment received.
--  * Admin alerts (delayed order, low stock, unpaid balance) are created automatically every 5 minutes
--    instead of only when the Dashboard is opened.
-- =====================================================================

create or replace function public.orders_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare cust_user uuid;
begin
  if new.status is distinct from old.status then
    insert into public.activity_logs(user_id, action, entity, entity_id, details)
    select auth.uid(), 'order_status', 'order', new.id, jsonb_build_object('order_no', new.order_no, 'from', old.status, 'to', new.status)
    where auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid());
    select user_id into cust_user from public.customers where id = new.customer_id;
    if new.status = 'Ready for Pickup' then
      insert into public.notifications(type, title, message, order_id, target_roles, target_user)
      values ('ready', 'Order ready for pickup', 'Order ' || new.order_no || ' is ready for pickup.', new.id, '{admin,cashier}', cust_user);
    elsif cust_user is not null and new.status <> 'Pending' then
      -- tell the customer about every progress step (approved, printing, completed, cancelled...)
      insert into public.notifications(type, title, message, order_id, target_user)
      values ('order_status',
        case new.status when 'Approved' then 'Order approved' when 'Completed' then 'Order completed' when 'Cancelled' then 'Order cancelled' else 'Order update' end,
        'Order ' || new.order_no || case new.status when 'Approved' then ' was approved.' when 'Completed' then ' is completed. Thank you!' when 'Cancelled' then ' was cancelled.' else ' is now ' || new.status || '.' end,
        new.id, cust_user);
    end if;
    if new.status = 'Completed' and not new.inventory_deducted then perform public.deduct_for_order(new.id); end if;
  end if;
  if new.assigned_to is not null and new.assigned_to is distinct from old.assigned_to then
    insert into public.notifications(type, title, message, order_id, target_user)
    values ('assigned', 'New job assigned', 'Order ' || new.order_no || ' was assigned to you.', new.id, new.assigned_to);
  end if;
  return null;
end $$;
drop trigger if exists trg_orders_after on public.orders;
create trigger trg_orders_after after update on public.orders for each row execute function public.orders_after();

-- Customer is told when a payment is received
create or replace function public.payments_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare cust_user uuid; ono text;
begin
  select c.user_id, o.order_no into cust_user, ono
    from public.orders o join public.customers c on c.id = o.customer_id where o.id = new.order_id;
  if cust_user is not null then
    insert into public.notifications(type, title, message, order_id, target_user)
    values ('payment_customer', 'Payment received', 'We received PHP ' || to_char(new.amount,'FM999,999,990.00') || ' for ' || ono || '. Thank you!', new.order_id, cust_user);
  end if;
  return null;
end $$;
drop trigger if exists trg_payments_after on public.payments;
create trigger trg_payments_after after insert on public.payments for each row execute function public.payments_after();

-- Same alerts as refresh_alerts(), but run automatically every 5 minutes by the Netlify function "alerts-cron"
-- (no need to open the Dashboard). Only between 8:00 AM and 9:00 PM Manila time so nobody is woken at midnight.
create or replace function public.refresh_alerts_system() returns void
language plpgsql security definer set search_path = public as $$
declare h int := extract(hour from (now() at time zone 'Asia/Manila'))::int;
begin
  if h < 8 or h >= 21 then return; end if;
  insert into public.notifications(type, title, message, target_roles, dedupe_key)
  select 'low_stock', 'Low stock: ' || name, name || ' is at ' || quantity || ' ' || unit || ' (minimum ' || min_stock || ')',
         '{admin}', 'low:' || id || ':' || to_char(current_date,'YYYYMMDD')
  from public.inventory where active and quantity <= min_stock on conflict (dedupe_key) do nothing;
  insert into public.notifications(type, title, message, order_id, target_roles, dedupe_key)
  select 'delayed', 'Delayed order ' || order_no, 'Expected ' || to_char(expected_date,'Mon DD') || ' - still ' || status, id, '{admin,cashier}', 'late:' || id
  from public.orders where status in ('Pending','Approved','Designing','Printing','Finishing')
    and expected_date < (now() at time zone 'Asia/Manila')::date on conflict (dedupe_key) do nothing;
  insert into public.notifications(type, title, message, order_id, target_roles, dedupe_key)
  select 'unpaid', 'Unpaid balance ' || order_no, 'PHP ' || to_char(balance,'FM999,999,990.00') || ' still due', id, '{admin,cashier}', 'unpaid:' || id
  from public.orders where status in ('Ready for Pickup','Completed') and balance > 0 on conflict (dedupe_key) do nothing;
end $$;
revoke execute on function public.refresh_alerts_system() from public, anon, authenticated;
grant execute on function public.refresh_alerts_system() to service_role;
