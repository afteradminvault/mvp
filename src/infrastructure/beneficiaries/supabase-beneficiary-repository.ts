import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Beneficiary,
  BeneficiaryRepository,
  CreateBeneficiaryInput,
  UpdateBeneficiaryInput,
} from "@/domain/beneficiaries/ports";

interface BeneficiaryRow {
  id: string;
  estate_id: string;
  digital_asset_id: string | null;
  display_name: string;
  relationship: string | null;
  contact_email: string | null;
  linked_user_id: string | null;
  notes: string | null;
  created_at: string;
}

function toBeneficiary(row: BeneficiaryRow): Beneficiary {
  return {
    id: row.id,
    estateId: row.estate_id,
    digitalAssetId: row.digital_asset_id,
    displayName: row.display_name,
    relationship: row.relationship,
    contactEmail: row.contact_email,
    linkedUserId: row.linked_user_id,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/**
 * Concrete adapter against Supabase. Same shape as
 * SupabaseDigitalAssetRepository — beneficiaries has a normal RLS INSERT
 * policy (beneficiaries_write_owner, Database Schema §4.3), so creation is
 * a plain insert, not a SECURITY DEFINER RPC.
 */
export class SupabaseBeneficiaryRepository implements BeneficiaryRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createBeneficiary(estateId: string, input: CreateBeneficiaryInput): Promise<Beneficiary> {
    const { data, error } = await this.supabase
      .from("beneficiaries")
      .insert({
        estate_id: estateId,
        digital_asset_id: input.digitalAssetId,
        display_name: input.displayName,
        relationship: input.relationship,
        contact_email: input.contactEmail,
        notes: input.notes,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toBeneficiary(data as BeneficiaryRow);
  }

  async getBeneficiary(beneficiaryId: string): Promise<Beneficiary | null> {
    const { data, error } = await this.supabase
      .from("beneficiaries")
      .select("*")
      .eq("id", beneficiaryId)
      .maybeSingle();
    if (error) throw error;
    return data ? toBeneficiary(data as BeneficiaryRow) : null;
  }

  async updateBeneficiary(beneficiaryId: string, input: UpdateBeneficiaryInput): Promise<Beneficiary> {
    const patch: Record<string, unknown> = {};
    if (input.digitalAssetId !== undefined) patch.digital_asset_id = input.digitalAssetId;
    if (input.displayName !== undefined) patch.display_name = input.displayName;
    if (input.relationship !== undefined) patch.relationship = input.relationship;
    if (input.contactEmail !== undefined) patch.contact_email = input.contactEmail;
    if (input.notes !== undefined) patch.notes = input.notes;

    const { data, error } = await this.supabase
      .from("beneficiaries")
      .update(patch)
      .eq("id", beneficiaryId)
      .select("*")
      .single();
    if (error) throw error;
    return toBeneficiary(data as BeneficiaryRow);
  }

  async deleteBeneficiary(beneficiaryId: string): Promise<void> {
    const { error } = await this.supabase.from("beneficiaries").delete().eq("id", beneficiaryId);
    if (error) throw error;
  }

  async listBeneficiaries(estateId: string): Promise<Beneficiary[]> {
    const { data, error } = await this.supabase
      .from("beneficiaries")
      .select("*")
      .eq("estate_id", estateId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as BeneficiaryRow[]).map(toBeneficiary);
  }
}
