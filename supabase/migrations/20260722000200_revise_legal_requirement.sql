-- Milestone 2 feature 1: revising a legal_requirements row is two writes
-- (insert the new version, mark the old row's superseded_by_id) that must
-- not partially apply. Deliberately NOT security definer — RLS
-- (legal_requirements_admin_write, is_platform_admin()) already correctly
-- gates this table, so this function runs as the caller and gets the same
-- protection on both statements, rather than bypassing it. This wraps
-- them in one transaction (a plpgsql function body is atomic), not a
-- privilege escalation.

create function revise_legal_requirement(
  p_existing_id uuid,
  p_jurisdiction_id uuid,
  p_asset_category asset_category,
  p_provider_id uuid,
  p_requirement_type requirement_type,
  p_submission_channel submission_channel,
  p_submission_detail text,
  p_display_order int,
  p_notes text,
  p_pending_counsel_review boolean
) returns legal_requirements as $$
declare
  v_new legal_requirements;
begin
  insert into legal_requirements
    (jurisdiction_id, asset_category, provider_id, requirement_type, submission_channel,
     submission_detail, display_order, notes, pending_counsel_review)
  values
    (p_jurisdiction_id, p_asset_category, p_provider_id, p_requirement_type, p_submission_channel,
     p_submission_detail, p_display_order, p_notes, p_pending_counsel_review)
  returning * into v_new;

  update legal_requirements set superseded_by_id = v_new.id where id = p_existing_id;

  return v_new;
end;
$$ language plpgsql;
