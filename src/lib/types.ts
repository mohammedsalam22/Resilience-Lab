// Shared client+server DTOs. Feature snapshot types land here as features are built.

export type RealOrModeled = "REAL" | "MODELED";

export type TelemetryTone = "muted" | "healthy" | "warning" | "danger" | "flow";

export interface TelemetryEntry {
  id: number;
  time: string;
  message: string;
  tone?: TelemetryTone;
}

// ── Circuit Breaker ──────────────────────────────────────────────────────────

export type BreakerMode = "closed" | "open" | "halfOpen";

export interface BreakerStats {
  passed: number;
  failed: number;
  rejected: number;
  trips: number;
}

export interface BreakerState {
  mode: BreakerMode;
  stats: BreakerStats;
  serviceHealthy: boolean;
  /** Unix ms when the breaker last opened, or null when closed. */
  openedAt: number | null;
  log: TelemetryEntry[];
}

// ── Load Balancer ─────────────────────────────────────────────────────────────

export type Algorithm = "rr" | "wrr" | "lc" | "p2c" | "sticky" | "lrt" | "jiq" | "adaptive";

export interface Worker {
  id: string;
  name: string;
  weight: number;
  slow: boolean;
  down: boolean;
  handled: number;
}

export interface InFlight {
  /** Unique id for a real in-flight request (cluster mode); omitted in-process. */
  id?: number;
  workerId: string;
  doneAt: number;
}

export interface LBStats {
  routed: number;
  dropped: number;
}

export interface LoadBalancerState {
  workers: Worker[];
  inFlight: InFlight[];
  algorithm: Algorithm;
  streaming: boolean;
  stats: LBStats;
  /** True when routing to real worker containers (§9); workers become REAL. */
  cluster: boolean;
  log: TelemetryEntry[];
}

// ── Health Check + Heartbeat ──────────────────────────────────────────────────

export interface HealthNode {
  id: string;
  name: string;
  beating: boolean;
  missed: number;
  healthy: boolean;
  inPool: boolean;
}

export interface HealthCheckState {
  nodes: HealthNode[];
  /** True when polling real worker /health endpoints (§9); pings become REAL. */
  cluster: boolean;
  log: TelemetryEntry[];
}

// ── Load Balancer — Tier 2 algorithms ────────────────────────────────────────

// Algorithm is extended to include Tier 2 options in the same selector.
// Re-export as a union so the engine and component stay in sync.
// (The Tier-1 type above is replaced by this wider union.)

// ── Data Sharding ─────────────────────────────────────────────────────────────

export type ShardStrategy = "hash" | "range" | "directory";

export interface Shard {
  id: string;
  name: string;
  keys: string[];
}

export interface ShardRoute {
  key: string;
  shardId: string;
  rule: string;
}

export interface ShardingState {
  strategy: ShardStrategy;
  shards: Shard[];
  lastRoute: ShardRoute | null;
  log: TelemetryEntry[];
}

// ── Fallback ──────────────────────────────────────────────────────────────────

export type FallbackMode = "withFallback" | "noFallback";

export interface FallbackStats {
  primary: number;
  fallback: number;
  failed: number;
}

export interface FallbackState {
  mode: FallbackMode;
  primaryHealthy: boolean;
  stats: FallbackStats;
  log: TelemetryEntry[];
}

// ── Replication ───────────────────────────────────────────────────────────────

export type ReplicationMode = "active" | "passive";

export interface Replica {
  id: string;
  name: string;
  role: "primary" | "backup";
  alive: boolean;
  ops: number;
  walEntries: number;
}

export interface ReplicationState {
  mode: ReplicationMode;
  replicas: Replica[];
  lastCommand: string | null;
  electing: boolean;
  /** True when replicas are real worker containers (§9); kill/failover become REAL. */
  cluster: boolean;
  log: TelemetryEntry[];
}

// ── Consistent Hashing ────────────────────────────────────────────────────────

export interface RingNode {
  id: string;
  name: string;
  alive: boolean;
  /** Angles of this node's virtual replicas around the ring (best practice). */
  vnodes: number[];
}

/** One virtual replica point on the ring, tagged with its physical node. */
export interface VNode {
  nodeId: string;
  angle: number;
}

export interface RingKey {
  id: string;
  label: string;
  angle: number;
  ownerId: string;
  /** Angle of the specific virtual replica that owns this key (for the arc/table). */
  ownerVnodeAngle: number;
}

export interface ConsistentHashState {
  nodes: RingNode[];
  keys: RingKey[];
  /** Virtual replicas per physical node; 1 = naive (uneven), higher = smooth. */
  replicas: number;
  log: TelemetryEntry[];
}

// ── Retry + Backoff ───────────────────────────────────────────────────────────

/** "expo" = exponential (1/2/4/8s); "fixed" = constant 200ms ("no backoff"). */
export type BackoffMode = "expo" | "fixed";

export type RetryRunStatus = "idle" | "running" | "succeeded" | "failed";

export interface RetryAttempt {
  /** 1-based attempt number. */
  attempt: number;
  outcome: "pending" | "success" | "failure";
  /** Delay (ms) the engine will wait before the NEXT attempt; null on the last. */
  delayBeforeNext: number | null;
}

export interface RetryState {
  backoffMode: BackoffMode;
  jitter: boolean;
  serviceHealthy: boolean;
  status: RetryRunStatus;
  /** Unix ms when the current backoff delay started, or null if not waiting. */
  waitingSince: number | null;
  /** Length (ms) of the current backoff delay, or null if not waiting. */
  currentDelay: number | null;
  attempts: RetryAttempt[];
  log: TelemetryEntry[];
}
