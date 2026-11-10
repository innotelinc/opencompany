import { getSession } from "@/lib/session";
import { submitOwnerBrief } from "@/lib/domain/commands";
import { fail, ok, readJson, unexpected } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BriefBody {
  title?: string;
  brief?: string;
  requirements?: string;
  budgetCents?: number;
}

export async function POST(request: Request) {
  try {
    const session = getSession();
    const body = await readJson<BriefBody>(request);
    if (!body.title?.trim()) return fail("A goal title is required.");
    if (!body.brief?.trim()) return fail("A brief is required.");
    if (!body.requirements?.trim()) {
      return fail("Paste the customer requirements so they are saved as company knowledge.");
    }
    const result = submitOwnerBrief({
      companyId: session.company.id,
      ownerId: session.owner.id,
      title: body.title,
      brief: body.brief,
      requirements: body.requirements,
      budgetCents: body.budgetCents,
    });
    return ok(result);
  } catch (error) {
    return unexpected(error);
  }
}
