import type { Metadata } from "next";
import { Replication } from "@/components/features/Replication";

export const metadata: Metadata = { title: "Replication" };

export default function ReplicationPage() {
  return <Replication />;
}
