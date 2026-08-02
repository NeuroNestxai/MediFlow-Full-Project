-- =============================================================================
-- MediFlow AI — Expand & reconcile clinic directory (AUTHORITATIVE MCC workbook)
-- Migration: 20260802000002_expand_and_reconcile_clinic_directory
-- Source: docs/datasets/MediFlow_MCC_Complete_Prototype_Dataset.xlsx (02,03,05,06,07)
--
-- STRATEGY (explicit, idempotent, reconciling — NOT ON CONFLICT (slug) DO NOTHING):
--   * Directory rows are upserted BY PRIMARY KEY (id) with DO UPDATE, so the 3
--     pre-existing services keep their UUIDs but receive authoritative
--     slug/name/description/age_group (this is what a plain slug-based insert
--     could NOT do — it would hit a services_pkey duplicate on ids 202/203).
--   * doctor_services rows are upserted BY (doctor_id, service_id) DO UPDATE so
--     even the pre-existing Abbas->Diabetes row gets mapping_source + mcc_verified.
--   * Khawla Al Hotti is reconciled to the authoritative workbook:
--       - legacy doctors.specialty_id -> General & Chronic Care
--       - her doctor_specialties junction row (GCC) is added and kept
--       - her TWO outdated dental doctor_services rows (Cleaning, Root-canal) are
--         deleted; those services now belong to Samar Al Sinani (kept).
--   * Nadia Al Hajri keeps BOTH specialties in doctor_specialties; her legacy
--     doctors.specialty_id stays NULL (nothing silently chosen).
--   * Prototype doctor-service maps are stored with mcc_verified = false and a
--     mapping_source note; never presented as confirmed assignments.
--
-- SAFETY: single transaction; PREFLIGHT aborts before any change on unexpected
-- state; POSTFLIGHT asserts final counts. No table/RLS/RPC/trigger/profile/role
-- is dropped. The existing appointment + its doctor_id/service_id are untouched
-- (appointments have no FK to doctor_services, so the targeted DELETE cannot
-- affect any booking). Deterministic UUIDs; safe to re-run.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- PREFLIGHT: fail clearly BEFORE modifying data if the world isn't as expected.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.services where id = '22222222-2222-2222-2222-222222222202') then
    raise exception 'PREFLIGHT: expected existing service % (diabetes) is missing', '22222222-2222-2222-2222-222222222202'; end if;
  if not exists (select 1 from public.services where id = '22222222-2222-2222-2222-222222222201') then
    raise exception 'PREFLIGHT: expected existing service % (cleaning) is missing', '22222222-2222-2222-2222-222222222201'; end if;
  if not exists (select 1 from public.services where id = '22222222-2222-2222-2222-222222222203') then
    raise exception 'PREFLIGHT: expected existing service % (root-canal) is missing', '22222222-2222-2222-2222-222222222203'; end if;
  -- The two NEW authoritative slugs must not already be held by a DIFFERENT id.
  if exists (select 1 from public.services where slug = 'diabetes-blood-pressure-follow-up' and id <> '22222222-2222-2222-2222-222222222202') then
    raise exception 'PREFLIGHT: slug diabetes-blood-pressure-follow-up already used by another id'; end if;
  if exists (select 1 from public.services where slug = 'root-canal-treatment' and id <> '22222222-2222-2222-2222-222222222203') then
    raise exception 'PREFLIGHT: slug root-canal-treatment already used by another id'; end if;
  if not exists (select 1 from public.doctors where id = '33333333-3333-3333-3333-333333333302') then
    raise exception 'PREFLIGHT: expected existing doctor Khawla % is missing', '33333333-3333-3333-3333-333333333302'; end if;
  if not exists (select 1 from public.doctors where id = '33333333-3333-3333-3333-333333333301') then
    raise exception 'PREFLIGHT: expected existing doctor Abbas % is missing', '33333333-3333-3333-3333-333333333301'; end if;
  if not exists (select 1 from public.doctors where id = '33333333-3333-3333-3333-333333333303') then
    raise exception 'PREFLIGHT: expected existing doctor Fadi % is missing', '33333333-3333-3333-3333-333333333303'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Additive junction table for multi-specialty support (MCC-confirmed links).
-- ---------------------------------------------------------------------------
create table if not exists public.doctor_specialties (
  doctor_id     uuid not null references public.doctors(id)     on delete cascade,
  specialty_id  uuid not null references public.specialties(id) on delete cascade,
  source        text,
  mcc_verified  boolean not null default true,
  created_at    timestamptz not null default now(),
  primary key (doctor_id, specialty_id)
);
create index if not exists doctor_specialties_specialty_idx on public.doctor_specialties (specialty_id);
alter table public.doctor_specialties enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.doctor_specialties from anon, authenticated;
grant select on public.doctor_specialties to authenticated;
drop policy if exists doctor_specialties_read on public.doctor_specialties;
create policy doctor_specialties_read on public.doctor_specialties
  for select to authenticated
  using (
    exists (select 1 from public.doctors d    where d.id = doctor_id    and d.is_active)
    and exists (select 1 from public.specialties s where s.id = specialty_id and s.is_active)
  );

-- Additive prototype-provenance columns on the existing doctor_services table.
alter table public.doctor_services
  add column if not exists mapping_source text,
  add column if not exists mcc_verified   boolean not null default false;

