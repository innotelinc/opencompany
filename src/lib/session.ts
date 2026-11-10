import { getConfig } from "@/lib/config";
import { getCompanyBySlug, getOwner } from "@/lib/domain/repo";
import type { Company, HumanMember } from "@/lib/domain/types";

/**
 * Single-owner session for the first version.
 *
 * The owner is resolved on the server from configuration, never from a client
 * header or body. Every API route derives the company from this session and
 * filters by it, so a request cannot reach another company's data by asking for
 * a different id. Real multi-user sign-in is a documented gap; the schema,
 * repository and worker are already company-scoped.
 */
export interface Session {
  company: Company;
  owner: HumanMember;
}

export function getSession(): Session {
  const config = getConfig();
  const company = getCompanyBySlug(config.companySlug);
  if (!company) {
    throw new Error(
      `Company "${config.companySlug}" does not exist. Run \`npm run db:seed\` (or \`npm run db:reset\`) first.`,
    );
  }
  return { company, owner: getOwner(company.id) };
}

export function tryGetSession(): Session | null {
  try {
    return getSession();
  } catch {
    return null;
  }
}
