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
      anamnesis_forms: {
        Row: {
          additional_observations: string | null
          alcohol_consumption: boolean | null
          alcohol_frequency: string | null
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
          id: string
          marital_status: string | null
          objective: string | null
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
          id?: string
          marital_status?: string | null
          objective?: string | null
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
          id?: string
          marital_status?: string | null
          objective?: string | null
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
      career_plan_config: {
        Row: {
          created_at: string | null
          description: string | null
          duration_months: number | null
          id: string
          is_active: boolean | null
          min_monthly_students: number | null
          must_be_top_seller: boolean | null
          name: string
          reward_description: string | null
          reward_details: string | null
          reward_value: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration_months?: number | null
          id?: string
          is_active?: boolean | null
          min_monthly_students?: number | null
          must_be_top_seller?: boolean | null
          name: string
          reward_description?: string | null
          reward_details?: string | null
          reward_value?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration_months?: number | null
          id?: string
          is_active?: boolean | null
          min_monthly_students?: number | null
          must_be_top_seller?: boolean | null
          name?: string
          reward_description?: string | null
          reward_details?: string | null
          reward_value?: number | null
        }
        Relationships: []
      }
      career_plan_progress: {
        Row: {
          best_streak: number | null
          career_plan_id: string
          coach_id: string
          consecutive_months_qualified: number | null
          created_at: string | null
          current_streak_active: boolean | null
          id: string
          reward_earned: boolean | null
          reward_earned_at: string | null
          start_month: string | null
        }
        Insert: {
          best_streak?: number | null
          career_plan_id: string
          coach_id: string
          consecutive_months_qualified?: number | null
          created_at?: string | null
          current_streak_active?: boolean | null
          id?: string
          reward_earned?: boolean | null
          reward_earned_at?: string | null
          start_month?: string | null
        }
        Update: {
          best_streak?: number | null
          career_plan_id?: string
          coach_id?: string
          consecutive_months_qualified?: number | null
          created_at?: string | null
          current_streak_active?: boolean | null
          id?: string
          reward_earned?: boolean | null
          reward_earned_at?: string | null
          start_month?: string | null
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
            referencedRelation: "products"
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
            referencedRelation: "products"
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
      coaches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bank_account: string | null
          bank_account_type: string | null
          bank_agency: string | null
          bank_name: string | null
          career_goal_progress: Json | null
          consecutive_months_as_top: number | null
          created_at: string | null
          herbalife_portal_url: string | null
          id: string
          inactive_since: string | null
          inactivity_warning_sent: boolean | null
          last_activity_at: string | null
          pix_key: string | null
          pix_key_type: string | null
          profile_id: string
          referral_code: string
          referral_link: string | null
          total_active_students: number | null
          total_sales: number | null
          transferred_at: string | null
          transferred_to_coach_id: string | null
          upline_coach_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          career_goal_progress?: Json | null
          consecutive_months_as_top?: number | null
          created_at?: string | null
          herbalife_portal_url?: string | null
          id?: string
          inactive_since?: string | null
          inactivity_warning_sent?: boolean | null
          last_activity_at?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          profile_id: string
          referral_code: string
          referral_link?: string | null
          total_active_students?: number | null
          total_sales?: number | null
          transferred_at?: string | null
          transferred_to_coach_id?: string | null
          upline_coach_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          career_goal_progress?: Json | null
          consecutive_months_as_top?: number | null
          created_at?: string | null
          herbalife_portal_url?: string | null
          id?: string
          inactive_since?: string | null
          inactivity_warning_sent?: boolean | null
          last_activity_at?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          profile_id?: string
          referral_code?: string
          referral_link?: string | null
          total_active_students?: number | null
          total_sales?: number | null
          transferred_at?: string | null
          transferred_to_coach_id?: string | null
          upline_coach_id?: string | null
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
          is_referral: boolean | null
          level: number
          percentage: number
          referred_by_student_id: string | null
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
          is_referral?: boolean | null
          level: number
          percentage: number
          referred_by_student_id?: string | null
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
          is_referral?: boolean | null
          level?: number
          percentage?: number
          referred_by_student_id?: string | null
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
      patent_rules: {
        Row: {
          badge_color: string
          badge_icon: string
          benefits: string | null
          can_access_reports: boolean | null
          created_at: string | null
          display_name: string
          id: string
          min_consecutive_months: number | null
          min_direct_students: number | null
          min_monthly_revenue: number | null
          min_network_students: number | null
          patent: Database["public"]["Enums"]["patent_level"]
          report_scope: string | null
          sort_order: number | null
        }
        Insert: {
          badge_color: string
          badge_icon: string
          benefits?: string | null
          can_access_reports?: boolean | null
          created_at?: string | null
          display_name: string
          id?: string
          min_consecutive_months?: number | null
          min_direct_students?: number | null
          min_monthly_revenue?: number | null
          min_network_students?: number | null
          patent: Database["public"]["Enums"]["patent_level"]
          report_scope?: string | null
          sort_order?: number | null
        }
        Update: {
          badge_color?: string
          badge_icon?: string
          benefits?: string | null
          can_access_reports?: boolean | null
          created_at?: string | null
          display_name?: string
          id?: string
          min_consecutive_months?: number | null
          min_direct_students?: number | null
          min_monthly_revenue?: number | null
          min_network_students?: number | null
          patent?: Database["public"]["Enums"]["patent_level"]
          report_scope?: string | null
          sort_order?: number | null
        }
        Relationships: []
      }
      products: {
        Row: {
          app_fee: number | null
          app_fee_percentage: number | null
          commission_coach: number | null
          commission_level1: number | null
          commission_level2: number | null
          commission_level3: number | null
          commission_level4: number | null
          commission_level5: number | null
          created_at: string | null
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
          id: string
          image_url: string | null
          max_installments: number | null
          name: string
          original_price: number | null
          pix_fee_percentage: number | null
          price: number
          referral_commission_percentage: number | null
          slug: string | null
          sort_order: number | null
          status: string | null
          tax_percentage: number | null
          type: Database["public"]["Enums"]["product_type"] | null
          updated_at: string | null
        }
        Insert: {
          app_fee?: number | null
          app_fee_percentage?: number | null
          commission_coach?: number | null
          commission_level1?: number | null
          commission_level2?: number | null
          commission_level3?: number | null
          commission_level4?: number | null
          commission_level5?: number | null
          created_at?: string | null
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
          id?: string
          image_url?: string | null
          max_installments?: number | null
          name: string
          original_price?: number | null
          pix_fee_percentage?: number | null
          price: number
          referral_commission_percentage?: number | null
          slug?: string | null
          sort_order?: number | null
          status?: string | null
          tax_percentage?: number | null
          type?: Database["public"]["Enums"]["product_type"] | null
          updated_at?: string | null
        }
        Update: {
          app_fee?: number | null
          app_fee_percentage?: number | null
          commission_coach?: number | null
          commission_level1?: number | null
          commission_level2?: number | null
          commission_level3?: number | null
          commission_level4?: number | null
          commission_level5?: number | null
          created_at?: string | null
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
          id?: string
          image_url?: string | null
          max_installments?: number | null
          name?: string
          original_price?: number | null
          pix_fee_percentage?: number | null
          price?: number
          referral_commission_percentage?: number | null
          slug?: string | null
          sort_order?: number | null
          status?: string | null
          tax_percentage?: number | null
          type?: Database["public"]["Enums"]["product_type"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          bio: string | null
          birthdate: string | null
          city: string | null
          cpf: string | null
          created_at: string | null
          email: string
          id: string
          name: string
          neighborhood: string | null
          number: string | null
          patent: Database["public"]["Enums"]["patent_level"] | null
          phone: string | null
          photo_url: string | null
          report_permissions: Json | null
          role: Database["public"]["Enums"]["user_role"]
          state: string | null
          status: string | null
          street: string | null
          updated_at: string | null
          user_id: string
          zip_code: string | null
        }
        Insert: {
          bio?: string | null
          birthdate?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string | null
          email: string
          id?: string
          name: string
          neighborhood?: string | null
          number?: string | null
          patent?: Database["public"]["Enums"]["patent_level"] | null
          phone?: string | null
          photo_url?: string | null
          report_permissions?: Json | null
          role?: Database["public"]["Enums"]["user_role"]
          state?: string | null
          status?: string | null
          street?: string | null
          updated_at?: string | null
          user_id: string
          zip_code?: string | null
        }
        Update: {
          bio?: string | null
          birthdate?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string | null
          email?: string
          id?: string
          name?: string
          neighborhood?: string | null
          number?: string | null
          patent?: Database["public"]["Enums"]["patent_level"] | null
          phone?: string | null
          photo_url?: string | null
          report_permissions?: Json | null
          role?: Database["public"]["Enums"]["user_role"]
          state?: string | null
          status?: string | null
          street?: string | null
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
          bioimpedance_date: string | null
          bmr: number | null
          body_fat_percentage: number | null
          body_water_percentage: number | null
          bone_mass: number | null
          coach_account_created_at: string | null
          coach_course_completed_at: string | null
          coach_id: string
          completed_coach_course: boolean | null
          created_at: string | null
          current_weight: number | null
          goal_description: string | null
          goal_weight: number | null
          height: number | null
          id: string
          metabolic_age: number | null
          muscle_mass: number | null
          notes: string | null
          profile_id: string
          referral_code: string | null
          referral_link: string | null
          referred_by_student_id: string | null
          target_fat_percentage: number | null
          target_muscle_mass: number | null
          updated_at: string | null
          visceral_fat: number | null
        }
        Insert: {
          bioimpedance_date?: string | null
          bmr?: number | null
          body_fat_percentage?: number | null
          body_water_percentage?: number | null
          bone_mass?: number | null
          coach_account_created_at?: string | null
          coach_course_completed_at?: string | null
          coach_id: string
          completed_coach_course?: boolean | null
          created_at?: string | null
          current_weight?: number | null
          goal_description?: string | null
          goal_weight?: number | null
          height?: number | null
          id?: string
          metabolic_age?: number | null
          muscle_mass?: number | null
          notes?: string | null
          profile_id: string
          referral_code?: string | null
          referral_link?: string | null
          referred_by_student_id?: string | null
          target_fat_percentage?: number | null
          target_muscle_mass?: number | null
          updated_at?: string | null
          visceral_fat?: number | null
        }
        Update: {
          bioimpedance_date?: string | null
          bmr?: number | null
          body_fat_percentage?: number | null
          body_water_percentage?: number | null
          bone_mass?: number | null
          coach_account_created_at?: string | null
          coach_course_completed_at?: string | null
          coach_id?: string
          completed_coach_course?: boolean | null
          created_at?: string | null
          current_weight?: number | null
          goal_description?: string | null
          goal_weight?: number | null
          height?: number | null
          id?: string
          metabolic_age?: number | null
          muscle_mass?: number | null
          notes?: string | null
          profile_id?: string
          referral_code?: string | null
          referral_link?: string | null
          referred_by_student_id?: string | null
          target_fat_percentage?: number | null
          target_muscle_mass?: number | null
          updated_at?: string | null
          visceral_fat?: number | null
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
          net_amount: number
          paid_at: string | null
          payment_fee: number | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          product_id: string
          purchase_type: string | null
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
          net_amount: number
          paid_at?: string | null
          payment_fee?: number | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          product_id: string
          purchase_type?: string | null
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
          net_amount?: number
          paid_at?: string | null
          payment_fee?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          product_id?: string
          purchase_type?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          store_product_id?: string | null
          student_id?: string
          subscription_id?: string | null
          tax_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      process_paid_transaction: {
        Args: { _transaction_id: string }
        Returns: undefined
      }
      refresh_coach_patents: { Args: never; Returns: number }
      refresh_monthly_rankings: {
        Args: { _reference_month?: string }
        Returns: undefined
      }
      release_available_commissions: { Args: never; Returns: number }
    }
    Enums: {
      chat_permission:
        | "all_members"
        | "coaches_only"
        | "managers_only"
        | "admins_only"
      commission_status: "pending" | "available" | "withdrawn" | "cancelled"
      patent_level:
        | "coach"
        | "senior_coach"
        | "manager"
        | "senior_manager"
        | "director"
        | "senior_director"
        | "master_director"
      payment_method: "credit_card" | "debit_card" | "pix"
      product_type: "challenge" | "physical" | "herbalife"
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
      user_role: "admin" | "director" | "manager" | "coach" | "student"
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
      commission_status: ["pending", "available", "withdrawn", "cancelled"],
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
      product_type: ["challenge", "physical", "herbalife"],
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
      user_role: ["admin", "director", "manager", "coach", "student"],
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
