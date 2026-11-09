-- ประมาณการเงินได้ทั้งปี (รันครั้งเดียว)
create table if not exists public.income_estimates (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tax_year   int  not null,
  salary     numeric(14,2) not null default 0,  -- เงินเดือน+โบนัสทั้งปี (คาดการณ์)
  wht        numeric(14,2) not null default 0,  -- ภาษีที่ถูกหักไว้ทั้งปี
  sso        numeric(14,2) not null default 0,  -- ประกันสังคมทั้งปี
  updated_at timestamptz not null default now(),
  primary key (user_id, tax_year)
);
alter table public.income_estimates enable row level security;
drop policy if exists "own rows" on public.income_estimates;
create policy "own rows" on public.income_estimates for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.income_estimates to authenticated;
revoke all on public.income_estimates from anon;
