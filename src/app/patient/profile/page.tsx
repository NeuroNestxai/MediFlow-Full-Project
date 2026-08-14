import { requirePatient } from "@/lib/supabase/patient-auth";
import { ProfileClient } from "./ProfileClient";

// Reads the authenticated user + profile per request — never static.
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { profile, email, profileBlocked, mfId } = await requirePatient();

  return (
    <ProfileClient profile={profile} email={email} profileBlocked={profileBlocked} mfId={mfId} />
  );
}
