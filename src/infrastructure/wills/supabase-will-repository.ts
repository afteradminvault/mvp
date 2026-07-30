import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BequestCategory,
  CreateBequestInput,
  UpdateBequestInput,
  UpdateGuardianInfoInput,
  Will,
  WillBequest,
  WillExecutorSummary,
  WillRepository,
  WillStatus,
  WillVersion,
} from "@/domain/wills/ports";

interface WillRow {
  id: string;
  case_id: string;
  status: WillStatus;
  guardian_full_name: string | null;
  guardian_relationship: string | null;
  alternate_guardian_full_name: string | null;
  alternate_guardian_relationship: string | null;
  has_minor_children: boolean;
  residuary_beneficiary_description: string | null;
  current_version_id: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface WillVersionRow {
  id: string;
  will_id: string;
  content: string;
  generated_at: string;
}

interface WillBequestRow {
  id: string;
  will_id: string;
  bequest_category: BequestCategory;
  digital_asset_id: string | null;
  beneficiary_id: string | null;
  description: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface CaseMemberRow {
  user_id: string | null;
  invite_email: string;
  fallback_order: number | null;
}

function toWill(row: WillRow): Will {
  return {
    id: row.id,
    caseId: row.case_id,
    status: row.status,
    guardianFullName: row.guardian_full_name,
    guardianRelationship: row.guardian_relationship,
    alternateGuardianFullName: row.alternate_guardian_full_name,
    alternateGuardianRelationship: row.alternate_guardian_relationship,
    hasMinorChildren: row.has_minor_children,
    residuaryBeneficiaryDescription: row.residuary_beneficiary_description,
    currentVersionId: row.current_version_id,
    executedAt: row.executed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toWillVersion(row: WillVersionRow): WillVersion {
  return { id: row.id, willId: row.will_id, content: row.content, generatedAt: row.generated_at };
}

function toWillBequest(row: WillBequestRow): WillBequest {
  return {
    id: row.id,
    willId: row.will_id,
    bequestCategory: row.bequest_category,
    digitalAssetId: row.digital_asset_id,
    beneficiaryId: row.beneficiary_id,
    description: row.description,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Concrete adapter against Supabase. wills/will_versions/will_bequests RLS (wills_write_family etc.) already gates every write to the testator's own case — see the migration's own comment. */
export class SupabaseWillRepository implements WillRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getWillByCaseId(caseId: string): Promise<Will | null> {
    const { data, error } = await this.supabase.from("wills").select("*").eq("case_id", caseId).maybeSingle();
    if (error) throw error;
    return data ? toWill(data as WillRow) : null;
  }

  async createWill(caseId: string): Promise<Will> {
    const { data, error } = await this.supabase.from("wills").insert({ case_id: caseId }).select("*").single();
    if (error) throw error;
    return toWill(data as WillRow);
  }

  async getWill(willId: string): Promise<Will | null> {
    const { data, error } = await this.supabase.from("wills").select("*").eq("id", willId).maybeSingle();
    if (error) throw error;
    return data ? toWill(data as WillRow) : null;
  }

  async updateGuardianInfo(willId: string, input: UpdateGuardianInfoInput): Promise<Will> {
    const { data, error } = await this.supabase
      .from("wills")
      .update({
        has_minor_children: input.hasMinorChildren,
        guardian_full_name: input.guardianFullName ?? null,
        guardian_relationship: input.guardianRelationship ?? null,
        alternate_guardian_full_name: input.alternateGuardianFullName ?? null,
        alternate_guardian_relationship: input.alternateGuardianRelationship ?? null,
      })
      .eq("id", willId)
      .select("*")
      .single();
    if (error) throw error;
    return toWill(data as WillRow);
  }

  async updateResiduaryClause(willId: string, description: string | null): Promise<Will> {
    const { data, error } = await this.supabase
      .from("wills")
      .update({ residuary_beneficiary_description: description })
      .eq("id", willId)
      .select("*")
      .single();
    if (error) throw error;
    return toWill(data as WillRow);
  }

  async listBequests(willId: string): Promise<WillBequest[]> {
    const { data, error } = await this.supabase
      .from("will_bequests")
      .select("*")
      .eq("will_id", willId)
      .order("display_order", { ascending: true });
    if (error) throw error;
    return (data as WillBequestRow[]).map(toWillBequest);
  }

  async createBequest(willId: string, input: CreateBequestInput): Promise<WillBequest> {
    const { data, error } = await this.supabase
      .from("will_bequests")
      .insert({
        will_id: willId,
        bequest_category: input.bequestCategory,
        digital_asset_id: input.digitalAssetId ?? null,
        beneficiary_id: input.beneficiaryId ?? null,
        description: input.description ?? null,
        display_order: input.displayOrder ?? 0,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toWillBequest(data as WillBequestRow);
  }

  async updateBequest(bequestId: string, input: UpdateBequestInput): Promise<WillBequest> {
    const patch: Record<string, unknown> = {};
    if (input.bequestCategory !== undefined) patch.bequest_category = input.bequestCategory;
    if (input.digitalAssetId !== undefined) patch.digital_asset_id = input.digitalAssetId;
    if (input.beneficiaryId !== undefined) patch.beneficiary_id = input.beneficiaryId;
    if (input.description !== undefined) patch.description = input.description;
    if (input.displayOrder !== undefined) patch.display_order = input.displayOrder;

    const { data, error } = await this.supabase
      .from("will_bequests")
      .update(patch)
      .eq("id", bequestId)
      .select("*")
      .single();
    if (error) throw error;
    return toWillBequest(data as WillBequestRow);
  }

  async deleteBequest(bequestId: string): Promise<void> {
    const { error } = await this.supabase.from("will_bequests").delete().eq("id", bequestId);
    if (error) throw error;
  }

  async createVersion(willId: string, content: string): Promise<WillVersion> {
    const { data, error } = await this.supabase
      .from("will_versions")
      .insert({ will_id: willId, content })
      .select("*")
      .single();
    if (error) throw error;
    return toWillVersion(data as WillVersionRow);
  }

  async setStatus(
    willId: string,
    status: WillStatus,
    extra?: { currentVersionId?: string; executedAt?: string | null },
  ): Promise<Will> {
    const patch: Record<string, unknown> = { status };
    if (extra?.currentVersionId !== undefined) patch.current_version_id = extra.currentVersionId;
    if (extra?.executedAt !== undefined) patch.executed_at = extra.executedAt;

    const { data, error } = await this.supabase.from("wills").update(patch).eq("id", willId).select("*").single();
    if (error) throw error;
    return toWill(data as WillRow);
  }

  /**
   * Two plain queries rather than a PostgREST embedded-relation select
   * (`users(display_name)`) — matches this codebase's existing preference
   * for simple .from().select() calls elsewhere, and only pending-invite
   * executors (user_id null) even need the second query skipped.
   */
  async listExecutors(caseId: string): Promise<WillExecutorSummary[]> {
    const { data, error } = await this.supabase
      .from("case_members")
      .select("user_id, invite_email, fallback_order")
      .eq("case_id", caseId)
      .eq("role", "executor")
      .neq("invite_status", "revoked")
      .order("fallback_order", { ascending: true, nullsFirst: true });
    if (error) throw error;
    const members = data as CaseMemberRow[];

    const userIds = members.map((m) => m.user_id).filter((id): id is string => id !== null);
    const displayNameByUserId = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await this.supabase
        .from("users")
        .select("id, display_name")
        .in("id", userIds);
      if (usersError) throw usersError;
      for (const user of users as { id: string; display_name: string }[]) {
        displayNameByUserId.set(user.id, user.display_name);
      }
    }

    return members.map((member) => ({
      displayName: member.user_id ? (displayNameByUserId.get(member.user_id) ?? null) : null,
      inviteEmail: member.invite_email,
      fallbackOrder: member.fallback_order,
    }));
  }
}
