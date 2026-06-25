import { createClient } from '@supabase/supabase-js';
import type { Tables } from '@/lib/database.types';
import type { WorkshopRole } from '@/lib/authz';

// Les types métier dérivent du schéma Supabase généré (`database.types.ts`),
// ils ne peuvent donc plus diverger des colonnes réelles (audit 3.5).
// Seul `role` est resserré sur l'union `WorkshopRole` (le check Postgres
// `owner | manager | member` n'est pas reflété comme enum dans le schéma généré).

export type UserProfile = Tables<'user_profiles'>;

export type Workshop = Tables<'workshops'>;

export type WorkshopMember = Omit<Tables<'workshop_members'>, 'role'> & {
  role: WorkshopRole;
  user_profiles?: UserProfile;
};

export type WorkshopWithRole = Workshop & {
  role: WorkshopRole;
  member_count?: number;
};

export type WorkshopDetail = Workshop & {
  currentUserRole: WorkshopRole;
  workshop_members: WorkshopMember[];
};

// NOTE (suivi) : on pourrait typer le client avec `createClient<Database>` pour
// une sécurité de bout en bout sur toutes les requêtes `.from()`. C'est laissé
// volontairement non typé ici : l'activer révèle ~15 incohérences réelles de
// nullabilité/Json à corriger sur de nombreux fichiers — migration à part entière,
// hors périmètre de l'audit 3.5. Tracé au backlog CLAUDE.md §18.
export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars manquantes');
  return createClient(url, key);
}
