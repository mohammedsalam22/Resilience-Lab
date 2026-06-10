import type { Metadata } from "next";
import { ConsistentHashing } from "@/components/features/ConsistentHashing";

export const metadata: Metadata = { title: "Consistent Hashing" };

export default function ConsistentHashingPage() {
  return <ConsistentHashing />;
}
