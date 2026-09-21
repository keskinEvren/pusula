export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          currency: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          currency?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          currency?: string
          updated_at?: string
        }
        Relationships: []
      }
      accounts: {
        Row: {
          id: string
          user_id: string
          name: string
          type: string
          balance: number
          balance_as_of: string | null
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type?: string
          balance?: number
          balance_as_of?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: string
          balance?: number
          balance_as_of?: string | null
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          user_id: string
          slug: string
          name: string
          description: string | null
          status: 'Planlama' | 'Geliştirmede' | 'Canlı' | 'Arşiv'
          project_type: 'saas' | 'workplace' | 'client' | 'internal'
          budget_limit: number | null
          repo_url: string | null
          live_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          slug: string
          name: string
          description?: string | null
          status?: 'Planlama' | 'Geliştirmede' | 'Canlı' | 'Arşiv'
          project_type?: 'saas' | 'workplace' | 'client' | 'internal'
          budget_limit?: number | null
          repo_url?: string | null
          live_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          slug?: string
          name?: string
          description?: string | null
          status?: 'Planlama' | 'Geliştirmede' | 'Canlı' | 'Arşiv'
          project_type?: 'saas' | 'workplace' | 'client' | 'internal'
          budget_limit?: number | null
          repo_url?: string | null
          live_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      credit_cards: {
        Row: {
          id: string
          user_id: string
          bank: string
          card_name: string
          last_four: string | null
          current_debt: number
          statement_debt: number
          minimum_payment: number
          interest_fees: number
          statement_date: string | null
          due_date: string | null
          status_note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          bank: string
          card_name: string
          last_four?: string | null
          current_debt?: number
          statement_debt?: number
          minimum_payment?: number
          interest_fees?: number
          statement_date?: string | null
          due_date?: string | null
          status_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          bank?: string
          card_name?: string
          last_four?: string | null
          current_debt?: number
          statement_debt?: number
          minimum_payment?: number
          interest_fees?: number
          statement_date?: string | null
          due_date?: string | null
          status_note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      card_statements: {
        Row: {
          id: string
          card_id: string
          statement_date: string
          period_debt: number
          minimum: number
          payments: number
          spending: number
          cash_advance: number
          interest_fees: number
          due_date: string | null
          prev_debt: number | null
          change_amount: number | null
          change_pct: number | null
          import_id: string | null
          user_id?: string | null
          created_at: string
        }
        Insert: {
          id?: string
          card_id: string
          statement_date: string
          period_debt: number
          minimum?: number
          payments?: number
          spending?: number
          cash_advance?: number
          interest_fees?: number
          due_date?: string | null
          prev_debt?: number | null
          change_amount?: number | null
          change_pct?: number | null
          import_id?: string | null
          user_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          card_id?: string
          statement_date?: string
          period_debt?: number
          minimum?: number
          payments?: number
          spending?: number
          cash_advance?: number
          interest_fees?: number
          due_date?: string | null
          prev_debt?: number | null
          change_amount?: number | null
          change_pct?: number | null
          import_id?: string | null
          user_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      debts: {
        Row: {
          id: string
          user_id: string
          type: 'Borç' | 'Alacak'
          category: string
          person_or_entity: string
          description: string | null
          principal: number
          past_payments: number
          remaining: number
          status: 'Açık' | 'Kapatıldı'
          linked_account_id: string | null
          project_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: 'Borç' | 'Alacak'
          category?: string
          person_or_entity: string
          description?: string | null
          principal?: number
          past_payments?: number
          remaining?: number
          status?: 'Açık' | 'Kapatıldı'
          linked_account_id?: string | null
          project_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: 'Borç' | 'Alacak'
          category?: string
          person_or_entity?: string
          description?: string | null
          principal?: number
          past_payments?: number
          remaining?: number
          status?: 'Açık' | 'Kapatıldı'
          linked_account_id?: string | null
          project_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          service: string
          group_type: 'Kişisel' | 'İş'
          model: string
          amount: number
          currency: string
          period: string
          end_date: string | null
          decision: 'Devam' | 'İptal Et' | 'Kararsız'
          payment_method: string | null
          status: 'Aktif' | 'İptal' | 'Donduruldu'
          project_id: string | null
          payment_card_id: string | null
          strategic_tag: 'Vazgeçilmez' | 'Esnek' | 'Tek Seferlik' | 'İptal' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          service: string
          group_type?: 'Kişisel' | 'İş'
          model?: string
          amount?: number
          currency?: string
          period?: string
          end_date?: string | null
          decision?: 'Devam' | 'İptal Et' | 'Kararsız'
          payment_method?: string | null
          status?: 'Aktif' | 'İptal' | 'Donduruldu'
          project_id?: string | null
          payment_card_id?: string | null
          strategic_tag?: 'Vazgeçilmez' | 'Esnek' | 'Tek Seferlik' | 'İptal' | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          service?: string
          group_type?: 'Kişisel' | 'İş'
          model?: string
          amount?: number
          currency?: string
          period?: string
          end_date?: string | null
          decision?: 'Devam' | 'İptal Et' | 'Kararsız'
          payment_method?: string | null
          status?: 'Aktif' | 'İptal' | 'Donduruldu'
          project_id?: string | null
          payment_card_id?: string | null
          strategic_tag?: 'Vazgeçilmez' | 'Esnek' | 'Tek Seferlik' | 'İptal' | null
          updated_at?: string
        }
        Relationships: []
      }
      statement_imports: {
        Row: {
          id: string
          user_id: string
          file_name: string
          bank: string | null
          card_id: string | null
          account_id: string | null
          statement_date: string | null
          due_date: string | null
          total_transactions: number
          total_amount: number
          file_hash: string | null
          status: 'PROCESSING' | 'COMPLETED' | 'COMMITTED' | 'ROLLED_BACK' | 'FAILED' | null
          import_type: 'credit_card' | 'bank_account' | null
          idempotency_key: string | null
          source_account_id: string | null
          source_account_ref: string | null
          parser_version: string | null
          completed_at: string | null
          snapshot_data: Json | null
          raw_text: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          file_name: string
          bank?: string | null
          card_id?: string | null
          account_id?: string | null
          statement_date?: string | null
          due_date?: string | null
          total_transactions?: number
          total_amount?: number
          file_hash?: string | null
          status?: 'PROCESSING' | 'COMPLETED' | 'COMMITTED' | 'ROLLED_BACK' | 'FAILED' | null
          import_type?: 'credit_card' | 'bank_account' | null
          idempotency_key?: string | null
          source_account_id?: string | null
          source_account_ref?: string | null
          parser_version?: string | null
          completed_at?: string | null
          snapshot_data?: Json | null
          raw_text?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          file_name?: string
          bank?: string | null
          card_id?: string | null
          account_id?: string | null
          statement_date?: string | null
          due_date?: string | null
          total_transactions?: number
          total_amount?: number
          file_hash?: string | null
          status?: 'PROCESSING' | 'COMPLETED' | 'COMMITTED' | 'ROLLED_BACK' | 'FAILED' | null
          import_type?: 'credit_card' | 'bank_account' | null
          idempotency_key?: string | null
          source_account_id?: string | null
          source_account_ref?: string | null
          parser_version?: string | null
          completed_at?: string | null
          snapshot_data?: Json | null
          raw_text?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          date: string
          account_or_card: string | null
          type: 'Harcama' | 'Kart Ödemesi' | 'Gelir' | 'Tahsilat' | 'Finansman/Masraf' | 'İade' | 'Borç Ödemesi' | 'Nakit Avans' | 'Transfer'
          description: string
          amount: number
          analysis_group: 'Kişisel' | 'İş' | 'Finansman' | 'Hariç'
          merchant: string | null
          recurrence: string | null
          statement_date: string | null
          card_id: string | null
          account_id: string | null
          project_id: string | null
          source_account_id: string | null
          target_account_id: string | null
          related_debt_id: string | null
          related_investment_id: string | null
          investment_quantity_delta: number | null
          investment_unit_price: number | null
          import_id: string | null
          source_bank: string | null
          source_account_ref: string | null
          source_external_id: string | null
          source_fingerprint: string | null
          weak_fingerprint: string | null
          fingerprint_strength: 'strong' | 'weak' | null
          classification_status: 'CONFIRMED' | 'HIGH_CONFIDENCE' | 'NEEDS_REVIEW' | 'UNKNOWN' | 'CONFLICTING_RULES'
          classification_confidence: 'high' | 'medium' | 'low' | null
          classification_reason: Json
          import_row_index: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          account_or_card?: string | null
          type?: 'Harcama' | 'Kart Ödemesi' | 'Gelir' | 'Tahsilat' | 'Finansman/Masraf' | 'İade' | 'Borç Ödemesi' | 'Nakit Avans' | 'Transfer'
          description: string
          amount?: number
          analysis_group?: 'Kişisel' | 'İş' | 'Finansman' | 'Hariç'
          merchant?: string | null
          recurrence?: string | null
          statement_date?: string | null
          card_id?: string | null
          account_id?: string | null
          project_id?: string | null
          source_account_id?: string | null
          target_account_id?: string | null
          related_debt_id?: string | null
          related_investment_id?: string | null
          investment_quantity_delta?: number | null
          investment_unit_price?: number | null
          import_id?: string | null
          source_bank?: string | null
          source_account_ref?: string | null
          source_external_id?: string | null
          source_fingerprint?: string | null
          weak_fingerprint?: string | null
          fingerprint_strength?: 'strong' | 'weak' | null
          classification_status?: 'CONFIRMED' | 'HIGH_CONFIDENCE' | 'NEEDS_REVIEW' | 'UNKNOWN' | 'CONFLICTING_RULES'
          classification_confidence?: 'high' | 'medium' | 'low' | null
          classification_reason?: Json
          import_row_index?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          account_or_card?: string | null
          type?: 'Harcama' | 'Kart Ödemesi' | 'Gelir' | 'Tahsilat' | 'Finansman/Masraf' | 'İade' | 'Borç Ödemesi' | 'Nakit Avans' | 'Transfer'
          description?: string
          amount?: number
          analysis_group?: 'Kişisel' | 'İş' | 'Finansman' | 'Hariç'
          merchant?: string | null
          recurrence?: string | null
          statement_date?: string | null
          card_id?: string | null
          account_id?: string | null
          project_id?: string | null
          source_account_id?: string | null
          target_account_id?: string | null
          related_debt_id?: string | null
          related_investment_id?: string | null
          investment_quantity_delta?: number | null
          investment_unit_price?: number | null
          import_id?: string | null
          source_bank?: string | null
          source_account_ref?: string | null
          source_external_id?: string | null
          source_fingerprint?: string | null
          weak_fingerprint?: string | null
          fingerprint_strength?: 'strong' | 'weak' | null
          classification_status?: 'CONFIRMED' | 'HIGH_CONFIDENCE' | 'NEEDS_REVIEW' | 'UNKNOWN' | 'CONFLICTING_RULES'
          classification_confidence?: 'high' | 'medium' | 'low' | null
          classification_reason?: Json
          import_row_index?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ideas: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          status: 'inbox' | 'maybe' | 'decided' | 'killed' | 'promoted'
          score: number | null
          tags: string[] | null
          promoted_project_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          status?: 'inbox' | 'maybe' | 'decided' | 'killed' | 'promoted'
          score?: number | null
          tags?: string[] | null
          promoted_project_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          status?: 'inbox' | 'maybe' | 'decided' | 'killed' | 'promoted'
          score?: number | null
          tags?: string[] | null
          promoted_project_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      merchant_mappings: {
        Row: {
          id: string
          user_id: string
          raw_pattern: string
          merchant_name: string
          default_group: 'Kişisel' | 'İş' | 'Finansman' | 'Hariç'
          default_project_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          raw_pattern: string
          merchant_name: string
          default_group?: 'Kişisel' | 'İş' | 'Finansman' | 'Hariç'
          default_project_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          raw_pattern?: string
          merchant_name?: string
          default_group?: 'Kişisel' | 'İş' | 'Finansman' | 'Hariç'
          default_project_id?: string | null
        }
        Relationships: []
      }
      investments: {
        Row: {
          id: string
          user_id: string
          name: string
          symbol: string | null
          category: string
          institution: string | null
          quantity: number
          unit_cost: number
          current_price: number
          currency: string
          last_price_updated_at: string | null
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          symbol?: string | null
          category: string
          institution?: string | null
          quantity?: number
          unit_cost?: number
          current_price?: number
          currency?: string
          last_price_updated_at?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          symbol?: string | null
          category?: string
          institution?: string | null
          quantity?: number
          unit_cost?: number
          current_price?: number
          currency?: string
          last_price_updated_at?: string | null
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      dreams: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          identity_persona: string | null
          motivation_why: string | null
          horizon: 'horizon_1y' | 'horizon_1_3y' | 'horizon_3_5y' | 'horizon_lifetime'
          category: string
          status: 'active' | 'incubating' | 'achieved' | 'archived'
          next_focus_note: string | null
          cover_image_url: string | null
          target_year: string | null
          achieved_at: string | null
          achieved_note: string | null
          achieved_image_url: string | null
          order_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          identity_persona?: string | null
          motivation_why?: string | null
          horizon?: 'horizon_1y' | 'horizon_1_3y' | 'horizon_3_5y' | 'horizon_lifetime'
          category?: string
          status?: 'active' | 'incubating' | 'achieved' | 'archived'
          next_focus_note?: string | null
          cover_image_url?: string | null
          target_year?: string | null
          achieved_at?: string | null
          achieved_note?: string | null
          achieved_image_url?: string | null
          order_index?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          identity_persona?: string | null
          motivation_why?: string | null
          horizon?: 'horizon_1y' | 'horizon_1_3y' | 'horizon_3_5y' | 'horizon_lifetime'
          category?: string
          status?: 'active' | 'incubating' | 'achieved' | 'archived'
          next_focus_note?: string | null
          cover_image_url?: string | null
          target_year?: string | null
          achieved_at?: string | null
          achieved_note?: string | null
          achieved_image_url?: string | null
          order_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      routines: {
        Row: {
          id: string
          user_id: string
          title: string
          icon: string
          time_block: 'morning' | 'afternoon' | 'evening' | 'night'
          frequency: 'daily' | 'weekdays' | 'weekends' | 'custom'
          target_days: number[] | null
          target_duration_minutes: number | null
          minimum_effective_dose: string | null
          dream_id: string | null
          identity_persona: string | null
          is_active: boolean
          order_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          icon?: string
          time_block?: 'morning' | 'afternoon' | 'evening' | 'night'
          frequency?: 'daily' | 'weekdays' | 'weekends' | 'custom'
          target_days?: number[] | null
          target_duration_minutes?: number | null
          minimum_effective_dose?: string | null
          dream_id?: string | null
          identity_persona?: string | null
          is_active?: boolean
          order_index?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          icon?: string
          time_block?: 'morning' | 'afternoon' | 'evening' | 'night'
          frequency?: 'daily' | 'weekdays' | 'weekends' | 'custom'
          target_days?: number[] | null
          target_duration_minutes?: number | null
          minimum_effective_dose?: string | null
          dream_id?: string | null
          identity_persona?: string | null
          is_active?: boolean
          order_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      routine_logs: {
        Row: {
          id: string
          user_id: string
          routine_id: string
          log_date: string
          status: 'completed' | 'micro_dose' | 'kintsugi_repaired' | 'skipped' | 'frozen'
          note: string | null
          duration_minutes: number
          completed_at: string
        }
        Insert: {
          id?: string
          user_id: string
          routine_id: string
          log_date?: string
          status?: 'completed' | 'micro_dose' | 'kintsugi_repaired' | 'skipped' | 'frozen'
          note?: string | null
          duration_minutes?: number
          completed_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          routine_id?: string
          log_date?: string
          status?: 'completed' | 'micro_dose' | 'kintsugi_repaired' | 'skipped' | 'frozen'
          note?: string | null
          duration_minutes?: number
          completed_at?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          id: string
          user_id: string
          entry_date: string
          title: string
          content: string
          mood: 'high_energy' | 'calm' | 'low_energy' | 'stormy' | 'reflective'
          template_type: 'freeform' | 'stoic' | 'gratitude_victory' | 'weekly_retro'
          tags: string[]
          weather_note: string | null
          pinned: boolean
          word_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          entry_date?: string
          title: string
          content: string
          mood?: 'high_energy' | 'calm' | 'low_energy' | 'stormy' | 'reflective'
          template_type?: 'freeform' | 'stoic' | 'gratitude_victory' | 'weekly_retro'
          tags?: string[]
          weather_note?: string | null
          pinned?: boolean
          word_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          entry_date?: string
          title?: string
          content?: string
          mood?: 'high_energy' | 'calm' | 'low_energy' | 'stormy' | 'reflective'
          template_type?: 'freeform' | 'stoic' | 'gratitude_victory' | 'weekly_retro'
          tags?: string[]
          weather_note?: string | null
          pinned?: boolean
          word_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      agenda_items: {
        Row: {
          id: string
          user_id: string
          title: string
          plan_date: string | null
          plan_time: string | null
          project_id: string | null
          status: 'planned' | 'in_progress' | 'completed' | 'missed' | 'cancelled'
          duration_seconds: number
          timer_mode: 'stopwatch' | 'pomodoro'
          pomodoro_target_minutes: number | null
          notes: string | null
          completed_at: string | null
          is_late_completed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          plan_date?: string | null
          plan_time?: string | null
          project_id?: string | null
          status?: 'planned' | 'in_progress' | 'completed' | 'missed' | 'cancelled'
          duration_seconds?: number
          timer_mode?: 'stopwatch' | 'pomodoro'
          pomodoro_target_minutes?: number | null
          notes?: string | null
          completed_at?: string | null
          is_late_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          plan_date?: string | null
          plan_time?: string | null
          project_id?: string | null
          status?: 'planned' | 'in_progress' | 'completed' | 'missed' | 'cancelled'
          duration_seconds?: number
          timer_mode?: 'stopwatch' | 'pomodoro'
          pomodoro_target_minutes?: number | null
          notes?: string | null
          completed_at?: string | null
          is_late_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      credentials: {
        Row: {
          id: string
          user_id: string
          title: string
          category: 'login' | 'gaming' | 'card_pin' | 'wifi' | 'identity' | 'license' | 'note'
          email: string | null
          username: string | null
          url: string | null
          is_favorite: boolean
          encrypted_payload: string
          encryption_iv: string
          encryption_salt: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          category: 'login' | 'gaming' | 'card_pin' | 'wifi' | 'identity' | 'license' | 'note'
          email?: string | null
          username?: string | null
          url?: string | null
          is_favorite?: boolean
          encrypted_payload: string
          encryption_iv: string
          encryption_salt: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          category?: 'login' | 'gaming' | 'card_pin' | 'wifi' | 'identity' | 'license' | 'note'
          email?: string | null
          username?: string | null
          url?: string | null
          is_favorite?: boolean
          encrypted_payload?: string
          encryption_iv?: string
          encryption_salt?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fn_commit_statement_import_atomic: {
        Args: { p_payload: Json }
        Returns: Json
      }
      rollback_statement_import: {
        Args: {
          p_import_id: string
          p_user_id?: string
        }
        Returns: Json
      }
      fn_record_expense_atomic: {
        Args: {
          p_user_id: string
          p_date: string
          p_amount: number
          p_description: string
          p_account_id?: string | null
          p_card_id?: string | null
          p_project_id?: string | null
          p_merchant?: string | null
          p_analysis_group?: string | null
          p_recurrence?: string | null
          p_statement_date?: string | null
          p_import_id?: string | null
        }
        Returns: Json
      }
      fn_record_income_atomic: {
        Args: {
          p_user_id: string
          p_date: string
          p_amount: number
          p_description: string
          p_account_id: string
          p_project_id?: string | null
          p_merchant?: string | null
          p_analysis_group?: string | null
        }
        Returns: Json
      }
      fn_record_payment_atomic: {
        Args: {
          p_user_id: string
          p_date: string
          p_amount: number
          p_description: string
          p_type: 'Kart Ödemesi' | 'Borç Ödemesi' | 'Tahsilat'
          p_account_id: string | null
          p_target_id: string
        }
        Returns: Json
      }
      fn_record_transfer_atomic: {
        Args: {
          p_user_id: string
          p_date: string
          p_amount: number
          p_description: string
          p_source_account_id: string
          p_target_account_id: string
        }
        Returns: Json
      }
      fn_delete_transaction_atomic: {
        Args: {
          p_transaction_id: string
          p_user_id?: string
        }
        Returns: Json
      }
      fn_link_transaction_to_debt_atomic: {
        Args: {
          p_transaction_id: string
          p_debt_id: string
          p_user_id?: string
        }
        Returns: Json
      }
      fn_unlink_transaction_from_debt_atomic: {
        Args: { p_user_id: string; p_transaction_id: string }
        Returns: Json
      }
      fn_link_transaction_to_investment_atomic: {
        Args: {
          p_user_id: string
          p_transaction_id: string
          p_investment_id: string
          p_added_qty?: number | null
          p_unit_price?: number | null
        }
        Returns: Json
      }
      fn_unlink_transaction_from_investment_atomic: {
        Args: { p_user_id: string; p_transaction_id: string }
        Returns: Json
      }
      fn_promote_idea_to_project_atomic: {
        Args: { p_user_id: string; p_idea_id: string; p_slug: string; p_budget_limit?: number | null }
        Returns: Json
      }
      fn_restore_vault_replace_atomic: {
        Args: { p_data: Json }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Convenience Type Aliases
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Account = Database['public']['Tables']['accounts']['Row']
export type Project = Database['public']['Tables']['projects']['Row']
export type CreditCard = Database['public']['Tables']['credit_cards']['Row']
export type CardStatement = Database['public']['Tables']['card_statements']['Row']
export type Debt = Database['public']['Tables']['debts']['Row']
export type Subscription = Database['public']['Tables']['subscriptions']['Row']
export type StatementImport = Database['public']['Tables']['statement_imports']['Row']
export type Transaction = Database['public']['Tables']['transactions']['Row']
export type Idea = Database['public']['Tables']['ideas']['Row']
export type MerchantMapping = Database['public']['Tables']['merchant_mappings']['Row']
export type Investment = Database['public']['Tables']['investments']['Row']
export type Dream = Database['public']['Tables']['dreams']['Row']
export type Routine = Database['public']['Tables']['routines']['Row']
export type RoutineLog = Database['public']['Tables']['routine_logs']['Row']
export type JournalEntry = Database['public']['Tables']['journal_entries']['Row']
export type AgendaItem = Database['public']['Tables']['agenda_items']['Row']
export type AgendaItemInsert = Database['public']['Tables']['agenda_items']['Insert']
export type AgendaItemUpdate = Database['public']['Tables']['agenda_items']['Update']
export type Credential = Database['public']['Tables']['credentials']['Row']
export type CredentialInsert = Database['public']['Tables']['credentials']['Insert']
export type CredentialUpdate = Database['public']['Tables']['credentials']['Update']
