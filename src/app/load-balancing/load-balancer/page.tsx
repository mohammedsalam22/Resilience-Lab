import type { Metadata } from "next";
import { LoadBalancer } from "@/components/features/LoadBalancer";

export const metadata: Metadata = {
  title: "Load Balancer",
};

export default function LoadBalancerPage() {
  return <LoadBalancer />;
}