-- SPECIALTIES (9) — upsert by id (existing 3 keep UUIDs; names refreshed)
insert into public.specialties (id, slug, name) values
  ('11111111-1111-1111-1111-111111111101', 'general-chronic-care', 'General & Chronic Care'),  -- SPC001
  ('11111111-1111-1111-1111-111111111102', 'general-dentistry', 'General Dentistry'),  -- SPC002
  ('24f36633-30f0-5fce-b2b9-9cef47b19597', 'pediatric-dentistry', 'Pediatric Dentistry'),  -- SPC003
  ('11111111-1111-1111-1111-111111111103', 'orthodontics', 'Orthodontics'),  -- SPC004
  ('7ef17e8a-0ca6-57d8-a659-43eec9282f0e', 'general-surgery', 'General Surgery'),  -- SPC005
  ('ed48f831-36c9-5d01-9abe-b2fa81ce3f83', 'pediatrics-infectious-disease', 'Pediatrics & Infectious Disease'),  -- SPC006
  ('9eea081b-1979-5d74-82db-ad29e8f59ecb', 'toxicology-emergency', 'Toxicology & Emergency'),  -- SPC007
  ('bc3018ac-c8d3-5859-87ef-2ffcc00f44e8', 'labs-medical-tests', 'Labs & Medical Tests'),  -- SPC008
  ('5ba56ea3-0079-5213-91dd-b3626e3e4dd7', 'dermatology-cosmetics', 'Dermatology & Cosmetics')  -- SPC009
on conflict (id) do update set slug = excluded.slug, name = excluded.name;

