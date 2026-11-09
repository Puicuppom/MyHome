-- เงินได้ + ลดหย่อน (รันครั้งเดียว)
create table if not exists public.income_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  received_date date not null,
  type          text not null check (type in ('salary','bonus','40_2','other')),
  payer         text,
  amount        numeric(14,2) not null check (amount > 0),
  wht           numeric(14,2) not null default 0 check (wht >= 0),   -- ภาษีหัก ณ ที่จ่าย
  sso           numeric(14,2) not null default 0 check (sso >= 0),   -- ประกันสังคมที่ถูกหัก
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists income_entries_user_date on public.income_entries (user_id, received_date);

create table if not exists public.deduction_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tax_year   int  not null,
  category   text not null,
  amount     numeric(14,2) not null check (amount >= 0),
  label      text,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deduction_items_user_year on public.deduction_items (user_id, tax_year);

alter table public.income_entries  enable row level security;
alter table public.deduction_items enable row level security;
do $$
declare t text;
begin
  foreach t in array array['income_entries','deduction_items'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
grant select, insert, update, delete on public.income_entries, public.deduction_items to authenticated;
revoke all on public.income_entries, public.deduction_items from anon;
