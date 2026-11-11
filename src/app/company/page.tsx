import { tryGetSession } from "@/lib/session";
import { getConfig } from "@/lib/config";
import { listDepartments, listEmployees } from "@/lib/domain/repo";
import { getPositions } from "@/lib/domain/setup";
import { Badge, Panel, SetupNotice } from "@/components/ui";
import { CompanyIdentityForm, DepartmentManager, PositionEditor, WorkTitleEditor } from "@/components/CompanySetup";

export const dynamic = "force-dynamic";

export default function CompanySetupPage() {
  const session = tryGetSession();
  if (!session) return <SetupNotice />;
  const { company } = session;
  const employees = listEmployees(company.id);
  const departments = listDepartments(company.id);
  const positions = getPositions(company.id);
  const browserEnabled = getConfig().limits.browserEnabled;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Company setup</p>
          <h1>{company.name}</h1>
          <p>
            Identity, departments, regulatory positions and work titles. Everything on this page is owner-editable and
            belongs to this company only.
          </p>
        </div>
        <Badge tone={browserEnabled ? "ok" : "default"}>
          browser {browserEnabled ? "enabled" : "disabled by OPENCOMPANY_BROWSER_ENABLED"}
        </Badge>
      </header>

      <div className="grid two">
        <Panel title="Company identity" hint={`slug ${company.slug}`}>
          <CompanyIdentityForm
            company={{
              name: company.name,
              mission: company.mission,
              operatingPrinciples: company.operatingPrinciples,
            }}
          />
        </Panel>

        <Panel title="Departments" hint={`${departments.length}`}>
          <DepartmentManager
            departments={departments.map((department) => ({
              id: department.id,
              name: department.name,
              people: employees.filter((employee) => employee.departmentId === department.id).length,
            }))}
          />
        </Panel>
      </div>

      <Panel title="Regulatory positions" hint="Rename any title, keep an alias">
        <PositionEditor positions={positions} />
      </Panel>

      <Panel title="Work titles" hint={`${employees.length} people`}>
        <WorkTitleEditor
          employees={employees.map((employee) => ({ id: employee.id, name: employee.name, title: employee.title }))}
          positions={positions}
        />
      </Panel>
    </div>
  );
}
