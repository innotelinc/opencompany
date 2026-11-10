import { tryGetSession } from "@/lib/session";
import { getDb, parseJson } from "@/lib/db";
import { listEmployees, listKnowledge } from "@/lib/domain/repo";
import { Badge, Empty, Panel, SetupNotice, relativeTime } from "@/components/ui";
import { KnowledgeForm } from "@/components/OwnerConsole";
import { KnowledgeEditor } from "@/components/KnowledgeEditor";

export const dynamic = "force-dynamic";

export default function KnowledgePage() {
  const session = tryGetSession();
  if (!session) return <SetupNotice />;
  const { company } = session;
  const docs = listKnowledge(company.id);
  const employees = listEmployees(company.id);
  const nameOf = new Map(employees.map((employee) => [employee.id, employee.name]));
  const versionCounts = new Map<string, number>();
  const versions = getDb()
    .prepare("SELECT doc_id, body, edited_by, created_at, version FROM knowledge_doc_versions WHERE company_id = ? ORDER BY version DESC")
    .all(company.id) as any[];
  for (const version of versions) {
    versionCounts.set(version.doc_id, (versionCounts.get(version.doc_id) ?? 0) + 1);
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Knowledge</p>
          <h1>Company memory and procedures</h1>
          <p>
            Documents are company-scoped and access-controlled: company-wide, department-only, or one employee.
            Employees read only what their role permits, and edits keep every version.
          </p>
        </div>
        <KnowledgeForm employees={employees.map((employee) => ({ id: employee.id, name: employee.name }))} />
      </header>

      {docs.length === 0 ? <Panel><Empty>No documents yet.</Empty></Panel> : null}

      <div className="grid two">
        {docs.map((doc) => {
          const history = versions.filter((version) => version.doc_id === doc.id).slice(0, 5);
          return (
            <Panel key={doc.id}>
              <div className="spread">
                <div>
                  <div className="row" style={{ gap: 6 }}>
                    <h2 style={{ margin: 0, fontSize: 16 }}>{doc.title}</h2>
                    <Badge tone={doc.accessScope === "company" ? "info" : doc.accessScope === "private" ? "warn" : "default"}>
                      {doc.accessScope}
                    </Badge>
                  </div>
                  <p className="tiny faint" style={{ margin: "4px 0 0" }}>
                    {doc.kind} · v{doc.version} · {versionCounts.get(doc.id) ?? 1} version(s) · updated {relativeTime(doc.updatedAt)}
                    {doc.ownerEmployeeId ? ` · owned by ${nameOf.get(doc.ownerEmployeeId) ?? "employee"}` : ""}
                  </p>
                </div>
              </div>
              <pre className="pre small muted" style={{ marginTop: 10, maxHeight: 200, overflow: "auto" }}>{doc.body}</pre>
              <details>
                <summary>Version history</summary>
                <ul className="list">
                  {history.map((version) => (
                    <li key={`${version.doc_id}-${version.version}`}>
                      <span className="small">v{version.version} · {version.edited_by === "system" ? "system" : nameOf.get(version.edited_by) ?? version.edited_by}</span>
                      <span className="tiny faint">{relativeTime(version.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </details>
              <div style={{ marginTop: 10 }}>
                <KnowledgeEditor docId={doc.id} initialBody={doc.body} />
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
