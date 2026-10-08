-- 0100: extensions + enums
create extension if not exists pgcrypto with schema extensions;

create type public.user_role      as enum ('customer', 'admin');
create type public.product_status as enum ('draft', 'active', 'archived');
create type public.order_status   as enum ('pending', 'confirmed', 'shipping', 'completed', 'cancelled');
create type public.payment_status as enum ('unpaid', 'paid', 'failed', 'refunded');
