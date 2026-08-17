import { Workbench } from "@/components/Workbench";
import { readPrivateSettings, readWorkspace, toPublicSettings } from "@/lib/storage";
import { PortfolioHome } from "@/components/PortfolioHome";
import { getProject, listProjects, listTopicBatches } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const { projectId } = await searchParams;
  const projects = listProjects();
  if (!projectId || !getProject(projectId)) return <PortfolioHome initialProjects={projects} initialBatches={listTopicBatches()} />;
  const [workspace, settings] = await Promise.all([readWorkspace(projectId), readPrivateSettings()]);
  return <Workbench initialData={workspace} initialSettings={toPublicSettings(settings)} projects={projects} />;
}
