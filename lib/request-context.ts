import { getDefaultProjectId, getProject } from "./portfolio";

export function projectIdFromRequest(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId") ?? getDefaultProjectId();
  if (!getProject(projectId)) throw new Error("项目不存在。");
  return projectId;
}

export function scopeRequestToProject(request: Request, projectId: string) {
  const url = new URL(request.url); url.searchParams.set("projectId", projectId);
  return new Request(url, request);
}
