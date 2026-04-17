import { DashboardShell } from "@/components/dashboard/shell";
import { requireStaff } from "@/features/auth/guards";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await requireStaff();
  return <DashboardShell staff={staff}>{children}</DashboardShell>;
}
