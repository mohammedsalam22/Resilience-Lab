import type { Metadata } from "next";
import { Fallback } from "@/components/features/Fallback";

export const metadata: Metadata = { title: "Fallback" };

export default function FallbackPage() {
  return <Fallback />;
}
