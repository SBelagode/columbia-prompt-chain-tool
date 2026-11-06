-- Lets the Prompt Chain Tool (signed-in superadmin, anon key, no service role)
-- manage prompt chains and their steps. Existing SELECT policies are untouched;
-- these are additional, superadmin-only write policies.
-- Run logging relies on the policies in the consumer app's migration
-- 20261026_consumer_generation_logging.sql.

grant insert, update, delete on public.prompt_chains to authenticated;
grant insert, update, delete on public.prompt_chain_steps to authenticated;

-- prompt_chains
drop policy if exists prompt_chains_superadmin_insert on public.prompt_chains;
create policy prompt_chains_superadmin_insert on public.prompt_chains
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_superadmin
    )
  );

drop policy if exists prompt_chains_superadmin_update on public.prompt_chains;
create policy prompt_chains_superadmin_update on public.prompt_chains
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_superadmin
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_superadmin
    )
  );

-- The consumer app looks up the default chain by slug, so it can't be deleted.
drop policy if exists prompt_chains_superadmin_delete on public.prompt_chains;
create policy prompt_chains_superadmin_delete on public.prompt_chains
  for delete to authenticated
  using (
    slug <> 'default-columbia-image-caption'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_superadmin
    )
  );

-- prompt_chain_steps
drop policy if exists prompt_chain_steps_superadmin_insert on public.prompt_chain_steps;
create policy prompt_chain_steps_superadmin_insert on public.prompt_chain_steps
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_superadmin
    )
  );

drop policy if exists prompt_chain_steps_superadmin_update on public.prompt_chain_steps;
create policy prompt_chain_steps_superadmin_update on public.prompt_chain_steps
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_superadmin
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_superadmin
    )
  );

drop policy if exists prompt_chain_steps_superadmin_delete on public.prompt_chain_steps;
create policy prompt_chain_steps_superadmin_delete on public.prompt_chain_steps
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_superadmin
    )
  );

-- Renumbers a chain's steps to 1..N in the given order, in one transaction.
-- SECURITY INVOKER, so the RLS policies above still decide who can do this.
-- Rows first move above every current value, so a unique constraint on
-- (prompt_chain_id, step_order) can't collide partway through.
create or replace function public.reorder_prompt_chain_steps(
  p_chain_id uuid,
  p_step_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
  v_max integer;
  v_matched integer;
  v_updated integer;
begin
  perform 1 from public.prompt_chain_steps
    where prompt_chain_id = p_chain_id
    for update;

  select count(*), coalesce(max(step_order), 0)
    into v_count, v_max
    from public.prompt_chain_steps
    where prompt_chain_id = p_chain_id;

  select count(*)
    into v_matched
    from public.prompt_chain_steps
    where prompt_chain_id = p_chain_id and id = any(p_step_ids);

  -- Must be exactly this chain's steps, each listed once.
  if cardinality(p_step_ids) <> v_count or v_matched <> v_count then
    raise exception 'step list does not match the chain' using errcode = '22023';
  end if;

  update public.prompt_chain_steps
    set step_order = step_order + v_max + v_count + 1
    where prompt_chain_id = p_chain_id;

  get diagnostics v_updated = row_count;
  if v_updated <> v_count then
    raise exception 'not allowed to reorder these steps' using errcode = '42501';
  end if;

  update public.prompt_chain_steps s
    set step_order = o.position::integer, updated_at = now()
    from unnest(p_step_ids) with ordinality as o(step_id, position)
    where s.id = o.step_id and s.prompt_chain_id = p_chain_id;
end;
$$;

revoke all on function public.reorder_prompt_chain_steps(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_prompt_chain_steps(uuid, uuid[]) to authenticated;
