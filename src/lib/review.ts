import type { DecisionLog, WeeklyReview } from "./types";
import { uid } from "./types";

export function startOfWeek(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

export function generateWeeklyReview(logs: DecisionLog[]): WeeklyReview {
  const weekStart = startOfWeek();
  const weekLogs = logs.filter((log) => log.createdAt.slice(0, 10) >= weekStart);
  const actionCount = weekLogs.reduce<Record<string, number>>((acc, log) => {
    acc[log.action] = (acc[log.action] ?? 0) + 1;
    return acc;
  }, {});
  const ruleBreaks = weekLogs.filter((log) => log.localRules.some((rule) => /低于|超过|冷却|禁动/.test(rule)));
  const emotionalSignals = weekLogs.filter((log) => /追|怕|恐慌|冲动|踏空|消息/.test(log.eventText + log.finalDecision));

  return {
    id: uid("review"),
    weekStart,
    createdAt: new Date().toISOString(),
    actionsSummary: weekLogs.length
      ? `本周记录 ${weekLogs.length} 次决策：${Object.entries(actionCount)
          .map(([action, count]) => `${action} ${count} 次`)
          .join("，")}。`
      : "本周还没有决策日志。",
    rulesFollowed: ruleBreaks.length ? `有 ${ruleBreaks.length} 次触发硬规则，需要复查是否遵守。` : "未发现明显硬规则冲突。",
    emotionalSignals: emotionalSignals.length
      ? `发现 ${emotionalSignals.length} 条可能的情绪交易线索。`
      : "未发现明显情绪交易措辞。",
    reflection: ruleBreaks[0]?.reviewPoint || weekLogs[0]?.reviewPoint || "本周最该反思：是否在没有触发条件时也想行动。",
    nextWatchItems: weekLogs.slice(0, 3).map((log) => log.reviewPoint || log.eventText.slice(0, 40)).filter(Boolean)
  };
}
