import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateNotificationLetterInput,
  FinalizeNotificationLetterInput,
  NotificationLetter,
  NotificationLetterRepository,
  NotificationLetterSentVia,
  NotificationLetterType,
} from "@/domain/notification-letters/ports";

interface NotificationLetterRow {
  id: string;
  case_id: string;
  platform_id: string;
  created_by_user_id: string;
  letter_type: NotificationLetterType;
  content: string;
  sent_via: NotificationLetterSentVia | null;
  sent_at: string | null;
  pdf_document_id: string | null;
  created_at: string;
  updated_at: string;
}

function toNotificationLetter(row: NotificationLetterRow): NotificationLetter {
  return {
    id: row.id,
    estateId: row.case_id,
    platformId: row.platform_id,
    createdByUserId: row.created_by_user_id,
    letterType: row.letter_type,
    content: row.content,
    sentVia: row.sent_via,
    sentAt: row.sent_at,
    pdfDocumentId: row.pdf_document_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Concrete adapter against Supabase — plain RLS-backed CRUD (notification_letters_select_member / notification_letters_write_family), no RPCs needed. */
export class SupabaseNotificationLetterRepository implements NotificationLetterRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createLetter(
    estateId: string,
    createdByUserId: string,
    input: CreateNotificationLetterInput,
  ): Promise<NotificationLetter> {
    const { data, error } = await this.supabase
      .from("notification_letters")
      .insert({
        case_id: estateId,
        platform_id: input.platformId,
        created_by_user_id: createdByUserId,
        letter_type: input.letterType,
        content: input.content,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toNotificationLetter(data as NotificationLetterRow);
  }

  async getLetter(letterId: string): Promise<NotificationLetter | null> {
    const { data, error } = await this.supabase
      .from("notification_letters")
      .select("*")
      .eq("id", letterId)
      .maybeSingle();
    if (error) throw error;
    return data ? toNotificationLetter(data as NotificationLetterRow) : null;
  }

  async listLetters(estateId: string): Promise<NotificationLetter[]> {
    const { data, error } = await this.supabase
      .from("notification_letters")
      .select("*")
      .eq("case_id", estateId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as NotificationLetterRow[]).map(toNotificationLetter);
  }

  async updateContent(letterId: string, content: string): Promise<NotificationLetter> {
    const { data, error } = await this.supabase
      .from("notification_letters")
      .update({ content })
      .eq("id", letterId)
      .select("*")
      .single();
    if (error) throw error;
    return toNotificationLetter(data as NotificationLetterRow);
  }

  async finalize(letterId: string, input: FinalizeNotificationLetterInput): Promise<NotificationLetter> {
    const { data, error } = await this.supabase
      .from("notification_letters")
      .update({ sent_via: input.sentVia, sent_at: new Date().toISOString(), pdf_document_id: input.pdfDocumentId })
      .eq("id", letterId)
      .select("*")
      .single();
    if (error) throw error;
    return toNotificationLetter(data as NotificationLetterRow);
  }

  async getUserDisplayName(userId: string): Promise<string | null> {
    const { data, error } = await this.supabase.from("users").select("display_name").eq("id", userId).maybeSingle();
    if (error) throw error;
    return (data as { display_name: string } | null)?.display_name ?? null;
  }
}