-- SERVICES (48) — upsert BY ID so existing ids 201/202/203 keep their UUIDs
-- but receive authoritative slug/name/description/age_group. price stays NULL.
insert into public.services (id, slug, specialty_id, name, description, age_group, price) values
  ('22222222-2222-2222-2222-222222222202', 'diabetes-blood-pressure-follow-up', '11111111-1111-1111-1111-111111111101', 'Diabetes & blood-pressure follow-up', 'Ongoing review for patients already managing diabetes or blood pressure with a clinician.', 'Adult', null),  -- SVC-GCC-01
  ('7610dcd7-c285-5800-8de6-ebdd4fd29df5', 'heart-disease-care', '11111111-1111-1111-1111-111111111101', 'Heart-disease care', 'Continued care and review for a previously documented heart condition.', 'Adult', null),  -- SVC-GCC-02
  ('92404e61-91eb-5dce-9a33-8d09d59b163b', 'general-consultations', '11111111-1111-1111-1111-111111111101', 'General consultations', 'A starting appointment for adults who need a general doctor or are unsure which service fits.', 'Adult', null),  -- SVC-GCC-03
  ('7a0e2b5a-e4fa-5e3c-99bf-2b4443470158', 'periodic-check-ups', '11111111-1111-1111-1111-111111111101', 'Periodic check-ups', 'A routine health review even when the patient does not have one specific concern.', 'Adult', null),  -- SVC-GCC-04
  ('badda939-61a0-57b2-ba5b-bdd4d34e39c0', 'chronic-disease-management', '11111111-1111-1111-1111-111111111101', 'Chronic-disease management', 'Coordinated follow-up for one or more long-term conditions and related records.', 'Adult', null),  -- SVC-GCC-05
  ('ac45a94f-9c94-5646-990f-6c9410c52377', 'cosmetic-fillings', '11111111-1111-1111-1111-111111111102', 'Cosmetic fillings', 'Dental fillings used to restore a tooth while matching its natural appearance.', 'Adult', null),  -- SVC-GD-01
  ('22222222-2222-2222-2222-222222222201', 'cleaning-whitening', '11111111-1111-1111-1111-111111111102', 'Cleaning & whitening', 'Professional tooth cleaning and cosmetic whitening services.', 'Adult', null),  -- SVC-GD-02
  ('b60c1d56-156d-54f1-9d1f-b01688c58ca1', 'gum-treatment', '11111111-1111-1111-1111-111111111102', 'Gum treatment', 'Dental care for gum concerns such as bleeding, irritation, or previously identified gum problems.', 'Adult', null),  -- SVC-GD-03
  ('d6d02515-c56a-547b-8a18-f81f8c3ca496', 'dental-crowns', '11111111-1111-1111-1111-111111111102', 'Dental crowns', 'Assessment or care for a dental crown used to cover and protect a tooth.', 'Adult', null),  -- SVC-GD-04
  ('22222222-2222-2222-2222-222222222203', 'root-canal-treatment', '11111111-1111-1111-1111-111111111102', 'Root-canal treatment', 'Dental treatment involving the inside of a tooth; the dentist decides whether it is needed.', 'Adult', null),  -- SVC-GD-05
  ('50cd70a0-1f2f-5ebb-a27d-7bea44d77bf4', 'cavity-prevention', '24f36633-30f0-5fce-b2b9-9cef47b19597', 'Cavity prevention', 'Preventive dental care that helps reduce the chance of cavities in children.', 'Child', null),  -- SVC-PD-01
  ('22b050f7-382e-59ad-b3aa-9c0102906472', 'baby-permanent-teeth-care', '24f36633-30f0-5fce-b2b9-9cef47b19597', 'Baby & permanent teeth care', 'Dental care for children’s baby teeth and growing permanent teeth.', 'Child', null),  -- SVC-PD-02
  ('20d6f10a-b4b8-57ae-8544-7e045f4900c5', 'laughing-gas-sedation', '24f36633-30f0-5fce-b2b9-9cef47b19597', 'Laughing-gas sedation', 'A calming dental option that a pediatric dentist may consider after reviewing the child.', 'Child', null),  -- SVC-PD-03
  ('7acae226-1b42-5b19-897e-6d46430de4a0', 'fluoride-sealants', '24f36633-30f0-5fce-b2b9-9cef47b19597', 'Fluoride & sealants', 'Preventive treatments that help protect children’s teeth from cavities.', 'Child', null),  -- SVC-PD-04
  ('e424044b-c51e-5980-aa7e-20755349a7e4', 'oral-health-education', '24f36633-30f0-5fce-b2b9-9cef47b19597', 'Oral-health education', 'Simple guidance for children and guardians about brushing, diet, and healthy dental habits.', 'Child', null),  -- SVC-PD-05
  ('232b4197-c414-5d09-acf2-e0adc4703c25', 'orthodontic-consultation', '11111111-1111-1111-1111-111111111103', 'Orthodontic consultation', 'A first assessment for tooth alignment, bite, braces, or retainer concerns.', 'All', null),  -- SVC-ORTH-01
  ('f8572a98-da24-590c-b038-b54b27e2192b', 'braces-assessment', '11111111-1111-1111-1111-111111111103', 'Braces assessment', 'An assessment to discuss whether braces may be appropriate; the orthodontist decides after review.', 'All', null),  -- SVC-ORTH-02
  ('418e39b8-e646-5251-b00e-99b684c97810', 'braces-follow-up', '11111111-1111-1111-1111-111111111103', 'Braces follow-up', 'A planned review for a patient who already has braces.', 'All', null),  -- SVC-ORTH-03
  ('cb035e6d-8042-53fb-ac4c-4e7685e89480', 'retainer-assessment', '11111111-1111-1111-1111-111111111103', 'Retainer assessment', 'A check of a dental retainer’s fit, condition, or use.', 'All', null),  -- SVC-ORTH-04
  ('c6142fa0-5662-590d-b3ba-e14f108ab301', 'teeth-alignment-assessment', '11111111-1111-1111-1111-111111111103', 'Teeth-alignment assessment', 'An orthodontic review of tooth positioning and bite alignment.', 'All', null),  -- SVC-ORTH-05
  ('8b541638-d262-5071-bf31-253683d4581a', 'modern-general-surgery', '7ef17e8a-0ca6-57d8-a659-43eec9282f0e', 'Modern general surgery', 'General surgical consultation using current surgical approaches and clinician assessment.', 'Adult', null),  -- SVC-GS-01
  ('90a33d3e-84ea-5703-a632-da70df37ef26', 'pre-operative-care', '7ef17e8a-0ca6-57d8-a659-43eec9282f0e', 'Pre-operative care', 'Preparation and record review before a planned operation.', 'Adult', null),  -- SVC-GS-02
  ('ea2ec1d8-3225-566d-b01e-56752ccd5c81', 'post-operative-care', '7ef17e8a-0ca6-57d8-a659-43eec9282f0e', 'Post-operative care', 'Follow-up after an operation, based on the surgeon’s discharge and review plan.', 'Adult', null),  -- SVC-GS-03
  ('8bba0889-91a8-573d-9499-020bceb9bc6a', 'surgical-assessment', '7ef17e8a-0ca6-57d8-a659-43eec9282f0e', 'Surgical assessment', 'A consultation where a surgeon reviews a concern, referral, or previous reports.', 'Adult', null),  -- SVC-GS-04
  ('e2def5a2-5e8d-57e4-b260-e8e0c19d3e8f', 'laparoscopic-surgery', '7ef17e8a-0ca6-57d8-a659-43eec9282f0e', 'Laparoscopic surgery', 'Surgery using small openings and specialised instruments; suitability is decided by the surgeon.', 'Adult', null),  -- SVC-GS-05
  ('f97469ce-06c2-5c54-b2e9-0e37ff9b0eb9', 'diabetic-foot-podiatry', '7ef17e8a-0ca6-57d8-a659-43eec9282f0e', 'Diabetic foot & podiatry', 'Foot care, including diabetic-foot support and podiatry services.', 'Adult', null),  -- SVC-GS-06
  ('4d2a24a8-11cc-5adc-87f2-7581aa5d136d', 'advanced-wound-management', '7ef17e8a-0ca6-57d8-a659-43eec9282f0e', 'Advanced wound management', 'Structured care for wounds that need continued professional assessment and dressing support.', 'Adult', null),  -- SVC-GS-07
  ('c70f1f78-b17c-5de0-aba8-f562088cc26d', 'infant-child-care', 'ed48f831-36c9-5d01-9abe-b2fa81ce3f83', 'Infant & child care', 'General healthcare appointments for babies and children.', 'Child', null),  -- SVC-PED-01
  ('a8494758-cf47-52fa-8679-8d138894381c', 'infectious-disease-care', 'ed48f831-36c9-5d01-9abe-b2fa81ce3f83', 'Infectious-disease care', 'Pediatric assessment for a previously suspected or referred infectious-disease concern.', 'Child', null),  -- SVC-PED-02
  ('5ed20ce4-8dd9-5284-a2bb-a2fbe8af47f3', 'growth-development', 'ed48f831-36c9-5d01-9abe-b2fa81ce3f83', 'Growth & development', 'Review of a child’s growth, milestones, development, or related records.', 'Child', null),  -- SVC-PED-03
  ('dcc0413d-f706-5ea5-b9bf-73c05f4eb2a6', 'vaccinations', 'ed48f831-36c9-5d01-9abe-b2fa81ce3f83', 'Vaccinations', 'Child vaccination booking and vaccination-record review.', 'Child', null),  -- SVC-PED-04
  ('f6d17f5e-2499-59e1-8b14-816eb004ac3a', 'nutrition-counseling', 'ed48f831-36c9-5d01-9abe-b2fa81ce3f83', 'Nutrition counseling', 'Nutrition and feeding guidance for infants and children after professional review.', 'Child', null),  -- SVC-PED-05
  ('994e9190-5b65-555d-b71f-a86524143a3f', 'drug-poisoning', '9eea081b-1979-5d74-82db-ad29e8f59ecb', 'Drug poisoning', 'MCC service information related to possible medicine or drug poisoning.', 'All', null),  -- SVC-TE-01
  ('e5300364-3a07-5c5f-8e7c-7ae2dab49b1f', 'chemical-poisoning', '9eea081b-1979-5d74-82db-ad29e8f59ecb', 'Chemical poisoning', 'MCC service information related to possible chemical exposure or poisoning.', 'All', null),  -- SVC-TE-02
  ('342dde55-46f9-5ad4-9f10-559cc65ff230', 'venomous-bites', '9eea081b-1979-5d74-82db-ad29e8f59ecb', 'Venomous bites', 'MCC service information related to venomous bites or stings.', 'All', null),  -- SVC-TE-03
  ('7f1888be-1ca0-51bb-803b-5ac5569090c3', 'rapid-emergency-response', '9eea081b-1979-5d74-82db-ad29e8f59ecb', 'Rapid emergency response', 'MCC rapid-response service information. The assistant does not assess urgency.', 'All', null),  -- SVC-TE-04
  ('b6d02342-d434-5862-93b6-0243d18ef9ef', 'critical-care-support', '9eea081b-1979-5d74-82db-ad29e8f59ecb', 'Critical-care support', 'MCC critical-care support information. The assistant does not assess urgency.', 'All', null),  -- SVC-TE-05
  ('743b238d-6892-5b29-99ed-0b6ad555782d', 'complete-blood-panels', 'bc3018ac-c8d3-5859-87ef-2ffcc00f44e8', 'Complete blood panels', 'A group of blood tests requested to review different blood components.', 'All', null),  -- SVC-LAB-01
  ('5e517336-f8d5-5284-95e4-edb84c7e93d4', 'lipids-glucose', 'bc3018ac-c8d3-5859-87ef-2ffcc00f44e8', 'Lipids & glucose', 'Blood tests related to cholesterol, fats in the blood, and blood sugar.', 'All', null),  -- SVC-LAB-02
  ('ff8a1626-7c35-5af8-86bb-2d0b28341a88', 'liver-kidney-function', 'bc3018ac-c8d3-5859-87ef-2ffcc00f44e8', 'Liver & kidney function', 'Blood or laboratory tests used by clinicians to review liver and kidney function.', 'All', null),  -- SVC-LAB-03
  ('f148acd0-a9fd-53e6-8390-3c6ca96418ca', 'hormone-tests', 'bc3018ac-c8d3-5859-87ef-2ffcc00f44e8', 'Hormone tests', 'Laboratory tests for a specific hormone requested by a clinician.', 'All', null),  -- SVC-LAB-04
  ('f263abf0-13d3-5d3f-9478-4f3d37b2209c', 'pre-marital-screening', 'bc3018ac-c8d3-5859-87ef-2ffcc00f44e8', 'Pre-marital screening', 'Screening tests and required steps completed before marriage.', 'Adult', null),  -- SVC-LAB-05
  ('00846239-53ce-578f-9811-b93e5115618a', 'allergy-testing', 'bc3018ac-c8d3-5859-87ef-2ffcc00f44e8', 'Allergy testing', 'Laboratory or clinic testing requested to investigate a possible allergy.', 'All', null),  -- SVC-LAB-06
  ('add9d7bf-c802-5148-a48b-5a82f6ece823', 'acne-pigmentation', '5ba56ea3-0079-5213-91dd-b3626e3e4dd7', 'Acne & pigmentation', 'Dermatology care for acne, dark spots, or uneven skin colour.', 'All', null),  -- SVC-DERM-01
  ('75f5cb1e-46a3-5bf9-af6d-de8aa0245323', 'wrinkles-vitiligo-psoriasis', '5ba56ea3-0079-5213-91dd-b3626e3e4dd7', 'Wrinkles, vitiligo & psoriasis', 'Dermatology services for wrinkles and previously identified vitiligo or psoriasis concerns.', 'All', null),  -- SVC-DERM-02
  ('39d3acc0-3dd7-5401-93ff-66b3ea3012d2', 'laser-hair-removal', '5ba56ea3-0079-5213-91dd-b3626e3e4dd7', 'Laser hair removal', 'A cosmetic laser assessment for reducing unwanted hair.', 'Adult', null),  -- SVC-DERM-03
  ('cee50d88-23e0-5bb7-9994-81be0bd4472b', 'deep-chemical-peels', '5ba56ea3-0079-5213-91dd-b3626e3e4dd7', 'Deep chemical peels', 'A cosmetic skin-resurfacing assessment; suitability is decided by the clinician.', 'Adult', null),  -- SVC-DERM-04
  ('1f67a0ea-3d49-5bcd-8b1d-90f264ad59fe', 'hair-loss-treatment', '5ba56ea3-0079-5213-91dd-b3626e3e4dd7', 'Hair-loss treatment', 'Dermatology assessment for hair thinning, shedding, or patchy hair loss.', 'All', null)  -- SVC-DERM-05
