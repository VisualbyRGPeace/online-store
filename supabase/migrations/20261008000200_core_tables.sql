-- 0200: core tables. Money = integer VND (no decimals).

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text check (char_length(full_name) <= 100),
  phone      text check (phone ~ '^\+?[0-9]{9,15}$'),
  role       public.user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.categories(id) on delete set null,
  name       text not null check (char_length(name) between 1 and 100),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  category_id      uuid references public.categories(id) on delete set null,
  name             text not null check (char_length(name) between 1 and 200),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description      text check (char_length(description) <= 10000),
  price            integer not null check (price >= 0),
  compare_at_price integer check (compare_at_price is null or compare_at_price >= price),
  stock            integer not null default 0 check (stock >= 0),
  status           public.product_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);
create index products_status_created_idx on public.products (status, created_at desc);

create table public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  storage_path text not null unique check (storage_path like 'products/%'),
  sort_order   integer not null default 0,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);
create unique index product_images_one_primary on public.product_images (product_id) where is_primary;

create table public.addresses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  recipient_name text not null check (char_length(recipient_name) between 1 and 100),
  phone          text not null check (phone ~ '^\+?[0-9]{9,15}$'),
  province       text not null check (char_length(province) between 1 and 100),
  district       text not null check (char_length(district) between 1 and 100),
  ward           text not null check (char_length(ward) between 1 and 100),
  street         text not null check (char_length(street) between 1 and 200),
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);
create unique index addresses_one_default on public.addresses (user_id) where is_default;

-- Single-row store settings
create table public.shop_settings (
  id                      boolean primary key default true check (id),
  shipping_fee            integer not null default 0 check (shipping_fee >= 0),
  free_shipping_threshold integer check (free_shipping_threshold is null or free_shipping_threshold >= 0),
  updated_at              timestamptz not null default now()
);
insert into public.shop_settings (id) values (true);

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      bigint generated always as identity unique,
  user_id           uuid references auth.users(id) on delete set null,  -- null = guest
  status            public.order_status not null default 'pending',
  payment_status    public.payment_status not null default 'unpaid',
  payment_method    text not null default 'cod' check (payment_method in ('cod', 'vnpay', 'momo', 'stripe')),
  customer_name     text not null check (char_length(customer_name) between 1 and 100),
  customer_phone    text not null check (customer_phone ~ '^\+?[0-9]{9,15}$'),
  customer_email    text check (char_length(customer_email) <= 254),
  shipping_province text not null,
  shipping_district text not null,
  shipping_ward     text not null,
  shipping_street   text not null,
  note              text check (char_length(note) <= 500),
  subtotal          integer not null check (subtotal >= 0),
  shipping_fee      integer not null check (shipping_fee >= 0),
  total             integer not null,
  lookup_token_hash bytea not null,  -- sha256 of the guest lookup token
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint orders_total_matches check (total = subtotal + shipping_fee)
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);

create table public.order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders(id) on delete cascade,
  product_id            uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  price_snapshot        integer not null check (price_snapshot >= 0),
  quantity              integer not null check (quantity > 0),
  subtotal              integer not null,
  constraint order_items_subtotal_matches check (subtotal = price_snapshot * quantity)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  provider     text not null check (provider in ('cod', 'vnpay', 'momo', 'stripe')),
  provider_ref text,
  amount       integer not null check (amount >= 0),
  status       text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  raw_payload  jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);
create unique index payments_provider_ref_idx on public.payments (provider, provider_ref) where provider_ref is not null;
