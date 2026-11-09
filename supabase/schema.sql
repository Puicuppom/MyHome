-- MyHome: ผ่อนบ้าน + สมุดค่าเช่า
-- รันครั้งเดียวใน Supabase > SQL Editor (โปรเจกต์เดียวกับ PuiJod)
-- ทุกตารางเปิด RLS: แต่ละ user เห็น/แก้ได้เฉพาะแถวของตัวเอง

-- 1) ข้อมูลเครื่องคำนวณผ่อนบ้าน (1 แถวต่อ user)
create table if not exists public.loan_profiles (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2) รายการรับเงินค่าเช่า
create table if not exists public.rent_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  received_date date not null,
  amount        numeric(14,2) not null check (amount > 0),
  for_month     text,                -- 'YYYY-MM' ค่าเช่าของเดือน
  property      text not null,
  tenant        text,
  method        text,
  wht           numeric(14,2) not null default 0 check (wht >= 0),  -- ภาษีหัก ณ ที่จ่าย
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists rent_entries_user_date on public.rent_entries (user_id, received_date);

-- 3) ตั้งค่าคำนวณภาษีรายปี (ปี ค.ศ.)
create table if not exists public.rent_settings (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tax_year   int  not null,
  method     text not null default 'flat' check (method in ('flat','actual')),
  actual_h1  numeric(14,2) not null default 0,
  actual_y   numeric(14,2) not null default 0,
  ded94      numeric(14,2) not null default 30000,
  ded90      numeric(14,2) not null default 60000,
  paid94     numeric(14,2),          -- null = ใช้ค่าประมาณ
  updated_at timestamptz not null default now(),
  primary key (user_id, tax_year)
);

-- RLS
alter table public.loan_profiles enable row level security;
alter table public.rent_entries  enable row level security;
alter table public.rent_settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['loan_profiles','rent_entries','rent_settings'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

grant select, insert, update, delete on public.loan_profiles, public.rent_entries, public.rent_settings to authenticated;
revoke all on public.loan_profiles, public.rent_entries, public.rent_settings from anon;
