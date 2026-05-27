export type Market = "A股" | "港股" | "美股" | "基金" | "其他";
export type DecisionAction = "不动" | "复盘" | "减仓" | "加仓" | "写入观察";
export type ImpactLevel = "低" | "中" | "高";

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
