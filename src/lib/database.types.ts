// ⚠️ Fichier généré — NE PAS éditer à la main.
//
// Source de vérité du schéma Supabase (projet `hhkmrejjksjpfetwefju`).
// Régénérer après toute migration via le MCP Supabase (`generate_typescript_types`)
// ou la CLI : `supabase gen types typescript --project-id hhkmrejjksjpfetwefju > src/lib/database.types.ts`.
//
// Les types métier (UserProfile, Workshop, WorkshopMember…) dérivent de ce fichier
// dans `src/lib/supabase.ts` — ils ne peuvent donc plus diverger du schéma réel (audit 3.5).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      brick_mastery: {
        Row: {
          bloom_level: number
          brick_id: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bloom_level: number
          brick_id: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bloom_level?: number
          brick_id?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brick_mastery_brick_id_fkey"
            columns: ["brick_id"]
            isOneToOne: false
            referencedRelation: "workshop_bricks"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_codes: {
        Row: {
          attempts: number
          code: string
          created_at: string | null
          expires_at: string
          id: string
          last_attempt_at: string | null
          user_id: string
          workshop_id: string
        }
        Insert: {
          attempts?: number
          code: string
          created_at?: string | null
          expires_at: string
          id?: string
          last_attempt_at?: string | null
          user_id: string
          workshop_id: string
        }
        Update: {
          attempts?: number
          code?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          last_attempt_at?: string | null
          user_id?: string
          workshop_id?: string
        }
        Relationships: []
      }
      exam_draft: {
        Row: {
          config: Json
          draft_ids: Json
          editing_id: string | null
          updated_at: string
          user_id: string
          workshop_id: string
        }
        Insert: {
          config?: Json
          draft_ids?: Json
          editing_id?: string | null
          updated_at?: string
          user_id?: string
          workshop_id: string
        }
        Update: {
          config?: Json
          draft_ids?: Json
          editing_id?: string | null
          updated_at?: string
          user_id?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_draft_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_generated: {
        Row: {
          avg: string
          config: Json
          created_at: string
          date: string
          dur: string
          id: string
          q: number
          question_ids: Json
          status: string
          taken: number
          title: string
          workshop_id: string
        }
        Insert: {
          avg?: string
          config?: Json
          created_at?: string
          date?: string
          dur?: string
          id: string
          q?: number
          question_ids?: Json
          status?: string
          taken?: number
          title: string
          workshop_id: string
        }
        Update: {
          avg?: string
          config?: Json
          created_at?: string
          date?: string
          dur?: string
          id?: string
          q?: number
          question_ids?: Json
          status?: string
          taken?: number
          title?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_generated_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_pools: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          workshop_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id: string
          name: string
          workshop_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_pools_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          answer: string
          answer_optional: boolean
          choices: Json
          content: string
          context: string
          correct_choices: Json
          created_at: string
          difficulty: Json
          duration: Json
          exam_ids: Json
          id: string
          parts: Json
          pools: Json
          question_type: string
          response_type: string
          shuffle_choices: boolean
          text_lines: number
          title: string
          updated_at: string
          workshop_id: string
        }
        Insert: {
          answer?: string
          answer_optional?: boolean
          choices?: Json
          content?: string
          context?: string
          correct_choices?: Json
          created_at?: string
          difficulty?: Json
          duration?: Json
          exam_ids?: Json
          id: string
          parts?: Json
          pools?: Json
          question_type?: string
          response_type?: string
          shuffle_choices?: boolean
          text_lines?: number
          title?: string
          updated_at?: string
          workshop_id: string
        }
        Update: {
          answer?: string
          answer_optional?: boolean
          choices?: Json
          content?: string
          context?: string
          correct_choices?: Json
          created_at?: string
          difficulty?: Json
          duration?: Json
          exam_ids?: Json
          id?: string
          parts?: Json
          pools?: Json
          question_type?: string
          response_type?: string
          shuffle_choices?: boolean
          text_lines?: number
          title?: string
          updated_at?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      member_groups: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          workshop_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id: string
          name: string
          workshop_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_groups_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          display_name: string
          unique_tag: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          display_name: string
          unique_tag: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          display_name?: string
          unique_tag?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      workshop_bricks: {
        Row: {
          chapter_id: string | null
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          title: string
          updated_at: string
          workshop_id: string
        }
        Insert: {
          chapter_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          title: string
          updated_at?: string
          workshop_id: string
        }
        Update: {
          chapter_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
          updated_at?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_bricks_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_files: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          mime_type: string
          name: string
          size: number
          storage_path: string
          workshop_id: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          mime_type: string
          name: string
          size: number
          storage_path: string
          workshop_id: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mime_type?: string
          name?: string
          size?: number
          storage_path?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_files_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_invitations: {
        Row: {
          created_at: string
          id: string
          invited_by: string
          user_id: string
          workshop_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by: string
          user_id: string
          workshop_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string
          user_id?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_invitations_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_join_requests: {
        Row: {
          created_at: string
          id: string
          user_id: string
          workshop_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          workshop_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_join_requests_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_members: {
        Row: {
          groups: Json
          id: string
          joined_at: string | null
          last_visited_at: string
          role: string
          user_id: string
          workshop_id: string
        }
        Insert: {
          groups?: Json
          id?: string
          joined_at?: string | null
          last_visited_at?: string
          role: string
          user_id: string
          workshop_id: string
        }
        Update: {
          groups?: Json
          id?: string
          joined_at?: string | null
          last_visited_at?: string
          role?: string
          user_id?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_members_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshops: {
        Row: {
          cover_gradient: string | null
          cover_image_active: boolean
          cover_image_url: string | null
          created_at: string | null
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          emoji: string | null
          id: string
          is_premium: boolean
          name: string
          premium_activated_at: string | null
          show_programme: boolean
          unique_tag: string | null
          updated_at: string | null
        }
        Insert: {
          cover_gradient?: string | null
          cover_image_active?: boolean
          cover_image_url?: string | null
          created_at?: string | null
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          emoji?: string | null
          id?: string
          is_premium?: boolean
          name: string
          premium_activated_at?: string | null
          show_programme?: boolean
          unique_tag?: string | null
          updated_at?: string | null
        }
        Update: {
          cover_gradient?: string | null
          cover_image_active?: boolean
          cover_image_url?: string | null
          created_at?: string | null
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          emoji?: string | null
          id?: string
          is_premium?: boolean
          name?: string
          premium_activated_at?: string | null
          show_programme?: boolean
          unique_tag?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
