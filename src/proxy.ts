import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed the "middleware" file convention to "proxy".
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Role-gated areas: each requires the matching role (checked in updateSession).
  matcher: ["/patient/:path*", "/doctor/:path*", "/reception/:path*"],
};
