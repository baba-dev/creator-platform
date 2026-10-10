import { hasPlatformPermission } from "@aiwa/authz";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
export async function learnAdmin(request: Request) {
  if (request.method !== "GET" && !hasTrustedMutationOrigin(request))
    return null;
  const session = await getRequestSession(request.headers);
  return session &&
    hasPlatformPermission(session.user.platformRole, "learn:manage")
    ? session
    : null;
}
