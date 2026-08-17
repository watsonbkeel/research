const PROPOSAL_TARGET = /(开题报告|开题文稿|研究计划书|confirmation\s+proposal|research\s+proposal|proposal)/i;
const GENERATION_ACTION = /(生成|输出|完成|撰写|起草|写作|开始写|继续|推进|produce|generate|draft|write|complete|proceed)/i;
const AUTONOMOUS_PROGRESS = /((不要|无需|不必).{0,10}(再)?(问|提问|询问|确认)|(自行|自己|直接).{0,10}(判断|决定|推进|生成|输出)|(全部|都).{0,6}(接受|同意|确认|选\s*[Aa]).{0,12}(继续|推进|下一步)|(继续|推进).{0,12}(全部|都).{0,6}(接受|同意|确认))/i;

/** High-confidence conversational commands that authorize proposal drafting. */
export function requestsProposalGeneration(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return (PROPOSAL_TARGET.test(normalized) && GENERATION_ACTION.test(normalized))
    || (AUTONOMOUS_PROGRESS.test(normalized) && GENERATION_ACTION.test(normalized));
}
