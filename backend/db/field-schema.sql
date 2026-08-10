-- ============================================================
-- Recruweb Sales Portal — Field order placement RPC
-- Applied by: backend/db/migrate-field.js   (node db/migrate-field.js)
-- Safe to re-run: CREATE OR REPLACE + REVOKE are idempotent.
--
-- Depends on: schema.sql (products/orders) and portal-schema.sql
--             (profiles, commissions, notifications, orders.officer_id,
--              orders.customer_phone).
--
-- Why an RPC instead of controller-side queries:
--   Placing a field order touches four tables (products, orders,
--   commissions, notifications). Doing that over PostgREST would be
--   four separate statements with no transaction — a crash in the
--   middle would oversell stock or drop a commission. This function
--   runs everything in ONE transaction and locks each product row
--   (FOR UPDATE) so two officers can never oversell the same unit.
-- ============================================================

create or replace function public.place_field_order(
  p_officer_id     uuid,
  p_customer_name  text,
  p_customer_phone text,
  p_city           text,
  p_state          text,
  p_items          jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_officer_name text;
  v_item         record;
  v_product      record;
  v_qty          int;
  v_order_id     uuid;
  v_order_no     text;
  v_line_amount  numeric(12,2);
  v_commission   numeric(12,2);
  v_rate         constant numeric(5,4) := 0.08;
  v_total        numeric(12,2) := 0;
  v_total_comm   numeric(12,2) := 0;
  v_orders       json[] := '{}';
  v_attempt      int;
begin
  -- Defence in depth: the API validates first, but never trust the caller.
  if p_customer_name is null or length(btrim(p_customer_name)) < 2 then
    raise exception 'FIELD_ORDER_INVALID:Customer name is required.';
  end if;
  if p_city is null or length(btrim(p_city)) < 2 then
    raise exception 'FIELD_ORDER_INVALID:Customer city is required.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'FIELD_ORDER_INVALID:An order needs between 1 and 20 line items.';
  end if;

  select coalesce(pr.full_name, u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
    into v_officer_name
  from auth.users u
  left join public.profiles pr on pr.user_id = u.id
  where u.id = p_officer_id;

  if v_officer_name is null then
    raise exception 'FIELD_ORDER_INVALID:Officer account not found.';
  end if;

  for v_item in
    select (e->>'product_id')::uuid as product_id,
           (e->>'qty')::int         as qty
    from jsonb_array_elements(p_items) e
  loop
    v_qty := v_item.qty;
    if v_item.product_id is null then
      raise exception 'FIELD_ORDER_INVALID:Each line item needs a product.';
    end if;
    if v_qty is null or v_qty < 1 or v_qty > 10000 then
      raise exception 'FIELD_ORDER_INVALID:Each quantity must be between 1 and 10,000.';
    end if;

    -- Lock the product row so the stock check + decrement are atomic
    -- even under concurrent orders from other officers.
    select id, owner_id, name, price, stock, status
      into v_product
    from public.products
    where id = v_item.product_id
    for update;

    if not found or v_product.status <> 'live' then
      raise exception 'FIELD_ORDER_UNAVAILABLE:One of the products is no longer available for sale.';
    end if;
    if v_product.stock < v_qty then
      raise exception 'FIELD_ORDER_STOCK:Only % unit(s) of "%" left in stock.',
        v_product.stock, v_product.name;
    end if;

    update public.products set stock = stock - v_qty where id = v_product.id;

    -- Price always comes from the database, never from the request.
    v_line_amount := round(v_product.price * v_qty, 2);
    v_commission  := round(v_line_amount * v_rate, 2);

    -- Unique order number; retry a couple of times on the (rare) collision.
    v_attempt := 0;
    loop
      v_order_no := 'FLD-' || to_char(now(), 'YYMMDD') || '-' ||
                    upper(substr(md5(gen_random_uuid()::text), 1, 6));
      begin
        insert into public.orders
          (order_no, client_id, product_id, product_name, customer_name,
           customer_phone, city, state, channel, officer_name, officer_id,
           qty, unit_price, amount, status)
        values
          (v_order_no, v_product.owner_id, v_product.id, v_product.name,
           btrim(p_customer_name),
           nullif(btrim(coalesce(p_customer_phone, '')), ''),
           btrim(p_city),
           nullif(btrim(coalesce(p_state, '')), ''),
           'field', v_officer_name, p_officer_id,
           v_qty, v_product.price, v_line_amount, 'processing')
        returning id into v_order_id;
        exit;
      exception when unique_violation then
        v_attempt := v_attempt + 1;
        if v_attempt >= 3 then
          raise exception 'FIELD_ORDER_RETRY:Could not allocate an order number. Please try again.';
        end if;
      end;
    end loop;

    insert into public.commissions (order_id, officer_id, rate, amount, status)
    values (v_order_id, p_officer_id, v_rate, v_commission, 'pending');

    -- Tell the vendor their product just sold in the field.
    insert into public.notifications (user_id, type, title, body, link)
    values (v_product.owner_id, 'order',
            'New field order ' || v_order_no,
            v_qty || ' × ' || v_product.name || ' sold by ' || v_officer_name,
            '/client/orders');

    v_total      := v_total + v_line_amount;
    v_total_comm := v_total_comm + v_commission;
    v_orders     := v_orders || json_build_object(
      'id',           v_order_id,
      'order_no',     v_order_no,
      'product_name', v_product.name,
      'qty',          v_qty,
      'unit_price',   v_product.price,
      'amount',       v_line_amount,
      'commission',   v_commission
    );
  end loop;

  return json_build_object(
    'orders',            array_to_json(v_orders),
    'total_amount',      v_total,
    'commission_amount', v_total_comm
  );
end;
$$;

-- Service-role backend only — never callable from browser keys.
revoke execute on function public.place_field_order(uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
