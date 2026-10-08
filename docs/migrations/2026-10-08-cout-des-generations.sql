-- Coût des générations, appels perdus, et `scope` écrit sans écrasement — 08/10/2026.
--
-- Additive uniquement (expand) : le code en ligne ignore ces colonnes et ces
-- fonctions. Appliquée immédiatement.

-- 1. Le coût de chaque appel, en dollars hors taxe, calculé à l'écriture de la
--    ligne (jetons × prix du jour). `cost_estimated` : l'appel a été coupé en
--    route, sa sortie est estimée au débit du modèle.
alter table public.ai_import_events
  add column if not exists cost_usd numeric(12, 6),
  add column if not exists cost_estimated boolean not null default false;

-- 2. L'appel en vol d'une tâche : qui répond, depuis quand, son dernier signe de
--    vie, et ce qu'il a lu. Vidé à la fin de l'appel ; s'il reste rempli sur une
--    tâche coupée, la veille en tire une ligne de coût estimée.
alter table public.ai_import_tasks
  add column if not exists call_progress jsonb;

-- 3. Fusionner des clés dans le `scope` d'une génération sans relire ni
--    réécrire le reste : deux écritures concurrentes ne s'écrasent plus.
create or replace function public.merge_ai_import_scope(p_import_id uuid, p_patch jsonb)
returns void
language sql
set search_path = public
as $$
  update ai_imports
     set scope = coalesce(scope, '{}'::jsonb) || p_patch
   where id = p_import_id;
$$;

-- 4. Le tampon de clôture (annulation de la dernière génération) : la dernière
--    modification du programme, lue et écrite dans la même instruction.
create or replace function public.stamp_ai_import_program(p_import_id uuid)
returns void
language sql
set search_path = public
as $$
  update ai_imports i
     set scope = coalesce(i.scope, '{}'::jsonb)
               || jsonb_build_object('programStamp', jsonb_build_object('at', w.program_changed_at))
    from workshops w
   where i.id = p_import_id
     and w.id = i.workshop_id;
$$;

revoke all on function public.merge_ai_import_scope(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.stamp_ai_import_program(uuid) from public, anon, authenticated;

-- 5. Le coût par génération, et le compte qui l'a lancée.
create or replace view public.ai_generation_costs
with (security_invoker = true)
as
select i.id                                                         as import_id,
       i.workshop_id,
       i.created_by,
       i.origin,
       i.outcome,
       i.created_at,
       coalesce(sum(e.cost_usd), 0)                                 as cost_usd,
       coalesce(sum(e.cost_usd) filter (where e.provider = 'claude'), 0)   as claude_usd,
       coalesce(sum(e.cost_usd) filter (where e.provider = 'deepseek'), 0) as deepseek_usd,
       coalesce(sum(e.cost_usd) filter (where e.cost_estimated), 0) as estimated_usd,
       count(e.id) filter (where e.cost_usd is null and (e.input_tokens > 0 or e.output_tokens > 0)) as unpriced_calls
  from public.ai_imports i
  left join public.ai_import_events e on e.import_id = i.id
 group by i.id;

revoke all on public.ai_generation_costs from anon, authenticated;
