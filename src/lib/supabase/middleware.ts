import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Each role area requires the matching role, read from public.user_roles.
const AREA_ROLES = ["patient", "doctor", "reception"] as const;
type AreaRole = (typeof AREA_ROLES)[number];
const SIGN_IN_PATH = "/auth/sign-in";
const PERMISSION_DENIED_PATH = "/auth/permission-denied";

function areaFor(pathname: string): AreaRole | null {
  for (const role of AREA_ROLES) {
    if (pathname === `/${role}` || pathname.startsWith(`/${role}/`)) return role;
  }
  return null;
}

/**
 * Refreshes the Supabase session and enforces role-based access at the edge for
 * every /patient/*, /doctor/*, and /reception/* route:
 *   - no session on a protected route  → /auth/sign-in
 *   - session but the DB role does not match the area → /auth/permission-denied
 *
 * The role is read from public.user_roles via the authenticated (RLS-scoped)
 * client. No secrets/IDs/errors are ever written to the response.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: getUser() revalidates the token; keep it immediately after client creation.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const area = areaFor(request.nextUrl.pathname);
  if (!area) {
    return supabaseResponse;
  }

  if (!user) {
    // Preserve where they were headed (e.g. a QR check-in link) as a same-site
    // `next` param, so sign-in can safely return them there afterward instead
    // of dropping them on the generic dashboard. auth-roles.ts's safeNextPath
    // is what actually validates this value before ever redirecting to it.
    const intendedPath = request.nextUrl.pathname + request.nextUrl.search;
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = SIGN_IN_PATH;
    redirectUrl.search = "";
    redirectUrl.searchParams.set("next", intendedPath);
    return NextResponse.redirect(redirectUrl);
  }

  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const roles = error ? [] : (data ?? []).map((r) => String((r as { role: unknown }).role));
  if (!roles.includes(area)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = PERMISSION_DENIED_PATH;
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
