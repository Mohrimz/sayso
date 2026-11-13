
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "approvals": {
                  Row: {
                    "approver_id": string | null,"comment": string | null,"content_item_id": string,"created_at": string,"decision": Database["public"]['Enums']["approval_decision"],"id": string,"version_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approver_id"?: string | null,"comment"?: string | null,"content_item_id": string,"created_at"?: string,"decision": Database["public"]['Enums']["approval_decision"],"id"?: string,"version_id": string,"workspace_id": string
                  }
                  Update: {
                    "approver_id"?: string | null,"comment"?: string | null,"content_item_id"?: string,"created_at"?: string,"decision"?: Database["public"]['Enums']["approval_decision"],"id"?: string,"version_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "approvals_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_content_item_id_fkey"
      columns: ["content_item_id"]
isOneToOne: false
      referencedRelation: "content_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "content_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"assets": {
                  Row: {
                    "created_at": string,"folder": string,"id": string,"mime": string,"name": string,"note": string | null,"path": string,"size": number,"uploaded_by": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"folder"?: string,"id"?: string,"mime"?: string,"name": string,"note"?: string | null,"path": string,"size"?: number,"uploaded_by"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"folder"?: string,"id"?: string,"mime"?: string,"name"?: string,"note"?: string | null,"path"?: string,"size"?: number,"uploaded_by"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assets_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assets_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"assistant_chats": {
                  Row: {
                    "created_at": string,"id": string,"messages": NonNullable<Json>,"metas": NonNullable<Json>,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"messages"?: NonNullable<Json>,"metas"?: NonNullable<Json>,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"messages"?: NonNullable<Json>,"metas"?: NonNullable<Json>,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assistant_chats_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"assistant_usage": {
                  Row: {
                    "cost_usd": number,"questions": number,"updated_at": string,"user_id": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_usd"?: number,"questions"?: number,"updated_at"?: string,"user_id": string,"window_start"?: string
                  }
                  Update: {
                    "cost_usd"?: number,"questions"?: number,"updated_at"?: string,"user_id"?: string,"window_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assistant_usage_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"brand_kits": {
                  Row: {
                    "colours": NonNullable<Json>,"faq": NonNullable<Json>,"fonts": NonNullable<Json>,"logo_paths": (string)[],"notes": string | null,"tone": string | null,"topics_to_avoid": string | null,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "colours"?: NonNullable<Json>,"faq"?: NonNullable<Json>,"fonts"?: NonNullable<Json>,"logo_paths"?: (string)[],"notes"?: string | null,"tone"?: string | null,"topics_to_avoid"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "colours"?: NonNullable<Json>,"faq"?: NonNullable<Json>,"fonts"?: NonNullable<Json>,"logo_paths"?: (string)[],"notes"?: string | null,"tone"?: string | null,"topics_to_avoid"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "brand_kits_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: true
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_reads": {
                  Row: {
                    "channel": Database["public"]['Enums']["chat_channel"],"last_read_at": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channel": Database["public"]['Enums']["chat_channel"],"last_read_at"?: string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "channel"?: Database["public"]['Enums']["chat_channel"],"last_read_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_reads_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_reads_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "author_id": string | null,"body": string,"content_item_id": string,"created_at": string,"id": string,"kind": string,"parent_id": string | null,"pin": Json | null,"resolved": boolean,"updated_at": string,"version_id": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"content_item_id": string,"created_at"?: string,"id"?: string,"kind"?: string,"parent_id"?: string | null,"pin"?: Json | null,"resolved"?: boolean,"updated_at"?: string,"version_id"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"content_item_id"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"parent_id"?: string | null,"pin"?: Json | null,"resolved"?: boolean,"updated_at"?: string,"version_id"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_content_item_id_fkey"
      columns: ["content_item_id"]
isOneToOne: false
      referencedRelation: "content_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "content_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"content_items": {
                  Row: {
                    "approval_deadline": string | null,"approved_at": string | null,"assignee_id": string | null,"captions": NonNullable<Json>,"client_decision": Database["public"]['Enums']["approval_decision"] | null,"created_at": string,"created_by": string | null,"current_version": number,"hashtags": string | null,"id": string,"link_url": string | null,"live_url": string | null,"on_screen_text": string | null,"plan_id": string,"planned_at": string | null,"platforms": (string)[],"publish_requested_at": string | null,"publish_requested_by": string | null,"published_at": string | null,"reviewer_id": string | null,"revision_count": number,"sent_for_approval_at": string | null,"status": Database["public"]['Enums']["content_status"],"tags": (string)[],"title": string,"tracked_links": NonNullable<Json>,"type": Database["public"]['Enums']["content_type"],"updated_at": string,"utm": NonNullable<Json>,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_deadline"?: string | null,"approved_at"?: string | null,"assignee_id"?: string | null,"captions"?: NonNullable<Json>,"client_decision"?: Database["public"]['Enums']["approval_decision"] | null,"created_at"?: string,"created_by"?: string | null,"current_version"?: number,"hashtags"?: string | null,"id"?: string,"link_url"?: string | null,"live_url"?: string | null,"on_screen_text"?: string | null,"plan_id": string,"planned_at"?: string | null,"platforms"?: (string)[],"publish_requested_at"?: string | null,"publish_requested_by"?: string | null,"published_at"?: string | null,"reviewer_id"?: string | null,"revision_count"?: number,"sent_for_approval_at"?: string | null,"status"?: Database["public"]['Enums']["content_status"],"tags"?: (string)[],"title": string,"tracked_links"?: NonNullable<Json>,"type": Database["public"]['Enums']["content_type"],"updated_at"?: string,"utm"?: NonNullable<Json>,"workspace_id": string
                  }
                  Update: {
                    "approval_deadline"?: string | null,"approved_at"?: string | null,"assignee_id"?: string | null,"captions"?: NonNullable<Json>,"client_decision"?: Database["public"]['Enums']["approval_decision"] | null,"created_at"?: string,"created_by"?: string | null,"current_version"?: number,"hashtags"?: string | null,"id"?: string,"link_url"?: string | null,"live_url"?: string | null,"on_screen_text"?: string | null,"plan_id"?: string,"planned_at"?: string | null,"platforms"?: (string)[],"publish_requested_at"?: string | null,"publish_requested_by"?: string | null,"published_at"?: string | null,"reviewer_id"?: string | null,"revision_count"?: number,"sent_for_approval_at"?: string | null,"status"?: Database["public"]['Enums']["content_status"],"tags"?: (string)[],"title"?: string,"tracked_links"?: NonNullable<Json>,"type"?: Database["public"]['Enums']["content_type"],"updated_at"?: string,"utm"?: NonNullable<Json>,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_items_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_items_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_items_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "monthly_plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_items_publish_requested_by_fkey"
      columns: ["publish_requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_items_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_items_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"content_versions": {
                  Row: {
                    "captions": NonNullable<Json>,"content_item_id": string,"created_at": string,"created_by": string | null,"hashtags": string | null,"id": string,"link_url": string | null,"media": NonNullable<Json>,"note": string | null,"on_screen_text": string | null,"sent_to_client_at": string | null,"tracked_links": NonNullable<Json>,"version_number": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "captions"?: NonNullable<Json>,"content_item_id": string,"created_at"?: string,"created_by"?: string | null,"hashtags"?: string | null,"id"?: string,"link_url"?: string | null,"media"?: NonNullable<Json>,"note"?: string | null,"on_screen_text"?: string | null,"sent_to_client_at"?: string | null,"tracked_links"?: NonNullable<Json>,"version_number": number,"workspace_id": string
                  }
                  Update: {
                    "captions"?: NonNullable<Json>,"content_item_id"?: string,"created_at"?: string,"created_by"?: string | null,"hashtags"?: string | null,"id"?: string,"link_url"?: string | null,"media"?: NonNullable<Json>,"note"?: string | null,"on_screen_text"?: string | null,"sent_to_client_at"?: string | null,"tracked_links"?: NonNullable<Json>,"version_number"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_versions_content_item_id_fkey"
      columns: ["content_item_id"]
isOneToOne: false
      referencedRelation: "content_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_versions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_versions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"internal_notes": {
                  Row: {
                    "author_id": string | null,"body": string,"content_item_id": string,"created_at": string,"decision": Database["public"]['Enums']["internal_decision"] | null,"id": string,"version_number": number | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body"?: string,"content_item_id": string,"created_at"?: string,"decision"?: Database["public"]['Enums']["internal_decision"] | null,"id"?: string,"version_number"?: number | null,"workspace_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"content_item_id"?: string,"created_at"?: string,"decision"?: Database["public"]['Enums']["internal_decision"] | null,"id"?: string,"version_number"?: number | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "internal_notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_notes_content_item_id_fkey"
      columns: ["content_item_id"]
isOneToOne: false
      referencedRelation: "content_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_notes_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "attachments": NonNullable<Json>,"author_id": string | null,"body": string,"channel": Database["public"]['Enums']["chat_channel"],"created_at": string,"deleted_at": string | null,"edited_at": string | null,"id": string,"mentions": (string)[],"reactions": NonNullable<Json>,"reply_to": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attachments"?: NonNullable<Json>,"author_id"?: string | null,"body"?: string,"channel"?: Database["public"]['Enums']["chat_channel"],"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"mentions"?: (string)[],"reactions"?: NonNullable<Json>,"reply_to"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "attachments"?: NonNullable<Json>,"author_id"?: string | null,"body"?: string,"channel"?: Database["public"]['Enums']["chat_channel"],"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"mentions"?: (string)[],"reactions"?: NonNullable<Json>,"reply_to"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_reply_to_fkey"
      columns: ["reply_to"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"monthly_plans": {
                  Row: {
                    "created_at": string,"created_by": string | null,"goals": string | null,"id": string,"key_dates": NonNullable<Json>,"month": string,"status": Database["public"]['Enums']["plan_status"],"themes": string | null,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"goals"?: string | null,"id"?: string,"key_dates"?: NonNullable<Json>,"month": string,"status"?: Database["public"]['Enums']["plan_status"],"themes"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"goals"?: string | null,"id"?: string,"key_dates"?: NonNullable<Json>,"month"?: string,"status"?: Database["public"]['Enums']["plan_status"],"themes"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "monthly_plans_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "monthly_plans_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"emailed_at": string | null,"id": string,"link": string | null,"read_at": string | null,"title": string,"type": string,"user_id": string,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"emailed_at"?: string | null,"id"?: string,"link"?: string | null,"read_at"?: string | null,"title": string,"type": string,"user_id": string,"workspace_id"?: string | null
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"emailed_at"?: string | null,"id"?: string,"link"?: string | null,"read_at"?: string | null,"title"?: string,"type"?: string,"user_id"?: string,"workspace_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"offers": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"message": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"message": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"message"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "offers_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"packages": {
                  Row: {
                    "currency": string,"monthly_fee": number | null,"notes": string | null,"service_name": string,"start_date": string | null,"term_months": number | null,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "currency"?: string,"monthly_fee"?: number | null,"notes"?: string | null,"service_name"?: string,"start_date"?: string | null,"term_months"?: number | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "currency"?: string,"monthly_fee"?: number | null,"notes"?: string | null,"service_name"?: string,"start_date"?: string | null,"term_months"?: number | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "packages_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: true
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"post_insights": {
                  Row: {
                    "content_item_id": string,"error": string | null,"fetched_at": string,"media_id": string | null,"metrics": NonNullable<Json>,"permalink": string | null,"platform": string,"posted_at": string | null,"status": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_item_id": string,"error"?: string | null,"fetched_at"?: string,"media_id"?: string | null,"metrics"?: NonNullable<Json>,"permalink"?: string | null,"platform": string,"posted_at"?: string | null,"status"?: string,"workspace_id": string
                  }
                  Update: {
                    "content_item_id"?: string,"error"?: string | null,"fetched_at"?: string,"media_id"?: string | null,"metrics"?: NonNullable<Json>,"permalink"?: string | null,"platform"?: string,"posted_at"?: string | null,"status"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_insights_content_item_id_fkey"
      columns: ["content_item_id"]
isOneToOne: false
      referencedRelation: "content_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_insights_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "agency_role": Database["public"]['Enums']["agency_role"] | null,"avatar_path": string | null,"created_at": string,"email": string,"full_name": string | null,"id": string,"job_title": string | null,"notification_prefs": NonNullable<Json>,"onboarded_at": string | null,"phone": string | null,"side": Database["public"]['Enums']["user_side"],"profile_missing": (string)[] | null
                  }
                  ComputedFields: "profile_missing"
                  Insert: {
                    "agency_role"?: Database["public"]['Enums']["agency_role"] | null,"avatar_path"?: string | null,"created_at"?: string,"email": string,"full_name"?: string | null,"id": string,"job_title"?: string | null,"notification_prefs"?: NonNullable<Json>,"onboarded_at"?: string | null,"phone"?: string | null,"side"?: Database["public"]['Enums']["user_side"]
                  }
                  Update: {
                    "agency_role"?: Database["public"]['Enums']["agency_role"] | null,"avatar_path"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"job_title"?: string | null,"notification_prefs"?: NonNullable<Json>,"onboarded_at"?: string | null,"phone"?: string | null,"side"?: Database["public"]['Enums']["user_side"]
                  }
                  Relationships: [
                    
                  ]
                },"progress_updates": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"id": string,"plan_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"id"?: string,"plan_id": string,"workspace_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"plan_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "progress_updates_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "progress_updates_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "monthly_plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "progress_updates_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"task_submissions": {
                  Row: {
                    "content_item_id": string | null,"decision": string | null,"files": NonNullable<Json>,"id": string,"note": string | null,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"submitted_at": string,"submitted_by": string | null,"task_id": string,"version_id": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_item_id"?: string | null,"decision"?: string | null,"files"?: NonNullable<Json>,"id"?: string,"note"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"submitted_at"?: string,"submitted_by"?: string | null,"task_id": string,"version_id"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "content_item_id"?: string | null,"decision"?: string | null,"files"?: NonNullable<Json>,"id"?: string,"note"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"submitted_at"?: string,"submitted_by"?: string | null,"task_id"?: string,"version_id"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_submissions_content_item_id_fkey"
      columns: ["content_item_id"]
isOneToOne: false
      referencedRelation: "content_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_submissions_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_submissions_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_submissions_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_submissions_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "content_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_submissions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "completed_at": string | null,"content_item_id": string | null,"created_at": string,"created_by": string | null,"description": string | null,"due_date": string | null,"id": string,"internal": boolean,"owner_id": string | null,"owner_side": Database["public"]['Enums']["user_side"],"plan_id": string | null,"status": Database["public"]['Enums']["task_status"],"title": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"content_item_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date"?: string | null,"id"?: string,"internal"?: boolean,"owner_id"?: string | null,"owner_side"?: Database["public"]['Enums']["user_side"],"plan_id"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"title": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"content_item_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date"?: string | null,"id"?: string,"internal"?: boolean,"owner_id"?: string | null,"owner_side"?: Database["public"]['Enums']["user_side"],"plan_id"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"title"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_content_item_id_fkey"
      columns: ["content_item_id"]
isOneToOne: false
      referencedRelation: "content_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "monthly_plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"user_activity": {
                  Row: {
                    "last_seen_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "last_seen_at"?: string,"user_id": string
                  }
                  Update: {
                    "last_seen_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_activity_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_members": {
                  Row: {
                    "created_at": string,"role": Database["public"]['Enums']["member_role"],"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"role": Database["public"]['Enums']["member_role"],"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"role"?: Database["public"]['Enums']["member_role"],"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "approval_rule": Database["public"]['Enums']["approval_rule"],"baseline": NonNullable<Json>,"created_at": string,"facebook_page_id": string | null,"goals_focus": string | null,"id": string,"instagram_account_id": string | null,"logo_path": string | null,"main_contact_email": string | null,"main_contact_name": string | null,"name": string,"quotas": NonNullable<Json>,"revision_rounds": number,"rules": NonNullable<Json>,"slug": string,"social_accounts": NonNullable<Json>,"status": Database["public"]['Enums']["workspace_status"],"success_measures": string | null,"time_zone": string,"updated_at": string,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_rule"?: Database["public"]['Enums']["approval_rule"],"baseline"?: NonNullable<Json>,"created_at"?: string,"facebook_page_id"?: string | null,"goals_focus"?: string | null,"id"?: string,"instagram_account_id"?: string | null,"logo_path"?: string | null,"main_contact_email"?: string | null,"main_contact_name"?: string | null,"name": string,"quotas"?: NonNullable<Json>,"revision_rounds"?: number,"rules"?: NonNullable<Json>,"slug": string,"social_accounts"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["workspace_status"],"success_measures"?: string | null,"time_zone"?: string,"updated_at"?: string,"website"?: string | null
                  }
                  Update: {
                    "approval_rule"?: Database["public"]['Enums']["approval_rule"],"baseline"?: NonNullable<Json>,"created_at"?: string,"facebook_page_id"?: string | null,"goals_focus"?: string | null,"id"?: string,"instagram_account_id"?: string | null,"logo_path"?: string | null,"main_contact_email"?: string | null,"main_contact_name"?: string | null,"name"?: string,"quotas"?: NonNullable<Json>,"revision_rounds"?: number,"rules"?: NonNullable<Json>,"slug"?: string,"social_accounts"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["workspace_status"],"success_measures"?: string | null,"time_zone"?: string,"updated_at"?: string,"website"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_assistant_usage":
{ Args: { "p_cost": number,"p_user": string }; Returns: number
                           },
"agency_recipients":
{ Args: { "p_item": string }; Returns: (string)[]
                           },
"can_access_chat":
{ Args: { "p_channel": Database["public"]['Enums']["chat_channel"],"p_ws": string }; Returns: boolean
                           },
"can_access_chat_path":
{ Args: { "p_name": string }; Returns: boolean
                           },
"can_join_chat_topic":
{ Args: { "p_topic": string }; Returns: boolean
                           },
"can_see_profile":
{ Args: { "p_id": string }; Returns: boolean
                           },
"chat_link":
{ Args: { "p_channel": Database["public"]['Enums']["chat_channel"],"p_ws": string }; Returns: string
                           },
"chat_threads":
{ Args: Record<PropertyKey, never>; Returns: {
              "channel": Database["public"]['Enums']["chat_channel"],"last_at": string,"last_author": string,"last_body": string,"last_deleted": boolean,"last_files": number,"unread": number,"workspace_id": string
            }[]
                           },
"delete_message":
{ Args: { "p_id": string }; Returns: Json
                           },
"display_name":
{ Args: { "p_user": string }; Returns: string
                           },
"edit_message":
{ Args: { "p_body": string,"p_id": string }; Returns: undefined
                           },
"is_agency":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_agency_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_agency_member":
{ Args: { "ws": string }; Returns: boolean
                           },
"is_client_approver":
{ Args: { "ws": string }; Returns: boolean
                           },
"is_client_member":
{ Args: { "ws": string }; Returns: boolean
                           },
"is_member":
{ Args: { "ws": string }; Returns: boolean
                           },
"item_visible_to_client":
{ Args: { "p_item": string }; Returns: boolean
                           },
"join_words":
{ Args: { "p_words": (string)[] }; Returns: string
                           },
"mark_chat_read":
{ Args: { "p_channel": Database["public"]['Enums']["chat_channel"],"p_ws": string }; Returns: undefined
                           },
"message_preview":
{ Args: { "p_attachments": Json,"p_author": string,"p_body": string }; Returns: string
                           },
"notify_users":
{ Args: { "p_body": string,"p_link": string,"p_title": string,"p_type": string,"p_users": (string)[],"p_ws": string }; Returns: undefined
                           },
"nudge_profile":
{ Args: { "p_user": string }; Returns: undefined
                           },
"plan_shared":
{ Args: { "p_plan": string }; Returns: boolean
                           },
"profile_missing":
{ Args: { "p": Omit<Database["public"]['Tables']["profiles"]['Row'], Database["public"]['Tables']["profiles"]['ComputedFields']> }; Returns: (string)[]
                           },
"reorder_post_media":
{ Args: { "p_item": string,"p_keys": (string)[] }; Returns: undefined
                           },
"request_publish":
{ Args: { "p_item": string }; Returns: undefined
                           },
"review_task_work":
{ Args: { "p_decision": string,"p_note": string,"p_task": string }; Returns: undefined
                           },
"send_approved_work":
{ Args: { "p_deadline"?: string,"p_item": string }; Returns: string
                           },
"send_for_approval":
{ Args: { "p_deadline"?: string,"p_item": string }; Returns: string
                           },
"set_client_task_status":
{ Args: { "p_status": Database["public"]['Enums']["task_status"],"p_task": string }; Returns: undefined
                           },
"submit_approval":
{ Args: { "p_comment"?: string,"p_decision": Database["public"]['Enums']["approval_decision"],"p_item": string }; Returns: Database["public"]['Enums']["content_status"]
                           },
"submit_task_work":
{ Args: { "p_files": Json,"p_item": string,"p_note": string,"p_task": string }; Returns: string
                           },
"toggle_reaction":
{ Args: { "p_emoji": string,"p_message": string }; Returns: Json
                           },
"touch_last_seen":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"try_uuid":
{ Args: { "p": string }; Returns: string
                           },
"user_can_access_chat":
{ Args: { "p_channel": Database["public"]['Enums']["chat_channel"],"p_user": string,"p_ws": string }; Returns: boolean
                           },
"workspace_slug":
{ Args: { "p_ws": string }; Returns: string
                           }
          }
          Enums: {
            "agency_role": "admin"|"member","approval_decision": "approved"|"changes_requested","approval_rule": "any"|"all","chat_channel": "client"|"team"|"direct","content_status": "planned"|"draft"|"internal_review"|"client_review"|"approved"|"scheduled"|"published","content_type": "feed_post"|"carousel"|"reel"|"story","internal_decision": "passed"|"fixes_needed","member_role": "team_member"|"approver"|"viewer","plan_status": "draft"|"active"|"closed","task_status": "todo"|"in_progress"|"in_review"|"done","user_side": "agency"|"client","workspace_status": "onboarding"|"active"|"paused"|"archived"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "agency_role": ["admin", "member"],"approval_decision": ["approved", "changes_requested"],"approval_rule": ["any", "all"],"chat_channel": ["client", "team", "direct"],"content_status": ["planned", "draft", "internal_review", "client_review", "approved", "scheduled", "published"],"content_type": ["feed_post", "carousel", "reel", "story"],"internal_decision": ["passed", "fixes_needed"],"member_role": ["team_member", "approver", "viewer"],"plan_status": ["draft", "active", "closed"],"task_status": ["todo", "in_progress", "in_review", "done"],"user_side": ["agency", "client"],"workspace_status": ["onboarding", "active", "paused", "archived"]
          }
        }
} as const
