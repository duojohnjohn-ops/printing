-- =====================================================================
-- PSMS schema  (run FIRST in Supabase SQL Editor)
-- =====================================================================
create extension if not exists pgcrypto;
create sequence if not exists public.customer_seq;
create sequence if not exists public.order_seq;
create sequence if not exists public.receipt_seq;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  role text not null default 'customer' check (role in ('admin','cashier','staff','customer')),
  phone text,
  active boolean not null default true,
  is_owner boolean not null default false,   -- exactly one owner; set only by claim_owner()
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_single_owner on public.profiles ((is_owner)) where is_owner;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_no text not null unique default ('CUST-' || lpad(nextval('public.customer_seq')::text, 5, '0')),
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  phone text, email text, address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  position text, phone text,
  monthly_salary numeric(12,2) not null default 0 check (monthly_salary >= 0),
  hired_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text, description text,
  turnaround_days int not null default 1 check (turnaround_days >= 0),
  rush_fee_percent numeric(6,2) not null default 0 check (rush_fee_percent between 0 and 500),
  additional_charge numeric(12,2) not null default 0 check (additional_charge >= 0),
  additional_charge_label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_pricing (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  paper_size text, paper_type text,
  color_mode text not null default 'any' check (color_mode in ('any','bw','color')),
  sided text not null default 'any' check (sided in ('any','single','double')),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quantity_discounts (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id) on delete cascade, -- null = all services
  min_qty int not null check (min_qty > 0),
  discount_percent numeric(5,2) not null check (discount_percent between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  source text not null default 'walk-in' check (source in ('walk-in','online')),
  status text not null default 'Pending' check (status in ('Pending','Approved','Designing','Printing','Finishing','Ready for Pickup','Completed','Cancelled')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid,
  order_date timestamptz not null default now(),
  expected_date date,
  completed_at timestamptz,
  special_instructions text,
  production_notes text,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  rush_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0 check (total >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  balance numeric(12,2) not null default 0,
  payment_status text not null default 'Unpaid' check (payment_status in ('Unpaid','Partial','Paid')),
  inventory_deducted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  service_name text not null,
  paper_size text, paper_type text,
  color_mode text not null check (color_mode in ('bw','color')),
  sided text not null check (sided in ('single','double')),
  pages int not null check (pages > 0),
  copies int not null check (copies > 0),
  quantity numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  additional_charge numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null,
  discount numeric(12,2) not null default 0,
  rush boolean not null default false,
  rush_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  instructions text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_size bigint, mime_type text,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  order_id uuid not null references public.orders(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  tendered numeric(12,2),
  change_given numeric(12,2) not null default 0,
  method text not null check (method in ('Cash','GCash','Maya','Bank Transfer','Other')),
  reference text, notes text,
  received_by uuid,
  paid_at timestamptz not null default now()
);

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.expense_categories(id) on delete restrict,
  description text,
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null default current_date,
  payment_method text,
  receipt_path text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  unit text not null default 'pcs',
  quantity numeric(14,2) not null default 0 check (quantity >= 0),
  min_stock numeric(14,2) not null default 0 check (min_stock >= 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  type text not null check (type in ('purchase','usage','adjustment','order_deduction')),
  quantity numeric(14,2) not null,           -- signed change
  unit_cost numeric(12,2),
  balance_after numeric(14,2),
  reference_order_id uuid references public.orders(id) on delete set null,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
-- Prevent duplicate automatic deductions for the same order + material
create unique index if not exists uq_inv_order_deduction
  on public.inventory_transactions(reference_order_id, inventory_id) where type = 'order_deduction';

create table if not exists public.material_usage_rules (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  qty_per_unit numeric(14,4) not null check (qty_per_unit > 0),
  active boolean not null default true,
  unique (service_id, inventory_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  message text,
  order_id uuid references public.orders(id) on delete cascade,
  target_roles text[] not null default '{}',
  target_user uuid,
  dedupe_key text unique,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.business_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists ix_orders_customer on public.orders(customer_id);
create index if not exists ix_orders_status on public.orders(status);
create index if not exists ix_orders_date on public.orders(order_date);
create index if not exists ix_orders_assigned on public.orders(assigned_to);
create index if not exists ix_items_order on public.order_items(order_id);
create index if not exists ix_files_order on public.order_files(order_id);
create index if not exists ix_payments_order on public.payments(order_id);
create index if not exists ix_payments_paid on public.payments(paid_at);
create index if not exists ix_expenses_date on public.expenses(expense_date);
create index if not exists ix_invtx_inv on public.inventory_transactions(inventory_id);
create index if not exists ix_pricing_service on public.service_pricing(service_id);
create index if not exists ix_notif_created on public.notifications(created_at desc);
create index if not exists ix_logs_created on public.activity_logs(created_at desc);

-- updated_at triggers
do $$ declare t text; begin
  foreach t in array array['profiles','customers','employees','services','service_pricing','orders','expenses','inventory'] loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, email, role, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email, 'customer', new.raw_user_meta_data->>'phone');
  insert into public.customers(user_id, name, email, phone)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)), new.email, new.raw_user_meta_data->>'phone');
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Only admins (or the service role / SQL editor) can change role or active flag.
-- Nobody signed in through the app can ever change the owner flag, and the owner cannot be demoted or deactivated.
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.is_owner is distinct from old.is_owner then raise exception 'The owner flag cannot be changed'; end if;
    if old.is_owner and (new.role <> 'admin' or new.active = false) then raise exception 'The owner account cannot be demoted or deactivated'; end if;
    if coalesce(public.app_role(),'') <> 'admin' and (new.role <> old.role or new.active <> old.active or new.id <> old.id) then
      raise exception 'Not allowed to change role or status';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard before update on public.profiles for each row execute function public.guard_profile_update();

create or replace function public.orders_before() returns trigger language plpgsql as $$
begin
  new.balance := greatest(new.total - new.amount_paid, 0);
  new.payment_status := case
    when new.total > 0 and new.amount_paid >= new.total then 'Paid'
    when new.amount_paid > 0 then 'Partial' else 'Unpaid' end;
  if new.status = 'Completed' then
    if tg_op = 'INSERT' then new.completed_at := now();
    elsif old.status <> 'Completed' then new.completed_at := now(); end if;
  else new.completed_at := null; end if;
  return new;
end $$;
drop trigger if exists trg_orders_before on public.orders;
create trigger trg_orders_before before insert or update on public.orders for each row execute function public.orders_before();

create or replace function public.next_order_no() returns text
language plpgsql security definer set search_path = public as $$
declare pref text;
begin
  select value into pref from public.business_settings where key = 'order_prefix';
  return coalesce(nullif(pref,''),'ORD') || '-' || to_char(now() at time zone 'Asia/Manila','YYMMDD') || '-' || lpad(nextval('public.order_seq')::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------
-- Owner-first setup
-- ---------------------------------------------------------------------
-- Public check used by the login page to decide between "Set up owner" and "Sign in".
create or replace function public.owner_exists() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where is_owner)
$$;
revoke execute on function public.owner_exists() from public;
grant execute on function public.owner_exists() to anon, authenticated, service_role;

-- Atomically promotes the first account to owner/admin. Service role only (called by the setup-owner function).
create or replace function public.claim_owner(p_user uuid, p_name text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(727001);
  if exists (select 1 from public.profiles where is_owner) then
    raise exception 'The owner account has already been set up';
  end if;
  update public.profiles
     set role = 'admin', is_owner = true, active = true,
         full_name = coalesce(nullif(trim(p_name),''), full_name), phone = nullif(trim(p_phone),'')
   where id = p_user;
  if not found then raise exception 'User profile not found'; end if;
  delete from public.customers where user_id = p_user;  -- the owner is staff, not a customer
  insert into public.activity_logs(user_id, action, entity, entity_id, details)
  values (p_user, 'owner_setup', 'user', p_user, null);
end $$;
revoke execute on function public.claim_owner(uuid,text,text) from public, anon, authenticated;
grant execute on function public.claim_owner(uuid,text,text) to service_role;

-- ---------------------------------------------------------------------
-- Pricing (single source of truth; used by the UI preview AND order creation)
-- ---------------------------------------------------------------------
create or replace function public.calc_line(
  p_service uuid, p_paper_size text, p_paper_type text, p_color text, p_sided text,
  p_pages int, p_copies int, p_rush boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.services%rowtype; pr public.service_pricing%rowtype;
  qty numeric; sub numeric; pct numeric := 0; disc numeric; rush numeric := 0;
begin
  if p_pages is null or p_pages < 1 or p_copies is null or p_copies < 1 then
    raise exception 'Pages and copies must be at least 1';
  end if;
  select * into s from public.services where id = p_service and active;
  if not found then raise exception 'Service is not available'; end if;
  select * into pr from public.service_pricing sp
   where sp.service_id = p_service and sp.active
     and (sp.paper_size is null or sp.paper_size = p_paper_size)
     and (sp.paper_type is null or sp.paper_type = p_paper_type)
     and (sp.color_mode = 'any' or sp.color_mode = p_color)
     and (sp.sided = 'any' or sp.sided = p_sided)
   order by ((sp.paper_size is not null)::int + (sp.paper_type is not null)::int
            + (sp.color_mode <> 'any')::int + (sp.sided <> 'any')::int) desc, sp.unit_price asc
   limit 1;
  if not found then raise exception 'No price is configured for the selected options'; end if;
  qty := p_pages * p_copies;
  sub := round(pr.unit_price * qty + s.additional_charge, 2);
  select coalesce(max(discount_percent),0) into pct from public.quantity_discounts
   where active and min_qty <= qty and (service_id is null or service_id = p_service);
  disc := round(sub * pct / 100, 2);
  if p_rush then rush := round((sub - disc) * s.rush_fee_percent / 100, 2); end if;
  return jsonb_build_object('service_name', s.name, 'unit_price', pr.unit_price, 'quantity', qty,
    'additional_charge', s.additional_charge, 'subtotal', sub, 'discount_percent', pct, 'discount', disc,
    'rush_fee', rush, 'total', sub - disc + rush, 'turnaround_days', s.turnaround_days);
end $$;

-- ---------------------------------------------------------------------
-- Transactional operations (callable ONLY by the service role = Netlify Functions)
-- ---------------------------------------------------------------------
create or replace function public.create_order(
  p_customer uuid, p_items jsonb, p_source text, p_expected date, p_instructions text,
  p_user uuid, p_extra_discount numeric default 0, p_assigned uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare oid uuid; it jsonb; c jsonb; v_sub numeric := 0; v_disc numeric := 0; v_rush numeric := 0;
  v_days int := 0; v_any_rush boolean := false; extra numeric; v_no text; r boolean;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Order needs at least one item'; end if;
  if not exists (select 1 from public.customers where id = p_customer) then raise exception 'Customer not found'; end if;
  v_no := public.next_order_no();
  insert into public.orders(order_no, customer_id, source, created_by, assigned_to, special_instructions, status)
  values (v_no, p_customer, p_source, p_user, p_assigned, p_instructions,
          case when p_source = 'online' then 'Pending' else 'Approved' end)
  returning id into oid;
  for it in select * from jsonb_array_elements(p_items) loop
    r := coalesce((it->>'rush')::boolean, false);
    c := public.calc_line((it->>'service_id')::uuid, nullif(it->>'paper_size',''), nullif(it->>'paper_type',''),
          coalesce(it->>'color_mode','bw'), coalesce(it->>'sided','single'), (it->>'pages')::int, (it->>'copies')::int, r);
    insert into public.order_items(order_id, service_id, service_name, paper_size, paper_type, color_mode, sided, pages, copies,
        quantity, unit_price, additional_charge, subtotal, discount, rush, rush_fee, total, instructions)
    values (oid, (it->>'service_id')::uuid, c->>'service_name', nullif(it->>'paper_size',''), nullif(it->>'paper_type',''),
        coalesce(it->>'color_mode','bw'), coalesce(it->>'sided','single'), (it->>'pages')::int, (it->>'copies')::int,
        (c->>'quantity')::numeric, (c->>'unit_price')::numeric, (c->>'additional_charge')::numeric, (c->>'subtotal')::numeric,
        (c->>'discount')::numeric, r, (c->>'rush_fee')::numeric, (c->>'total')::numeric, nullif(left(it->>'instructions',500),''));
    v_sub := v_sub + (c->>'subtotal')::numeric;
    v_disc := v_disc + (c->>'discount')::numeric;
    v_rush := v_rush + (c->>'rush_fee')::numeric;
    v_days := greatest(v_days, (c->>'turnaround_days')::int);
    if r then v_any_rush := true; end if;
  end loop;
  extra := least(greatest(coalesce(p_extra_discount,0),0), v_sub - v_disc + v_rush);
  update public.orders set subtotal = v_sub, discount = v_disc + extra, rush_fee = v_rush,
         total = v_sub - v_disc + v_rush - extra,
         expected_date = coalesce(p_expected, (now() at time zone 'Asia/Manila')::date + case when v_any_rush then 0 else v_days end)
   where id = oid;
  if p_source = 'online' then
    insert into public.notifications(type, title, message, order_id, target_roles)
    values ('new_order', 'New customer order', 'Order ' || v_no || ' was submitted online.', oid, '{admin,cashier}');
  end if;
  insert into public.activity_logs(user_id, action, entity, entity_id, details)
  select p_user, 'create_order', 'order', oid, jsonb_build_object('order_no', v_no) where exists (select 1 from public.profiles where id = p_user);
  return oid;
end $$;

create or replace function public.record_payment(
  p_order uuid, p_amount numeric, p_tendered numeric, p_method text, p_reference text, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; pid uuid; rno text; chg numeric := 0;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status = 'Cancelled' then raise exception 'Cannot take payment for a cancelled order'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if p_amount > o.balance + 0.004 then raise exception 'Payment exceeds the remaining balance of %', o.balance; end if;
  if p_method = 'Cash' then
    if coalesce(p_tendered, p_amount) < p_amount then raise exception 'Cash tendered is less than the amount paid'; end if;
    chg := coalesce(p_tendered, p_amount) - p_amount;
  end if;
  rno := 'OR-' || to_char(now() at time zone 'Asia/Manila','YYMMDD') || '-' || lpad(nextval('public.receipt_seq')::text, 5, '0');
  insert into public.payments(receipt_no, order_id, amount, tendered, change_given, method, reference, received_by)
  values (rno, p_order, p_amount, case when p_method = 'Cash' then coalesce(p_tendered, p_amount) end, chg, p_method, nullif(p_reference,''), p_user)
  returning id into pid;
  update public.orders set amount_paid = amount_paid + p_amount where id = p_order;
  insert into public.notifications(type, title, message, order_id, target_roles)
  values ('payment', 'Payment received', 'PHP ' || to_char(p_amount,'FM999,999,990.00') || ' for ' || o.order_no || ' (' || p_method || ')', p_order, '{admin,cashier}');
  insert into public.activity_logs(user_id, action, entity, entity_id, details)
  select p_user, 'payment', 'payment', pid, jsonb_build_object('order_no', o.order_no, 'amount', p_amount, 'method', p_method)
  where exists (select 1 from public.profiles where id = p_user);
  return jsonb_build_object('payment_id', pid, 'receipt_no', rno, 'change', chg);
end $$;

create or replace function public.inventory_move(
  p_inventory uuid, p_type text, p_qty numeric, p_unit_cost numeric, p_notes text, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv public.inventory%rowtype; delta numeric; newq numeric;
begin
  select * into inv from public.inventory where id = p_inventory for update;
  if not found then raise exception 'Inventory item not found'; end if;
  if p_qty is null then raise exception 'Quantity is required'; end if;
  if p_type in ('purchase','usage') and p_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_type = 'purchase' then delta := p_qty;
  elsif p_type = 'usage' then delta := -p_qty;
  elsif p_type = 'adjustment' then
    if p_qty < 0 then raise exception 'Counted quantity cannot be negative'; end if;
    delta := p_qty - inv.quantity;
  else raise exception 'Invalid movement type'; end if;
  newq := inv.quantity + delta;
  if newq < 0 then raise exception 'Insufficient stock (only % % available)', inv.quantity, inv.unit; end if;
  update public.inventory set quantity = newq,
    unit_cost = case when p_type = 'purchase' and p_unit_cost is not null then p_unit_cost else unit_cost end
  where id = p_inventory;
  insert into public.inventory_transactions(inventory_id, type, quantity, unit_cost, balance_after, notes, created_by)
  values (p_inventory, p_type, delta, p_unit_cost, newq, nullif(p_notes,''), p_user);
  insert into public.activity_logs(user_id, action, entity, entity_id, details)
  select p_user, 'inventory_' || p_type, 'inventory', p_inventory, jsonb_build_object('name', inv.name, 'change', delta)
  where exists (select 1 from public.profiles where id = p_user);
  return jsonb_build_object('quantity', newq);
end $$;

revoke execute on function public.create_order(uuid,jsonb,text,date,text,uuid,numeric,uuid) from public, anon, authenticated;
revoke execute on function public.record_payment(uuid,numeric,numeric,text,text,uuid) from public, anon, authenticated;
revoke execute on function public.inventory_move(uuid,text,numeric,numeric,text,uuid) from public, anon, authenticated;
revoke execute on function public.next_order_no() from public, anon, authenticated;
grant execute on function public.create_order(uuid,jsonb,text,date,text,uuid,numeric,uuid) to service_role;
grant execute on function public.record_payment(uuid,numeric,numeric,text,text,uuid) to service_role;
grant execute on function public.inventory_move(uuid,text,numeric,numeric,text,uuid) to service_role;
grant execute on function public.next_order_no() to service_role;
revoke execute on function public.calc_line(uuid,text,text,text,text,int,int,boolean) from public, anon;
grant execute on function public.calc_line(uuid,text,text,text,text,int,int,boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Inventory auto-deduction (only through admin-configured material_usage_rules; once per order)
-- ---------------------------------------------------------------------
create or replace function public.deduct_for_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record; q numeric;
begin
  perform 1 from public.orders where id = p_order and not inventory_deducted for update;
  if not found then return; end if;
  for r in
    select mur.inventory_id, sum(mur.qty_per_unit * oi.quantity) as need
    from public.order_items oi
    join public.material_usage_rules mur on mur.service_id = oi.service_id and mur.active
    where oi.order_id = p_order group by mur.inventory_id
  loop
    select quantity into q from public.inventory where id = r.inventory_id for update;
    insert into public.inventory_transactions(inventory_id, type, quantity, balance_after, reference_order_id, notes)
    values (r.inventory_id, 'order_deduction', -least(r.need, q), greatest(q - r.need, 0), p_order, 'Automatic deduction on order completion')
    on conflict do nothing;
    if found then
      update public.inventory set quantity = greatest(quantity - r.need, 0) where id = r.inventory_id;
    end if;
  end loop;
  update public.orders set inventory_deducted = true where id = p_order;
end $$;
revoke execute on function public.deduct_for_order(uuid) from public, anon, authenticated;

create or replace function public.orders_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare cust_user uuid;
begin
  if new.status is distinct from old.status then
    insert into public.activity_logs(user_id, action, entity, entity_id, details)
    select auth.uid(), 'order_status', 'order', new.id, jsonb_build_object('order_no', new.order_no, 'from', old.status, 'to', new.status)
    where auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid());
    if new.status = 'Ready for Pickup' then
      select user_id into cust_user from public.customers where id = new.customer_id;
      insert into public.notifications(type, title, message, order_id, target_roles, target_user)
      values ('ready', 'Order ready for pickup', 'Order ' || new.order_no || ' is ready for pickup.', new.id, '{admin,cashier}', cust_user);
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

-- Staff progress updates (staff cannot update orders directly)
create or replace function public.staff_update_job(p_order uuid, p_status text, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare r text := public.app_role(); o public.orders%rowtype;
begin
  if r is null or r not in ('staff','admin','cashier') then raise exception 'Not allowed'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if r = 'staff' and o.assigned_to is distinct from auth.uid() then raise exception 'This job is not assigned to you'; end if;
  if p_status is not null and p_status <> o.status then
    if r = 'staff' and p_status not in ('Designing','Printing','Finishing','Ready for Pickup','Completed') then
      raise exception 'Status not allowed for staff'; end if;
    if o.status = 'Cancelled' then raise exception 'Order is cancelled'; end if;
    update public.orders set status = p_status where id = p_order;
  end if;
  if p_notes is not null then update public.orders set production_notes = left(p_notes, 2000) where id = p_order; end if;
end $$;
revoke execute on function public.staff_update_job(uuid,text,text) from public, anon;
grant execute on function public.staff_update_job(uuid,text,text) to authenticated;

-- ---------------------------------------------------------------------
-- Alerts + dashboard (admin only)
-- ---------------------------------------------------------------------
create or replace function public.refresh_alerts() returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.app_role(),'') <> 'admin' then return; end if;
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

create or replace function public.dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Manila')::date; mstart date; r jsonb;
begin
  if coalesce(public.app_role(),'') <> 'admin' then raise exception 'Not allowed'; end if;
  mstart := date_trunc('month', today::timestamp)::date;
  select jsonb_build_object(
    'sales_today', coalesce((select sum(total) from public.orders where status <> 'Cancelled' and (order_date at time zone 'Asia/Manila')::date = today),0),
    'sales_month', coalesce((select sum(total) from public.orders where status <> 'Cancelled' and (order_date at time zone 'Asia/Manila')::date >= mstart),0),
    'collected_today', coalesce((select sum(amount) from public.payments where (paid_at at time zone 'Asia/Manila')::date = today),0),
    'collected_month', coalesce((select sum(amount) from public.payments where (paid_at at time zone 'Asia/Manila')::date >= mstart),0),
    'total_orders', (select count(*) from public.orders),
    'pending', (select count(*) from public.orders where status in ('Pending','Approved')),
    'in_production', (select count(*) from public.orders where status in ('Designing','Printing','Finishing')),
    'completed', (select count(*) from public.orders where status = 'Completed'),
    'expenses_month', coalesce((select sum(amount) from public.expenses where expense_date >= mstart),0),
    'expenses_total', coalesce((select sum(amount) from public.expenses),0),
    'unpaid', coalesce((select sum(balance) from public.orders where status <> 'Cancelled'),0),
    'popular', coalesce((select jsonb_agg(x) from (
        select oi.service_name as name, sum(oi.quantity) as qty from public.order_items oi
        join public.orders o on o.id = oi.order_id where o.status <> 'Cancelled'
        group by oi.service_name order by qty desc limit 6) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;

create or replace function public.sales_series(p_gran text, p_count int)
returns table(period date, sales numeric, collected numeric)
language plpgsql stable security definer set search_path = public as $$
declare step interval; today date := (now() at time zone 'Asia/Manila')::date; startd timestamp;
begin
  if coalesce(public.app_role(),'') <> 'admin' then raise exception 'Not allowed'; end if;
  if p_gran not in ('day','week','month') then raise exception 'Invalid granularity'; end if;
  step := ('1 ' || p_gran)::interval;
  startd := date_trunc(p_gran, today::timestamp) - (p_count - 1) * step;
  return query
  select g::date,
    coalesce((select sum(o.total) from public.orders o where o.status <> 'Cancelled'
       and date_trunc(p_gran, o.order_date at time zone 'Asia/Manila')::date = g::date), 0),
    coalesce((select sum(p.amount) from public.payments p
       where date_trunc(p_gran, p.paid_at at time zone 'Asia/Manila')::date = g::date), 0)
  from generate_series(startd, date_trunc(p_gran, today::timestamp), step) g;
end $$;
revoke execute on function public.refresh_alerts() from public, anon;
revoke execute on function public.dashboard_stats() from public, anon;
revoke execute on function public.sales_series(text,int) from public, anon;
grant execute on function public.refresh_alerts() to authenticated;
grant execute on function public.dashboard_stats() to authenticated;
grant execute on function public.sales_series(text,int) to authenticated;
