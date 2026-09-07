import { VarDashboard } from "@/components/var/var-dashboard";
import { connection } from "next/server";

export default async function Home() {
  await connection();
  return <VarDashboard />;
}
