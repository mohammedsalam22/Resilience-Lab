import type { Metadata } from "next";
import { Retry } from "@/components/features/Retry";

export const metadata: Metadata = {
  title: "Retry + Backoff",
};

export default function RetryPage() {
  return <Retry />;
}
