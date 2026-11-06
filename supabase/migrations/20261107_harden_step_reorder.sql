-- Hardens step reordering. Apply after 20261106_prompt_chain_tool_writes.sql.
-- Both functions are SECURITY INVOKER, so the superadmin RLS policies on
-- prompt_chains and prompt_chain_steps still decide who can reorder.

-- Renumbers a chain's steps to 1..N in the given order, in one transaction.
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
  v_min integer;
  v_max integer;
  v_matched integer;
  v_updated integer;
begin
  -- Serializes reorders of this chain. It also blocks concurrent step inserts,
  -- whose foreign-key check needs a lock that conflicts with this one.
  perform 1 from public.prompt_chains where id = p_chain_id for update;

  select count(*), coalesce(min(step_order), 0), coalesce(max(step_order), 0)
    into v_count, v_min, v_max
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

  -- Phase 1: move every row above both the current values and 1..N, so a
  -- non-deferrable unique (prompt_chain_id, step_order) can't collide on the
  -- way through. Values stay positive for any step_order > 0 check.
  update public.prompt_chain_steps
    set step_order = step_order + greatest(v_max, 0) - least(v_min, 0) + v_count + 1
    where prompt_chain_id = p_chain_id;

  get diagnostics v_updated = row_count;
  if v_updated <> v_count then
    raise exception 'not allowed to reorder these steps' using errcode = '42501';
  end if;

  -- Phase 2: every target in 1..N is now free.
  update public.prompt_chain_steps s
    set step_order = o.position::integer, updated_at = now()
    from unnest(p_step_ids) with ordinality as o(step_id, position)
    where s.id = o.step_id and s.prompt_chain_id = p_chain_id;
end;
$$;

-- Moves one step up or down. Reading the order, swapping and saving all happen
-- under one lock, so overlapping moves apply in turn instead of overwriting
-- each other. Returns false if the step is already at that end of the chain.
create or replace function public.move_prompt_chain_step(
  p_step_id uuid,
  p_direction text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_chain_id uuid;
  v_ids uuid[];
  v_from integer;
  v_to integer;
begin
  if p_direction is null or p_direction not in ('up', 'down') then
    raise exception 'direction must be up or down' using errcode = '22023';
  end if;

  select prompt_chain_id into v_chain_id
    from public.prompt_chain_steps
    where id = p_step_id;
  if v_chain_id is null then
    raise exception 'step not found' using errcode = 'P0002';
  end if;

  perform 1 from public.prompt_chains where id = v_chain_id for update;

  -- Read after taking the lock, so this is the order the move applies to.
  select array_agg(id order by step_order) into v_ids
    from public.prompt_chain_steps
    where prompt_chain_id = v_chain_id;

  v_from := array_position(v_ids, p_step_id);
  if v_from is null then
    raise exception 'step not found' using errcode = 'P0002';
  end if;

  v_to := case when p_direction = 'up' then v_from - 1 else v_from + 1 end;
  if v_to < 1 or v_to > cardinality(v_ids) then
    return false;
  end if;

  v_ids[v_from] := v_ids[v_to];
  v_ids[v_to] := p_step_id;

  perform public.reorder_prompt_chain_steps(v_chain_id, v_ids);
  return true;
end;
$$;

revoke all on function public.move_prompt_chain_step(uuid, text) from public, anon;
grant execute on function public.move_prompt_chain_step(uuid, text) to authenticated;
