import type { Metadata } from "next";
import { HealthCheck } from "@/components/features/HealthCheck";

export const metadata: Metadata = {
  title: "Health Check + Heartbeat",
};

export default function HealthCheckPage() {
  return <HealthCheck />;
}
