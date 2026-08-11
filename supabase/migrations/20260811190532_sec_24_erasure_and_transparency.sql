-- =============================================================================
-- MediFlow AI — Right-to-erasure + patient AI-data transparency view
-- Migration: 20260811190532_sec_24_erasure_and_transparency  (IDEMPOTENT)
-- =============================================================================

begin;

create or replace function public.admin_delete_patient_data(p_user_id uuid)
returns void language plpgsql volatile security definer set search_path to '' as $$
begin
  if not private.is_admin() then raise exception 'not_authorized' using errcode='42501'; end if;
  perform private.require_aal2();

  update public.patients
     set full_name='[erased]', preferred_display_name=null, age=null, gender=null,
         email=null, civil_id_encrypted=null, updated_at=now()
   where user_id = p_user_id;

  update public.profiles
     set full_name='[erased]', preferred_name=null, phone=null, avatar_url=null,
         account_status='suspended', updated_at=now()
   where id = p_user_id;

  update public.patient_clinical
     set medical_history=null, current_medications=null, allergies=null, presenting_symptoms=null, updated_at=now()
   where user_id = p_user_id;

  update public.patient_reported_health
     set allergies=null, current_medications=null, updated_at=now()
   where patient_id = p_user_id;

  delete from public.patient_consents where user_id = p_user_id;

  perform private.log_audit('patient_data_erased', 'patient', p_user_id::text, null);
end;
$$;
revoke all on function public.admin_delete_patient_data(uuid) from public, anon;
grant execute on function public.admin_delete_patient_data(uuid) to authenticated;

create or replace view public.dashboard_my_ai_data
with (security_invoker = true) as
select pt.patient_id,
       pc.medical_history, pc.current_medications, pc.allergies, pc.presenting_symptoms,
       'The AI assistant receives ONLY the fields shown here (your MediFlow ID plus your symptoms and clinical notes). It never receives your name, age, gender, email, or civil ID.'::text as what_the_ai_sees
from public.patients pt
left join public.patient_clinical pc on pc.user_id = pt.user_id
where pt.user_id = (select auth.uid()) and private.is_patient();
grant select on public.dashboard_my_ai_data to authenticated;

commit;