on conflict (id) do update set slug = excluded.slug, specialty_id = excluded.specialty_id,
  name = excluded.name, description = excluded.description, age_group = excluded.age_group;

-- DOCTORS (11) — insert new; for existing rows refresh name/gender only and
-- PRESERVE existing portrait_palette. specialty_id is NOT overwritten here
-- (Khawla is corrected explicitly below; new doctors get their value on insert).
insert into public.doctors (id, slug, full_name, specialty_id, gender, portrait_palette) values
  ('33333333-3333-3333-3333-333333333301', 'abbas-pakkyara', 'Dr. Abbas Pakkyara', '11111111-1111-1111-1111-111111111101', 'Male', null),  -- DOC-001
  ('33333333-3333-3333-3333-333333333302', 'khawla-al-hotti', 'Dr. Khawla Al Hotti', '11111111-1111-1111-1111-111111111101', 'Female', null),  -- DOC-002
  ('3f29b873-ec25-5eb9-bed3-f44937dd5438', 'hayat-al-koyoumi', 'Dr. Hayat Al Koyoumi', '11111111-1111-1111-1111-111111111101', 'Female', null),  -- DOC-003
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb', 'nadia-al-hajri', 'Dr. Nadia Al Hajri', null, 'Female', null),  -- DOC-004  [MULTI -> specialty_id NULL]
  ('2f5397dd-71b5-56db-9fdb-87ef9ae46455', 'samar-al-sinani', 'Dr. Samar Al Sinani', '11111111-1111-1111-1111-111111111102', 'Female', null),  -- DOC-005
  ('079b0246-1a2a-5375-a9bc-d73514bbff0e', 'fatma-al-khoudr', 'Dr. Fatma Al Khoudr', '24f36633-30f0-5fce-b2b9-9cef47b19597', 'Female', null),  -- DOC-006
  ('33333333-3333-3333-3333-333333333303', 'fadi-mosa', 'Dr. Fadi Mosa', '11111111-1111-1111-1111-111111111103', 'Male', null),  -- DOC-007
  ('c449c097-775a-510c-9300-e2bb8fb1d298', 'magdi-ashria', 'Dr. Magdi Ashria', '7ef17e8a-0ca6-57d8-a659-43eec9282f0e', 'Male', null),  -- DOC-008
  ('face5aaa-db0f-5988-bfc6-1137dfef9caf', 'nawal-al-maskari', 'Dr. Nawal Al Maskari', 'ed48f831-36c9-5d01-9abe-b2fa81ce3f83', 'Female', null),  -- DOC-009
  ('a5729a99-8e4b-5523-897e-7b2897a0c202', 'raya-al-hajri', 'Dr. Raya Al Hajri', '5ba56ea3-0079-5213-91dd-b3626e3e4dd7', 'Female', null),  -- DOC-010
  ('a9c56ae6-40b6-59b6-93e9-df70166d412c', 'siham', 'Dr. Siham', 'bc3018ac-c8d3-5859-87ef-2ffcc00f44e8', 'Female', null)  -- DOC-011
