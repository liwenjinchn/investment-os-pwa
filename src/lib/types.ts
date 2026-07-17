export type Market = "A股" | "港股" | "美股" | "基金" | "其他";
export type DecisionAction = "不动" | "复盘" | "减仓" | "加仓" | "写入观察";
export type ImpactLevel = "低" | "中" | "高";
export type EventStatus = "待研判" | "研判中" | "监控中" | "已复盘";
export type EventType =
  | "业绩与指引"
  | "监管与诉讼"
  | "并购与重组"
  | "产品与经营"
  | "资本配置"
  | "指数与资金流"
  | "宏观与行业"
  | "其他";
export type EvidenceTier = "一手文件" | "公司口径" | "独立来源" | "市场信号" | "未核实";
export type EvidenceNature = "事实" | "假设" | "判断";
export type ThesisEffect = "强化" | "不变" | "削弱" | "证伪";

export interface Holding {
  id: string;
  name: string;
  code: string;
  market: Market;
  theme: string;
  weight: number;
  marketValue?: number;
  pnl?: number;
  thesis: string;
  updatedAt: string;
}

export interface RuleSettings {
  id: "main";
  minCashRatio: number;
  maxSingleWeight: number;
  maxThemeExposure: number;
  maxSingleAdjustment: number;
  noTradeAtOpen: boolean;
  overnightCooldownAfterSell: boolean;
  updatedAt: string;
}

export interface AiSettings {
  id: "main";
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  updatedAt: string;
}

export interface DecisionLog {
  id: string;
  createdAt: string;
  eventText: string;
  impactLevel: ImpactLevel;
  action: DecisionAction;
  aiAdvice: string;
  localRules: string[];
  finalDecision: string;
  reviewPoint: string;
  relatedCode?: string;
  eventCaseId?: string;
}

export interface EventEvidence {
  id: string;
  title: string;
  sourceUrl: string;
  publishedAt: string;
  tier: EvidenceTier;
  nature: EvidenceNature;
  note: string;
}

export interface EventScenario {
  id: string;
  name: string;
  probability: number;
  portfolioImpact: number;
  thesisEffect: ThesisEffect;
  rationale: string;
  signpost: string;
}

export interface EventDecisionCase {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: EventStatus;
  title: string;
  symbol: string;
  companyName: string;
  eventType: EventType;
  eventDate: string;
  timeWindow: string;
  summary: string;
  affectedThesis: string;
  thesisBreakCondition: string;
  evidence: EventEvidence[];
  scenarios: EventScenario[];
  riskNotes: string;
  finalAction: DecisionAction;
  decisionRationale: string;
  nextTrigger: string;
  reviewAt: string;
  aiRedTeam: string;
  actualOutcome: string;
  lesson: string;
}

export interface WeeklyReview {
  id: string;
  weekStart: string;
  createdAt: string;
  actionsSummary: string;
  rulesFollowed: string;
  emotionalSignals: string;
  reflection: string;
  nextWatchItems: string[];
}

export interface OcrCandidate {
  id: string;
  rawText: string;
  name: string;
  code: string;
  market: Market;
  theme: string;
  weight: number;
  thesis: string;
}

export interface AppData {
  holdings: Holding[];
  rules: RuleSettings;
  aiSettings: AiSettings;
  decisionLogs: DecisionLog[];
  weeklyReviews: WeeklyReview[];
  eventCases: EventDecisionCase[];
}

export const defaultRules = (): RuleSettings => ({
  id: "main",
  minCashRatio: 20,
  maxSingleWeight: 20,
  maxThemeExposure: 55,
  maxSingleAdjustment: 15,
  noTradeAtOpen: true,
  overnightCooldownAfterSell: true,
  updatedAt: new Date().toISOString()
});

export const defaultAiSettings = (): AiSettings => ({
  id: "main",
  apiBaseUrl: "https://ai.centos.hk",
  apiKey: "",
  model: "claude-haiku-4-5-20251001",
  updatedAt: new Date().toISOString()
});

export const uid = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
