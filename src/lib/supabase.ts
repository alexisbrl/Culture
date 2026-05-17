import { createClient } from '@supabase/supabase-js';

export type UserProfile = {
  user_id: string;
  unique_tag: string;
  display_name: string;
  updated_at: string;
};

export type Workshop = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type WorkshopMember = {
  id: string;
  workshop_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  user_profiles?: UserProfile;
};

export type WorkshopWithRole = Workshop & {
  role: 'owner' | 'member';
  member_count?: number;
};

export type WorkshopDetail = Workshop & {
  currentUserRole: 'owner' | 'member';
  workshop_members: WorkshopMember[];
};

export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars manquantes');
  return createClient(url, key);
}