on conflict (id) do update set full_name = excluded.full_name, gender = excluded.gender,
  portrait_palette = coalesce(doctors.portrait_palette, excluded.portrait_palette);

-- KHAWLA reconciliation (1/2): correct legacy specialty_id to General & Chronic Care.
update public.doctors set specialty_id = '11111111-1111-1111-1111-111111111101' where id = '33333333-3333-3333-3333-333333333302';

-- DOCTOR -> SPECIALTY (12 confirmed; incl. Nadia's two). Upsert by pair.
insert into public.doctor_specialties (doctor_id, specialty_id, source, mcc_verified) values
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111101', 'MCC-confirmed by project team', true),  -- DSM-001 Abbas Pakkyara / General & Chronic Care
  ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111101', 'MCC-confirmed by project team', true),  -- DSM-002 Khawla Al Hotti / General & Chronic Care
  ('3f29b873-ec25-5eb9-bed3-f44937dd5438', '11111111-1111-1111-1111-111111111101', 'MCC-confirmed by project team', true),  -- DSM-003 Hayat Al Koyoumi / General & Chronic Care
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb', '11111111-1111-1111-1111-111111111101', 'MCC-confirmed by project team', true),  -- DSM-004 Nadia Al Hajri / General & Chronic Care
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb', '9eea081b-1979-5d74-82db-ad29e8f59ecb', 'MCC-confirmed by project team', true),  -- DSM-005 Nadia Al Hajri / Toxicology & Emergency
  ('2f5397dd-71b5-56db-9fdb-87ef9ae46455', '11111111-1111-1111-1111-111111111102', 'MCC-confirmed by project team', true),  -- DSM-006 Samar Al Sinani / General Dentistry
  ('079b0246-1a2a-5375-a9bc-d73514bbff0e', '24f36633-30f0-5fce-b2b9-9cef47b19597', 'MCC-confirmed by project team', true),  -- DSM-007 Fatma Al Khoudr / Pediatric Dentistry
  ('33333333-3333-3333-3333-333333333303', '11111111-1111-1111-1111-111111111103', 'MCC-confirmed by project team', true),  -- DSM-008 Fadi Mosa / Orthodontics
  ('c449c097-775a-510c-9300-e2bb8fb1d298', '7ef17e8a-0ca6-57d8-a659-43eec9282f0e', 'MCC-confirmed by project team', true),  -- DSM-009 Magdi Ashria / General Surgery
  ('face5aaa-db0f-5988-bfc6-1137dfef9caf', 'ed48f831-36c9-5d01-9abe-b2fa81ce3f83', 'MCC-confirmed by project team', true),  -- DSM-010 Nawal Al Maskari / Pediatrics & Infectious Disease
  ('a5729a99-8e4b-5523-897e-7b2897a0c202', '5ba56ea3-0079-5213-91dd-b3626e3e4dd7', 'MCC-confirmed by project team', true),  -- DSM-011 Raya Al Hajri / Dermatology & Cosmetics
  ('a9c56ae6-40b6-59b6-93e9-df70166d412c', 'bc3018ac-c8d3-5859-87ef-2ffcc00f44e8', 'MCC-confirmed by project team', true)  -- DSM-012 Siham / Labs & Medical Tests
on conflict (doctor_id, specialty_id) do update set source = excluded.source, mcc_verified = excluded.mcc_verified;

-- DOCTOR -> SERVICE (63 PROTOTYPE; mcc_verified=false). Upsert by pair so the
-- pre-existing Abbas->Diabetes row also gets mapping_source + mcc_verified.
insert into public.doctor_services (doctor_id, service_id, mapping_source, mcc_verified) values
  ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222202', 'Prototype assumption within confirmed specialty', false),  -- DSV-001 Abbas Pakkyara / Diabetes & blood-pressure follow-up
  ('33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222202', 'Prototype assumption within confirmed specialty', false),  -- DSV-002 Khawla Al Hotti / Diabetes & blood-pressure follow-up
  ('3f29b873-ec25-5eb9-bed3-f44937dd5438', '22222222-2222-2222-2222-222222222202', 'Prototype assumption within confirmed specialty', false),  -- DSV-003 Hayat Al Koyoumi / Diabetes & blood-pressure follow-up
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb', '22222222-2222-2222-2222-222222222202', 'Prototype assumption within confirmed specialty', false),  -- DSV-004 Nadia Al Hajri / Diabetes & blood-pressure follow-up
  ('33333333-3333-3333-3333-333333333301', '7610dcd7-c285-5800-8de6-ebdd4fd29df5', 'Prototype assumption within confirmed specialty', false),  -- DSV-005 Abbas Pakkyara / Heart-disease care
  ('33333333-3333-3333-3333-333333333302', '7610dcd7-c285-5800-8de6-ebdd4fd29df5', 'Prototype assumption within confirmed specialty', false),  -- DSV-006 Khawla Al Hotti / Heart-disease care
  ('3f29b873-ec25-5eb9-bed3-f44937dd5438', '7610dcd7-c285-5800-8de6-ebdd4fd29df5', 'Prototype assumption within confirmed specialty', false),  -- DSV-007 Hayat Al Koyoumi / Heart-disease care
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb', '7610dcd7-c285-5800-8de6-ebdd4fd29df5', 'Prototype assumption within confirmed specialty', false),  -- DSV-008 Nadia Al Hajri / Heart-disease care
  ('33333333-3333-3333-3333-333333333301', '92404e61-91eb-5dce-9a33-8d09d59b163b', 'Prototype assumption within confirmed specialty', false),  -- DSV-009 Abbas Pakkyara / General consultations
  ('33333333-3333-3333-3333-333333333302', '92404e61-91eb-5dce-9a33-8d09d59b163b', 'Prototype assumption within confirmed specialty', false),  -- DSV-010 Khawla Al Hotti / General consultations
  ('3f29b873-ec25-5eb9-bed3-f44937dd5438', '92404e61-91eb-5dce-9a33-8d09d59b163b', 'Prototype assumption within confirmed specialty', false),  -- DSV-011 Hayat Al Koyoumi / General consultations
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb', '92404e61-91eb-5dce-9a33-8d09d59b163b', 'Prototype assumption within confirmed specialty', false),  -- DSV-012 Nadia Al Hajri / General consultations
  ('33333333-3333-3333-3333-333333333301', '7a0e2b5a-e4fa-5e3c-99bf-2b4443470158', 'Prototype assumption within confirmed specialty', false),  -- DSV-013 Abbas Pakkyara / Periodic check-ups
  ('33333333-3333-3333-3333-333333333302', '7a0e2b5a-e4fa-5e3c-99bf-2b4443470158', 'Prototype assumption within confirmed specialty', false),  -- DSV-014 Khawla Al Hotti / Periodic check-ups
  ('3f29b873-ec25-5eb9-bed3-f44937dd5438', '7a0e2b5a-e4fa-5e3c-99bf-2b4443470158', 'Prototype assumption within confirmed specialty', false),  -- DSV-015 Hayat Al Koyoumi / Periodic check-ups
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb', '7a0e2b5a-e4fa-5e3c-99bf-2b4443470158', 'Prototype assumption within confirmed specialty', false),  -- DSV-016 Nadia Al Hajri / Periodic check-ups
  ('33333333-3333-3333-3333-333333333301', 'badda939-61a0-57b2-ba5b-bdd4d34e39c0', 'Prototype assumption within confirmed specialty', false),  -- DSV-017 Abbas Pakkyara / Chronic-disease management
  ('33333333-3333-3333-3333-333333333302', 'badda939-61a0-57b2-ba5b-bdd4d34e39c0', 'Prototype assumption within confirmed specialty', false),  -- DSV-018 Khawla Al Hotti / Chronic-disease management
  ('3f29b873-ec25-5eb9-bed3-f44937dd5438', 'badda939-61a0-57b2-ba5b-bdd4d34e39c0', 'Prototype assumption within confirmed specialty', false),  -- DSV-019 Hayat Al Koyoumi / Chronic-disease management
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb', 'badda939-61a0-57b2-ba5b-bdd4d34e39c0', 'Prototype assumption within confirmed specialty', false),  -- DSV-020 Nadia Al Hajri / Chronic-disease management
  ('2f5397dd-71b5-56db-9fdb-87ef9ae46455', 'ac45a94f-9c94-5646-990f-6c9410c52377', 'Prototype assumption within confirmed specialty', false),  -- DSV-021 Samar Al Sinani / Cosmetic fillings
  ('2f5397dd-71b5-56db-9fdb-87ef9ae46455', '22222222-2222-2222-2222-222222222201', 'Prototype assumption within confirmed specialty', false),  -- DSV-022 Samar Al Sinani / Cleaning & whitening
  ('2f5397dd-71b5-56db-9fdb-87ef9ae46455', 'b60c1d56-156d-54f1-9d1f-b01688c58ca1', 'Prototype assumption within confirmed specialty', false),  -- DSV-023 Samar Al Sinani / Gum treatment
  ('2f5397dd-71b5-56db-9fdb-87ef9ae46455', 'd6d02515-c56a-547b-8a18-f81f8c3ca496', 'Prototype assumption within confirmed specialty', false),  -- DSV-024 Samar Al Sinani / Dental crowns
  ('2f5397dd-71b5-56db-9fdb-87ef9ae46455', '22222222-2222-2222-2222-222222222203', 'Prototype assumption within confirmed specialty', false),  -- DSV-025 Samar Al Sinani / Root-canal treatment
  ('079b0246-1a2a-5375-a9bc-d73514bbff0e', '50cd70a0-1f2f-5ebb-a27d-7bea44d77bf4', 'Prototype assumption within confirmed specialty', false),  -- DSV-026 Fatma Al Khoudr / Cavity prevention
  ('079b0246-1a2a-5375-a9bc-d73514bbff0e', '22b050f7-382e-59ad-b3aa-9c0102906472', 'Prototype assumption within confirmed specialty', false),  -- DSV-027 Fatma Al Khoudr / Baby & permanent teeth care
  ('079b0246-1a2a-5375-a9bc-d73514bbff0e', '20d6f10a-b4b8-57ae-8544-7e045f4900c5', 'Prototype assumption within confirmed specialty', false),  -- DSV-028 Fatma Al Khoudr / Laughing-gas sedation
  ('079b0246-1a2a-5375-a9bc-d73514bbff0e', '7acae226-1b42-5b19-897e-6d46430de4a0', 'Prototype assumption within confirmed specialty', false),  -- DSV-029 Fatma Al Khoudr / Fluoride & sealants
  ('079b0246-1a2a-5375-a9bc-d73514bbff0e', 'e424044b-c51e-5980-aa7e-20755349a7e4', 'Prototype assumption within confirmed specialty', false),  -- DSV-030 Fatma Al Khoudr / Oral-health education
  ('33333333-3333-3333-3333-333333333303', '232b4197-c414-5d09-acf2-e0adc4703c25', 'Prototype assumption within confirmed specialty', false),  -- DSV-031 Fadi Mosa / Orthodontic consultation
  ('33333333-3333-3333-3333-333333333303', 'f8572a98-da24-590c-b038-b54b27e2192b', 'Prototype assumption within confirmed specialty', false),  -- DSV-032 Fadi Mosa / Braces assessment
  ('33333333-3333-3333-3333-333333333303', '418e39b8-e646-5251-b00e-99b684c97810', 'Prototype assumption within confirmed specialty', false),  -- DSV-033 Fadi Mosa / Braces follow-up
  ('33333333-3333-3333-3333-333333333303', 'cb035e6d-8042-53fb-ac4c-4e7685e89480', 'Prototype assumption within confirmed specialty', false),  -- DSV-034 Fadi Mosa / Retainer assessment
  ('33333333-3333-3333-3333-333333333303', 'c6142fa0-5662-590d-b3ba-e14f108ab301', 'Prototype assumption within confirmed specialty', false),  -- DSV-035 Fadi Mosa / Teeth-alignment assessment
  ('c449c097-775a-510c-9300-e2bb8fb1d298', '8b541638-d262-5071-bf31-253683d4581a', 'Prototype assumption within confirmed specialty', false),  -- DSV-036 Magdi Ashria / Modern general surgery
  ('c449c097-775a-510c-9300-e2bb8fb1d298', '90a33d3e-84ea-5703-a632-da70df37ef26', 'Prototype assumption within confirmed specialty', false),  -- DSV-037 Magdi Ashria / Pre-operative care
  ('c449c097-775a-510c-9300-e2bb8fb1d298', 'ea2ec1d8-3225-566d-b01e-56752ccd5c81', 'Prototype assumption within confirmed specialty', false),  -- DSV-038 Magdi Ashria / Post-operative care
  ('c449c097-775a-510c-9300-e2bb8fb1d298', '8bba0889-91a8-573d-9499-020bceb9bc6a', 'Prototype assumption within confirmed specialty', false),  -- DSV-039 Magdi Ashria / Surgical assessment
  ('c449c097-775a-510c-9300-e2bb8fb1d298', 'e2def5a2-5e8d-57e4-b260-e8e0c19d3e8f', 'Prototype assumption within confirmed specialty', false),  -- DSV-040 Magdi Ashria / Laparoscopic surgery
  ('c449c097-775a-510c-9300-e2bb8fb1d298', 'f97469ce-06c2-5c54-b2e9-0e37ff9b0eb9', 'Prototype assumption within confirmed specialty', false),  -- DSV-041 Magdi Ashria / Diabetic foot & podiatry
  ('c449c097-775a-510c-9300-e2bb8fb1d298', '4d2a24a8-11cc-5adc-87f2-7581aa5d136d', 'Prototype assumption within confirmed specialty', false),  -- DSV-042 Magdi Ashria / Advanced wound management
  ('face5aaa-db0f-5988-bfc6-1137dfef9caf', 'c70f1f78-b17c-5de0-aba8-f562088cc26d', 'Prototype assumption within confirmed specialty', false),  -- DSV-043 Nawal Al Maskari / Infant & child care
  ('face5aaa-db0f-5988-bfc6-1137dfef9caf', 'a8494758-cf47-52fa-8679-8d138894381c', 'Prototype assumption within confirmed specialty', false),  -- DSV-044 Nawal Al Maskari / Infectious-disease care
  ('face5aaa-db0f-5988-bfc6-1137dfef9caf', '5ed20ce4-8dd9-5284-a2bb-a2fbe8af47f3', 'Prototype assumption within confirmed specialty', false),  -- DSV-045 Nawal Al Maskari / Growth & development
  ('face5aaa-db0f-5988-bfc6-1137dfef9caf', 'dcc0413d-f706-5ea5-b9bf-73c05f4eb2a6', 'Prototype assumption within confirmed specialty', false),  -- DSV-046 Nawal Al Maskari / Vaccinations
  ('face5aaa-db0f-5988-bfc6-1137dfef9caf', 'f6d17f5e-2499-59e1-8b14-816eb004ac3a', 'Prototype assumption within confirmed specialty', false),  -- DSV-047 Nawal Al Maskari / Nutrition counseling
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb', '994e9190-5b65-555d-b71f-a86524143a3f', 'Prototype assumption within confirmed specialty', false),  -- DSV-048 Nadia Al Hajri / Drug poisoning
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb', 'e5300364-3a07-5c5f-8e7c-7ae2dab49b1f', 'Prototype assumption within confirmed specialty', false),  -- DSV-049 Nadia Al Hajri / Chemical poisoning
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb', '342dde55-46f9-5ad4-9f10-559cc65ff230', 'Prototype assumption within confirmed specialty', false),  -- DSV-050 Nadia Al Hajri / Venomous bites
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb', '7f1888be-1ca0-51bb-803b-5ac5569090c3', 'Prototype assumption within confirmed specialty', false),  -- DSV-051 Nadia Al Hajri / Rapid emergency response
  ('8b16e33f-b21b-5827-8b37-8210aee67bbb', 'b6d02342-d434-5862-93b6-0243d18ef9ef', 'Prototype assumption within confirmed specialty', false),  -- DSV-052 Nadia Al Hajri / Critical-care support
  ('a9c56ae6-40b6-59b6-93e9-df70166d412c', '743b238d-6892-5b29-99ed-0b6ad555782d', 'Prototype assumption within confirmed specialty', false),  -- DSV-053 Siham / Complete blood panels
  ('a9c56ae6-40b6-59b6-93e9-df70166d412c', '5e517336-f8d5-5284-95e4-edb84c7e93d4', 'Prototype assumption within confirmed specialty', false),  -- DSV-054 Siham / Lipids & glucose
  ('a9c56ae6-40b6-59b6-93e9-df70166d412c', 'ff8a1626-7c35-5af8-86bb-2d0b28341a88', 'Prototype assumption within confirmed specialty', false),  -- DSV-055 Siham / Liver & kidney function
  ('a9c56ae6-40b6-59b6-93e9-df70166d412c', 'f148acd0-a9fd-53e6-8390-3c6ca96418ca', 'Prototype assumption within confirmed specialty', false),  -- DSV-056 Siham / Hormone tests
  ('a9c56ae6-40b6-59b6-93e9-df70166d412c', 'f263abf0-13d3-5d3f-9478-4f3d37b2209c', 'Prototype assumption within confirmed specialty', false),  -- DSV-057 Siham / Pre-marital screening
  ('a9c56ae6-40b6-59b6-93e9-df70166d412c', '00846239-53ce-578f-9811-b93e5115618a', 'Prototype assumption within confirmed specialty', false),  -- DSV-058 Siham / Allergy testing
  ('a5729a99-8e4b-5523-897e-7b2897a0c202', 'add9d7bf-c802-5148-a48b-5a82f6ece823', 'Prototype assumption within confirmed specialty', false),  -- DSV-059 Raya Al Hajri / Acne & pigmentation
  ('a5729a99-8e4b-5523-897e-7b2897a0c202', '75f5cb1e-46a3-5bf9-af6d-de8aa0245323', 'Prototype assumption within confirmed specialty', false),  -- DSV-060 Raya Al Hajri / Wrinkles, vitiligo & psoriasis
  ('a5729a99-8e4b-5523-897e-7b2897a0c202', '39d3acc0-3dd7-5401-93ff-66b3ea3012d2', 'Prototype assumption within confirmed specialty', false),  -- DSV-061 Raya Al Hajri / Laser hair removal
  ('a5729a99-8e4b-5523-897e-7b2897a0c202', 'cee50d88-23e0-5bb7-9994-81be0bd4472b', 'Prototype assumption within confirmed specialty', false),  -- DSV-062 Raya Al Hajri / Deep chemical peels
  ('a5729a99-8e4b-5523-897e-7b2897a0c202', '1f67a0ea-3d49-5bcd-8b1d-90f264ad59fe', 'Prototype assumption within confirmed specialty', false)  -- DSV-063 Raya Al Hajri / Hair-loss treatment
on conflict (doctor_id, service_id) do update set mapping_source = excluded.mapping_source, mcc_verified = excluded.mcc_verified;

-- KHAWLA reconciliation (2/2): remove ONLY her two outdated dental mappings
-- (Cleaning & Whitening, Root-canal). These belong to Samar in the workbook and
-- Samar's rows are inserted above. Appointments are unaffected (no FK to this table).
delete from public.doctor_services where doctor_id = '33333333-3333-3333-3333-333333333302' and service_id in ('22222222-2222-2222-2222-222222222201', '22222222-2222-2222-2222-222222222203');

-- ---------------------------------------------------------------------------
-- POSTFLIGHT: assert the reconciled end state; any mismatch rolls back.
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.specialties)      <> 9  then raise exception 'POST: specialties <> 9';  end if;
  if (select count(*) from public.services)         <> 48 then raise exception 'POST: services <> 48';    end if;
  if (select count(*) from public.doctors)          <> 11 then raise exception 'POST: doctors <> 11';     end if;
  if (select count(*) from public.doctor_specialties) <> 12 then raise exception 'POST: doctor_specialties <> 12'; end if;
  if (select count(*) from public.doctor_services)  <> 63 then raise exception 'POST: doctor_services <> 63'; end if;
  if (select specialty_id from public.doctors where id = '33333333-3333-3333-3333-333333333302') is distinct from '11111111-1111-1111-1111-111111111101'::uuid
    then raise exception 'POST: Khawla specialty_id not General & Chronic Care'; end if;
  if exists (select 1 from public.doctor_services where doctor_id = '33333333-3333-3333-3333-333333333302' and service_id in ('22222222-2222-2222-2222-222222222201','22222222-2222-2222-2222-222222222203'))
    then raise exception 'POST: Khawla dental mappings still present'; end if;
  if (select count(*) from public.doctor_services where doctor_id = '2f5397dd-71b5-56db-9fdb-87ef9ae46455') <> 5
    then raise exception 'POST: Samar should have 5 service mappings'; end if;
  if (select mapping_source from public.doctor_services where doctor_id = '33333333-3333-3333-3333-333333333301' and service_id = '22222222-2222-2222-2222-222222222202')
       is distinct from 'Prototype assumption within confirmed specialty'
    then raise exception 'POST: Abbas->Diabetes provenance not set'; end if;
  if (select specialty_id from public.doctors where id = '8b16e33f-b21b-5827-8b37-8210aee67bbb') is not null
    then raise exception 'POST: Nadia legacy specialty_id should be NULL'; end if;
  if (select count(*) from public.doctor_specialties where doctor_id = '8b16e33f-b21b-5827-8b37-8210aee67bbb') <> 2
    then raise exception 'POST: Nadia should have 2 specialties'; end if;
end $$;

commit;

