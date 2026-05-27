import type { AiSettings, DecisionLog, Holding, RuleSettings } from "./types";
import { calculateCashRatio, themeExposure } from "./rules";

export function buildPrompt(input: {
  eventText: string;
  holdings: Holding[];
  rules: RuleSettings;
  recentLogs: DecisionLog[];
  localRuleMessages: string[];
}) {
  const holdingsSummary = input.holdings.map((item) => ({
    name: item.name,
    code: item.code,
    market: item.market,
    theme: item.theme,
    weight: item.weight,
    thesis: item.thesis
  }));

  return [
    "你是一个投资纪律助手，只做决策辅助，不预测收益，不给确定性盈利承诺。",
    "请基于本地持仓摘要、规则、事件和必要历史，输出严格 JSON。",
    "JSON 字段：impactLevel(低/中/高), action(不动/复盘/减仓/加仓/写入观察), reasons(string[]), triggeredRules(string[]), reviewPoint(string)。",
    `事件：${input.eventText}`,
    `现金比例：${calculateCashRatio(input.holdings)}%`,
    `主题暴露：${JSON.stringify(themeExposure(input.holdings))}`,
    `规则：${JSON.stringify(input.rules)}`,
    `本地规则提示：${JSON.stringify(input.localRuleMessages)}`,
    `持仓摘要：${JSON.stringify(holdingsSummary)}`,
    `最近决策：${JSON.stringify(input.recentLogs.slice(0, 5).map((log) => ({
      createdAt: log.createdAt,
      eventText: log.eventText,
      action: log.action,
      finalDecision: log.finalDecision,
      reviewPoint: log.reviewPoint
    })))}`
  ].join("\n");
}

export async function requestAiDecision(settings: AiSettings, prompt: string) {
  if (!settings.apiKey.trim()) throw new Error("缺少 API Key，请先在设置页粘贴并保存。");
  if (!settings.apiBaseUrl.trim()) throw new Error("缺少 Base URL。");
  if (!settings.model.trim()) throw new Error("缺少模型名称。");

  const base = settings.apiBaseUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: "system", content: "你是本地投资决策纪律助手。输出必须可执行、克制、可复盘。" },
        { role: "user", content: prompt }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) throw new Error("认证失败，请检查 API Key。");
    if (response.status === 404) throw new Error("接口或模型不存在，请检查 Base URL 和模型名。");
    if (response.status === 429) throw new Error("请求受限或余额不足，请稍后重试或检查账户余额。");
    throw new Error(`AI 请求失败：HTTP ${response.status}${body ? ` - ${body.slice(0, 120)}` : ""}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 返回为空。");
  return String(content);
}
