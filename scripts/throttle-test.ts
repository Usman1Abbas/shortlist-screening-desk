import { throttle } from "../lib/agent/model";

async function main() {
  const t0 = Date.now();
  const starts: number[] = [];
  // Fire 5 acquisitions "in parallel" (as the subagents would) and record when
  // each is actually granted. They must come out spaced ~4s apart, not at once.
  await Promise.all(
    Array.from({ length: 5 }, () => throttle().then(() => starts.push(Date.now() - t0))),
  );
  starts.sort((a, b) => a - b);
  console.log("grant times (ms from start):", starts.map((s) => Math.round(s / 100) * 100));
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  console.log("gaps (ms):", gaps.map((g) => Math.round(g / 100) * 100));
  const ok = gaps.every((g) => g >= 3800);
  console.log(ok ? "PASS: every call spaced >= ~4s (<=15/min, no burst)" : "FAIL: calls bursted");
  console.log("5 calls took", Math.round((starts[4]) / 1000) + "s  (one candidate = ~4 calls => well under 60s)");
}
main();
