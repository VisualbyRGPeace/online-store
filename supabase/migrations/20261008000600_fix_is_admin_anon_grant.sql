-- 0600: RLS policies for anonymous visitors call is_admin() (e.g. "status = 'active' OR is_admin()").
-- Postgres checks EXECUTE permission on every function used in a policy, even when the first
-- condition is true, so anon must be allowed to call it. For anon it simply returns false.
grant execute on function public.is_admin() to anon;
