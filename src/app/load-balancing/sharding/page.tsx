import type { Metadata } from "next";
import { Sharding } from "@/components/features/Sharding";

export const metadata: Metadata = { title: "Data Sharding" };

export default function ShardingPage() {
  return <Sharding />;
}
