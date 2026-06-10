import type { Metadata } from "next";
import { CircuitBreaker } from "@/components/features/CircuitBreaker";

export const metadata: Metadata = {
  title: "Circuit Breaker",
};

export default function CircuitBreakerPage() {
  return <CircuitBreaker />;
}
