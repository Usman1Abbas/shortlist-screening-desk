// Shared demo data. The résumés are written to exercise the rubric in
// different directions: one clear strong, one strong-elsewhere, one too junior.

export const JD = `
Senior Backend Engineer — Ledger (Remote, EU)
Fintech, 60 people. You'll own the double-entry ledger that every payment flows
through. Reports to the VP Eng; you'll be the third engineer on the team and
will set the technical direction for the service.

Requirements: 5+ years backend. Deep Postgres — you should be comfortable
reasoning about isolation levels and lock contention. Experience running
services that cannot lose data. Go or Rust. EU work authorisation required.
Nice to have: payments or accounting domain experience, Kubernetes.
`.trim();

export const RESUMES = [
  {
    label: "amara-okafor.txt",
    rawResume: `Amara Okafor — Berlin, Germany (EU citizen)

Staff Engineer, Mollie (2021–present)
  Owned the settlement ledger processing ~2M transactions/day. Redesigned the
  write path from SERIALIZABLE to explicit row-level locking after profiling
  showed 40% of transactions were aborting under contention; p99 write latency
  fell from 800ms to 120ms and the retry storms stopped.
  Led the migration of the ledger from Python to Go over 9 months with zero
  reconciliation breaks during cutover.

Senior Backend Engineer, N26 (2017–2021)
  Built the double-entry accounting core. Designed the idempotency layer for
  card authorisations, which cut duplicate-charge incidents to zero over 18
  months.

Skills: Go, Postgres, Kafka, Terraform, Kubernetes
B.Sc Computer Science, University of Lagos`,
  },
  {
    label: "jonas-reyes.txt",
    rawResume: `Jonas Reyes — Lisbon, Portugal

Backend Engineer, Feedzai (2022–present)
  Rust services for real-time fraud scoring. Sub-10ms p99 on the scoring path.
  Wrote the feature store backing the model serving layer.

Backend Engineer, Talkdesk (2019–2022)
  Go microservices for call routing. Owned the on-call rotation for the team.

Skills: Rust, Go, Redis, MySQL, gRPC. Expert in distributed systems.
M.Sc Software Engineering, Instituto Superior Técnico`,
  },
  {
    label: "tara-nguyen.txt",
    rawResume: `Tara Nguyen — San Francisco, CA

Software Engineer, Stripe (2023–present)
  Contributed to the payouts service. Shipped the retry policy refactor.

Junior Software Engineer, Brex (2022–2023)
  Internal tooling in TypeScript.

Skills: TypeScript, Python, Postgres, React
B.Sc, UC Berkeley, 2022`,
  },
];
