import type { DecisionLog, Holding, RuleSettings } from "./types";

export interface RuleResult {
  severity: "ok" | "warn" | "danger";
  messages: string[];
}

const todayKey = () => new Date().toISOString().slice(0, 10);

export function calculateCashRatio(holdings: Holding[]) {
  const invested = holdings.reduce((sum, item) => sum + item.weight, 0);
  return Math.max(0, Number((100 - invested).toFixed(1)));
}

export function themeExposure(holdings: Holding[]) {
  return holdings.reduce<Record<string, number>>((acc, item) => {
    const key = item.theme.trim() || "未分类";
    acc[key] = Number(((acc[key] ?? 0) + item.weight).toFixed(1));
    return acc;
  }, {});
}

export function evaluateRules(
  holdings: Holding[],
  rules: RuleSettings,
  eventText = "",
  logs: DecisionLog[] = []
): RuleResult {
  const messages: string[] = [];
  const cashRatio = calculateCashRatio(holdings);
  const maxHolding = holdings[0];

  if (cashRatio < rules.minCashRatio) {
    messages.push(`现金 ${cashRatio}% 低于下限 ${rules.minCashRatio}%`);
  }
  if (maxHolding && maxHolding.weight > rules.maxSingleWeight) {
    messages.push(`${maxHolding.name} 仓位 ${maxHolding.weight}% 超过单只上限 ${rules.maxSingleWeight}%`);
  }

  Object.entries(themeExposure(holdings)).forEach(([theme, exposure]) => {
    if (exposure > rules.maxThemeExposure) {
      messages.push(`${theme} 主题暴露 ${exposure}% 超过上限 ${rules.maxThemeExposure}%`);
    }
  });

  if (rules.noTradeAtOpen) {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    if (minutes >= 9 * 60 + 30 && minutes <= 10 * 60) {
      messages.push("开盘前 30 分钟禁动规则生效");
    }
  }

  if (rules.overnightCooldownAfterSell && /买回|加仓|回补/.test(eventText)) {
    const soldToday = logs.some(
      (log) => log.createdAt.startsWith(todayKey()) && log.action === "减仓" && /卖出|减仓/.test(log.finalDecision)
    );
    if (soldToday) messages.push("今日已有卖出记录，同日买回触发冷却提醒");
  }

  return {
    severity: messages.some((text) => /低于|超过|冷却/.test(text)) ? "danger" : messages.length ? "warn" : "ok",
    messages: messages.length ? messages : ["未触发硬性规则，仍需记录理由"]
  };
}

export function localDecisionHint(messages: string[]) {
  if (messages.some((text) => text.includes("现金") || text.includes("超过") || text.includes("冷却"))) return "不动";
  if (messages.some((text) => text.includes("禁动"))) return "复盘";
  return "写入观察";
}
