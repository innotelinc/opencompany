import { getConfig } from "@/lib/config";
import { publicSiteUrl } from "@/lib/public-site/uptime";

/**
 * The address a deployment decision should name.
 *
 * The company's own site is served by this application, so its address is known
 * before anything is approved: `OPENCOMPANY_PUBLIC_SITE_URL`, or this app's `/site`
 * route when that is unset. Anything else is built for a customer and only gets an
 * address when the deployment provider deploys it, so the label names the provider
 * rather than inventing a hostname that never resolves.
 */
export function deploymentTargetLabel(isPublicSite: boolean): string {
  if (isPublicSite) return publicSiteUrl();
  const provider = getConfig().deployment.provider;
  if (provider && provider !== "none") return `the ${provider} deployment`;
  return "the deployment provider, once one is configured";
}
