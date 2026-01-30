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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_tenant_access: {
        Row: {
          admin_user_id: string
          created_at: string
          id: string
          tenant_id: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          id?: string
          tenant_id: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_tenant_access_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      boost_awards: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          lock_date: string | null
          name: string
          points_value: number
          prediction_type: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          lock_date?: string | null
          name: string
          points_value?: number
          prediction_type: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          lock_date?: string | null
          name?: string
          points_value?: number
          prediction_type?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      boost_predictions: {
        Row: {
          award_id: string
          created_at: string
          id: string
          predicted_player_name: string | null
          predicted_team_code: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          award_id: string
          created_at?: string
          id?: string
          predicted_player_name?: string | null
          predicted_team_code?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          award_id?: string
          created_at?: string
          id?: string
          predicted_player_name?: string | null
          predicted_team_code?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boost_predictions_award_id_fkey"
            columns: ["award_id"]
            isOneToOne: false
            referencedRelation: "boost_awards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boost_predictions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      boost_results: {
        Row: {
          award_id: string
          created_at: string
          id: string
          result_player_name: string | null
          result_team_code: string | null
          set_by: string | null
          updated_at: string
        }
        Insert: {
          award_id: string
          created_at?: string
          id?: string
          result_player_name?: string | null
          result_team_code?: string | null
          set_by?: string | null
          updated_at?: string
        }
        Update: {
          award_id?: string
          created_at?: string
          id?: string
          result_player_name?: string | null
          result_team_code?: string | null
          set_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boost_results_award_id_fkey"
            columns: ["award_id"]
            isOneToOne: true
            referencedRelation: "boost_awards"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: {
          id: string
          joined_at: string
          league_id: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          league_id: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          league_id?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          avatar_emoji: string | null
          created_at: string
          creator_id: string
          id: string
          join_code: string
          name: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_emoji?: string | null
          created_at?: string
          creator_id: string
          id?: string
          join_code: string
          name: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_emoji?: string | null
          created_at?: string
          creator_id?: string
          id?: string
          join_code?: string
          name?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      live_matches: {
        Row: {
          api_match_id: number | null
          away_score: number | null
          away_team_code: string
          away_team_name: string
          city: string | null
          created_at: string
          group_name: string | null
          home_score: number | null
          home_team_code: string
          home_team_name: string
          id: string
          last_updated: string
          match_date: string
          match_id: string
          stage: string
          status: string
          venue: string | null
        }
        Insert: {
          api_match_id?: number | null
          away_score?: number | null
          away_team_code: string
          away_team_name: string
          city?: string | null
          created_at?: string
          group_name?: string | null
          home_score?: number | null
          home_team_code: string
          home_team_name: string
          id?: string
          last_updated?: string
          match_date: string
          match_id: string
          stage?: string
          status?: string
          venue?: string | null
        }
        Update: {
          api_match_id?: number | null
          away_score?: number | null
          away_team_code?: string
          away_team_name?: string
          city?: string | null
          created_at?: string
          group_name?: string | null
          home_score?: number | null
          home_team_code?: string
          home_team_name?: string
          id?: string
          last_updated?: string
          match_date?: string
          match_id?: string
          stage?: string
          status?: string
          venue?: string | null
        }
        Relationships: []
      }
      oidc_identities: {
        Row: {
          created_at: string
          id: string
          oidc_issuer: string | null
          oidc_subject: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          oidc_issuer?: string | null
          oidc_subject: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          oidc_issuer?: string | null
          oidc_subject?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oidc_identities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          phone_number: string
          used: boolean
          user_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          phone_number: string
          used?: boolean
          user_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone_number?: string
          used?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      predictions: {
        Row: {
          away_score: number
          created_at: string
          home_score: number
          id: string
          match_id: string
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          away_score?: number
          created_at?: string
          home_score?: number
          id?: string
          match_id: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          away_score?: number
          created_at?: string
          home_score?: number
          id?: string
          match_id?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_emoji: string | null
          created_at: string
          display_name: string
          id: string
          phone_number: string | null
          privacy_consent_at: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_emoji?: string | null
          created_at?: string
          display_name: string
          id?: string
          phone_number?: string | null
          privacy_consent_at?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_emoji?: string | null
          created_at?: string
          display_name?: string
          id?: string
          phone_number?: string | null
          privacy_consent_at?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_custom_boost_predictions: {
        Row: {
          created_at: string
          custom_boost_id: string
          id: string
          predicted_player_name: string | null
          predicted_team_code: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_boost_id: string
          id?: string
          predicted_player_name?: string | null
          predicted_team_code?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_boost_id?: string
          id?: string
          predicted_player_name?: string | null
          predicted_team_code?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_custom_boost_predictions_custom_boost_id_fkey"
            columns: ["custom_boost_id"]
            isOneToOne: false
            referencedRelation: "tenant_custom_boosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_custom_boost_predictions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_custom_boost_results: {
        Row: {
          created_at: string
          custom_boost_id: string
          id: string
          result_player_name: string | null
          result_team_code: string | null
          set_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_boost_id: string
          id?: string
          result_player_name?: string | null
          result_team_code?: string | null
          set_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_boost_id?: string
          id?: string
          result_player_name?: string | null
          result_team_code?: string | null
          set_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_custom_boost_results_custom_boost_id_fkey"
            columns: ["custom_boost_id"]
            isOneToOne: true
            referencedRelation: "tenant_custom_boosts"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_custom_boosts: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          lock_date: string | null
          original_language: string | null
          points_value: number
          prediction_type: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          lock_date?: string | null
          original_language?: string | null
          points_value?: number
          prediction_type: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          lock_date?: string | null
          original_language?: string | null
          points_value?: number
          prediction_type?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_custom_boosts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_oidc_config: {
        Row: {
          auth_url: string
          client_id: string
          created_at: string
          id: string
          issuer: string | null
          redirect_uri: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auth_url: string
          client_id: string
          created_at?: string
          id?: string
          issuer?: string | null
          redirect_uri: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auth_url?: string
          client_id?: string
          created_at?: string
          id?: string
          issuer?: string | null
          redirect_uri?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_oidc_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          auth_method: Database["public"]["Enums"]["auth_method"]
          created_at: string
          id: string
          name: string
          uid: string
          updated_at: string
        }
        Insert: {
          auth_method?: Database["public"]["Enums"]["auth_method"]
          created_at?: string
          id?: string
          name: string
          uid?: string
          updated_at?: string
        }
        Update: {
          auth_method?: Database["public"]["Enums"]["auth_method"]
          created_at?: string
          id?: string
          name?: string
          uid?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      profiles_public: {
        Row: {
          avatar_emoji: string | null
          display_name: string | null
          id: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          avatar_emoji?: string | null
          display_name?: string | null
          id?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_emoji?: string | null
          display_name?: string | null
          id?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_can_access_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      cleanup_expired_otps: { Args: never; Returns: undefined }
      get_admin_accessible_tenants: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_league_by_code: {
        Args: { code: string }
        Returns: {
          avatar_emoji: string
          id: string
          name: string
        }[]
      }
      get_tenant_by_uid: {
        Args: { _uid: string }
        Returns: {
          id: string
          name: string
          uid: string
        }[]
      }
      get_tenant_profiles: {
        Args: { _tenant_id: string }
        Returns: {
          avatar_emoji: string
          display_name: string
          id: string
          user_id: string
        }[]
      }
      get_user_league_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_any_admin: { Args: { _user_id: string }; Returns: boolean }
      is_league_creator: {
        Args: { _league_id: string; _user_id: string }
        Returns: boolean
      }
      is_league_member: {
        Args: { _league_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "site_admin" | "tenant_admin"
      auth_method: "otp" | "oidc" | "both"
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
    Enums: {
      app_role: ["admin", "moderator", "site_admin", "tenant_admin"],
      auth_method: ["otp", "oidc", "both"],
    },
  },
} as const
