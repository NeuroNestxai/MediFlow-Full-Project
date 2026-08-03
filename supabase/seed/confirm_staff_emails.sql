-- =============================================================================
-- Confirm staff email addresses.
--
-- Supabase's built-in email service is rate-limited (a few messages per hour on
-- the free tier). Creating a user WITHOUT "Auto Confirm User" ticked tries to
-- send a confirmation email, and once the limit is hit, user creation fails.
--
-- This marks the MCC staff addresses as confirmed so they can sign in without
-- any email being sent. Safe to re-run.
--
-- Only touches @mccoman.com staff accounts — patient accounts are untouched,
-- because a patient confirming their own address is a real check we want to
-- keep.
-- =============================================================================

update auth.users
   set email_confirmed_at = coalesce(email_confirmed_at, now())
 where lower(email) like '%@mccoman.com'
   and email_confirmed_at is null;

-- What exists now, and whether each account can actually sign in.
select lower(u.email)                                              as email,
       case when u.email_confirmed_at is null
            then 'NOT CONFIRMED — cannot sign in'
            else 'confirmed' end                                   as sign_in_status,
       coalesce(string_agg(distinct ur.role::text, ' + ' order by ur.role::text),
                '— no role yet —')                                 as roles,
       coalesce(max(d.full_name), '— not linked —')                as linked_doctor
  from auth.users u
  left join public.user_roles ur on ur.user_id = u.id
  left join public.doctors    d  on d.user_id  = u.id
 where lower(u.email) like '%@mccoman.com'
 group by lower(u.email), u.email_confirmed_at
 order by 1;
