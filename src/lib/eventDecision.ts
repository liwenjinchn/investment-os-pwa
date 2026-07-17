import { calculateCashRatio, themeExposure } from "./rules";
import {
  type DecisionAction,
  type EventDecisionCase,
  type EventEvidence,
  type EventScenario,
  type Holding,
  type RuleSettings,
  uid
} from "./types";

export interface EventAssessment {
  probabilityTotal: number;
  expectedPortfolioImpact: number | null;
  evidenceLabel: "待补证" | "可研判" | "证据较强";
  evidenceDetail: string;
  readiness: "blocked" | "review" | "ready";
  suggestedAction: DecisionAction;
  gates: string[];
  warnings: string[];
  reasons: string[];
}

const today = () => new Date().toISOString().slice(0, 10);

export const newEvidence = (): EventEvidence => ({
  id: uid("evidence"),
  title: "",
  sourceUrl: "",
  publishedAt: today(),
  tier: "未核实",
  nature: "事实",
  note: ""
});

export const newScenario = (name = "新情景"): EventScenario => ({
  id: uid("scenario"),
  name,
  probability: 0,
  portfolioImpact: 0,
  thesisEffect: "不变",
  rationale: "",
  signpost: ""
});

export function newEventCase(holding?: Holding): EventDecisionCase {
  const now = new Date().toISOString();
  return {
    id: uid("event"),
    createdAt: now,
    updatedAt: now,
    status: "待研判",
    title: "",
    symbol: holding?.code ?? "",
    companyName: holding?.name ?? "",
    eventType: "业绩与指引",
    eventDate: "",
    timeWindow: "",
    summary: "",
    affectedThesis: holding?.thesis ?? "",
    thesisBreakCondition: "",
    evidence: [newEvidence()],
    scenarios: [newScenario("兑现"), newScenario("延迟"), newScenario("落空")],
    riskNotes: "",
    finalAction: "写入观察",
    decisionRationale: "",
    nextTrigger: "",
    reviewAt: "",
    aiRedTeam: "",
    actualOutcome: "",
    lesson: ""
  };
}

function rounded(value: number) {
  return Number(value.toFixed(2));
}

function holdingFor(eventCase: EventDecisionCase, holdings: Holding[]) {
  const symbol = eventCase.symbol.trim().toUpperCase();
  return holdings.find((item) => item.code.trim().toUpperCase() === symbol);
}

