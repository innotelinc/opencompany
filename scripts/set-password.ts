/**
 * Set or reset the password the owner signs in with.
 *
 *   npm run auth:password -- owner@example.com                 # prompts
 *   npm run auth:password -- owner@example.com --password-file /root/pw
 *   OPENCOMPANY_NEW_PASSWORD=... npm run auth:password -- owner@example.com
 *
 * The password is hashed with scrypt before it is stored; this command never
 * prints it, and every other session for that person is revoked so a reset also
 * signs other browsers out.
 */
import fs from "node:fs";
import { createInterface } from "node:readline";
import { closeDb } from "../src/lib/db";
import { hashPassword, passwordProblem, revokeOtherSessions } from "../src/lib/auth";
import { getConfig } from "../src/lib/config";
import { getCompanyBySlug, getHumanMemberByEmail, setPasswordHash } from "../src/lib/domain/repo";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function readPassword(): Promise<string> {
  const fromFile = argument("--password-file");
  if (fromFile) {
    const contents = fs.readFileSync(fromFile, "utf8").replace(/\r?\n$/, "");
    if (!contents) throw new Error(`${fromFile} is empty.`);
    return contents;
  }
  const fromEnv = process.env.OPENCOMPANY_NEW_PASSWORD;
  if (fromEnv) return fromEnv;

  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const piped = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
    if (!piped) throw new Error("No password on stdin.");
    return piped;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const answer = await new Promise<string>((resolve) => {
    rl.question("New password: ", resolve);
  });
  rl.close();
  return answer;
}

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email || email.startsWith("--")) {
    console.error("usage: npm run auth:password -- <owner email> [--password-file <path>]");
    process.exit(1);
  }

  const company = getCompanyBySlug(getConfig().companySlug);
  if (!company) {
    console.error("Company not found. Run npm run db:seed first.");
    process.exit(1);
  }

  const member = getHumanMemberByEmail(company.id, email);
  if (!member) {
    console.error(`No human member with email ${email} in ${company.slug}.`);
    process.exit(1);
  }

  const password = await readPassword();
  const problem = passwordProblem(password);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }

  if (!setPasswordHash(member.id, hashPassword(password))) {
    console.error("Could not save the password.");
    process.exit(1);
  }

  const revoked = revokeOtherSessions(member.id);
  console.log(`password set for ${member.email} (${company.slug}); ${revoked} other session(s) revoked`);
  closeDb();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
