/**
 * Admin jurisdictions domain contracts (Database Schema §2.2, API
 * Specification §8). Framework-free, same rationale as other ports.ts
 * files. Separate from src/domain/estates/ports.ts's read-only
 * Jurisdiction type (the Planner-facing is_supported=true picker) — this
 * is the admin-write side, listing every jurisdiction regardless of
 * support status.
 */

export interface AdminJurisdiction {
  id: string;
  countryCode: string;
  regionCode: string | null;
  displayName: string;
  isSupported: boolean;
}

export interface CreateJurisdictionInput {
  countryCode: string;
  regionCode?: string | null;
  displayName: string;
  isSupported?: boolean;
}

export interface UpdateJurisdictionInput {
  displayName?: string;
  isSupported?: boolean;
}

export interface AdminJurisdictionRepository {
  createJurisdiction(input: CreateJurisdictionInput): Promise<AdminJurisdiction>;
  listJurisdictions(): Promise<AdminJurisdiction[]>;
  updateJurisdiction(id: string, input: UpdateJurisdictionInput): Promise<AdminJurisdiction>;
}
