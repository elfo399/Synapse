import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "@/features/auth/login-form";
export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return <LoginForm />;
}
