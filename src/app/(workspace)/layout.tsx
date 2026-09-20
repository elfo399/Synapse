import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { WorkspaceShell } from "@/components/workspace-shell";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return <WorkspaceShell name={session.user.name || "My workspace"} email={session.user.email}>{children}</WorkspaceShell>;
}
