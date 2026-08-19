import { createHash } from "node:crypto";
import { getCandidateRecord, responseHash, saveVerificationEvent, updateCandidateStatus, updateWorkVerification } from "./evidence-store";
import { importWork, readWorkspace, writeWorkspaceState } from "./storage";
import { registerProjectWork } from "./portfolio";
import type { VerificationEvent } from "./types";

export function normalizeBibliographicText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function authorTokens(values: string[]) {
  return new Set(values.map((value) => {
    const normalized = normalizeBibliographicText(value);
    const comma = normalized.indexOf(",");
    return (comma >= 0 ? normalized.slice(0, comma) : normalized.split(" ").at(-1))?.trim() ?? "";
  }).filter((value) => value.length > 1));
}
function overlap(left: Set<string>, right: Set<string>) { if (!left.size || !right.size) return false; const common = [...left].filter((value) => right.has(value)).length; return common / Math.min(left.size, right.size) >= 0.5; }
function doi(value?: string) { return value?.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, ""); }
function venueMatches(candidate?: string, remote?: string) {
  if (!candidate || !remote) return false;
  const left = normalizeBibliographicText(candidate); const right = normalizeBibliographicText(remote);
  return left === right || left.startsWith(`${right} `) || right.startsWith(`${left} `);
}

type CrossrefMessage = { DOI?: string; title?: string[]; author?: Array<{ given?: string; family?: string }>; published?: { "date-parts"?: number[][] }; issued?: { "date-parts"?: number[][] }; "container-title"?: string[]; subtype?: string; relation?: Record<string, unknown>; "update-to"?: unknown };

export async function verifyCandidateBibliography(input: { projectId: string; candidateId: string; fetchImpl?: typeof fetch }) {
  const candidate = getCandidateRecord(input.projectId, input.candidateId);
  if (!candidate) throw new Error("CandidateRecord不存在。");
  if (!candidate.doi) throw new Error("无 DOI 候选必须通过题名、作者和年份人工选择，不能自动核验。");
  updateCandidateStatus(input.projectId, input.candidateId, "verification_pending");
  const fetchImpl = input.fetchImpl ?? fetch;
  let payload: { message?: CrossrefMessage } | undefined;
  try {
    const response = await fetchImpl(`https://api.crossref.org/works/${encodeURIComponent(doi(candidate.doi) ?? "")}`, { headers: { "user-agent": "doctoral-evidence-workbench/1.0" } });
    if (!response.ok) {
      const event = saveVerificationEvent({ projectId: input.projectId, candidateId: candidate.id, provider: "crossref", inputIdentifier: candidate.doi, matchedFields: { doi: false, title: false, authors: false, year: false, venue: false }, result: "failed", retractionStatus: "unknown", notes: `Crossref returned ${response.status}` });
      updateCandidateStatus(input.projectId, candidate.id, "discovered"); return { event };
    }
    payload = await response.json() as { message?: CrossrefMessage };
  } catch (error) {
    const event = saveVerificationEvent({ projectId: input.projectId, candidateId: candidate.id, provider: "crossref", inputIdentifier: candidate.doi, matchedFields: { doi: false, title: false, authors: false, year: false, venue: false }, result: "failed", retractionStatus: "unknown", notes: error instanceof Error ? error.message : "Crossref request failed" });
    updateCandidateStatus(input.projectId, candidate.id, "discovered"); return { event };
  }
  const message = payload.message ?? {};
  const remoteAuthors = (message.author ?? []).map((author) => [author.given, author.family].filter(Boolean).join(" "));
  const remoteYear = message.published?.["date-parts"]?.[0]?.[0] ?? message.issued?.["date-parts"]?.[0]?.[0];
  const matchedFields = {
    doi: doi(message.DOI) === doi(candidate.doi),
    title: normalizeBibliographicText(message.title?.[0] ?? "") === normalizeBibliographicText(candidate.title),
    authors: overlap(authorTokens(candidate.authors), authorTokens(remoteAuthors)),
    year: candidate.year != null && remoteYear === candidate.year,
    venue: candidate.venue ? venueMatches(candidate.venue, message["container-title"]?.[0]) : false,
  };
  const core = [matchedFields.doi, matchedFields.title, matchedFields.authors, matchedFields.year];
  const result: VerificationEvent["result"] = core.every(Boolean) && (!candidate.venue || matchedFields.venue) ? "verified" : matchedFields.doi && core.filter(Boolean).length >= 3 ? "partial_match" : "mismatch";
  const retractionStatus: VerificationEvent["retractionStatus"] = message.subtype === "retraction" || message["update-to"] ? "unknown" : "unknown";
  const eventInput = { projectId: input.projectId, candidateId: candidate.id, provider: "crossref" as const, inputIdentifier: candidate.doi, matchedFields, result, retractionStatus, rawResponseHash: responseHash(payload), notes: result === "verified" ? "Crossref exact DOI metadata matched all required fields." : "Metadata requires human review; no Work was promoted." };
  if (result !== "verified") { const event = saveVerificationEvent(eventInput); updateCandidateStatus(input.projectId, candidate.id, "discovered"); return { event }; }
  const promotedMetadata = { title: message.title?.[0] ?? candidate.title, authors: remoteAuthors.join("; ") || candidate.authors.join("; "), year: remoteYear ?? candidate.year ?? 0, venue: message["container-title"]?.[0] ?? candidate.venue ?? "", doi: doi(message.DOI), relevance: "Promoted from a bibliographically verified CandidateRecord." };
  let workspace = await readWorkspace(input.projectId);
  let work = workspace.works.find((item) => doi(item.doi) === doi(candidate.doi) || normalizeBibliographicText(item.title) === normalizeBibliographicText(candidate.title));
  if (!work) {
    await importWork(promotedMetadata, input.projectId);
    workspace = await readWorkspace(input.projectId);
    work = workspace.works.find((item) => doi(item.doi) === doi(candidate.doi));
  } else {
    work = { ...work, ...promotedMetadata, doi: promotedMetadata.doi, status: "未核验", bibliographicStatus: "unverified", legacyStatusRequiresReverification: false };
    workspace.works = workspace.works.map((item) => item.id === work!.id ? work! : item);
    workspace.updatedAt = new Date().toISOString();
    writeWorkspaceState("workspace", workspace, input.projectId);
    registerProjectWork(input.projectId, work);
  }
  if (!work) throw new Error("核验成功但 Work 创建失败。");
  const workEvent = updateWorkVerification(input.projectId, work.id, { ...eventInput, id: `verification-${createHash("sha256").update(`${input.projectId}|${candidate.id}|${Date.now()}`).digest("hex").slice(0, 20)}`, checkedAt: new Date().toISOString(), workId: work.id });
  work.bibliographicStatus = workEvent.result;
  work.retractionStatus = workEvent.retractionStatus;
  updateCandidateStatus(input.projectId, candidate.id, "promoted");
  return { event: workEvent, work };
}

export function stableCandidateId(projectId: string, provider: string, providerRecordId: string) { return `candidate-${createHash("sha256").update(`${projectId}|${provider}|${providerRecordId}`).digest("hex").slice(0, 20)}`; }
