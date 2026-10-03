-- Monthly revenue per active customer
with active as (select id, name, region from customers where deleted_at is null and status in ('active','trial')),
orders_month as (select customer_id, date_trunc('month', created_at) as month, sum(total) as revenue, count(*) n from orders where created_at >= now() - interval '1 year' group by 1, 2)
select a.name, a.region, o.month, o.revenue, -- gross, before refunds
case when o.revenue > 10000 then 'gold' when o.revenue > 1000 then 'silver' else 'bronze' end as tier,
rank() over (partition by o.month order by o.revenue desc) as rank_in_month
from active a join orders_month o on o.customer_id = a.id
left join refunds r on r.order_id = o.customer_id and r.status = 'done'
where a.region <> 'test' and (o.n > 1 or o.revenue > 500)
order by o.month desc, rank_in_month limit 100;

create table if not exists refunds (id bigserial primary key, order_id bigint not null references orders (id) on delete cascade, amount numeric(12,2) not null check (amount > 0), status text default 'pending', created_at timestamp with time zone default now());

insert into refunds (order_id, amount) values (42, 19.90), (43, 5.00) on conflict do nothing returning id;

create or replace function refund_total(p_order bigint) returns numeric language plpgsql stable as $$
declare total numeric := 0;
begin
  select coalesce(sum(amount), 0) into total from refunds where order_id = p_order and status = 'done';
  if total < 0 then raise exception 'negative refund for %', p_order; end if;
  return total;
end;
$$;
