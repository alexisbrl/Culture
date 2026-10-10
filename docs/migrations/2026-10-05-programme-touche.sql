-- La dernière modification du programme d'un atelier (chapitres et notions).
--
-- Sert l'annulation de la dernière génération (docs/architecture.md §7.8) :
-- elle n'est offerte que si rien n'a bougé dans Chapitre & Notion depuis la
-- fin de la génération — par qui que ce soit, et par quelque chemin que ce
-- soit, suppression comprise. Une date de modification par ligne ne voit pas
-- une suppression ; un déclencheur sur les deux tables voit tout.
--
-- Purement additive : le code en ligne ignore la colonne, et le déclencheur
-- ne fait qu'écrire cette colonne.

alter table public.workshops add column if not exists program_changed_at timestamptz;

create or replace function public.touch_workshop_program()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  wid uuid;
begin
  if tg_op = 'DELETE' then wid := old.workshop_id; else wid := new.workshop_id; end if;
  -- `now()` est l'heure de début de transaction : une écriture de masse ne met
  -- à jour la ligne de l'atelier qu'une fois.
  update public.workshops
     set program_changed_at = now()
   where id = wid
     and program_changed_at is distinct from now();
  return null;
end;
$$;

drop trigger if exists workshop_chapters_touch_program on public.workshop_chapters;
create trigger workshop_chapters_touch_program
  after insert or update or delete on public.workshop_chapters
  for each row execute function public.touch_workshop_program();

-- table encore nommée bricks en base — renommage différé, voir docs/backlog.md
drop trigger if exists workshop_bricks_touch_program on public.workshop_bricks;
create trigger workshop_bricks_touch_program
  after insert or update or delete on public.workshop_bricks
  for each row execute function public.touch_workshop_program();
