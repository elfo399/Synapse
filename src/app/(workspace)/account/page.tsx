import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AccountForm } from "@/features/auth/account-form";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <AccountForm
      username={session.user.username ?? ""}
      email={session.user.email}
    />
  );
}
