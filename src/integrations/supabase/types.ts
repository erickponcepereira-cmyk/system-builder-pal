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
      achievement_catalog: {
        Row: {
          active: boolean
          code: string
          condition_type: string
          condition_value: number | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          condition_type: string
          condition_value?: number | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          condition_type?: string
          condition_value?: number | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_profile_id: string | null
          after_permissions: Json | null
          after_role: string | null
          before_permissions: Json | null
          before_role: string | null
          created_at: string
          id: string
          notes: string | null
          target_profile_id: string | null
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          after_permissions?: Json | null
          after_role?: string | null
          before_permissions?: Json | null
          before_role?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          target_profile_id?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          after_permissions?: Json | null
          after_role?: string | null
          before_permissions?: Json | null
          before_role?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          target_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_system_wallet: {
        Row: {
          available_balance: number
          id: boolean
          total_earned: number
          total_withdrawn: number
          updated_at: string
        }
        Insert: {
          available_balance?: number
          id?: boolean
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string
        }
        Update: {
          available_balance?: number
          id?: boolean
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string
        }
        Relationships: []
      }
      admin_system_wallet_entries: {
        Row: {
          amount: number
          created_at: string
          id: string
          kind: string
          notes: string | null
          slot_label: string | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          kind?: string
          notes?: string | null
          slot_label?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          kind?: string
          notes?: string | null
          slot_label?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_system_wallet_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_forms: {
        Row: {
          additional_observations: string | null
          alcohol_consumption: boolean | null
          alcohol_frequency: string | null
          blood_type: string | null
          confirmed_at: string | null
          current_medications: string | null
          dietary_goals: Json | null
          dietary_goals_other: string | null
          disliked_foods: string | null
          exercise_duration: string | null
          exercise_level: string | null
          exercise_since: string | null
          exercise_time: string | null
          exercise_type: string | null
          exercises_regularly: boolean | null
          fast_food_frequency: string | null
          filled_at: string | null
          food_allergies: string | null
          food_diary: Json | null
          food_intolerances: string | null
          gender: string | null
          has_cardiopathy: boolean | null
          has_diabetes: boolean | null
          has_hypertension: boolean | null
          height: number | null
          id: string
          marital_status: string | null
          objective: string | null
          other_chronic_conditions: string | null
          preexisting_conditions: string | null
          profession: string | null
          protocol_reason: string | null
          sleep_hours: string | null
          special_dietary_habits: string | null
          stress_level: string | null
          stress_strategies: string | null
          student_id: string
          student_signature_confirmed: boolean | null
          subscription_id: string | null
          supplements_used: string | null
          surgical_history: string | null
          tobacco_consumption: boolean | null
          tobacco_quantity: string | null
          water_intake_daily: string | null
        }
        Insert: {
          additional_observations?: string | null
          alcohol_consumption?: boolean | null
          alcohol_frequency?: string | null
          blood_type?: string | null
          confirmed_at?: string | null
          current_medications?: string | null
          dietary_goals?: Json | null
          dietary_goals_other?: string | null
          disliked_foods?: string | null
          exercise_duration?: string | null
          exercise_level?: string | null
          exercise_since?: string | null
          exercise_time?: string | null
          exercise_type?: string | null
          exercises_regularly?: boolean | null
          fast_food_frequency?: string | null
          filled_at?: string | null
          food_allergies?: string | null
          food_diary?: Json | null
          food_intolerances?: string | null
          gender?: string | null
          has_cardiopathy?: boolean | null
          has_diabetes?: boolean | null
          has_hypertension?: boolean | null
          height?: number | null
          id?: string
          marital_status?: string | null
          objective?: string | null
          other_chronic_conditions?: string | null
          preexisting_conditions?: string | null
          profession?: string | null
          protocol_reason?: string | null
          sleep_hours?: string | null
          special_dietary_habits?: string | null
          stress_level?: string | null
          stress_strategies?: string | null
          student_id: string
          student_signature_confirmed?: boolean | null
          subscription_id?: string | null
          supplements_used?: string | null
          surgical_history?: string | null
          tobacco_consumption?: boolean | null
          tobacco_quantity?: string | null
          water_intake_daily?: string | null
        }
        Update: {
          additional_observations?: string | null
          alcohol_consumption?: boolean | null
          alcohol_frequency?: string | null
          blood_type?: string | null
          confirmed_at?: string | null
          current_medications?: string | null
          dietary_goals?: Json | null
          dietary_goals_other?: string | null
          disliked_foods?: string | null
          exercise_duration?: string | null
          exercise_level?: string | null
          exercise_since?: string | null
          exercise_time?: string | null
          exercise_type?: string | null
          exercises_regularly?: boolean | null
          fast_food_frequency?: string | null
          filled_at?: string | null
          food_allergies?: string | null
          food_diary?: Json | null
          food_intolerances?: string | null
          gender?: string | null
          has_cardiopathy?: boolean | null
          has_diabetes?: boolean | null
          has_hypertension?: boolean | null
          height?: number | null
          id?: string
          marital_status?: string | null
          objective?: string | null
          other_chronic_conditions?: string | null
          preexisting_conditions?: string | null
          profession?: string | null
          protocol_reason?: string | null
          sleep_hours?: string | null
          special_dietary_habits?: string | null
          stress_level?: string | null
          stress_strategies?: string | null
          student_id?: string
          student_signature_confirmed?: boolean | null
          subscription_id?: string | null
          supplements_used?: string | null
          surgical_history?: string | null
          tobacco_consumption?: boolean | null
          tobacco_quantity?: string | null
          water_intake_daily?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_forms_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_forms_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_shares: {
        Row: {
          assessment_id: string
          client_name: string
          coach_id: string
          created_at: string
          expires_at: string | null
          id: string
          token: string
          view_count: number
        }
        Insert: {
          assessment_id: string
          client_name: string
          coach_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          token?: string
          view_count?: number
        }
        Update: {
          assessment_id?: string
          client_name?: string
          coach_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          token?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_shares_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_logs: {
        Row: {
          activity_type: string | null
          attended: boolean | null
          created_at: string | null
          id: string
          log_date: string
          notes: string | null
          student_id: string
          subscription_id: string | null
        }
        Insert: {
          activity_type?: string | null
          attended?: boolean | null
          created_at?: string | null
          id?: string
          log_date: string
          notes?: string | null
          student_id: string
          subscription_id?: string | null
        }
        Update: {
          activity_type?: string | null
          attended?: boolean | null
          created_at?: string | null
          id?: string
          log_date?: string
          notes?: string | null
          student_id?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      bioimpedance_evaluations: {
        Row: {
          bmi: number | null
          bmi_classification: string | null
          bmi_health_risk: string | null
          body_age: number | null
          created_at: string | null
          evaluated_by_coach_id: string
          evaluation_date: string
          evaluation_type: string
          fat_classification: string | null
          fat_delta: number | null
          fat_percentage: number | null
          id: string
          muscle_classification: string | null
          muscle_delta: number | null
          muscle_percentage: number | null
          notes: string | null
          resting_metabolism: number | null
          scale_number: string | null
          student_id: string
          subscription_id: string | null
          visceral_fat: number | null
          visceral_fat_classification: string | null
          weighing_class: string | null
          weight: number | null
          weight_delta: number | null
        }
        Insert: {
          bmi?: number | null
          bmi_classification?: string | null
          bmi_health_risk?: string | null
          body_age?: number | null
          created_at?: string | null
          evaluated_by_coach_id: string
          evaluation_date?: string
          evaluation_type: string
          fat_classification?: string | null
          fat_delta?: number | null
          fat_percentage?: number | null
          id?: string
          muscle_classification?: string | null
          muscle_delta?: number | null
          muscle_percentage?: number | null
          notes?: string | null
          resting_metabolism?: number | null
          scale_number?: string | null
          student_id: string
          subscription_id?: string | null
          visceral_fat?: number | null
          visceral_fat_classification?: string | null
          weighing_class?: string | null
          weight?: number | null
          weight_delta?: number | null
        }
        Update: {
          bmi?: number | null
          bmi_classification?: string | null
          bmi_health_risk?: string | null
          body_age?: number | null
          created_at?: string | null
          evaluated_by_coach_id?: string
          evaluation_date?: string
          evaluation_type?: string
          fat_classification?: string | null
          fat_delta?: number | null
          fat_percentage?: number | null
          id?: string
          muscle_classification?: string | null
          muscle_delta?: number | null
          muscle_percentage?: number | null
          notes?: string | null
          resting_metabolism?: number | null
          scale_number?: string | null
          student_id?: string
          subscription_id?: string | null
          visceral_fat?: number | null
          visceral_fat_classification?: string | null
          weighing_class?: string | null
          weight?: number | null
          weight_delta?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bioimpedance_evaluations_evaluated_by_coach_id_fkey"
            columns: ["evaluated_by_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bioimpedance_evaluations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bioimpedance_evaluations_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      career_challenge_progress: {
        Row: {
          achieved_at: string | null
          challenge_id: string
          coach_id: string
          created_at: string
          id: string
          notes: string | null
          points_in_period: number
          reward_delivered_at: string | null
          updated_at: string
        }
        Insert: {
          achieved_at?: string | null
          challenge_id: string
          coach_id: string
          created_at?: string
          id?: string
          notes?: string | null
          points_in_period?: number
          reward_delivered_at?: string | null
          updated_at?: string
        }
        Update: {
          achieved_at?: string | null
          challenge_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          points_in_period?: number
          reward_delivered_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_challenge_progress_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "career_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_challenge_progress_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      career_challenges: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string
          id: string
          is_active: boolean
          required_points: number
          reward_image_url: string | null
          reward_label: string
          reward_value: number | null
          start_date: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date: string
          id?: string
          is_active?: boolean
          required_points?: number
          reward_image_url?: string | null
          reward_label: string
          reward_value?: number | null
          start_date: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string
          id?: string
          is_active?: boolean
          required_points?: number
          reward_image_url?: string | null
          reward_label?: string
          reward_value?: number | null
          start_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      career_medal_rules: {
        Row: {
          created_at: string
          display_name: string
          icon: string | null
          id: string
          is_active: boolean
          key: string
          kind: string
          sort_order: number
          threshold: number
          tier: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          icon?: string | null
          id?: string
          is_active?: boolean
          key: string
          kind: string
          sort_order?: number
          threshold: number
          tier?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          key?: string
          kind?: string
          sort_order?: number
          threshold?: number
          tier?: string | null
        }
        Relationships: []
      }
      career_plan_config: {
        Row: {
          created_at: string | null
          description: string | null
          duration_months: number | null
          id: string
          is_active: boolean | null
          min_monthly_points: number
          min_monthly_students: number | null
          must_be_top_seller: boolean | null
          name: string
          plan_type: string
          product_id: string | null
          required_period_points: number
          reward_description: string | null
          reward_details: string | null
          reward_image_url: string | null
          reward_value: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration_months?: number | null
          id?: string
          is_active?: boolean | null
          min_monthly_points?: number
          min_monthly_students?: number | null
          must_be_top_seller?: boolean | null
          name: string
          plan_type?: string
          product_id?: string | null
          required_period_points?: number
          reward_description?: string | null
          reward_details?: string | null
          reward_image_url?: string | null
          reward_value?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration_months?: number | null
          id?: string
          is_active?: boolean | null
          min_monthly_points?: number
          min_monthly_students?: number | null
          must_be_top_seller?: boolean | null
          name?: string
          plan_type?: string
          product_id?: string | null
          required_period_points?: number
          reward_description?: string | null
          reward_details?: string | null
          reward_image_url?: string | null
          reward_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_plan_config_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_commission_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_plan_config_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      career_plan_progress: {
        Row: {
          accumulated_points: number
          best_streak: number | null
          career_plan_id: string
          coach_id: string
          consecutive_months_qualified: number | null
          created_at: string | null
          current_streak_active: boolean | null
          delivery_notes: string | null
          id: string
          period_end: string | null
          period_start: string | null
          reward_delivered: boolean
          reward_delivered_at: string | null
          reward_delivered_by: string | null
          reward_earned: boolean | null
          reward_earned_at: string | null
          start_month: string | null
          updated_at: string
        }
        Insert: {
          accumulated_points?: number
          best_streak?: number | null
          career_plan_id: string
          coach_id: string
          consecutive_months_qualified?: number | null
          created_at?: string | null
          current_streak_active?: boolean | null
          delivery_notes?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          reward_delivered?: boolean
          reward_delivered_at?: string | null
          reward_delivered_by?: string | null
          reward_earned?: boolean | null
          reward_earned_at?: string | null
          start_month?: string | null
          updated_at?: string
        }
        Update: {
          accumulated_points?: number
          best_streak?: number | null
          career_plan_id?: string
          coach_id?: string
          consecutive_months_qualified?: number | null
          created_at?: string | null
          current_streak_active?: boolean | null
          delivery_notes?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          reward_delivered?: boolean
          reward_delivered_at?: string | null
          reward_delivered_by?: string | null
          reward_earned?: boolean | null
          reward_earned_at?: string | null
          start_month?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_plan_progress_career_plan_id_fkey"
            columns: ["career_plan_id"]
            isOneToOne: false
            referencedRelation: "career_plan_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_plan_progress_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_awards_config: {
        Row: {
          award_description: string | null
          award_value: number | null
          badge_color: string | null
          badge_icon: string | null
          category: string
          created_at: string | null
          gender: string
          id: string
          placement: number
          product_id: string
        }
        Insert: {
          award_description?: string | null
          award_value?: number | null
          badge_color?: string | null
          badge_icon?: string | null
          category: string
          created_at?: string | null
          gender: string
          id?: string
          placement: number
          product_id: string
        }
        Update: {
          award_description?: string | null
          award_value?: number | null
          badge_color?: string | null
          badge_icon?: string | null
          category?: string
          created_at?: string | null
          gender?: string
          id?: string
          placement?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_awards_config_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_commission_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_awards_config_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_editions: {
        Row: {
          cover_url: string | null
          created_at: string | null
          edition_name: string | null
          edition_number: number
          end_date: string
          id: string
          is_current: boolean | null
          product_id: string | null
          start_date: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string | null
          edition_name?: string | null
          edition_number: number
          end_date: string
          id?: string
          is_current?: boolean | null
          product_id?: string | null
          start_date: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string | null
          edition_name?: string | null
          edition_number?: number
          end_date?: string
          id?: string
          is_current?: boolean | null
          product_id?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_editions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_commission_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_editions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_groups: {
        Row: {
          cover_url: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          product_id: string
          send_permission: Database["public"]["Enums"]["chat_permission"] | null
        }
        Insert: {
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          product_id: string
          send_permission?:
            | Database["public"]["Enums"]["chat_permission"]
            | null
        }
        Update: {
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          product_id?: string
          send_permission?:
            | Database["public"]["Enums"]["chat_permission"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "challenge_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_commission_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_token_attempts: {
        Row: {
          competition_id: string | null
          created_at: string
          enrollment_id: string | null
          error_code: string | null
          error_message: string | null
          group_id: string | null
          id: string
          student_id: string | null
          success: boolean
          token_id: string | null
          user_id: string | null
        }
        Insert: {
          competition_id?: string | null
          created_at?: string
          enrollment_id?: string | null
          error_code?: string | null
          error_message?: string | null
          group_id?: string | null
          id?: string
          student_id?: string | null
          success: boolean
          token_id?: string | null
          user_id?: string | null
        }
        Update: {
          competition_id?: string | null
          created_at?: string
          enrollment_id?: string | null
          error_code?: string | null
          error_message?: string | null
          group_id?: string | null
          id?: string
          student_id?: string | null
          success?: boolean
          token_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "challenge_token_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_winners: {
        Row: {
          after_photo_url: string | null
          award_description: string | null
          award_value: number | null
          before_photo_url: string | null
          created_at: string | null
          edition_id: string
          final_weight: number | null
          id: string
          initial_weight: number | null
          placement: number
          student_id: string
          testimonial: string | null
          weight_loss: number | null
        }
        Insert: {
          after_photo_url?: string | null
          award_description?: string | null
          award_value?: number | null
          before_photo_url?: string | null
          created_at?: string | null
          edition_id: string
          final_weight?: number | null
          id?: string
          initial_weight?: number | null
          placement: number
          student_id: string
          testimonial?: string | null
          weight_loss?: number | null
        }
        Update: {
          after_photo_url?: string | null
          award_description?: string | null
          award_value?: number | null
          before_photo_url?: string | null
          created_at?: string | null
          edition_id?: string
          final_weight?: number | null
          id?: string
          initial_weight?: number | null
          placement?: number
          student_id?: string
          testimonial?: string | null
          weight_loss?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "challenge_winners_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "challenge_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_winners_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      class_schedule: {
        Row: {
          created_at: string | null
          day_of_week: number | null
          description: string | null
          duration_minutes: number | null
          id: string
          instructor: string | null
          is_live: boolean | null
          level: string | null
          link: string | null
          product_id: string
          recording_url: string | null
          scheduled_datetime: string | null
          thumbnail_url: string | null
          title: string
          week_number: number | null
        }
        Insert: {
          created_at?: string | null
          day_of_week?: number | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          instructor?: string | null
          is_live?: boolean | null
          level?: string | null
          link?: string | null
          product_id: string
          recording_url?: string | null
          scheduled_datetime?: string | null
          thumbnail_url?: string | null
          title: string
          week_number?: number | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          instructor?: string | null
          is_live?: boolean | null
          level?: string | null
          link?: string | null
          product_id?: string
          recording_url?: string | null
          scheduled_datetime?: string | null
          thumbnail_url?: string | null
          title?: string
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "class_schedule_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_commission_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_schedule_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_applications: {
        Row: {
          admin_notes: string | null
          city: string | null
          completed_modules: number | null
          created_at: string | null
          experience: string | null
          id: string
          motivation: string
          phone: string | null
          profile_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_upline_coach_id: string | null
          status: string
          student_id: string
          total_modules: number | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          city?: string | null
          completed_modules?: number | null
          created_at?: string | null
          experience?: string | null
          id?: string
          motivation: string
          phone?: string | null
          profile_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selected_upline_coach_id?: string | null
          status?: string
          student_id: string
          total_modules?: number | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          city?: string | null
          completed_modules?: number | null
          created_at?: string | null
          experience?: string | null
          id?: string
          motivation?: string
          phone?: string | null
          profile_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selected_upline_coach_id?: string | null
          status?: string
          student_id?: string
          total_modules?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_applications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_applications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_assessment_deletions: {
        Row: {
          assessment_date: string | null
          assessment_id: string | null
          client_id: string | null
          client_name: string | null
          coach_id: string
          created_at: string
          deleted_by: string | null
          id: string
          reason: string
          snapshot: Json
        }
        Insert: {
          assessment_date?: string | null
          assessment_id?: string | null
          client_id?: string | null
          client_name?: string | null
          coach_id: string
          created_at?: string
          deleted_by?: string | null
          id?: string
          reason: string
          snapshot?: Json
        }
        Update: {
          assessment_date?: string | null
          assessment_id?: string | null
          client_id?: string | null
          client_name?: string | null
          coach_id?: string
          created_at?: string
          deleted_by?: string | null
          id?: string
          reason?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "coach_assessment_deletions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_evaluation_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_assessment_deletions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_badges: {
        Row: {
          badge_key: Database["public"]["Enums"]["coach_badge_key"]
          coach_id: string
          granted_at: string
          granted_by: string | null
          id: string
          notes: string | null
        }
        Insert: {
          badge_key: Database["public"]["Enums"]["coach_badge_key"]
          coach_id: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
        }
        Update: {
          badge_key?: Database["public"]["Enums"]["coach_badge_key"]
          coach_id?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_badges_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_badges_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_body_assessments: {
        Row: {
          age: number | null
          assessment_date: string
          basal_metabolism: number | null
          blood_glucose: number | null
          bmi: number | null
          body_age: number | null
          body_fat: number | null
          body_water: number | null
          bone_mass: number | null
          challenge_enrollment_id: string | null
          challenge_type: string | null
          client_id: string
          client_notes: string | null
          coach_id: string
          created_at: string
          diastolic_bp: number | null
          group_id: string | null
          heart_rate: number | null
          height: number | null
          id: string
          method: string
          muscle_mass: number | null
          next_assessment_date: string | null
          next_assessment_time: string | null
          photos: Json
          professional_notes: string | null
          segment_analysis: Json
          skeletal_muscle: number | null
          student_id: string | null
          systolic_bp: number | null
          updated_at: string
          visceral_fat: number | null
          weight: number | null
        }
        Insert: {
          age?: number | null
          assessment_date?: string
          basal_metabolism?: number | null
          blood_glucose?: number | null
          bmi?: number | null
          body_age?: number | null
          body_fat?: number | null
          body_water?: number | null
          bone_mass?: number | null
          challenge_enrollment_id?: string | null
          challenge_type?: string | null
          client_id: string
          client_notes?: string | null
          coach_id: string
          created_at?: string
          diastolic_bp?: number | null
          group_id?: string | null
          heart_rate?: number | null
          height?: number | null
          id?: string
          method?: string
          muscle_mass?: number | null
          next_assessment_date?: string | null
          next_assessment_time?: string | null
          photos?: Json
          professional_notes?: string | null
          segment_analysis?: Json
          skeletal_muscle?: number | null
          student_id?: string | null
          systolic_bp?: number | null
          updated_at?: string
          visceral_fat?: number | null
          weight?: number | null
        }
        Update: {
          age?: number | null
          assessment_date?: string
          basal_metabolism?: number | null
          blood_glucose?: number | null
          bmi?: number | null
          body_age?: number | null
          body_fat?: number | null
          body_water?: number | null
          bone_mass?: number | null
          challenge_enrollment_id?: string | null
          challenge_type?: string | null
          client_id?: string
          client_notes?: string | null
          coach_id?: string
          created_at?: string
          diastolic_bp?: number | null
          group_id?: string | null
          heart_rate?: number | null
          height?: number | null
          id?: string
          method?: string
          muscle_mass?: number | null
          next_assessment_date?: string | null
          next_assessment_time?: string | null
          photos?: Json
          professional_notes?: string | null
          segment_analysis?: Json
          skeletal_muscle?: number | null
          student_id?: string | null
          systolic_bp?: number | null
          updated_at?: string
          visceral_fat?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_body_assessments_challenge_enrollment_id_fkey"
            columns: ["challenge_enrollment_id"]
            isOneToOne: false
            referencedRelation: "competition_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_body_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "coach_evaluation_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_body_assessments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_body_assessments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_course_modules: {
        Row: {
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean | null
          is_required: boolean | null
          material_url: string | null
          sort_order: number | null
          title: string
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          material_url?: string | null
          sort_order?: number | null
          title: string
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          material_url?: string | null
          sort_order?: number | null
          title?: string
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      coach_course_progress: {
        Row: {
          completed_at: string | null
          id: string
          module_id: string
          notes: string | null
          quiz_score: number | null
          student_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          module_id: string
          notes?: string | null
          quiz_score?: number | null
          student_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          module_id?: string
          notes?: string | null
          quiz_score?: number | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_course_progress_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "coach_course_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_course_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_created_courses: {
        Row: {
          approved_at: string | null
          approved_by_admin: boolean | null
          created_at: string | null
          creator_coach_id: string
          creator_commission_percentage: number
          digital_product_id: string
          id: string
          platform_percentage: number | null
          status: string | null
          upline_commission_percentage: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by_admin?: boolean | null
          created_at?: string | null
          creator_coach_id: string
          creator_commission_percentage: number
          digital_product_id: string
          id?: string
          platform_percentage?: number | null
          status?: string | null
          upline_commission_percentage?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by_admin?: boolean | null
          created_at?: string | null
          creator_coach_id?: string
          creator_commission_percentage?: number
          digital_product_id?: string
          id?: string
          platform_percentage?: number | null
          status?: string | null
          upline_commission_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_created_courses_creator_coach_id_fkey"
            columns: ["creator_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_created_courses_digital_product_id_fkey"
            columns: ["digital_product_id"]
            isOneToOne: false
            referencedRelation: "digital_products"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_evaluation_clients: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          coach_id: string
          created_at: string
          current_weight: number | null
          email: string | null
          ethnicity: string
          gender: string
          groups: string[]
          height: number | null
          height_unit: string
          id: string
          language: string
          name: string
          notes: string | null
          student_id: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          coach_id: string
          created_at?: string
          current_weight?: number | null
          email?: string | null
          ethnicity?: string
          gender?: string
          groups?: string[]
          height?: number | null
          height_unit?: string
          id?: string
          language?: string
          name: string
          notes?: string | null
          student_id?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          coach_id?: string
          created_at?: string
          current_weight?: number | null
          email?: string | null
          ethnicity?: string
          gender?: string
          groups?: string[]
          height?: number | null
          height_unit?: string
          id?: string
          language?: string
          name?: string
          notes?: string | null
          student_id?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_evaluation_clients_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_evaluation_clients_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_goals: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          new_students: number
          prospections: number
          reference_month: string
          renewals: number
          revenue: number
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          new_students?: number
          prospections?: number
          reference_month?: string
          renewals?: number
          revenue?: number
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          new_students?: number
          prospections?: number
          reference_month?: string
          renewals?: number
          revenue?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_goals_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_google_tokens: {
        Row: {
          access_token: string
          coach_id: string | null
          created_at: string
          expires_at: string
          fitmind_calendar_id: string | null
          google_email: string | null
          id: string
          last_synced_at: string | null
          refresh_token: string
          scope: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          coach_id?: string | null
          created_at?: string
          expires_at: string
          fitmind_calendar_id?: string | null
          google_email?: string | null
          id?: string
          last_synced_at?: string | null
          refresh_token: string
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          coach_id?: string | null
          created_at?: string
          expires_at?: string
          fitmind_calendar_id?: string | null
          google_email?: string | null
          id?: string
          last_synced_at?: string | null
          refresh_token?: string
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_google_tokens_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_medals_individual: {
        Row: {
          awarded_at: string
          coach_id: string
          id: string
          medal_key: string
          medal_kind: string
          period_month: number | null
          period_year: number | null
          vp_amount: number
        }
        Insert: {
          awarded_at?: string
          coach_id: string
          id?: string
          medal_key: string
          medal_kind: string
          period_month?: number | null
          period_year?: number | null
          vp_amount?: number
        }
        Update: {
          awarded_at?: string
          coach_id?: string
          id?: string
          medal_key?: string
          medal_kind?: string
          period_month?: number | null
          period_year?: number | null
          vp_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "coach_medals_individual_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_network_projections: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          product_id: string | null
          tree: Json
          updated_at: string
          vendas_coach: number
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          product_id?: string | null
          tree?: Json
          updated_at?: string
          vendas_coach?: number
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          product_id?: string | null
          tree?: Json
          updated_at?: string
          vendas_coach?: number
        }
        Relationships: [
          {
            foreignKeyName: "coach_network_projections_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_network_projections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_commission_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_network_projections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_patent_achievements: {
        Row: {
          achieved_at: string
          coach_id: string
          created_at: string
          id: string
          patent_key: string
          patent_level: number
          qualifying_revenue: number
        }
        Insert: {
          achieved_at?: string
          coach_id: string
          created_at?: string
          id?: string
          patent_key: string
          patent_level?: number
          qualifying_revenue?: number
        }
        Update: {
          achieved_at?: string
          coach_id?: string
          created_at?: string
          id?: string
          patent_key?: string
          patent_level?: number
          qualifying_revenue?: number
        }
        Relationships: []
      }
      coach_points_log: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          metadata: Json
          points: number
          product_id: string | null
          reason: string | null
          transaction_id: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          metadata?: Json
          points: number
          product_id?: string | null
          reason?: string | null
          transaction_id?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          points?: number
          product_id?: string | null
          reason?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_points_log_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_points_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_commission_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_points_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_points_log_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_transfers: {
        Row: {
          coaches_transferred: number | null
          from_coach_id: string
          id: string
          performed_by: string | null
          reason: string | null
          students_transferred: number | null
          to_coach_id: string
          transferred_at: string | null
        }
        Insert: {
          coaches_transferred?: number | null
          from_coach_id: string
          id?: string
          performed_by?: string | null
          reason?: string | null
          students_transferred?: number | null
          to_coach_id: string
          transferred_at?: string | null
        }
        Update: {
          coaches_transferred?: number | null
          from_coach_id?: string
          id?: string
          performed_by?: string | null
          reason?: string | null
          students_transferred?: number | null
          to_coach_id?: string
          transferred_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_transfers_from_coach_id_fkey"
            columns: ["from_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_transfers_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_transfers_to_coach_id_fkey"
            columns: ["to_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_unlock_attempts: {
        Row: {
          attempted_number: number
          coach_id: string
          created_at: string
          id: string
          ip_address: string | null
          profile_id: string
          success: boolean
          user_agent: string | null
        }
        Insert: {
          attempted_number: number
          coach_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          profile_id: string
          success: boolean
          user_agent?: string | null
        }
        Update: {
          attempted_number?: number
          coach_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          profile_id?: string
          success?: boolean
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_unlock_attempts_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches: {
        Row: {
          activation_order_id: string | null
          activation_paid_at: string | null
          approved_at: string | null
          approved_by: string | null
          bank_account: string | null
          bank_account_type: string | null
          bank_agency: string | null
          bank_name: string | null
          blocked_at: string | null
          blocked_reason: string | null
          card_valid_until: string | null
          career_goal_progress: Json | null
          coach_course_notes: string | null
          coach_number: number | null
          completed_coach_course: boolean
          consecutive_months_as_top: number | null
          council_number: string | null
          created_at: string | null
          facebook: string | null
          herbalife_portal_url: string | null
          id: string
          inactive_since: string | null
          inactivity_grace_until: string | null
          inactivity_warning_sent: boolean | null
          instagram: string | null
          is_professional: boolean
          last_activity_at: string | null
          last_unlock_attempt_at: string | null
          last_unlock_failed_at: string | null
          onboarding_stage: string
          pix_key: string | null
          pix_key_type: string | null
          professional_council: string | null
          profile_id: string
          quiz_result_submitted_at: string | null
          quiz_result_url: string | null
          referral_code: string
          referral_link: string | null
          serves_whole_network: boolean
          social_links: Json
          specialty_custom_description: string | null
          specialty_key: string | null
          specialty_pending_setup: boolean
          tiktok: string | null
          total_active_students: number | null
          total_points: number
          total_sales: number | null
          transferred_at: string | null
          transferred_to_coach_id: string | null
          unlock_attempts: number
          upline_coach_id: string | null
          website: string | null
          youtube: string | null
        }
        Insert: {
          activation_order_id?: string | null
          activation_paid_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          card_valid_until?: string | null
          career_goal_progress?: Json | null
          coach_course_notes?: string | null
          coach_number?: number | null
          completed_coach_course?: boolean
          consecutive_months_as_top?: number | null
          council_number?: string | null
          created_at?: string | null
          facebook?: string | null
          herbalife_portal_url?: string | null
          id?: string
          inactive_since?: string | null
          inactivity_grace_until?: string | null
          inactivity_warning_sent?: boolean | null
          instagram?: string | null
          is_professional?: boolean
          last_activity_at?: string | null
          last_unlock_attempt_at?: string | null
          last_unlock_failed_at?: string | null
          onboarding_stage?: string
          pix_key?: string | null
          pix_key_type?: string | null
          professional_council?: string | null
          profile_id: string
          quiz_result_submitted_at?: string | null
          quiz_result_url?: string | null
          referral_code: string
          referral_link?: string | null
          serves_whole_network?: boolean
          social_links?: Json
          specialty_custom_description?: string | null
          specialty_key?: string | null
          specialty_pending_setup?: boolean
          tiktok?: string | null
          total_active_students?: number | null
          total_points?: number
          total_sales?: number | null
          transferred_at?: string | null
          transferred_to_coach_id?: string | null
          unlock_attempts?: number
          upline_coach_id?: string | null
          website?: string | null
          youtube?: string | null
        }
        Update: {
          activation_order_id?: string | null
          activation_paid_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          card_valid_until?: string | null
          career_goal_progress?: Json | null
          coach_course_notes?: string | null
          coach_number?: number | null
          completed_coach_course?: boolean
          consecutive_months_as_top?: number | null
          council_number?: string | null
          created_at?: string | null
          facebook?: string | null
          herbalife_portal_url?: string | null
          id?: string
          inactive_since?: string | null
          inactivity_grace_until?: string | null
          inactivity_warning_sent?: boolean | null
          instagram?: string | null
          is_professional?: boolean
          last_activity_at?: string | null
          last_unlock_attempt_at?: string | null
          last_unlock_failed_at?: string | null
          onboarding_stage?: string
          pix_key?: string | null
          pix_key_type?: string | null
          professional_council?: string | null
          profile_id?: string
          quiz_result_submitted_at?: string | null
          quiz_result_url?: string | null
          referral_code?: string
          referral_link?: string | null
          serves_whole_network?: boolean
          social_links?: Json
          specialty_custom_description?: string | null
          specialty_key?: string | null
          specialty_pending_setup?: boolean
          tiktok?: string | null
          total_active_students?: number | null
          total_points?: number
          total_sales?: number | null
          transferred_at?: string | null
          transferred_to_coach_id?: string | null
          unlock_attempts?: number
          upline_coach_id?: string | null
          website?: string | null
          youtube?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaches_specialty_key_fkey"
            columns: ["specialty_key"]
            isOneToOne: false
            referencedRelation: "professional_specialties"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "coaches_transferred_to_coach_id_fkey"
            columns: ["transferred_to_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaches_upline_coach_id_fkey"
            columns: ["upline_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          amount: number
          available_at: string | null
          beneficiary_coach_id: string | null
          beneficiary_profile_id: string
          created_at: string | null
          id: string
          is_master_coach_commission: boolean | null
          is_referral: boolean | null
          level: number
          master_coach_id: string | null
          percentage: number | null
          referred_by_student_id: string | null
          slot_label: string | null
          status: Database["public"]["Enums"]["commission_status"] | null
          transaction_id: string
        }
        Insert: {
          amount: number
          available_at?: string | null
          beneficiary_coach_id?: string | null
          beneficiary_profile_id: string
          created_at?: string | null
          id?: string
          is_master_coach_commission?: boolean | null
          is_referral?: boolean | null
          level: number
          master_coach_id?: string | null
          percentage?: number | null
          referred_by_student_id?: string | null
          slot_label?: string | null
          status?: Database["public"]["Enums"]["commission_status"] | null
          transaction_id: string
        }
        Update: {
          amount?: number
          available_at?: string | null
          beneficiary_coach_id?: string | null
          beneficiary_profile_id?: string
          created_at?: string | null
          id?: string
          is_master_coach_commission?: boolean | null
          is_referral?: boolean | null
          level?: number
          master_coach_id?: string | null
          percentage?: number | null
          referred_by_student_id?: string | null
          slot_label?: string | null
          status?: Database["public"]["Enums"]["commission_status"] | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_beneficiary_coach_id_fkey"
            columns: ["beneficiary_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_beneficiary_profile_id_fkey"
            columns: ["beneficiary_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_master_coach_id_fkey"
            columns: ["master_coach_id"]
            isOneToOne: false
            referencedRelation: "master_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_referred_by_student_id_fkey"
            columns: ["referred_by_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_appointments: {
        Row: {
          coach_id: string
          created_at: string
          enrollment_id: string
          id: string
          notes: string | null
          requested_date: string
          requested_time: string
          status: string
          student_id: string
          type: string
          updated_at: string
          weight_recorded: number | null
        }
        Insert: {
          coach_id: string
          created_at?: string
          enrollment_id: string
          id?: string
          notes?: string | null
          requested_date: string
          requested_time: string
          status?: string
          student_id: string
          type: string
          updated_at?: string
          weight_recorded?: number | null
        }
        Update: {
          coach_id?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          notes?: string | null
          requested_date?: string
          requested_time?: string
          status?: string
          student_id?: string
          type?: string
          updated_at?: string
          weight_recorded?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "competition_appointments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_appointments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "competition_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_appointments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_enrollments: {
        Row: {
          coach_id: string
          competition_id: string
          enrolled_at: string
          enrolled_by: string
          final_body_fat: number | null
          final_date: string | null
          final_muscle_mass: number | null
          final_share_url: string | null
          final_weight: number | null
          gender: string
          group_id: string
          id: string
          initial_body_fat: number | null
          initial_date: string | null
          initial_muscle_mass: number | null
          initial_share_url: string | null
          initial_weight: number | null
          result_fat_pct_lost: number | null
          result_kg: number | null
          result_kg_lost: number | null
          result_muscle_gain_pct: number | null
          result_pct: number | null
          status: string
          student_id: string
        }
        Insert: {
          coach_id: string
          competition_id: string
          enrolled_at?: string
          enrolled_by?: string
          final_body_fat?: number | null
          final_date?: string | null
          final_muscle_mass?: number | null
          final_share_url?: string | null
          final_weight?: number | null
          gender: string
          group_id: string
          id?: string
          initial_body_fat?: number | null
          initial_date?: string | null
          initial_muscle_mass?: number | null
          initial_share_url?: string | null
          initial_weight?: number | null
          result_fat_pct_lost?: number | null
          result_kg?: number | null
          result_kg_lost?: number | null
          result_muscle_gain_pct?: number | null
          result_pct?: number | null
          status?: string
          student_id: string
        }
        Update: {
          coach_id?: string
          competition_id?: string
          enrolled_at?: string
          enrolled_by?: string
          final_body_fat?: number | null
          final_date?: string | null
          final_muscle_mass?: number | null
          final_share_url?: string | null
          final_weight?: number | null
          gender?: string
          group_id?: string
          id?: string
          initial_body_fat?: number | null
          initial_date?: string | null
          initial_muscle_mass?: number | null
          initial_share_url?: string | null
          initial_weight?: number | null
          result_fat_pct_lost?: number | null
          result_kg?: number | null
          result_kg_lost?: number | null
          result_muscle_gain_pct?: number | null
          result_pct?: number | null
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_enrollments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_enrollments_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_enrollments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "competition_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_finalization_log: {
        Row: {
          competition_id: string
          created_at: string
          finalized_at: string
          finalized_by: string | null
          id: string
          snapshot: Json
          winner_female_enrollment_id: string | null
          winner_male_enrollment_id: string | null
        }
        Insert: {
          competition_id: string
          created_at?: string
          finalized_at?: string
          finalized_by?: string | null
          id?: string
          snapshot?: Json
          winner_female_enrollment_id?: string | null
          winner_male_enrollment_id?: string | null
        }
        Update: {
          competition_id?: string
          created_at?: string
          finalized_at?: string
          finalized_by?: string | null
          id?: string
          snapshot?: Json
          winner_female_enrollment_id?: string | null
          winner_male_enrollment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competition_finalization_log_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_groups: {
        Row: {
          award_date: string | null
          competition_id: string
          created_at: string
          end_date: string | null
          final_weigh_in_date: string | null
          group_number: number | null
          id: string
          initial_end_date: string | null
          initial_start_date: string | null
          start_date: string | null
        }
        Insert: {
          award_date?: string | null
          competition_id: string
          created_at?: string
          end_date?: string | null
          final_weigh_in_date?: string | null
          group_number?: number | null
          id?: string
          initial_end_date?: string | null
          initial_start_date?: string | null
          start_date?: string | null
        }
        Update: {
          award_date?: string | null
          competition_id?: string
          created_at?: string
          end_date?: string | null
          final_weigh_in_date?: string | null
          group_number?: number | null
          id?: string
          initial_end_date?: string | null
          initial_start_date?: string | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competition_groups_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_hall_of_fame: {
        Row: {
          coach_id: string
          competition_id: string
          created_at: string
          enrollment_id: string
          final_weight: number
          gender: string
          id: string
          initial_weight: number
          prize_amount: number
          prize_paid: boolean
          prize_paid_at: string | null
          result_kg: number
          result_pct: number
          student_id: string
        }
        Insert: {
          coach_id: string
          competition_id: string
          created_at?: string
          enrollment_id: string
          final_weight: number
          gender: string
          id?: string
          initial_weight: number
          prize_amount?: number
          prize_paid?: boolean
          prize_paid_at?: string | null
          result_kg: number
          result_pct: number
          student_id: string
        }
        Update: {
          coach_id?: string
          competition_id?: string
          created_at?: string
          enrollment_id?: string
          final_weight?: number
          gender?: string
          id?: string
          initial_weight?: number
          prize_amount?: number
          prize_paid?: boolean
          prize_paid_at?: string | null
          result_kg?: number
          result_pct?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_hall_of_fame_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_hall_of_fame_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_hall_of_fame_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "competition_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_hall_of_fame_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          created_at: string
          description: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          month: number
          prize_amount: number
          status: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          month: number
          prize_amount?: number
          status?: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          description?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          month?: number
          prize_amount?: number
          status?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      course_teacher_commissions: {
        Row: {
          commission_percentage: number
          created_at: string | null
          digital_product_id: string
          id: string
          is_active: boolean | null
          teacher_profile_id: string
        }
        Insert: {
          commission_percentage: number
          created_at?: string | null
          digital_product_id: string
          id?: string
          is_active?: boolean | null
          teacher_profile_id: string
        }
        Update: {
          commission_percentage?: number
          created_at?: string | null
          digital_product_id?: string
          id?: string
          is_active?: boolean | null
          teacher_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_teacher_commissions_digital_product_id_fkey"
            columns: ["digital_product_id"]
            isOneToOne: false
            referencedRelation: "digital_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_teacher_commissions_teacher_profile_id_fkey"
            columns: ["teacher_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_quote_delivery: {
        Row: {
          delivered_date: string
          id: string
          quote_id: string
          student_id: string
        }
        Insert: {
          delivered_date?: string
          id?: string
          quote_id: string
          student_id: string
        }
        Update: {
          delivered_date?: string
          id?: string
          quote_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_quote_delivery_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "motivational_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_quote_delivery_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_products: {
        Row: {
          access_days: number | null
          content_url: string | null
          cover_url: string | null
          created_at: string | null
          description: string | null
          duration_hours: number | null
          id: string
          instructor: string | null
          is_featured: boolean | null
          original_price: number | null
          price: number
          sort_order: number | null
          status: string | null
          title: string
          type: string
        }
        Insert: {
          access_days?: number | null
          content_url?: string | null
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          duration_hours?: number | null
          id?: string
          instructor?: string | null
          is_featured?: boolean | null
          original_price?: number | null
          price: number
          sort_order?: number | null
          status?: string | null
          title: string
          type: string
        }
        Update: {
          access_days?: number | null
          content_url?: string | null
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          duration_hours?: number | null
          id?: string
          instructor?: string | null
          is_featured?: boolean | null
          original_price?: number | null
          price?: number
          sort_order?: number | null
          status?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      digital_purchases: {
        Row: {
          access_url: string | null
          amount_paid: number | null
          digital_product_id: string
          expires_at: string | null
          id: string
          purchased_at: string | null
          student_id: string
        }
        Insert: {
          access_url?: string | null
          amount_paid?: number | null
          digital_product_id: string
          expires_at?: string | null
          id?: string
          purchased_at?: string | null
          student_id: string
        }
        Update: {
          access_url?: string | null
          amount_paid?: number | null
          digital_product_id?: string
          expires_at?: string | null
          id?: string
          purchased_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_purchases_digital_product_id_fkey"
            columns: ["digital_product_id"]
            isOneToOne: false
            referencedRelation: "digital_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_purchases_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendances: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          event_id: string
          id: string
          profile_id: string
          student_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          event_id: string
          id?: string
          profile_id: string
          student_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          event_id?: string
          id?: string
          profile_id?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_attendances_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "fitmind_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendances_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendances_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tickets: {
        Row: {
          amount_paid: number | null
          checked_in_at: string | null
          event_id: string
          id: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          profile_id: string
          purchased_at: string | null
          qr_code_url: string | null
          referring_coach_id: string | null
          status: string | null
          student_id: string | null
          ticket_code: string | null
        }
        Insert: {
          amount_paid?: number | null
          checked_in_at?: string | null
          event_id: string
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          profile_id: string
          purchased_at?: string | null
          qr_code_url?: string | null
          referring_coach_id?: string | null
          status?: string | null
          student_id?: string | null
          ticket_code?: string | null
        }
        Update: {
          amount_paid?: number | null
          checked_in_at?: string | null
          event_id?: string
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          profile_id?: string
          purchased_at?: string | null
          qr_code_url?: string | null
          referring_coach_id?: string | null
          status?: string | null
          student_id?: string | null
          ticket_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "live_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tickets_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tickets_referring_coach_id_fkey"
            columns: ["referring_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tickets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_photos: {
        Row: {
          caption: string | null
          created_at: string | null
          id: string
          is_visible_to_coach: boolean | null
          photo_date: string
          photo_url: string
          student_id: string
          subscription_id: string | null
          week_number: number | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          id?: string
          is_visible_to_coach?: boolean | null
          photo_date: string
          photo_url: string
          student_id: string
          subscription_id?: string | null
          week_number?: number | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          id?: string
          is_visible_to_coach?: boolean | null
          photo_date?: string
          photo_url?: string
          student_id?: string
          subscription_id?: string | null
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evolution_photos_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evolution_photos_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_library: {
        Row: {
          body_focus: string | null
          created_at: string
          created_by_coach_id: string | null
          description: string | null
          difficulty: string | null
          equipment: string | null
          gif_url: string | null
          id: string
          image_url: string | null
          is_global: boolean
          media_type: string
          muscle_group: string | null
          name: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          body_focus?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          difficulty?: string | null
          equipment?: string | null
          gif_url?: string | null
          id?: string
          image_url?: string | null
          is_global?: boolean
          media_type?: string
          muscle_group?: string | null
          name: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          body_focus?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          difficulty?: string | null
          equipment?: string | null
          gif_url?: string | null
          id?: string
          image_url?: string | null
          is_global?: boolean
          media_type?: string
          muscle_group?: string | null
          name?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercise_library_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      fitmind_events: {
        Row: {
          all_day: boolean
          category: Database["public"]["Enums"]["event_category"]
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          google_calendar_description: string | null
          google_calendar_location: string | null
          google_calendar_title: string | null
          highlight_color: string | null
          highlight_label: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_highlighted: boolean
          is_important: boolean
          location: string | null
          responsible_coach_id: string | null
          starts_at: string
          subtitle: string | null
          tags: string[] | null
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["event_visibility"]
          visibility_roles: string[]
        }
        Insert: {
          all_day?: boolean
          category?: Database["public"]["Enums"]["event_category"]
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          google_calendar_description?: string | null
          google_calendar_location?: string | null
          google_calendar_title?: string | null
          highlight_color?: string | null
          highlight_label?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_highlighted?: boolean
          is_important?: boolean
          location?: string | null
          responsible_coach_id?: string | null
          starts_at: string
          subtitle?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["event_visibility"]
          visibility_roles?: string[]
        }
        Update: {
          all_day?: boolean
          category?: Database["public"]["Enums"]["event_category"]
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          google_calendar_description?: string | null
          google_calendar_location?: string | null
          google_calendar_title?: string | null
          highlight_color?: string | null
          highlight_label?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_highlighted?: boolean
          is_important?: boolean
          location?: string | null
          responsible_coach_id?: string | null
          starts_at?: string
          subtitle?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["event_visibility"]
          visibility_roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "fitmind_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fitmind_events_responsible_coach_id_fkey"
            columns: ["responsible_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      fitmind_highlighted_days: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          label: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          label: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fitmind_highlighted_days_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      food_logs: {
        Row: {
          ai_analysis: Json | null
          created_at: string | null
          description: string | null
          id: string
          log_date: string
          manual_override: boolean | null
          meal_type: string | null
          photo_url: string | null
          student_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          log_date?: string
          manual_override?: boolean | null
          meal_type?: string | null
          photo_url?: string | null
          student_id: string
        }
        Update: {
          ai_analysis?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          log_date?: string
          manual_override?: boolean | null
          meal_type?: string | null
          photo_url?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      freebie_redemptions: {
        Row: {
          created_at: string
          delivered_at: string | null
          freebie_id: string
          id: string
          notes: string | null
          status: string
          student_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          freebie_id: string
          id?: string
          notes?: string | null
          status?: string
          student_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          freebie_id?: string
          id?: string
          notes?: string | null
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "freebie_redemptions_freebie_id_fkey"
            columns: ["freebie_id"]
            isOneToOne: false
            referencedRelation: "freebies"
            referencedColumns: ["id"]
          },
        ]
      }
      freebies: {
        Row: {
          address: string | null
          condition_note: string | null
          created_at: string
          description: string | null
          event_date: string | null
          event_time: string | null
          id: string
          image_url: string | null
          is_active: boolean
          kind: string
          location: string | null
          name: string
          per_student_limit: number
          sort_order: number
          sponsor_avatar: string | null
          sponsor_bio: string | null
          sponsor_instagram: string | null
          sponsor_name: string | null
          sponsor_website: string | null
          sponsor_whatsapp: string | null
          stock: number | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          address?: string | null
          condition_note?: string | null
          created_at?: string
          description?: string | null
          event_date?: string | null
          event_time?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          kind?: string
          location?: string | null
          name: string
          per_student_limit?: number
          sort_order?: number
          sponsor_avatar?: string | null
          sponsor_bio?: string | null
          sponsor_instagram?: string | null
          sponsor_name?: string | null
          sponsor_website?: string | null
          sponsor_whatsapp?: string | null
          stock?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          address?: string | null
          condition_note?: string | null
          created_at?: string
          description?: string | null
          event_date?: string | null
          event_time?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          kind?: string
          location?: string | null
          name?: string
          per_student_limit?: number
          sort_order?: number
          sponsor_avatar?: string | null
          sponsor_bio?: string | null
          sponsor_instagram?: string | null
          sponsor_name?: string | null
          sponsor_website?: string | null
          sponsor_whatsapp?: string | null
          stock?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      group_members: {
        Row: {
          banned_by: string | null
          group_id: string
          id: string
          is_banned: boolean | null
          is_muted: boolean | null
          joined_at: string | null
          muted_by: string | null
          muted_until: string | null
          profile_id: string
          role: string | null
        }
        Insert: {
          banned_by?: string | null
          group_id: string
          id?: string
          is_banned?: boolean | null
          is_muted?: boolean | null
          joined_at?: string | null
          muted_by?: string | null
          muted_until?: string | null
          profile_id: string
          role?: string | null
        }
        Update: {
          banned_by?: string | null
          group_id?: string
          id?: string
          is_banned?: boolean | null
          is_muted?: boolean | null
          joined_at?: string | null
          muted_by?: string | null
          muted_until?: string | null
          profile_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_members_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "challenge_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_muted_by_fkey"
            columns: ["muted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          content: string | null
          created_at: string | null
          deleted_by: string | null
          group_id: string
          id: string
          is_deleted: boolean | null
          media_type: string | null
          media_url: string | null
          reply_to_id: string | null
          sender_profile_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          deleted_by?: string | null
          group_id: string
          id?: string
          is_deleted?: boolean | null
          media_type?: string | null
          media_url?: string | null
          reply_to_id?: string | null
          sender_profile_id: string
        }
        Update: {
          content?: string | null
          created_at?: string | null
          deleted_by?: string | null
          group_id?: string
          id?: string
          is_deleted?: boolean | null
          media_type?: string | null
          media_url?: string | null
          reply_to_id?: string | null
          sender_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "challenge_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "group_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_appointments: {
        Row: {
          attendee_confirmed: boolean
          attendee_confirmed_at: string | null
          attendee_email: string | null
          attendee_name: string | null
          coach_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          end_at: string | null
          google_event_id: string | null
          html_link: string | null
          id: string
          last_synced_at: string
          location: string | null
          public_token: string
          source: string
          start_at: string
          status: string
          student_id: string | null
          summary: string
          updated_at: string
        }
        Insert: {
          attendee_confirmed?: boolean
          attendee_confirmed_at?: string | null
          attendee_email?: string | null
          attendee_name?: string | null
          coach_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          end_at?: string | null
          google_event_id?: string | null
          html_link?: string | null
          id?: string
          last_synced_at?: string
          location?: string | null
          public_token?: string
          source?: string
          start_at: string
          status?: string
          student_id?: string | null
          summary?: string
          updated_at?: string
        }
        Update: {
          attendee_confirmed?: boolean
          attendee_confirmed_at?: string | null
          attendee_email?: string | null
          attendee_name?: string | null
          coach_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          end_at?: string | null
          google_event_id?: string | null
          html_link?: string | null
          id?: string
          last_synced_at?: string
          location?: string | null
          public_token?: string
          source?: string
          start_at?: string
          status?: string
          student_id?: string | null
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_appointments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_appointments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          coach_id: string | null
          converted_at: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string | null
          phone: string | null
          referral_code: string | null
          source: string | null
        }
        Insert: {
          coach_id?: string | null
          converted_at?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          referral_code?: string | null
          source?: string | null
        }
        Update: {
          coach_id?: string | null
          converted_at?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          referral_code?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      live_events: {
        Row: {
          cover_url: string | null
          created_at: string | null
          description: string | null
          event_date: string
          id: string
          is_online: boolean | null
          location: string | null
          max_participants: number | null
          mlm_pool_percentage: number | null
          online_link: string | null
          organizer_coach_id: string
          organizer_commission_percentage: number | null
          platform_fee_percentage: number | null
          product_id: string
          status: string | null
          ticket_price: number
          title: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          event_date: string
          id?: string
          is_online?: boolean | null
          location?: string | null
          max_participants?: number | null
          mlm_pool_percentage?: number | null
          online_link?: string | null
          organizer_coach_id: string
          organizer_commission_percentage?: number | null
          platform_fee_percentage?: number | null
          product_id: string
          status?: string | null
          ticket_price: number
          title: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          event_date?: string
          id?: string
          is_online?: boolean | null
          location?: string | null
          max_participants?: number | null
          mlm_pool_percentage?: number | null
          online_link?: string | null
          organizer_coach_id?: string
          organizer_commission_percentage?: number | null
          platform_fee_percentage?: number | null
          product_id?: string
          status?: string | null
          ticket_price?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_events_organizer_coach_id_fkey"
            columns: ["organizer_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_commission_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      master_coach_attendances: {
        Row: {
          attendance_date: string
          commission_amount: number | null
          commission_status:
            | Database["public"]["Enums"]["commission_status"]
            | null
          created_at: string | null
          id: string
          master_coach_id: string
          notes: string | null
          original_coach_id: string
          resulted_in_sale: boolean | null
          student_id: string
          transaction_id: string | null
        }
        Insert: {
          attendance_date?: string
          commission_amount?: number | null
          commission_status?:
            | Database["public"]["Enums"]["commission_status"]
            | null
          created_at?: string | null
          id?: string
          master_coach_id: string
          notes?: string | null
          original_coach_id: string
          resulted_in_sale?: boolean | null
          student_id: string
          transaction_id?: string | null
        }
        Update: {
          attendance_date?: string
          commission_amount?: number | null
          commission_status?:
            | Database["public"]["Enums"]["commission_status"]
            | null
          created_at?: string | null
          id?: string
          master_coach_id?: string
          notes?: string | null
          original_coach_id?: string
          resulted_in_sale?: boolean | null
          student_id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "master_coach_attendances_master_coach_id_fkey"
            columns: ["master_coach_id"]
            isOneToOne: false
            referencedRelation: "master_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_coach_attendances_original_coach_id_fkey"
            columns: ["original_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_coach_attendances_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_coach_attendances_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      master_coach_commissions: {
        Row: {
          base_commission: number
          created_at: string
          id: string
          is_cross_sale: boolean
          master_amount: number
          master_coach_id: string
          order_id: string | null
          product_id: string | null
          seller_coach_id: string
        }
        Insert: {
          base_commission?: number
          created_at?: string
          id?: string
          is_cross_sale?: boolean
          master_amount?: number
          master_coach_id: string
          order_id?: string | null
          product_id?: string | null
          seller_coach_id: string
        }
        Update: {
          base_commission?: number
          created_at?: string
          id?: string
          is_cross_sale?: boolean
          master_amount?: number
          master_coach_id?: string
          order_id?: string | null
          product_id?: string | null
          seller_coach_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_coach_commissions_master_coach_id_fkey"
            columns: ["master_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_coach_commissions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "store_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_coach_commissions_seller_coach_id_fkey"
            columns: ["seller_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      master_coaches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          available_for_clients: boolean | null
          bio: string | null
          coach_id: string
          created_at: string | null
          crm_cref: string | null
          id: string
          master_commission_percentage: number | null
          specialty: string | null
          status: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          available_for_clients?: boolean | null
          bio?: string | null
          coach_id: string
          created_at?: string | null
          crm_cref?: string | null
          id?: string
          master_commission_percentage?: number | null
          specialty?: string | null
          status?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          available_for_clients?: boolean | null
          bio?: string | null
          coach_id?: string
          created_at?: string | null
          crm_cref?: string | null
          id?: string
          master_commission_percentage?: number | null
          specialty?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "master_coaches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_coaches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      mercadopago_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          mp_payment_id: string | null
          mp_preference_id: string | null
          paid_at: string | null
          payer_doc: string | null
          payer_email: string | null
          payer_name: string | null
          payment_method: string
          pix_expires_at: string | null
          pix_qr_code: string | null
          pix_qr_code_base64: string | null
          pix_ticket_url: string | null
          raw_response: Json | null
          raw_webhook: Json | null
          source_id: string
          source_kind: string
          status: string
          status_detail: string | null
          student_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          paid_at?: string | null
          payer_doc?: string | null
          payer_email?: string | null
          payer_name?: string | null
          payment_method: string
          pix_expires_at?: string | null
          pix_qr_code?: string | null
          pix_qr_code_base64?: string | null
          pix_ticket_url?: string | null
          raw_response?: Json | null
          raw_webhook?: Json | null
          source_id: string
          source_kind: string
          status?: string
          status_detail?: string | null
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          paid_at?: string | null
          payer_doc?: string | null
          payer_email?: string | null
          payer_name?: string | null
          payment_method?: string
          pix_expires_at?: string | null
          pix_qr_code?: string | null
          pix_qr_code_base64?: string | null
          pix_ticket_url?: string | null
          raw_response?: Json | null
          raw_webhook?: Json | null
          source_id?: string
          source_kind?: string
          status?: string
          status_detail?: string | null
          student_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      monthly_rankings: {
        Row: {
          coach_id: string
          created_at: string | null
          id: string
          is_top_seller: boolean | null
          new_students: number | null
          qualifies_for_career_plan: boolean | null
          ranking_position: number | null
          reference_month: string
          renewed_students: number | null
          total_points: number
          total_revenue: number | null
          total_students: number | null
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          id?: string
          is_top_seller?: boolean | null
          new_students?: number | null
          qualifies_for_career_plan?: boolean | null
          ranking_position?: number | null
          reference_month: string
          renewed_students?: number | null
          total_points?: number
          total_revenue?: number | null
          total_students?: number | null
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          id?: string
          is_top_seller?: boolean | null
          new_students?: number | null
          qualifies_for_career_plan?: boolean | null
          ranking_position?: number | null
          reference_month?: string
          renewed_students?: number | null
          total_points?: number
          total_revenue?: number | null
          total_students?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_rankings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      motivational_quotes: {
        Row: {
          author: string | null
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          quote: string
        }
        Insert: {
          author?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          quote: string
        }
        Update: {
          author?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          quote?: string
        }
        Relationships: []
      }
      network_unlock_history: {
        Row: {
          any_completed: boolean
          coach_id: string | null
          computed_at: string
          created_at: string
          goals_snapshot: Json
          id: string
          multiplier: number
          patent_level: number
          period_month: number
          period_year: number
          profile_id: string
          total_sales: number
          updated_at: string
        }
        Insert: {
          any_completed?: boolean
          coach_id?: string | null
          computed_at?: string
          created_at?: string
          goals_snapshot?: Json
          id?: string
          multiplier?: number
          patent_level?: number
          period_month: number
          period_year: number
          profile_id: string
          total_sales?: number
          updated_at?: string
        }
        Update: {
          any_completed?: boolean
          coach_id?: string | null
          computed_at?: string
          created_at?: string
          goals_snapshot?: Json
          id?: string
          multiplier?: number
          patent_level?: number
          period_month?: number
          period_year?: number
          profile_id?: string
          total_sales?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_unlock_history_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_unlock_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      network_unlock_rules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          label: string
          product_type: Database["public"]["Enums"]["product_type"] | null
          required_sales: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          product_type?: Database["public"]["Enums"]["product_type"] | null
          required_sales?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          product_type?: Database["public"]["Enums"]["product_type"] | null
          required_sales?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string | null
          profile_id: string
          title: string
          type: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          profile_id: string
          title: string
          type: string
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          profile_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nutritionist_blocked_entries: {
        Row: {
          amount: number
          cancelled_at: string | null
          created_at: string
          id: string
          notes: string | null
          product_id: string | null
          profile_id: string
          reason: string | null
          released_at: string | null
          slot_label: string | null
          status: Database["public"]["Enums"]["nutri_block_status"]
          student_id: string | null
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          cancelled_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          profile_id: string
          reason?: string | null
          released_at?: string | null
          slot_label?: string | null
          status?: Database["public"]["Enums"]["nutri_block_status"]
          student_id?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          cancelled_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          profile_id?: string
          reason?: string | null
          released_at?: string | null
          slot_label?: string | null
          status?: Database["public"]["Enums"]["nutri_block_status"]
          student_id?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      nutritionist_wallets: {
        Row: {
          available_balance: number
          blocked_balance: number
          profile_id: string
          total_earned: number
          total_released: number
          total_withdrawn: number
          updated_at: string
        }
        Insert: {
          available_balance?: number
          blocked_balance?: number
          profile_id: string
          total_earned?: number
          total_released?: number
          total_withdrawn?: number
          updated_at?: string
        }
        Update: {
          available_balance?: number
          blocked_balance?: number
          profile_id?: string
          total_earned?: number
          total_released?: number
          total_withdrawn?: number
          updated_at?: string
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          provider: string
          redirect_to: string | null
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          provider?: string
          redirect_to?: string | null
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          provider?: string
          redirect_to?: string | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      partner_benefits: {
        Row: {
          category: string | null
          coupon_code: string | null
          created_at: string | null
          description: string | null
          discount_info: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          sort_order: number | null
          website_url: string | null
        }
        Insert: {
          category?: string | null
          coupon_code?: string | null
          created_at?: string | null
          description?: string | null
          discount_info?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          sort_order?: number | null
          website_url?: string | null
        }
        Update: {
          category?: string | null
          coupon_code?: string | null
          created_at?: string | null
          description?: string | null
          discount_info?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          sort_order?: number | null
          website_url?: string | null
        }
        Relationships: []
      }
      partner_posts: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          image_url: string
          partner_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          image_url: string
          partner_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          image_url?: string
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_posts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_product_order_status_log: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          order_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          order_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_product_order_status_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_product_order_status_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "partner_product_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_product_orders: {
        Row: {
          cancelled_at: string | null
          coach_commission_amount: number
          coach_commission_pct: number
          coach_net_amount: number
          created_at: string
          gross_amount: number
          id: string
          master_coach_cross_beneficiary_coach_id: string | null
          master_coach_cross_bonus_amount: number
          metadata: Json
          mp_payment_id: string | null
          network_l1_amount: number
          network_l2_amount: number
          network_l3_amount: number
          notes: string | null
          order_number: string
          paid_at: string | null
          partner_id: string | null
          partner_net_amount: number
          partner_product_id: string | null
          payment_fee: number
          payment_method: string
          professional_coach_id: string | null
          professional_product_id: string | null
          selling_coach_id: string | null
          status: string
          student_id: string
          system_fee: number
          tax_amount: number
          updated_at: string
          upline_l1_coach_id: string | null
          upline_l2_coach_id: string | null
          upline_l3_coach_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          coach_commission_amount?: number
          coach_commission_pct?: number
          coach_net_amount?: number
          created_at?: string
          gross_amount?: number
          id?: string
          master_coach_cross_beneficiary_coach_id?: string | null
          master_coach_cross_bonus_amount?: number
          metadata?: Json
          mp_payment_id?: string | null
          network_l1_amount?: number
          network_l2_amount?: number
          network_l3_amount?: number
          notes?: string | null
          order_number?: string
          paid_at?: string | null
          partner_id?: string | null
          partner_net_amount?: number
          partner_product_id?: string | null
          payment_fee?: number
          payment_method?: string
          professional_coach_id?: string | null
          professional_product_id?: string | null
          selling_coach_id?: string | null
          status?: string
          student_id: string
          system_fee?: number
          tax_amount?: number
          updated_at?: string
          upline_l1_coach_id?: string | null
          upline_l2_coach_id?: string | null
          upline_l3_coach_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          coach_commission_amount?: number
          coach_commission_pct?: number
          coach_net_amount?: number
          created_at?: string
          gross_amount?: number
          id?: string
          master_coach_cross_beneficiary_coach_id?: string | null
          master_coach_cross_bonus_amount?: number
          metadata?: Json
          mp_payment_id?: string | null
          network_l1_amount?: number
          network_l2_amount?: number
          network_l3_amount?: number
          notes?: string | null
          order_number?: string
          paid_at?: string | null
          partner_id?: string | null
          partner_net_amount?: number
          partner_product_id?: string | null
          payment_fee?: number
          payment_method?: string
          professional_coach_id?: string | null
          professional_product_id?: string | null
          selling_coach_id?: string | null
          status?: string
          student_id?: string
          system_fee?: number
          tax_amount?: number
          updated_at?: string
          upline_l1_coach_id?: string | null
          upline_l2_coach_id?: string | null
          upline_l3_coach_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_product_orders_master_coach_cross_beneficiary_coac_fkey"
            columns: ["master_coach_cross_beneficiary_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_product_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_product_orders_partner_product_id_fkey"
            columns: ["partner_product_id"]
            isOneToOne: false
            referencedRelation: "partner_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_product_orders_professional_coach_id_fkey"
            columns: ["professional_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_product_orders_professional_product_id_fkey"
            columns: ["professional_product_id"]
            isOneToOne: false
            referencedRelation: "professional_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_product_orders_selling_coach_id_fkey"
            columns: ["selling_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_product_orders_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_product_orders_upline_l1_coach_id_fkey"
            columns: ["upline_l1_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_product_orders_upline_l2_coach_id_fkey"
            columns: ["upline_l2_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_product_orders_upline_l3_coach_id_fkey"
            columns: ["upline_l3_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_products: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          approved_by: string | null
          card_fee_percentage: number
          category_id: string | null
          coach_commission_amount: number | null
          coach_commission_percentage: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active_by_partner: boolean
          kind: string
          name: string
          network_l1_amount: number | null
          network_l2_amount: number | null
          network_l3_amount: number | null
          partner_id: string
          partner_net_amount: number | null
          pix_fee_percentage: number
          price: number | null
          price_input_mode: string
          redemption_instructions: string | null
          section_id: string | null
          status: string
          stock: number | null
          system_fee_fixed: number
          tax_percentage: number
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          card_fee_percentage?: number
          category_id?: string | null
          coach_commission_amount?: number | null
          coach_commission_percentage?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active_by_partner?: boolean
          kind: string
          name: string
          network_l1_amount?: number | null
          network_l2_amount?: number | null
          network_l3_amount?: number | null
          partner_id: string
          partner_net_amount?: number | null
          pix_fee_percentage?: number
          price?: number | null
          price_input_mode?: string
          redemption_instructions?: string | null
          section_id?: string | null
          status?: string
          stock?: number | null
          system_fee_fixed?: number
          tax_percentage?: number
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          card_fee_percentage?: number
          category_id?: string | null
          coach_commission_amount?: number | null
          coach_commission_percentage?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active_by_partner?: boolean
          kind?: string
          name?: string
          network_l1_amount?: number | null
          network_l2_amount?: number | null
          network_l3_amount?: number | null
          partner_id?: string
          partner_net_amount?: number | null
          pix_fee_percentage?: number
          price?: number | null
          price_input_mode?: string
          redemption_instructions?: string | null
          section_id?: string | null
          status?: string
          stock?: number | null
          system_fee_fixed?: number
          tax_percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_products_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "store_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_products_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_products_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "store_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_visits: {
        Row: {
          id: string
          partner_id: string
          source: string | null
          student_id: string
          visited_at: string
        }
        Insert: {
          id?: string
          partner_id: string
          source?: string | null
          student_id: string
          visited_at?: string
        }
        Update: {
          id?: string
          partner_id?: string
          source?: string | null
          student_id?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_visits_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_visits_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          address: string | null
          approved_at: string | null
          blocked_at: string | null
          blocked_reason: string | null
          city: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          document: string | null
          document_type: string | null
          facebook: string | null
          fantasy_name: string
          id: string
          instagram: string | null
          latitude: number | null
          longitude: number | null
          photo_url: string | null
          profile_id: string
          referral_code: string | null
          referral_link: string | null
          state: string | null
          status: string
          updated_at: string
          upline_coach_id: string | null
          website: string | null
          whatsapp: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          city?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          document?: string | null
          document_type?: string | null
          facebook?: string | null
          fantasy_name: string
          id?: string
          instagram?: string | null
          latitude?: number | null
          longitude?: number | null
          photo_url?: string | null
          profile_id: string
          referral_code?: string | null
          referral_link?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          upline_coach_id?: string | null
          website?: string | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          city?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          document?: string | null
          document_type?: string | null
          facebook?: string | null
          fantasy_name?: string
          id?: string
          instagram?: string | null
          latitude?: number | null
          longitude?: number | null
          photo_url?: string | null
          profile_id?: string
          referral_code?: string | null
          referral_link?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          upline_coach_id?: string | null
          website?: string | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partners_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_upline_coach_id_fkey"
            columns: ["upline_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      patent_rules: {
        Row: {
          badge_color: string
          badge_icon: string
          benefits: string | null
          can_access_reports: boolean | null
          created_at: string | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean | null
          key: string | null
          level: number | null
          max_team_sales_pct: number | null
          min_consecutive_months: number | null
          min_direct_students: number | null
          min_monthly_revenue: number | null
          min_network_students: number | null
          min_own_sales_pct: number | null
          patent: Database["public"]["Enums"]["patent_level"] | null
          phase: number | null
          report_scope: string | null
          required_revenue: number | null
          sort_order: number | null
          time_window_months: number | null
          ve_max_pct: number | null
          vp_max_pct: number | null
        }
        Insert: {
          badge_color: string
          badge_icon: string
          benefits?: string | null
          can_access_reports?: boolean | null
          created_at?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          key?: string | null
          level?: number | null
          max_team_sales_pct?: number | null
          min_consecutive_months?: number | null
          min_direct_students?: number | null
          min_monthly_revenue?: number | null
          min_network_students?: number | null
          min_own_sales_pct?: number | null
          patent?: Database["public"]["Enums"]["patent_level"] | null
          phase?: number | null
          report_scope?: string | null
          required_revenue?: number | null
          sort_order?: number | null
          time_window_months?: number | null
          ve_max_pct?: number | null
          vp_max_pct?: number | null
        }
        Update: {
          badge_color?: string
          badge_icon?: string
          benefits?: string | null
          can_access_reports?: boolean | null
          created_at?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          key?: string | null
          level?: number | null
          max_team_sales_pct?: number | null
          min_consecutive_months?: number | null
          min_direct_students?: number | null
          min_monthly_revenue?: number | null
          min_network_students?: number | null
          min_own_sales_pct?: number | null
          patent?: Database["public"]["Enums"]["patent_level"] | null
          phase?: number | null
          report_scope?: string | null
          required_revenue?: number | null
          sort_order?: number | null
          time_window_months?: number | null
          ve_max_pct?: number | null
          vp_max_pct?: number | null
        }
        Relationships: []
      }
      payment_fee_configs: {
        Row: {
          card_fee_3x12_percentage: number
          card_fee_percentage: number
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          notes: string | null
          pix_fee_percentage: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          card_fee_3x12_percentage?: number
          card_fee_percentage?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          notes?: string | null
          pix_fee_percentage?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          card_fee_3x12_percentage?: number
          card_fee_percentage?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          notes?: string | null
          pix_fee_percentage?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_fee_configs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_challenges: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          started_at: string
          status: string
          student_id: string
          target_days: number
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          started_at?: string
          status?: string
          student_id: string
          target_days: number
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          started_at?: string
          status?: string
          student_id?: string
          target_days?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      points_redeem_orders: {
        Row: {
          admin_notes: string | null
          coach_id: string
          created_at: string
          id: string
          points_spent: number
          redeem_product_id: string
          shipping_address: string | null
          status: string
          tracking_code: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          coach_id: string
          created_at?: string
          id?: string
          points_spent: number
          redeem_product_id: string
          shipping_address?: string | null
          status?: string
          tracking_code?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          coach_id?: string
          created_at?: string
          id?: string
          points_spent?: number
          redeem_product_id?: string
          shipping_address?: string | null
          status?: string
          tracking_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_redeem_orders_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_redeem_orders_redeem_product_id_fkey"
            columns: ["redeem_product_id"]
            isOneToOne: false
            referencedRelation: "points_redeem_products"
            referencedColumns: ["id"]
          },
        ]
      }
      points_redeem_products: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          points_cost: number
          sort_order: number
          stock: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          points_cost: number
          sort_order?: number
          stock?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          points_cost?: number
          sort_order?: number
          stock?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      product_order_pool_entries: {
        Row: {
          amount: number
          cancelled_at: string | null
          created_at: string
          delivered_at: string | null
          hbl_fulfiller_coach_id: string | null
          id: string
          notes: string | null
          preparing_at: string | null
          product_id: string | null
          shipped_at: string | null
          slot_label: string | null
          status: Database["public"]["Enums"]["order_pool_status"]
          student_id: string | null
          tracking_code: string | null
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          cancelled_at?: string | null
          created_at?: string
          delivered_at?: string | null
          hbl_fulfiller_coach_id?: string | null
          id?: string
          notes?: string | null
          preparing_at?: string | null
          product_id?: string | null
          shipped_at?: string | null
          slot_label?: string | null
          status?: Database["public"]["Enums"]["order_pool_status"]
          student_id?: string | null
          tracking_code?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          cancelled_at?: string | null
          created_at?: string
          delivered_at?: string | null
          hbl_fulfiller_coach_id?: string | null
          id?: string
          notes?: string | null
          preparing_at?: string | null
          product_id?: string | null
          shipped_at?: string | null
          slot_label?: string | null
          status?: Database["public"]["Enums"]["order_pool_status"]
          student_id?: string | null
          tracking_code?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_order_pool_entries_hbl_fulfiller_coach_id_fkey"
            columns: ["hbl_fulfiller_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      product_professional_requirements: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          notes: string | null
          product_id: string
          specialty_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          notes?: string | null
          product_id: string
          specialty_key: string
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          notes?: string | null
          product_id?: string
          specialty_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_professional_requirements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_commission_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_professional_requirements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_professional_requirements_specialty_key_fkey"
            columns: ["specialty_key"]
            isOneToOne: false
            referencedRelation: "professional_specialties"
            referencedColumns: ["key"]
          },
        ]
      }
      product_referral_rules: {
        Row: {
          coach_pool_percentage: number
          created_at: string
          enabled: boolean
          id: string
          pre_deduction_fixed: number
          pre_deduction_label: string
          product_id: string
          student_referral_percentage: number
          updated_at: string
        }
        Insert: {
          coach_pool_percentage?: number
          created_at?: string
          enabled?: boolean
          id?: string
          pre_deduction_fixed?: number
          pre_deduction_label?: string
          product_id: string
          student_referral_percentage?: number
          updated_at?: string
        }
        Update: {
          coach_pool_percentage?: number
          created_at?: string
          enabled?: boolean
          id?: string
          pre_deduction_fixed?: number
          pre_deduction_label?: string
          product_id?: string
          student_referral_percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_referral_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "product_commission_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_referral_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_value_slots: {
        Row: {
          applies_to_referral_sales: boolean
          applies_to_student_referral: boolean
          created_at: string
          delivery_trigger: string | null
          description: string | null
          destination: Database["public"]["Enums"]["value_destination_type"]
          destination_label: string | null
          id: string
          is_active: boolean
          is_blocked_until_delivery: boolean
          is_system_fee: boolean
          label: string
          linked_profile_role: string | null
          product_id: string
          redirect_metadata: Json
          redirect_to_module: string | null
          slot_group: number | null
          slot_order: number
          updated_at: string
          value_amount: number
          value_type: string
        }
        Insert: {
          applies_to_referral_sales?: boolean
          applies_to_student_referral?: boolean
          created_at?: string
          delivery_trigger?: string | null
          description?: string | null
          destination: Database["public"]["Enums"]["value_destination_type"]
          destination_label?: string | null
          id?: string
          is_active?: boolean
          is_blocked_until_delivery?: boolean
          is_system_fee?: boolean
          label: string
          linked_profile_role?: string | null
          product_id: string
          redirect_metadata?: Json
          redirect_to_module?: string | null
          slot_group?: number | null
          slot_order?: number
          updated_at?: string
          value_amount?: number
          value_type?: string
        }
        Update: {
          applies_to_referral_sales?: boolean
          applies_to_student_referral?: boolean
          created_at?: string
          delivery_trigger?: string | null
          description?: string | null
          destination?: Database["public"]["Enums"]["value_destination_type"]
          destination_label?: string | null
          id?: string
          is_active?: boolean
          is_blocked_until_delivery?: boolean
          is_system_fee?: boolean
          label?: string
          linked_profile_role?: string | null
          product_id?: string
          redirect_metadata?: Json
          redirect_to_module?: string | null
          slot_group?: number | null
          slot_order?: number
          updated_at?: string
          value_amount?: number
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_value_slots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_commission_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_value_slots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          allow_master_coach_sale: boolean
          app_fee: number | null
          app_fee_percentage: number | null
          badge_color: string | null
          badge_label: string | null
          card_access_days: number | null
          card_fee_percentage: number | null
          category_id: string | null
          commission_coach: number | null
          commission_level1: number | null
          commission_level2: number | null
          commission_level3: number | null
          commission_level4: number | null
          commission_level5: number | null
          cost: number | null
          course_level: number | null
          course_target: string | null
          created_at: string | null
          creator_coach_id: string | null
          creator_commission_percentage: number | null
          credit_fee_percentage: number | null
          debit_fee_percentage: number | null
          description: string | null
          duration_days: number | null
          feature_awards: boolean | null
          feature_benefits_club: boolean | null
          feature_bioimpedance: boolean | null
          feature_calorie_ai: boolean | null
          feature_challenge_tracker: boolean | null
          feature_class_schedule: boolean | null
          feature_coach_chat: boolean | null
          feature_group_chat: boolean | null
          feature_herbalife: boolean | null
          feature_photo_evolution: boolean | null
          feature_recipes: boolean | null
          feature_store: boolean | null
          feature_weight_tracking: boolean | null
          feature_winners_forum: boolean | null
          free_for_council: boolean
          free_for_nutritionist: boolean
          gallery: Json
          has_challenge_access: boolean
          highlights: Json | null
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean | null
          is_price_range: boolean | null
          kind: string | null
          marketing_plan: number | null
          master_coach_commission: number | null
          max_installments: number | null
          max_price: number | null
          metadata: Json
          min_price: number | null
          name: string
          network_commission_percentage: number | null
          nutritionist_fee: number | null
          original_price: number | null
          other_costs: number | null
          pix_fee_percentage: number | null
          points_auto_calculated: boolean
          points_per_sale: number
          price: number | null
          product_type: Database["public"]["Enums"]["product_type"] | null
          profit_percentage_max: number | null
          profit_percentage_min: number | null
          referral_commission_percentage: number | null
          required_badge: Database["public"]["Enums"]["coach_badge_key"] | null
          room_rental_commission: number | null
          section_id: string | null
          short_description: string | null
          sku: string | null
          slug: string | null
          sort_order: number | null
          status: string | null
          stock: number | null
          subtitle: string | null
          tax_percentage: number | null
          type: Database["public"]["Enums"]["product_type"] | null
          updated_at: string | null
        }
        Insert: {
          allow_master_coach_sale?: boolean
          app_fee?: number | null
          app_fee_percentage?: number | null
          badge_color?: string | null
          badge_label?: string | null
          card_access_days?: number | null
          card_fee_percentage?: number | null
          category_id?: string | null
          commission_coach?: number | null
          commission_level1?: number | null
          commission_level2?: number | null
          commission_level3?: number | null
          commission_level4?: number | null
          commission_level5?: number | null
          cost?: number | null
          course_level?: number | null
          course_target?: string | null
          created_at?: string | null
          creator_coach_id?: string | null
          creator_commission_percentage?: number | null
          credit_fee_percentage?: number | null
          debit_fee_percentage?: number | null
          description?: string | null
          duration_days?: number | null
          feature_awards?: boolean | null
          feature_benefits_club?: boolean | null
          feature_bioimpedance?: boolean | null
          feature_calorie_ai?: boolean | null
          feature_challenge_tracker?: boolean | null
          feature_class_schedule?: boolean | null
          feature_coach_chat?: boolean | null
          feature_group_chat?: boolean | null
          feature_herbalife?: boolean | null
          feature_photo_evolution?: boolean | null
          feature_recipes?: boolean | null
          feature_store?: boolean | null
          feature_weight_tracking?: boolean | null
          feature_winners_forum?: boolean | null
          free_for_council?: boolean
          free_for_nutritionist?: boolean
          gallery?: Json
          has_challenge_access?: boolean
          highlights?: Json | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean | null
          is_price_range?: boolean | null
          kind?: string | null
          marketing_plan?: number | null
          master_coach_commission?: number | null
          max_installments?: number | null
          max_price?: number | null
          metadata?: Json
          min_price?: number | null
          name: string
          network_commission_percentage?: number | null
          nutritionist_fee?: number | null
          original_price?: number | null
          other_costs?: number | null
          pix_fee_percentage?: number | null
          points_auto_calculated?: boolean
          points_per_sale?: number
          price?: number | null
          product_type?: Database["public"]["Enums"]["product_type"] | null
          profit_percentage_max?: number | null
          profit_percentage_min?: number | null
          referral_commission_percentage?: number | null
          required_badge?: Database["public"]["Enums"]["coach_badge_key"] | null
          room_rental_commission?: number | null
          section_id?: string | null
          short_description?: string | null
          sku?: string | null
          slug?: string | null
          sort_order?: number | null
          status?: string | null
          stock?: number | null
          subtitle?: string | null
          tax_percentage?: number | null
          type?: Database["public"]["Enums"]["product_type"] | null
          updated_at?: string | null
        }
        Update: {
          allow_master_coach_sale?: boolean
          app_fee?: number | null
          app_fee_percentage?: number | null
          badge_color?: string | null
          badge_label?: string | null
          card_access_days?: number | null
          card_fee_percentage?: number | null
          category_id?: string | null
          commission_coach?: number | null
          commission_level1?: number | null
          commission_level2?: number | null
          commission_level3?: number | null
          commission_level4?: number | null
          commission_level5?: number | null
          cost?: number | null
          course_level?: number | null
          course_target?: string | null
          created_at?: string | null
          creator_coach_id?: string | null
          creator_commission_percentage?: number | null
          credit_fee_percentage?: number | null
          debit_fee_percentage?: number | null
          description?: string | null
          duration_days?: number | null
          feature_awards?: boolean | null
          feature_benefits_club?: boolean | null
          feature_bioimpedance?: boolean | null
          feature_calorie_ai?: boolean | null
          feature_challenge_tracker?: boolean | null
          feature_class_schedule?: boolean | null
          feature_coach_chat?: boolean | null
          feature_group_chat?: boolean | null
          feature_herbalife?: boolean | null
          feature_photo_evolution?: boolean | null
          feature_recipes?: boolean | null
          feature_store?: boolean | null
          feature_weight_tracking?: boolean | null
          feature_winners_forum?: boolean | null
          free_for_council?: boolean
          free_for_nutritionist?: boolean
          gallery?: Json
          has_challenge_access?: boolean
          highlights?: Json | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean | null
          is_price_range?: boolean | null
          kind?: string | null
          marketing_plan?: number | null
          master_coach_commission?: number | null
          max_installments?: number | null
          max_price?: number | null
          metadata?: Json
          min_price?: number | null
          name?: string
          network_commission_percentage?: number | null
          nutritionist_fee?: number | null
          original_price?: number | null
          other_costs?: number | null
          pix_fee_percentage?: number | null
          points_auto_calculated?: boolean
          points_per_sale?: number
          price?: number | null
          product_type?: Database["public"]["Enums"]["product_type"] | null
          profit_percentage_max?: number | null
          profit_percentage_min?: number | null
          referral_commission_percentage?: number | null
          required_badge?: Database["public"]["Enums"]["coach_badge_key"] | null
          room_rental_commission?: number | null
          section_id?: string | null
          short_description?: string | null
          sku?: string | null
          slug?: string | null
          sort_order?: number | null
          status?: string | null
          stock?: number | null
          subtitle?: string | null
          tax_percentage?: number | null
          type?: Database["public"]["Enums"]["product_type"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_fk"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "store_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_creator_coach_id_fkey"
            columns: ["creator_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_anamnesis_external: {
        Row: {
          answers: Json
          coach_id: string
          created_at: string
          evaluation_client_id: string
          id: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          coach_id: string
          created_at?: string
          evaluation_client_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          coach_id?: string
          created_at?: string
          evaluation_client_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_anamnesis_external_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_anamnesis_external_evaluation_client_id_fkey"
            columns: ["evaluation_client_id"]
            isOneToOne: false
            referencedRelation: "coach_evaluation_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_anamnesis_questions: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          is_active: boolean
          kind: string
          label: string
          options: Json
          position: number
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          label: string
          options?: Json
          position?: number
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          label?: string
          options?: Json
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_anamnesis_questions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_appointments: {
        Row: {
          cancel_reason: string | null
          cancellation_window_hours: number
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          ends_at: string
          id: string
          notes: string | null
          order_id: string | null
          product_id: string
          professional_coach_id: string
          seller_coach_id: string | null
          starts_at: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cancellation_window_hours?: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          ends_at: string
          id?: string
          notes?: string | null
          order_id?: string | null
          product_id: string
          professional_coach_id: string
          seller_coach_id?: string | null
          starts_at: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancellation_window_hours?: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          product_id?: string
          professional_coach_id?: string
          seller_coach_id?: string | null
          starts_at?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_appointments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "partner_product_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_appointments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "professional_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_appointments_professional_coach_id_fkey"
            columns: ["professional_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_appointments_seller_coach_id_fkey"
            columns: ["seller_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_appointments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_availability: {
        Row: {
          created_at: string
          end_time: string
          id: string
          is_active: boolean
          professional_coach_id: string
          slot_minutes: number
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          is_active?: boolean
          professional_coach_id: string
          slot_minutes?: number
          start_time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          is_active?: boolean
          professional_coach_id?: string
          slot_minutes?: number
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "professional_availability_professional_coach_id_fkey"
            columns: ["professional_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_availability_blocks: {
        Row: {
          block_date: string
          created_at: string
          id: string
          professional_coach_id: string
          reason: string | null
        }
        Insert: {
          block_date: string
          created_at?: string
          id?: string
          professional_coach_id: string
          reason?: string | null
        }
        Update: {
          block_date?: string
          created_at?: string
          id?: string
          professional_coach_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_availability_blocks_professional_coach_id_fkey"
            columns: ["professional_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_products: {
        Row: {
          admin_notes: string | null
          cancellation_window_hours: number
          category_id: string | null
          coach_commission_amount: number | null
          coach_commission_percentage: number
          coach_id: string
          created_at: string
          default_duration_minutes: number
          description: string | null
          id: string
          image_url: string | null
          is_active_by_professional: boolean
          is_schedulable: boolean
          name: string
          network_l1_amount: number | null
          network_l2_amount: number | null
          network_l3_amount: number | null
          price: number
          price_input_mode: string
          professional_net_amount: number | null
          redemption_instructions: string | null
          section_id: string | null
          status: string
          stock: number | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          cancellation_window_hours?: number
          category_id?: string | null
          coach_commission_amount?: number | null
          coach_commission_percentage?: number
          coach_id: string
          created_at?: string
          default_duration_minutes?: number
          description?: string | null
          id?: string
          image_url?: string | null
          is_active_by_professional?: boolean
          is_schedulable?: boolean
          name: string
          network_l1_amount?: number | null
          network_l2_amount?: number | null
          network_l3_amount?: number | null
          price?: number
          price_input_mode?: string
          professional_net_amount?: number | null
          redemption_instructions?: string | null
          section_id?: string | null
          status?: string
          stock?: number | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          cancellation_window_hours?: number
          category_id?: string | null
          coach_commission_amount?: number | null
          coach_commission_percentage?: number
          coach_id?: string
          created_at?: string
          default_duration_minutes?: number
          description?: string | null
          id?: string
          image_url?: string | null
          is_active_by_professional?: boolean
          is_schedulable?: boolean
          name?: string
          network_l1_amount?: number | null
          network_l2_amount?: number | null
          network_l3_amount?: number | null
          price?: number
          price_input_mode?: string
          professional_net_amount?: number | null
          redemption_instructions?: string | null
          section_id?: string | null
          status?: string
          stock?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "store_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_products_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_products_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "store_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_public_profile: {
        Row: {
          bio_long: string | null
          created_at: string
          headline: string | null
          instagram: string | null
          profile_id: string
          services: string | null
          social_links: Json
          updated_at: string
          website: string | null
        }
        Insert: {
          bio_long?: string | null
          created_at?: string
          headline?: string | null
          instagram?: string | null
          profile_id: string
          services?: string | null
          social_links?: Json
          updated_at?: string
          website?: string | null
        }
        Update: {
          bio_long?: string | null
          created_at?: string
          headline?: string | null
          instagram?: string | null
          profile_id?: string
          services?: string | null
          social_links?: Json
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_public_profile_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_specialties: {
        Row: {
          capabilities: Json
          created_at: string
          default_tabs: Json
          description: string | null
          icon: string | null
          is_active: boolean
          key: string
          label: string
          requires_admin_setup: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          capabilities?: Json
          created_at?: string
          default_tabs?: Json
          description?: string | null
          icon?: string | null
          is_active?: boolean
          key: string
          label: string
          requires_admin_setup?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          capabilities?: Json
          created_at?: string
          default_tabs?: Json
          description?: string | null
          icon?: string | null
          is_active?: boolean
          key?: string
          label?: string
          requires_admin_setup?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          admin_permissions: Json
          avatar_url: string | null
          bio: string | null
          birthdate: string | null
          blood_type: string | null
          city: string | null
          cpf: string | null
          created_at: string | null
          email: string
          gender: string | null
          id: string
          instagram: string | null
          is_master_admin: boolean
          last_app_login_at: string | null
          name: string
          neighborhood: string | null
          number: string | null
          patent: Database["public"]["Enums"]["patent_level"] | null
          phone: string | null
          photo_url: string | null
          profession: string | null
          report_permissions: Json | null
          role: Database["public"]["Enums"]["user_role"]
          state: string | null
          status: string | null
          street: string | null
          theme_preference: string | null
          updated_at: string | null
          user_id: string
          zip_code: string | null
        }
        Insert: {
          admin_permissions?: Json
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          blood_type?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string | null
          email: string
          gender?: string | null
          id?: string
          instagram?: string | null
          is_master_admin?: boolean
          last_app_login_at?: string | null
          name: string
          neighborhood?: string | null
          number?: string | null
          patent?: Database["public"]["Enums"]["patent_level"] | null
          phone?: string | null
          photo_url?: string | null
          profession?: string | null
          report_permissions?: Json | null
          role?: Database["public"]["Enums"]["user_role"]
          state?: string | null
          status?: string | null
          street?: string | null
          theme_preference?: string | null
          updated_at?: string | null
          user_id: string
          zip_code?: string | null
        }
        Update: {
          admin_permissions?: Json
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          blood_type?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string | null
          email?: string
          gender?: string | null
          id?: string
          instagram?: string | null
          is_master_admin?: boolean
          last_app_login_at?: string | null
          name?: string
          neighborhood?: string | null
          number?: string | null
          patent?: Database["public"]["Enums"]["patent_level"] | null
          phone?: string | null
          photo_url?: string | null
          profession?: string | null
          report_permissions?: Json | null
          role?: Database["public"]["Enums"]["user_role"]
          state?: string | null
          status?: string | null
          street?: string | null
          theme_preference?: string | null
          updated_at?: string | null
          user_id?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      push_notifications_queue: {
        Row: {
          body: string
          data: Json | null
          id: string
          scheduled_for: string
          sent_at: string | null
          status: string | null
          student_id: string
          title: string
          type: string
        }
        Insert: {
          body: string
          data?: Json | null
          id?: string
          scheduled_for: string
          sent_at?: string | null
          status?: string | null
          student_id: string
          title: string
          type: string
        }
        Update: {
          body?: string
          data?: Json | null
          id?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string | null
          student_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notifications_queue_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      room_rentals: {
        Row: {
          created_at: string | null
          duration_hours: number | null
          end_time: string | null
          id: string
          is_first_rental: boolean | null
          price_per_hour: number | null
          referral_commission_amount: number | null
          referral_commission_paid: boolean | null
          referring_coach_id: string | null
          rental_date: string
          renter_profile_id: string
          room_name: string | null
          start_time: string | null
          status: string | null
          total_amount: number | null
        }
        Insert: {
          created_at?: string | null
          duration_hours?: number | null
          end_time?: string | null
          id?: string
          is_first_rental?: boolean | null
          price_per_hour?: number | null
          referral_commission_amount?: number | null
          referral_commission_paid?: boolean | null
          referring_coach_id?: string | null
          rental_date: string
          renter_profile_id: string
          room_name?: string | null
          start_time?: string | null
          status?: string | null
          total_amount?: number | null
        }
        Update: {
          created_at?: string | null
          duration_hours?: number | null
          end_time?: string | null
          id?: string
          is_first_rental?: boolean | null
          price_per_hour?: number | null
          referral_commission_amount?: number | null
          referral_commission_paid?: boolean | null
          referring_coach_id?: string | null
          rental_date?: string
          renter_profile_id?: string
          room_name?: string | null
          start_time?: string | null
          status?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "room_rentals_referring_coach_id_fkey"
            columns: ["referring_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_rentals_renter_profile_id_fkey"
            columns: ["renter_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_nutritionist_assignments: {
        Row: {
          assignment_method: string
          created_at: string
          id: string
          nutritionist_coach_id: string | null
          order_id: string
          seller_coach_id: string
        }
        Insert: {
          assignment_method?: string
          created_at?: string
          id?: string
          nutritionist_coach_id?: string | null
          order_id: string
          seller_coach_id: string
        }
        Update: {
          assignment_method?: string
          created_at?: string
          id?: string
          nutritionist_coach_id?: string | null
          order_id?: string
          seller_coach_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_nutritionist_assignments_nutritionist_coach_id_fkey"
            columns: ["nutritionist_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_nutritionist_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "store_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_nutritionist_assignments_seller_coach_id_fkey"
            columns: ["seller_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_payment_cards: {
        Row: {
          brand: string | null
          cardholder_name: string | null
          created_at: string
          expiration_month: number | null
          expiration_year: number | null
          first_six: string | null
          id: string
          is_default: boolean
          issuer_id: string | null
          last_four: string | null
          mp_card_id: string
          mp_customer_id: string | null
          payer_email: string | null
          payment_method_id: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          cardholder_name?: string | null
          created_at?: string
          expiration_month?: number | null
          expiration_year?: number | null
          first_six?: string | null
          id?: string
          is_default?: boolean
          issuer_id?: string | null
          last_four?: string | null
          mp_card_id: string
          mp_customer_id?: string | null
          payer_email?: string | null
          payment_method_id?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          cardholder_name?: string | null
          created_at?: string
          expiration_month?: number | null
          expiration_year?: number | null
          first_six?: string | null
          id?: string
          is_default?: boolean
          issuer_id?: string | null
          last_four?: string | null
          mp_card_id?: string
          mp_customer_id?: string | null
          payer_email?: string | null
          payment_method_id?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_payment_cards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      store_categories: {
        Row: {
          card_height: number | null
          card_width: number | null
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          pending: boolean
          section_id: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          card_height?: number | null
          card_width?: number | null
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          pending?: boolean
          section_id: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          card_height?: number | null
          card_width?: number | null
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          pending?: boolean
          section_id?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_categories_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "store_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      store_order_items: {
        Row: {
          created_at: string
          digital_product_id: string | null
          id: string
          metadata: Json
          order_id: string
          product_id: string | null
          product_kind: string
          quantity: number
          store_product_id: string | null
          title: string
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          digital_product_id?: string | null
          id?: string
          metadata?: Json
          order_id: string
          product_id?: string | null
          product_kind: string
          quantity?: number
          store_product_id?: string | null
          title: string
          total_price?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          digital_product_id?: string | null
          id?: string
          metadata?: Json
          order_id?: string
          product_id?: string | null
          product_kind?: string
          quantity?: number
          store_product_id?: string | null
          title?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "store_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      store_orders: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          mp_payment_id: string | null
          notes: string | null
          order_number: string
          payment_fee: number
          payment_method: Database["public"]["Enums"]["payment_method"]
          referrer_student_id: string | null
          shipping_address: string | null
          shipping_city: string | null
          shipping_name: string | null
          shipping_phone: string | null
          shipping_state: string | null
          shipping_zip: string | null
          status: string
          student_id: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          mp_payment_id?: string | null
          notes?: string | null
          order_number?: string
          payment_fee?: number
          payment_method?: Database["public"]["Enums"]["payment_method"]
          referrer_student_id?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_name?: string | null
          shipping_phone?: string | null
          shipping_state?: string | null
          shipping_zip?: string | null
          status?: string
          student_id: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          mp_payment_id?: string | null
          notes?: string | null
          order_number?: string
          payment_fee?: number
          payment_method?: Database["public"]["Enums"]["payment_method"]
          referrer_student_id?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_name?: string | null
          shipping_phone?: string | null
          shipping_state?: string | null
          shipping_zip?: string | null
          status?: string
          student_id?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_orders_mp_payment_id_fkey"
            columns: ["mp_payment_id"]
            isOneToOne: false
            referencedRelation: "mercadopago_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_orders_referrer_student_id_fkey"
            columns: ["referrer_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_orders_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      store_products: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          herbalife_product_code: string | null
          id: string
          image_url: string | null
          is_herbalife: boolean | null
          name: string
          original_price: number | null
          price: number
          sort_order: number | null
          status: string | null
          stock: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          herbalife_product_code?: string | null
          id?: string
          image_url?: string | null
          is_herbalife?: boolean | null
          name: string
          original_price?: number | null
          price: number
          sort_order?: number | null
          status?: string | null
          stock?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          herbalife_product_code?: string | null
          id?: string
          image_url?: string | null
          is_herbalife?: boolean | null
          name?: string
          original_price?: number | null
          price?: number
          sort_order?: number | null
          status?: string | null
          stock?: number | null
        }
        Relationships: []
      }
      store_sections: {
        Row: {
          card_height: number | null
          card_width: number | null
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          pending: boolean
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          card_height?: number | null
          card_width?: number | null
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          pending?: boolean
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          card_height?: number | null
          card_width?: number | null
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          pending?: boolean
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      student_challenge_tokens: {
        Row: {
          consumed_at: string | null
          consumed_competition_id: string | null
          consumed_enrollment_id: string | null
          created_at: string
          granted_at: string
          granted_by: string
          id: string
          notes: string | null
          source_product_id: string | null
          source_transaction_id: string | null
          student_id: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_competition_id?: string | null
          consumed_enrollment_id?: string | null
          created_at?: string
          granted_at?: string
          granted_by?: string
          id?: string
          notes?: string | null
          source_product_id?: string | null
          source_transaction_id?: string | null
          student_id: string
        }
        Update: {
          consumed_at?: string | null
          consumed_competition_id?: string | null
          consumed_enrollment_id?: string | null
          created_at?: string
          granted_at?: string
          granted_by?: string
          id?: string
          notes?: string | null
          source_product_id?: string | null
          source_transaction_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_challenge_tokens_consumed_competition_id_fkey"
            columns: ["consumed_competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_challenge_tokens_consumed_enrollment_id_fkey"
            columns: ["consumed_enrollment_id"]
            isOneToOne: false
            referencedRelation: "competition_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_challenge_tokens_source_product_id_fkey"
            columns: ["source_product_id"]
            isOneToOne: false
            referencedRelation: "product_commission_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_challenge_tokens_source_product_id_fkey"
            columns: ["source_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_challenge_tokens_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_challenge_tokens_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_checkin_scans: {
        Row: {
          id: string
          location: string | null
          notes: string | null
          scanned_at: string
          scanned_by_profile_id: string | null
          student_id: string
        }
        Insert: {
          id?: string
          location?: string | null
          notes?: string | null
          scanned_at?: string
          scanned_by_profile_id?: string | null
          student_id: string
        }
        Update: {
          id?: string
          location?: string | null
          notes?: string | null
          scanned_at?: string
          scanned_by_profile_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_checkin_scans_scanned_by_profile_id_fkey"
            columns: ["scanned_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_checkin_scans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_medical_confidential_notes: {
        Row: {
          author_profile_id: string
          content: string
          created_at: string
          id: string
          student_id: string
          title: string
          updated_at: string
        }
        Insert: {
          author_profile_id: string
          content: string
          created_at?: string
          id?: string
          student_id: string
          title: string
          updated_at?: string
        }
        Update: {
          author_profile_id?: string
          content?: string
          created_at?: string
          id?: string
          student_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_medical_confidential_notes_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_medical_confidential_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_protocols: {
        Row: {
          coach_id: string
          created_at: string
          daily_calorie_goal: number | null
          evaluation_client_id: string | null
          general_notes: string | null
          id: string
          ideal_times: Json
          marmita_tips: string | null
          meal_notes: Json
          meal_plan: Json
          meals_per_day: number | null
          restrictions: Json
          shopping_list: string | null
          student_id: string | null
          updated_at: string
          water_goal_ml: number | null
          weight_goal: number | null
          workout_goal: string | null
          workout_level: string | null
          workout_name: string | null
          workout_plan: Json
        }
        Insert: {
          coach_id: string
          created_at?: string
          daily_calorie_goal?: number | null
          evaluation_client_id?: string | null
          general_notes?: string | null
          id?: string
          ideal_times?: Json
          marmita_tips?: string | null
          meal_notes?: Json
          meal_plan?: Json
          meals_per_day?: number | null
          restrictions?: Json
          shopping_list?: string | null
          student_id?: string | null
          updated_at?: string
          water_goal_ml?: number | null
          weight_goal?: number | null
          workout_goal?: string | null
          workout_level?: string | null
          workout_name?: string | null
          workout_plan?: Json
        }
        Update: {
          coach_id?: string
          created_at?: string
          daily_calorie_goal?: number | null
          evaluation_client_id?: string | null
          general_notes?: string | null
          id?: string
          ideal_times?: Json
          marmita_tips?: string | null
          meal_notes?: Json
          meal_plan?: Json
          meals_per_day?: number | null
          restrictions?: Json
          shopping_list?: string | null
          student_id?: string | null
          updated_at?: string
          water_goal_ml?: number | null
          weight_goal?: number | null
          workout_goal?: string | null
          workout_level?: string | null
          workout_name?: string | null
          workout_plan?: Json
        }
        Relationships: [
          {
            foreignKeyName: "student_protocols_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_protocols_evaluation_client_id_fkey"
            columns: ["evaluation_client_id"]
            isOneToOne: false
            referencedRelation: "coach_evaluation_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_protocols_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_wallets: {
        Row: {
          available_balance: number | null
          id: string
          pending_balance: number | null
          student_id: string
          total_earned: number | null
          total_withdrawn: number | null
          updated_at: string | null
        }
        Insert: {
          available_balance?: number | null
          id?: string
          pending_balance?: number | null
          student_id: string
          total_earned?: number | null
          total_withdrawn?: number | null
          updated_at?: string | null
        }
        Update: {
          available_balance?: number | null
          id?: string
          pending_balance?: number | null
          student_id?: string
          total_earned?: number | null
          total_withdrawn?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_wallets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_water_logs: {
        Row: {
          amount_ml: number
          created_at: string
          id: string
          log_date: string
          student_id: string
        }
        Insert: {
          amount_ml: number
          created_at?: string
          id?: string
          log_date?: string
          student_id: string
        }
        Update: {
          amount_ml?: number
          created_at?: string
          id?: string
          log_date?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_water_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_withdrawal_requests: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          bank_account: string | null
          bank_account_type: string | null
          bank_agency: string | null
          bank_name: string | null
          holder_cpf: string | null
          holder_name: string | null
          id: string
          notes: string | null
          paid_at: string | null
          pix_key: string | null
          pix_key_type: string | null
          requested_at: string | null
          status: Database["public"]["Enums"]["withdrawal_status"] | null
          student_id: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          holder_cpf?: string | null
          holder_name?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          requested_at?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"] | null
          student_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          holder_cpf?: string | null
          holder_name?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          requested_at?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"] | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_withdrawal_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_withdrawal_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          activity_factor: number | null
          bioimpedance_date: string | null
          bmr: number | null
          body_fat_percentage: number | null
          body_water_percentage: number | null
          bone_mass: number | null
          card_valid_until: string | null
          coach_account_created_at: string | null
          coach_course_completed_at: string | null
          coach_id: string
          completed_coach_course: boolean | null
          created_at: string | null
          current_weight: number | null
          daily_calories_goal: number | null
          food_restrictions: string[]
          goal_description: string | null
          goal_weight: number | null
          health_goals_updated_at: string | null
          height: number | null
          id: string
          metabolic_age: number | null
          muscle_mass: number | null
          notes: string | null
          partner_id: string | null
          profile_id: string
          referral_code: string | null
          referral_link: string | null
          referred_by_student_id: string | null
          target_fat_percentage: number | null
          target_muscle_mass: number | null
          updated_at: string | null
          visceral_fat: number | null
          water_goal_ml: number | null
        }
        Insert: {
          activity_factor?: number | null
          bioimpedance_date?: string | null
          bmr?: number | null
          body_fat_percentage?: number | null
          body_water_percentage?: number | null
          bone_mass?: number | null
          card_valid_until?: string | null
          coach_account_created_at?: string | null
          coach_course_completed_at?: string | null
          coach_id: string
          completed_coach_course?: boolean | null
          created_at?: string | null
          current_weight?: number | null
          daily_calories_goal?: number | null
          food_restrictions?: string[]
          goal_description?: string | null
          goal_weight?: number | null
          health_goals_updated_at?: string | null
          height?: number | null
          id?: string
          metabolic_age?: number | null
          muscle_mass?: number | null
          notes?: string | null
          partner_id?: string | null
          profile_id: string
          referral_code?: string | null
          referral_link?: string | null
          referred_by_student_id?: string | null
          target_fat_percentage?: number | null
          target_muscle_mass?: number | null
          updated_at?: string | null
          visceral_fat?: number | null
          water_goal_ml?: number | null
        }
        Update: {
          activity_factor?: number | null
          bioimpedance_date?: string | null
          bmr?: number | null
          body_fat_percentage?: number | null
          body_water_percentage?: number | null
          bone_mass?: number | null
          card_valid_until?: string | null
          coach_account_created_at?: string | null
          coach_course_completed_at?: string | null
          coach_id?: string
          completed_coach_course?: boolean | null
          created_at?: string | null
          current_weight?: number | null
          daily_calories_goal?: number | null
          food_restrictions?: string[]
          goal_description?: string | null
          goal_weight?: number | null
          health_goals_updated_at?: string | null
          height?: number | null
          id?: string
          metabolic_age?: number | null
          muscle_mass?: number | null
          notes?: string | null
          partner_id?: string | null
          profile_id?: string
          referral_code?: string | null
          referral_link?: string | null
          referred_by_student_id?: string | null
          target_fat_percentage?: number | null
          target_muscle_mass?: number | null
          updated_at?: string | null
          visceral_fat?: number | null
          water_goal_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "students_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_referred_by_student_id_fkey"
            columns: ["referred_by_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          auto_renew: boolean | null
          created_at: string | null
          end_date: string
          id: string
          installments: number | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_method_token: string | null
          product_id: string
          start_date: string
          status: Database["public"]["Enums"]["subscription_status"] | null
          student_id: string
          updated_at: string | null
        }
        Insert: {
          auto_renew?: boolean | null
          created_at?: string | null
          end_date: string
          id?: string
          installments?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_method_token?: string | null
          product_id: string
          start_date: string
          status?: Database["public"]["Enums"]["subscription_status"] | null
          student_id: string
          updated_at?: string | null
        }
        Update: {
          auto_renew?: boolean | null
          created_at?: string | null
          end_date?: string
          id?: string
          installments?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_method_token?: string | null
          product_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"] | null
          student_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_commission_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      system_fee_payouts: {
        Row: {
          amount: number
          created_at: string
          id: string
          kind: string
          notes: string | null
          paid_at: string
          paid_by: string | null
          payment_method: string | null
          transaction_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          kind: string
          notes?: string | null
          paid_at?: string
          paid_by?: string | null
          payment_method?: string | null
          transaction_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          kind?: string
          notes?: string | null
          paid_at?: string
          paid_by?: string | null
          payment_method?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_fee_payouts_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_fee_payouts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      test_simulated_sales: {
        Row: {
          buyer_student_id: string | null
          created_at: string
          created_by_admin_profile_id: string | null
          flow_summary: Json
          gross_amount: number | null
          id: string
          label: string | null
          product_ref: string | null
          reverted_at: string | null
          seller_coach_id: string | null
          source_id: string
          source_kind: string
          wallets_snapshot: Json
        }
        Insert: {
          buyer_student_id?: string | null
          created_at?: string
          created_by_admin_profile_id?: string | null
          flow_summary?: Json
          gross_amount?: number | null
          id?: string
          label?: string | null
          product_ref?: string | null
          reverted_at?: string | null
          seller_coach_id?: string | null
          source_id: string
          source_kind: string
          wallets_snapshot?: Json
        }
        Update: {
          buyer_student_id?: string | null
          created_at?: string
          created_by_admin_profile_id?: string | null
          flow_summary?: Json
          gross_amount?: number | null
          id?: string
          label?: string | null
          product_ref?: string | null
          reverted_at?: string | null
          seller_coach_id?: string | null
          source_id?: string
          source_kind?: string
          wallets_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "test_simulated_sales_created_by_admin_profile_id_fkey"
            columns: ["created_by_admin_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_professional_assignments: {
        Row: {
          assigned_coach_id: string | null
          assignment_reason: string | null
          created_at: string
          delivered_at: string | null
          id: string
          preferred_coach_id: string | null
          specialty_key: string
          status: string
          transaction_id: string
          updated_at: string
        }
        Insert: {
          assigned_coach_id?: string | null
          assignment_reason?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          preferred_coach_id?: string | null
          specialty_key: string
          status?: string
          transaction_id: string
          updated_at?: string
        }
        Update: {
          assigned_coach_id?: string | null
          assignment_reason?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          preferred_coach_id?: string | null
          specialty_key?: string
          status?: string
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_professional_assignments_assigned_coach_id_fkey"
            columns: ["assigned_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_professional_assignments_preferred_coach_id_fkey"
            columns: ["preferred_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_professional_assignments_specialty_key_fkey"
            columns: ["specialty_key"]
            isOneToOne: false
            referencedRelation: "professional_specialties"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "transaction_professional_assignments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          app_fee: number | null
          created_at: string | null
          digital_product_id: string | null
          gateway_transaction_id: string | null
          gross_amount: number
          id: string
          installments: number | null
          metadata: Json | null
          mp_payment_id: string | null
          net_amount: number
          paid_at: string | null
          payment_fee: number | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          product_id: string
          purchase_type: string | null
          referrer_student_id: string | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          store_product_id: string | null
          student_id: string
          subscription_id: string | null
          tax_amount: number | null
        }
        Insert: {
          app_fee?: number | null
          created_at?: string | null
          digital_product_id?: string | null
          gateway_transaction_id?: string | null
          gross_amount: number
          id?: string
          installments?: number | null
          metadata?: Json | null
          mp_payment_id?: string | null
          net_amount: number
          paid_at?: string | null
          payment_fee?: number | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          product_id: string
          purchase_type?: string | null
          referrer_student_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          store_product_id?: string | null
          student_id: string
          subscription_id?: string | null
          tax_amount?: number | null
        }
        Update: {
          app_fee?: number | null
          created_at?: string | null
          digital_product_id?: string | null
          gateway_transaction_id?: string | null
          gross_amount?: number
          id?: string
          installments?: number | null
          metadata?: Json | null
          mp_payment_id?: string | null
          net_amount?: number
          paid_at?: string | null
          payment_fee?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          product_id?: string
          purchase_type?: string | null
          referrer_student_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          store_product_id?: string | null
          student_id?: string
          subscription_id?: string | null
          tax_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_mp_payment_id_fkey"
            columns: ["mp_payment_id"]
            isOneToOne: false
            referencedRelation: "mercadopago_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_commission_preview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_referrer_student_id_fkey"
            columns: ["referrer_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          available_balance: number | null
          id: string
          pending_balance: number | null
          profile_id: string
          total_earned: number | null
          total_withdrawn: number | null
          updated_at: string | null
        }
        Insert: {
          available_balance?: number | null
          id?: string
          pending_balance?: number | null
          profile_id: string
          total_earned?: number | null
          total_withdrawn?: number | null
          updated_at?: string | null
        }
        Update: {
          available_balance?: number | null
          id?: string
          pending_balance?: number | null
          profile_id?: string
          total_earned?: number | null
          total_withdrawn?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallets_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_logs: {
        Row: {
          arm_cm: number | null
          chest_cm: number | null
          created_at: string | null
          hip_cm: number | null
          id: string
          log_date: string
          notes: string | null
          photo_url: string | null
          student_id: string
          subscription_id: string | null
          thigh_cm: number | null
          type: string | null
          waist_cm: number | null
          weight: number
        }
        Insert: {
          arm_cm?: number | null
          chest_cm?: number | null
          created_at?: string | null
          hip_cm?: number | null
          id?: string
          log_date: string
          notes?: string | null
          photo_url?: string | null
          student_id: string
          subscription_id?: string | null
          thigh_cm?: number | null
          type?: string | null
          waist_cm?: number | null
          weight: number
        }
        Update: {
          arm_cm?: number | null
          chest_cm?: number | null
          created_at?: string | null
          hip_cm?: number | null
          id?: string
          log_date?: string
          notes?: string | null
          photo_url?: string | null
          student_id?: string
          subscription_id?: string | null
          thigh_cm?: number | null
          type?: string | null
          waist_cm?: number | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "weight_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weight_logs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      window_method_logs: {
        Row: {
          created_at: string
          goal: string
          id: string
          log_date: string
          meal_1_carb: boolean
          meal_1_exercise: boolean
          meal_1_fiber: boolean
          meal_1_protein: boolean
          meal_2_carb: boolean
          meal_2_exercise: boolean
          meal_2_fiber: boolean
          meal_2_protein: boolean
          meal_3_carb: boolean
          meal_3_exercise: boolean
          meal_3_fiber: boolean
          meal_3_protein: boolean
          meal_4_carb: boolean
          meal_4_exercise: boolean
          meal_4_fiber: boolean
          meal_4_protein: boolean
          meal_5_carb: boolean
          meal_5_exercise: boolean
          meal_5_fiber: boolean
          meal_5_protein: boolean
          meal_6_carb: boolean
          meal_6_exercise: boolean
          meal_6_fiber: boolean
          meal_6_protein: boolean
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          goal: string
          id?: string
          log_date?: string
          meal_1_carb?: boolean
          meal_1_exercise?: boolean
          meal_1_fiber?: boolean
          meal_1_protein?: boolean
          meal_2_carb?: boolean
          meal_2_exercise?: boolean
          meal_2_fiber?: boolean
          meal_2_protein?: boolean
          meal_3_carb?: boolean
          meal_3_exercise?: boolean
          meal_3_fiber?: boolean
          meal_3_protein?: boolean
          meal_4_carb?: boolean
          meal_4_exercise?: boolean
          meal_4_fiber?: boolean
          meal_4_protein?: boolean
          meal_5_carb?: boolean
          meal_5_exercise?: boolean
          meal_5_fiber?: boolean
          meal_5_protein?: boolean
          meal_6_carb?: boolean
          meal_6_exercise?: boolean
          meal_6_fiber?: boolean
          meal_6_protein?: boolean
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          goal?: string
          id?: string
          log_date?: string
          meal_1_carb?: boolean
          meal_1_exercise?: boolean
          meal_1_fiber?: boolean
          meal_1_protein?: boolean
          meal_2_carb?: boolean
          meal_2_exercise?: boolean
          meal_2_fiber?: boolean
          meal_2_protein?: boolean
          meal_3_carb?: boolean
          meal_3_exercise?: boolean
          meal_3_fiber?: boolean
          meal_3_protein?: boolean
          meal_4_carb?: boolean
          meal_4_exercise?: boolean
          meal_4_fiber?: boolean
          meal_4_protein?: boolean
          meal_5_carb?: boolean
          meal_5_exercise?: boolean
          meal_5_fiber?: boolean
          meal_5_protein?: boolean
          meal_6_carb?: boolean
          meal_6_exercise?: boolean
          meal_6_fiber?: boolean
          meal_6_protein?: boolean
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "window_method_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawal_requests: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          id: string
          notes: string | null
          paid_at: string | null
          pix_key: string | null
          pix_key_type: string | null
          profile_id: string
          requested_at: string | null
          status: Database["public"]["Enums"]["withdrawal_status"] | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          profile_id: string
          requested_at?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"] | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          profile_id?: string
          requested_at?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_achievements: {
        Row: {
          code: string
          description: string | null
          earned_at: string
          icon: string | null
          id: string
          student_id: string
          title: string
        }
        Insert: {
          code: string
          description?: string | null
          earned_at?: string
          icon?: string | null
          id?: string
          student_id: string
          title: string
        }
        Update: {
          code?: string
          description?: string | null
          earned_at?: string
          icon?: string | null
          id?: string
          student_id?: string
          title?: string
        }
        Relationships: []
      }
      workout_cardio_logs: {
        Row: {
          calories: number | null
          completed_at: string
          distance_km: number | null
          duration_min: number | null
          elevation: number | null
          exercise_id: string
          id: string
          pace: string | null
          session_id: string
          speed: number | null
        }
        Insert: {
          calories?: number | null
          completed_at?: string
          distance_km?: number | null
          duration_min?: number | null
          elevation?: number | null
          exercise_id: string
          id?: string
          pace?: string | null
          session_id: string
          speed?: number | null
        }
        Update: {
          calories?: number | null
          completed_at?: string
          distance_km?: number | null
          duration_min?: number | null
          elevation?: number | null
          exercise_id?: string
          id?: string
          pace?: string | null
          session_id?: string
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_cardio_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_cardio_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_exercises: {
        Row: {
          cardio_duration_min: number | null
          cardio_elevation: number | null
          cardio_pace: string | null
          cardio_speed: number | null
          created_at: string
          equipment_config: string | null
          equipment_config_user: string | null
          exercise_name: string
          exercise_ref_id: string | null
          id: string
          is_cardio: boolean
          load_kg: number | null
          media_url: string | null
          notes: string | null
          order_index: number
          plan_id: string
          reps: string | null
          rest_seconds: number
          rest_seconds_max: number | null
          sets: number
        }
        Insert: {
          cardio_duration_min?: number | null
          cardio_elevation?: number | null
          cardio_pace?: string | null
          cardio_speed?: number | null
          created_at?: string
          equipment_config?: string | null
          equipment_config_user?: string | null
          exercise_name: string
          exercise_ref_id?: string | null
          id?: string
          is_cardio?: boolean
          load_kg?: number | null
          media_url?: string | null
          notes?: string | null
          order_index?: number
          plan_id: string
          reps?: string | null
          rest_seconds?: number
          rest_seconds_max?: number | null
          sets?: number
        }
        Update: {
          cardio_duration_min?: number | null
          cardio_elevation?: number | null
          cardio_pace?: string | null
          cardio_speed?: number | null
          created_at?: string
          equipment_config?: string | null
          equipment_config_user?: string | null
          exercise_name?: string
          exercise_ref_id?: string | null
          id?: string
          is_cardio?: boolean
          load_kg?: number | null
          media_url?: string | null
          notes?: string | null
          order_index?: number
          plan_id?: string
          reps?: string | null
          rest_seconds?: number
          rest_seconds_max?: number | null
          sets?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercises_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_plans: {
        Row: {
          active: boolean
          coach_id: string | null
          created_at: string
          day_of_week: number | null
          id: string
          letter: string | null
          name: string
          notes: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          coach_id?: string | null
          created_at?: string
          day_of_week?: number | null
          id?: string
          letter?: string | null
          name: string
          notes?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          coach_id?: string | null
          created_at?: string
          day_of_week?: number | null
          id?: string
          letter?: string | null
          name?: string
          notes?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      workout_session_logs: {
        Row: {
          completed_at: string
          equipment_config: string | null
          exercise_id: string
          id: string
          load_kg: number | null
          reps_done: number | null
          rest_exceeded: boolean
          rest_seconds_actual: number | null
          session_id: string
          set_number: number
        }
        Insert: {
          completed_at?: string
          equipment_config?: string | null
          exercise_id: string
          id?: string
          load_kg?: number | null
          reps_done?: number | null
          rest_exceeded?: boolean
          rest_seconds_actual?: number | null
          session_id: string
          set_number: number
        }
        Update: {
          completed_at?: string
          equipment_config?: string | null
          exercise_id?: string
          id?: string
          load_kg?: number | null
          reps_done?: number | null
          rest_exceeded?: boolean
          rest_seconds_actual?: number | null
          session_id?: string
          set_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_session_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_session_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          completion_pct: number
          ended_at: string | null
          id: string
          notes: string | null
          plan_id: string
          started_at: string
          student_id: string
          total_seconds: number | null
          xp_earned: number
        }
        Insert: {
          completion_pct?: number
          ended_at?: string | null
          id?: string
          notes?: string | null
          plan_id: string
          started_at?: string
          student_id: string
          total_seconds?: number | null
          xp_earned?: number
        }
        Update: {
          completion_pct?: number
          ended_at?: string | null
          id?: string
          notes?: string | null
          plan_id?: string
          started_at?: string
          student_id?: string
          total_seconds?: number | null
          xp_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_templates: {
        Row: {
          created_at: string
          created_by_coach_id: string | null
          description: string | null
          goal: string
          id: string
          is_active: boolean
          is_global: boolean
          items: Json
          level: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          goal?: string
          id?: string
          is_active?: boolean
          is_global?: boolean
          items?: Json
          level?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          goal?: string
          id?: string
          is_active?: boolean
          is_global?: boolean
          items?: Json
          level?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_templates_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      product_commission_preview: {
        Row: {
          app_fee: number | null
          commission_coach: number | null
          commission_level1: number | null
          commission_level2: number | null
          commission_level3: number | null
          credit_coach_commission: number | null
          credit_fee_percentage: number | null
          credit_gateway_fee: number | null
          credit_tax: number | null
          debit_fee_percentage: number | null
          id: string | null
          name: string | null
          nutritionist_fee: number | null
          pix_coach_commission: number | null
          pix_commission_base: number | null
          pix_fee_percentage: number | null
          pix_gateway_fee: number | null
          pix_tax: number | null
          price: number | null
          product_type: Database["public"]["Enums"]["product_type"] | null
          tax_percentage: number | null
        }
        Insert: {
          app_fee?: number | null
          commission_coach?: number | null
          commission_level1?: number | null
          commission_level2?: number | null
          commission_level3?: number | null
          credit_coach_commission?: never
          credit_fee_percentage?: number | null
          credit_gateway_fee?: never
          credit_tax?: never
          debit_fee_percentage?: number | null
          id?: string | null
          name?: string | null
          nutritionist_fee?: number | null
          pix_coach_commission?: never
          pix_commission_base?: never
          pix_fee_percentage?: number | null
          pix_gateway_fee?: never
          pix_tax?: never
          price?: number | null
          product_type?: Database["public"]["Enums"]["product_type"] | null
          tax_percentage?: number | null
        }
        Update: {
          app_fee?: number | null
          commission_coach?: number | null
          commission_level1?: number | null
          commission_level2?: number | null
          commission_level3?: number | null
          credit_coach_commission?: never
          credit_fee_percentage?: number | null
          credit_gateway_fee?: never
          credit_tax?: never
          debit_fee_percentage?: number | null
          id?: string | null
          name?: string | null
          nutritionist_fee?: number | null
          pix_coach_commission?: never
          pix_commission_base?: never
          pix_fee_percentage?: number | null
          pix_gateway_fee?: never
          pix_tax?: never
          price?: number | null
          product_type?: Database["public"]["Enums"]["product_type"] | null
          tax_percentage?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_change_student_coach: {
        Args: { _new_coach_id: string; _student_id: string }
        Returns: undefined
      }
      admin_set_coach_card_validity: {
        Args: { _coach_id: string; _valid_until: string }
        Returns: undefined
      }
      assign_professionals_for_transaction: {
        Args: { _transaction_id: string }
        Returns: number
      }
      backfill_career_points: { Args: never; Returns: Json }
      block_inactive_coach: {
        Args: { _coach_id: string; _reason?: string }
        Returns: undefined
      }
      cancel_nutritionist_blocked_entry: {
        Args: { _entry_id: string; _notes?: string }
        Returns: undefined
      }
      coach_gets_product_free: {
        Args: { _coach_id: string; _product_id: string }
        Returns: boolean
      }
      coach_has_fitmindshape_bypass: {
        Args: { _coach_id: string }
        Returns: boolean
      }
      count_active_admins: { Args: never; Returns: number }
      create_coach_sale: {
        Args: {
          _client_id: string
          _items: Json
          _notes?: string
          _payment_method?: Database["public"]["Enums"]["payment_method"]
        }
        Returns: {
          order_id: string
          order_number: string
          total: number
        }[]
      }
      create_partner_company_order: {
        Args: {
          _partner_product_id: string
          _payment_method?: string
          _student_id?: string
        }
        Returns: string
      }
      create_partner_product_order: {
        Args: {
          _buyer_student_id?: string
          _payment_method?: string
          _professional_product_id: string
        }
        Returns: string
      }
      create_scheduled_professional_order: {
        Args: {
          _buyer_student_id?: string
          _payment_method?: string
          _professional_product_id: string
          _starts_at: string
        }
        Returns: string
      }
      create_store_order: {
        Args: {
          _items: Json
          _notes?: string
          _payment_method?: Database["public"]["Enums"]["payment_method"]
          _referrer_student_id?: string
          _shipping?: Json
        }
        Returns: string
      }
      current_coach_id: { Args: never; Returns: string }
      current_partner_id: { Args: never; Returns: string }
      current_profile_id: { Args: never; Returns: string }
      current_student_id: { Args: never; Returns: string }
      enqueue_daily_student_reminders: { Args: never; Returns: number }
      enroll_student_in_competition: {
        Args: { _gender?: string; _student_id: string }
        Returns: string
      }
      extend_coach_card_access: {
        Args: { _coach_id: string; _days: number }
        Returns: undefined
      }
      extend_coach_inactivity_grace: {
        Args: { _coach_id: string; _days?: number; _reason?: string }
        Returns: undefined
      }
      extend_student_card_access: {
        Args: { _days: number; _student_id: string }
        Returns: undefined
      }
      find_hbl_coach_for: { Args: { _coach_id: string }; Returns: string }
      find_master_coach_for: { Args: { _coach_id: string }; Returns: string }
      find_nutritionist_for: { Args: { _coach_id: string }; Returns: string }
      find_student_id_by_email: { Args: { _email: string }; Returns: string }
      find_upline_with_badge: {
        Args: {
          _badge: Database["public"]["Enums"]["coach_badge_key"]
          _coach_id: string
        }
        Returns: string
      }
      generate_competition_groups: {
        Args: { _competition_id: string; _month: number; _year: number }
        Returns: undefined
      }
      generate_competition_reminders: { Args: never; Returns: number }
      get_fitmind_events: {
        Args: { _from?: string; _to?: string }
        Returns: {
          all_day: boolean
          category: Database["public"]["Enums"]["event_category"]
          color: string
          description: string
          ends_at: string
          google_calendar_description: string
          google_calendar_location: string
          google_calendar_title: string
          highlight_color: string
          highlight_label: string
          id: string
          image_url: string
          is_highlighted: boolean
          is_important: boolean
          location: string
          starts_at: string
          subtitle: string
          tags: string[]
          title: string
          visibility: Database["public"]["Enums"]["event_visibility"]
        }[]
      }
      get_or_create_daily_quote: { Args: never; Returns: Json }
      get_student_attendance_summary: {
        Args: { _student_id?: string }
        Returns: Json
      }
      has_coach_badge: {
        Args: {
          _badge: Database["public"]["Enums"]["coach_badge_key"]
          _coach_id: string
        }
        Returns: boolean
      }
      increment_share_view: { Args: { p_token: string }; Returns: undefined }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_coach: { Args: { _user_id: string }; Returns: boolean }
      is_master_admin: { Args: { _user_id: string }; Returns: boolean }
      is_master_coach: { Args: { _coach_id: string }; Returns: boolean }
      join_student_challenge_group: {
        Args: { _group_id: string }
        Returns: undefined
      }
      list_all_students_for_master: {
        Args: { _q?: string }
        Returns: {
          coach_id: string
          coach_name: string
          cpf: string
          email: string
          id: string
          name: string
          phone: string
        }[]
      }
      list_coach_team_clients: {
        Args: never
        Returns: {
          coach_id: string
          cpf: string
          email: string
          id: string
          name: string
          phone: string
        }[]
      }
      list_professional_available_slots: {
        Args: {
          _coach_id: string
          _duration_minutes?: number
          _from: string
          _to: string
        }
        Returns: {
          slot_end: string
          slot_start: string
        }[]
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_coach_course_module_complete: {
        Args: { _module_id: string }
        Returns: Json
      }
      mark_notification_read: {
        Args: { _notification_id: string }
        Returns: undefined
      }
      mark_order_pool_entry_status: {
        Args: {
          _entry_id: string
          _notes?: string
          _status: Database["public"]["Enums"]["order_pool_status"]
          _tracking?: string
        }
        Returns: undefined
      }
      notify_admin_pending_specialty: {
        Args: { _coach_id: string }
        Returns: undefined
      }
      partner_checkin: { Args: { _partner_id: string }; Returns: Json }
      partner_scan_student: { Args: { _student_id: string }; Returns: Json }
      pay_coach_available: {
        Args: { _kind?: string; _notes?: string; _profile_id: string }
        Returns: number
      }
      pay_nutritionist_available: {
        Args: { _notes?: string; _profile_id: string }
        Returns: number
      }
      pick_professional_for_sale: {
        Args: {
          _preferred_coach_id?: string
          _selling_coach_id: string
          _specialty_key: string
        }
        Returns: {
          coach_id: string
          reason: string
        }[]
      }
      process_paid_transaction: {
        Args: { _transaction_id: string }
        Returns: undefined
      }
      process_partner_product_order_paid: {
        Args: { _order_id: string }
        Returns: undefined
      }
      profile_has_approved_coach: {
        Args: { _profile_id: string }
        Returns: boolean
      }
      profile_is_referred_by_current_student: {
        Args: { _profile_id: string }
        Returns: boolean
      }
      profile_shares_group_with_current_user: {
        Args: { _profile_id: string }
        Returns: boolean
      }
      recalc_product_points: {
        Args: { _product_id: string }
        Returns: undefined
      }
      recalc_student_wallet_for_referral: {
        Args: { _student_id: string }
        Returns: undefined
      }
      recalc_wallet_for_profile: {
        Args: { _profile_id: string }
        Returns: undefined
      }
      redeem_freebie: { Args: { _freebie_id: string }; Returns: string }
      refresh_coach_inactivity: { Args: never; Returns: number }
      refresh_coach_patents: { Args: never; Returns: number }
      refresh_monthly_rankings: {
        Args: { _reference_month?: string }
        Returns: undefined
      }
      register_admin_wallet_debit: {
        Args: { p_amount: number; p_description: string }
        Returns: string
      }
      register_checkin_via_qr: {
        Args: { _location?: string; _notes?: string; _student_id: string }
        Returns: Json
      }
      release_available_commissions: { Args: never; Returns: number }
      release_nutritionist_blocked_entry: {
        Args: { _entry_id: string; _notes?: string }
        Returns: undefined
      }
      reset_expired_career_period_plans: { Args: never; Returns: undefined }
      review_coach_application: {
        Args: {
          _admin_notes?: string
          _application_id: string
          _status: string
        }
        Returns: undefined
      }
      slot_target_profile_id: {
        Args: {
          _slot: Database["public"]["Tables"]["product_value_slots"]["Row"]
        }
        Returns: string
      }
      student_check_in: {
        Args: { _activity_type?: string; _notes?: string }
        Returns: string
      }
      student_has_partner_benefits: {
        Args: { _student_id: string }
        Returns: boolean
      }
      submit_coach_application:
        | {
            Args: {
              _city?: string
              _experience?: string
              _motivation: string
              _phone?: string
            }
            Returns: string
          }
        | {
            Args: {
              _city?: string
              _experience?: string
              _motivation: string
              _phone?: string
              _selected_upline_coach_id?: string
            }
            Returns: string
          }
      touch_my_activity: { Args: never; Returns: undefined }
      transfer_inactive_coach_network: {
        Args: { _from_coach_id: string; _reason?: string; _to_coach_id: string }
        Returns: Json
      }
      unblock_coach: { Args: { _coach_id: string }; Returns: undefined }
      update_career_challenge_progress: {
        Args: { _coach_id: string; _points: number }
        Returns: undefined
      }
      update_career_period_plans: {
        Args: { _coach_id: string; _points: number }
        Returns: undefined
      }
      update_coach_withdrawal_status: {
        Args: {
          _notes?: string
          _status: Database["public"]["Enums"]["withdrawal_status"]
          _withdrawal_id: string
        }
        Returns: undefined
      }
      update_partner_product_order_status: {
        Args: { _note?: string; _order_id: string; _status: string }
        Returns: undefined
      }
      update_student_withdrawal_status: {
        Args: {
          _notes?: string
          _status: Database["public"]["Enums"]["withdrawal_status"]
          _withdrawal_id: string
        }
        Returns: undefined
      }
      upsert_monthly_ranking_on_sale: {
        Args: {
          _coach_id: string
          _month: string
          _points: number
          _revenue: number
        }
        Returns: undefined
      }
      validate_referral_code: {
        Args: { _code: string }
        Returns: {
          coach_id: string
          kind: string
          partner_id: string
          referred_by_student_id: string
          sponsor_name: string
          valid: boolean
        }[]
      }
    }
    Enums: {
      chat_permission:
        | "all_members"
        | "coaches_only"
        | "managers_only"
        | "admins_only"
      coach_badge_key:
        | "master_coach"
        | "coach_hbl_42"
        | "coach_hbl_50"
        | "nutritionist_partner"
        | "council"
        | "partnership_master"
      commission_status: "pending" | "available" | "withdrawn" | "cancelled"
      event_category:
        | "aula"
        | "workshop"
        | "desafio"
        | "palestra"
        | "avaliacao"
        | "comemorativo"
        | "networking"
        | "outro"
      event_visibility:
        | "todos"
        | "coaches"
        | "alunos"
        | "parceiros"
        | "profissionais"
      nutri_block_status: "blocked" | "released" | "cancelled" | "paid"
      order_pool_status:
        | "pending"
        | "preparing"
        | "shipped"
        | "delivered"
        | "cancelled"
      patent_level:
        | "coach"
        | "senior_coach"
        | "manager"
        | "senior_manager"
        | "director"
        | "senior_director"
        | "master_director"
      payment_method: "credit_card" | "debit_card" | "pix"
      product_type:
        | "challenge"
        | "physical"
        | "herbalife"
        | "enrollment"
        | "plan_30"
        | "protocol_90"
        | "digital_course"
        | "coach_training"
        | "health_pro_course"
        | "room_rental"
        | "live_class"
      subscription_status:
        | "active"
        | "expired"
        | "cancelled"
        | "pending_payment"
      transaction_status:
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
        | "chargeback"
      user_role:
        | "admin"
        | "director"
        | "manager"
        | "coach"
        | "student"
        | "partner"
      value_destination_type:
        | "admin_wallet"
        | "coach_wallet"
        | "network_l1"
        | "network_l2"
        | "network_l3"
        | "nutritionist_wallet"
        | "health_pro_wallet"
        | "product_order_pool"
        | "referral_student"
        | "master_coach_wallet"
        | "event_organizer"
        | "platform_reserve"
        | "payment_gateway"
        | "government_tax"
        | "custom"
        | "nutritionist_blocked"
      withdrawal_status:
        | "requested"
        | "approved"
        | "processing"
        | "paid"
        | "rejected"
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
      chat_permission: [
        "all_members",
        "coaches_only",
        "managers_only",
        "admins_only",
      ],
      coach_badge_key: [
        "master_coach",
        "coach_hbl_42",
        "coach_hbl_50",
        "nutritionist_partner",
        "council",
        "partnership_master",
      ],
      commission_status: ["pending", "available", "withdrawn", "cancelled"],
      event_category: [
        "aula",
        "workshop",
        "desafio",
        "palestra",
        "avaliacao",
        "comemorativo",
        "networking",
        "outro",
      ],
      event_visibility: [
        "todos",
        "coaches",
        "alunos",
        "parceiros",
        "profissionais",
      ],
      nutri_block_status: ["blocked", "released", "cancelled", "paid"],
      order_pool_status: [
        "pending",
        "preparing",
        "shipped",
        "delivered",
        "cancelled",
      ],
      patent_level: [
        "coach",
        "senior_coach",
        "manager",
        "senior_manager",
        "director",
        "senior_director",
        "master_director",
      ],
      payment_method: ["credit_card", "debit_card", "pix"],
      product_type: [
        "challenge",
        "physical",
        "herbalife",
        "enrollment",
        "plan_30",
        "protocol_90",
        "digital_course",
        "coach_training",
        "health_pro_course",
        "room_rental",
        "live_class",
      ],
      subscription_status: [
        "active",
        "expired",
        "cancelled",
        "pending_payment",
      ],
      transaction_status: [
        "pending",
        "paid",
        "failed",
        "refunded",
        "chargeback",
      ],
      user_role: [
        "admin",
        "director",
        "manager",
        "coach",
        "student",
        "partner",
      ],
      value_destination_type: [
        "admin_wallet",
        "coach_wallet",
        "network_l1",
        "network_l2",
        "network_l3",
        "nutritionist_wallet",
        "health_pro_wallet",
        "product_order_pool",
        "referral_student",
        "master_coach_wallet",
        "event_organizer",
        "platform_reserve",
        "payment_gateway",
        "government_tax",
        "custom",
        "nutritionist_blocked",
      ],
      withdrawal_status: [
        "requested",
        "approved",
        "processing",
        "paid",
        "rejected",
      ],
    },
  },
} as const
