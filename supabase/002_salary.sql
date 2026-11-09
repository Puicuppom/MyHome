-- เพิ่มเงินเดือนสำหรับประมาณการ ภ.ง.ด.90 (รันครั้งเดียว)
alter table public.rent_settings
  add column if not exists salary     numeric(14,2) not null default 0,
  add column if not exists salary_wht numeric(14,2) not null default 0;
