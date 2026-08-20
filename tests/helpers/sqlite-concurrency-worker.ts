import { existsSync, writeFileSync } from "node:fs";
import { claimNextJob, recoverAssistantWorkflowJobAtomically } from "../../lib/assistant";

const [mode, ownerOrProjectId, runId, readyFile, barrierFile] = process.argv.slice(2);
if (!mode || !ownerOrProjectId || !readyFile || !barrierFile) throw new Error("Missing concurrency worker arguments.");

writeFileSync(readyFile, "ready", { encoding: "utf8" });
while (!existsSync(barrierFile)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);

if (mode === "claim") {
  const job = claimNextJob(ownerOrProjectId, 60_000);
  process.stdout.write(JSON.stringify({ jobId: job?.id, owner: job?.leaseOwner }) + "\n");
} else if (mode === "recover" && runId) {
  const result = recoverAssistantWorkflowJobAtomically(ownerOrProjectId, runId);
  process.stdout.write(JSON.stringify({ action: result.action, jobId: result.job?.id }) + "\n");
} else {
  throw new Error("Unsupported concurrency worker mode.");
}