export function assessEventCase(
  eventCase: EventDecisionCase,
  holdings: Holding[],
  rules: RuleSettings
): EventAssessment {
  const completedEvidence = eventCase.evidence.filter((item) => item.title.trim());
  const factualEvidence = completedEvidence.filter((item) => item.nature === "事实");
  const strongFacts = factualEvidence.filter((item) => item.tier === "一手文件" || item.tier === "公司口径");
  const independentFacts = factualEvidence.filter((item) => item.tier === "独立来源");

  let evidenceLabel: EventAssessment["evidenceLabel"] = "待补证";
  if (strongFacts.length >= 2 && (independentFacts.length >= 1 || completedEvidence.length >= 4)) {
    evidenceLabel = "证据较强";
  } else if (strongFacts.length >= 1 && completedEvidence.length >= 2) {
    evidenceLabel = "可研判";
  }

  const probabilityTotal = rounded(eventCase.scenarios.reduce((sum, item) => sum + Number(item.probability || 0), 0));
  const scenarioTreeReady = eventCase.scenarios.length >= 2 && Math.abs(probabilityTotal - 100) < 0.01;
  const expectedPortfolioImpact = scenarioTreeReady
    ? rounded(eventCase.scenarios.reduce((sum, item) => sum + (item.probability / 100) * item.portfolioImpact, 0))
    : null;
  const downsideScenarios = eventCase.scenarios.filter((item) => item.portfolioImpact < 0);
  const invalidationProbability = eventCase.scenarios
    .filter((item) => item.thesisEffect === "证伪")
    .reduce((sum, item) => sum + item.probability, 0);
  const positiveProbability = eventCase.scenarios
    .filter((item) => item.thesisEffect === "强化")
    .reduce((sum, item) => sum + item.probability, 0);

  const gates: string[] = [];
  if (!eventCase.title.trim() || !eventCase.summary.trim()) gates.push("补全事件标题与事实摘要");
  if (!eventCase.symbol.trim() && !eventCase.companyName.trim()) gates.push("关联一个标的或公司");
  if (!eventCase.eventDate && !eventCase.timeWindow.trim()) gates.push("写明已知日期或预计时间窗");
  if (!eventCase.affectedThesis.trim()) gates.push("写明这件事影响哪条投资论点");
  if (!eventCase.thesisBreakCondition.trim()) gates.push("写明什么结果会证伪原论点");
  if (strongFacts.length < 1 || completedEvidence.length < 2) gates.push("至少需要 1 条一手/公司事实和 1 条交叉证据");
  if (!scenarioTreeReady) gates.push(`情景概率需合计 100%，当前为 ${probabilityTotal}%`);
  if (downsideScenarios.length < 1) gates.push("至少保留一个负面情景和组合下行影响");
  if (eventCase.scenarios.some((item) => !item.name.trim() || !item.rationale.trim() || !item.signpost.trim())) {
    gates.push("每个情景都要写明依据与可观察信号");
  }

  const warnings: string[] = [];
  const relatedHolding = holdingFor(eventCase, holdings);
  const cashRatio = calculateCashRatio(holdings);
  const exposures = themeExposure(holdings);
  if (cashRatio < rules.minCashRatio) warnings.push(`现金 ${cashRatio}% 低于纪律线 ${rules.minCashRatio}%，不得用事件理由绕过现金约束`);
  if (relatedHolding && relatedHolding.weight >= rules.maxSingleWeight) {
    warnings.push(`${relatedHolding.name} 已达单只上限 ${rules.maxSingleWeight}%，加仓被硬规则阻止`);
  }
  if (relatedHolding?.theme && (exposures[relatedHolding.theme] ?? 0) >= rules.maxThemeExposure) {
    warnings.push(`${relatedHolding.theme} 主题已达暴露上限 ${rules.maxThemeExposure}%，加仓被硬规则阻止`);
  }
  if (completedEvidence.some((item) => item.tier === "未核实" && item.nature === "事实")) {
    warnings.push("仍有未核实内容被标为事实；确认动作前应降级为假设或补来源");
  }

  const addBlocked = warnings.some((item) => item.includes("加仓被硬规则阻止") || item.startsWith("现金"));
  let suggestedAction: DecisionAction = "复盘";
  const reasons: string[] = [];

  if (gates.length) {
    suggestedAction = completedEvidence.length ? "复盘" : "写入观察";
    reasons.push("关键输入尚未闭合，只能继续研判，不能确认交易动作");
  } else if (invalidationProbability >= 35 && evidenceLabel !== "待补证") {
    suggestedAction = "减仓";
    reasons.push(`论点证伪情景概率为 ${rounded(invalidationProbability)}%，先处理下行暴露`);
  } else if ((expectedPortfolioImpact ?? 0) >= 2 && positiveProbability >= 60 && evidenceLabel === "证据较强") {
    suggestedAction = addBlocked ? "不动" : "加仓";
    reasons.push(addBlocked ? "事件判断偏正面，但组合纪律否决新增风险" : "正面情景占优、证据已交叉验证，且组合纪律允许进一步评估加仓");
  } else if (Math.abs(expectedPortfolioImpact ?? 0) < 0.75) {
    suggestedAction = "不动";
    reasons.push("概率加权后的组合影响有限，没有足够理由制造动作");
  } else {
    suggestedAction = "复盘";
    reasons.push("事件可能影响组合，但证据与收益风险尚不足以自动跨过动作门槛");
  }

  const readiness: EventAssessment["readiness"] = gates.length
    ? "blocked"
    : warnings.length || evidenceLabel === "可研判"
      ? "review"
      : "ready";

  return {
    probabilityTotal,
    expectedPortfolioImpact,
    evidenceLabel,
    evidenceDetail: `${strongFacts.length} 条一手/公司事实 · ${independentFacts.length} 条独立事实 · ${completedEvidence.length} 条有效证据`,
    readiness,
    suggestedAction,
    gates,
    warnings,
    reasons
  };
}

export function buildEventRedTeamPrompt(eventCase: EventDecisionCase, assessment: EventAssessment, holding?: Holding) {
  return [
    "你是投资委员会的反方审稿人。不要给收益承诺，不要替用户交易，只负责找出事件研判中的证据缺口、路径风险和自我欺骗。",
    "必须区分事实、假设、判断；不要把价格波动当作论点证明。",
    `标的：${eventCase.companyName || holding?.name || "未填写"} ${eventCase.symbol || holding?.code || ""}`,
    `事件：${eventCase.title}\n${eventCase.summary}`,
    `受影响论点：${eventCase.affectedThesis}`,
    `证伪条件：${eventCase.thesisBreakCondition}`,
    `证据：${JSON.stringify(eventCase.evidence.filter((item) => item.title.trim()))}`,
    `情景：${JSON.stringify(eventCase.scenarios)}`,
    `系统评估：${JSON.stringify(assessment)}`,
    "请用中文输出四段：最可能错在哪里；市场可能已经知道什么；还缺哪份关键证据；什么变化会推翻当前动作。"
  ].join("\n\n");
}

export function eventImpactLevel(assessment: EventAssessment): "低" | "中" | "高" {
  const impact = Math.abs(assessment.expectedPortfolioImpact ?? 0);
  if (impact >= 3) return "高";
  if (impact >= 1) return "中";
  return "低";
}
