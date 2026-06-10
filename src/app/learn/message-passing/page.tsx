import type { Metadata } from "next";
import { SoftCard } from "@/components/ui/SoftCard";

export const metadata: Metadata = { title: "Message Passing" };

const PATTERNS = [
  {
    name: "Point-to-point queue",
    icon: "→",
    description:
      "Producer sends a message to a named queue; exactly one consumer dequeues it. The message disappears once acknowledged.",
    properties: ["Exactly-once delivery (with ack)", "Consumer controls processing rate", "Natural load-levelling"],
    examples: ["AWS SQS", "RabbitMQ (direct exchange)", "Azure Service Bus"],
  },
  {
    name: "Pub / Sub",
    icon: "⊕",
    description:
      "Publisher sends to a topic; all subscribers receive a copy. Sender and receivers are fully decoupled — neither knows the other exists.",
    properties: ["Fan-out to N consumers", "At-least-once delivery common", "Easy to add new consumers without changing producers"],
    examples: ["Apache Kafka", "Google Pub/Sub", "Redis Pub/Sub", "SNS + SQS fan-out"],
  },
  {
    name: "Request / Reply (RPC over queue)",
    icon: "↔",
    description:
      "Caller sends a message with a replyTo address and correlation ID; the worker processes it and sends the result back.",
    properties: ["Async without losing the response", "Timeout and retry responsibility on caller", "Works across language boundaries"],
    examples: ["AMQP RPC pattern", "gRPC with message-queue transport"],
  },
  {
    name: "Event streaming",
    icon: "≫",
    description:
      "Messages (events) are persisted in an ordered, immutable log. Consumers read at their own offset, can replay, and multiple consumer groups process independently.",
    properties: ["Replayable history", "High throughput (millions/sec)", "Consumer groups process independently"],
    examples: ["Apache Kafka", "AWS Kinesis", "Azure Event Hubs"],
  },
];

const BROKER_COMPARISON = [
  { name: "RabbitMQ",    model: "Queue + Exchange",  ordering: "Per queue",        replay: "No",  throughput: "~100k msg/s",   bestFor: "Task queues, RPC patterns" },
  { name: "Kafka",       model: "Log partitions",     ordering: "Per partition",    replay: "Yes", throughput: "Millions/s",    bestFor: "Event streaming, audit logs, ETL" },
  { name: "AWS SQS",     model: "Managed queue",      ordering: "FIFO optional",    replay: "No",  throughput: "3k–300k msg/s", bestFor: "Serverless, AWS-native workloads" },
  { name: "Redis Streams", model: "Append-only log",  ordering: "Per stream",       replay: "Yes", throughput: "~500k msg/s",   bestFor: "Low-latency, in-memory fan-out" },
  { name: "NATS",        model: "Pub/sub + JetStream", ordering: "Subject ordering", replay: "JetStream only", throughput: "Millions/s", bestFor: "Microservices mesh, IoT" },
];

const EXACTLY_ONCE_STEPS = [
  { step: "1", title: "Idempotency key", body: "Attach a unique ID to every message. The consumer deduplicates by storing processed IDs in a DB (or Kafka's transactional log)." },
  { step: "2", title: "Transactional outbox", body: "Write the message to a local DB table (the outbox) in the same transaction as the business write. A poller sends it to the broker." },
  { step: "3", title: "At-least-once + dedup", body: "Retry until acknowledged; deduplicate on the consumer side. Simpler than distributed transactions and more common in practice." },
];

export default function MessagePassingPage() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">Reference</p>
        <h1 className="font-display text-3xl tracking-tight">Message Passing</h1>
        <p className="max-w-xl text-muted">
          Async communication via queues and brokers — how services talk without
          waiting for each other.
        </p>
      </section>

      {/* Why async */}
      <SoftCard className="flex flex-col gap-3 p-5">
        <h2 className="font-display text-xl tracking-tight">Why decouple with messages?</h2>
        <p className="text-sm text-muted">
          Synchronous RPC ties the caller to the callee — a slow or failed service propagates
          latency and errors upstream. A message broker inserts a buffer: the producer
          sends and moves on; the consumer processes when ready. This gives you:
        </p>
        <ul className="flex flex-col gap-1.5 pl-4 text-sm text-muted">
          {["Independent scaling — scale consumers independently of producers.",
            "Back-pressure — the queue absorbs bursts the consumer can't handle yet.",
            "Retry without caller involvement — the broker retries on failure.",
            "Temporal decoupling — producer and consumer don't need to be online simultaneously.",
          ].map((item) => (
            <li key={item} className="list-disc">{item}</li>
          ))}
        </ul>
      </SoftCard>

      {/* Patterns */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl tracking-tight">Messaging patterns</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {PATTERNS.map((p) => (
            <SoftCard key={p.name} className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg text-flow">{p.icon}</span>
                <h3 className="font-semibold text-text">{p.name}</h3>
              </div>
              <p className="text-sm text-muted">{p.description}</p>
              <ul className="flex flex-col gap-1 pl-4 text-xs text-muted">
                {p.properties.map((prop) => (
                  <li key={prop} className="list-disc">{prop}</li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1.5">
                {p.examples.map((ex) => (
                  <span key={ex} className="rounded-full bg-track px-2 py-0.5 font-mono text-xs text-muted">
                    {ex}
                  </span>
                ))}
              </div>
            </SoftCard>
          ))}
        </div>
      </section>

      {/* Broker comparison */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl tracking-tight">Broker comparison</h2>
        <SoftCard className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <caption className="sr-only">Message brokers compared by model, ordering, replay support, throughput, and best fit.</caption>
            <thead>
              <tr className="border-b border-border">
                {["Broker", "Model", "Ordering", "Replay", "Throughput", "Best for"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BROKER_COMPARISON.map((b) => (
                <tr key={b.name} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium text-text">{b.name}</td>
                  <td className="px-4 py-2.5 text-muted">{b.model}</td>
                  <td className="px-4 py-2.5 text-muted">{b.ordering}</td>
                  <td className={`px-4 py-2.5 font-mono ${b.replay === "Yes" ? "text-healthy" : "text-muted"}`}>{b.replay}</td>
                  <td className="px-4 py-2.5 font-mono text-muted">{b.throughput}</td>
                  <td className="px-4 py-2.5 text-muted">{b.bestFor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SoftCard>
      </section>

      {/* Exactly-once semantics */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl tracking-tight">Exactly-once delivery</h2>
        <p className="text-sm text-muted">
          True exactly-once is hard — the broker and consumer need distributed coordination.
          In practice, most systems use <strong className="text-text">at-least-once + idempotent consumers</strong>.
        </p>
        <div className="flex flex-col gap-3">
          {EXACTLY_ONCE_STEPS.map((s) => (
            <SoftCard key={s.step} className="flex gap-4 p-5">
              <span className="mt-0.5 shrink-0 font-mono text-xl font-bold text-flow">{s.step}</span>
              <div className="flex flex-col gap-1">
                <h3 className="font-semibold text-text">{s.title}</h3>
                <p className="text-sm text-muted">{s.body}</p>
              </div>
            </SoftCard>
          ))}
        </div>
      </section>
    </div>
  );
}
