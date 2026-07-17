import { describe, expect, it } from "vitest";
import { createBackupPayload } from "./backup";
import { assessEventCase, newEventCase } from "./eventDecision";
import { defaultAiSettings, defaultRules, type AppData, type EventDecisionCase, type Holding } from "./types";

const holding: Holding = {
  id: "holding-1",
  name: "测试公司",
  code: "TEST",
  market: "美股",
  theme: "云服务",
  weight: 10,
  thesis: "客户留存与现金流能持续改善",
  updatedAt: "2026-07-17T00:00:00.000Z"
};

function decisionGradeCase(): EventDecisionCase {
  return {
    ...newEventCase(holding),
    title: "公司更新年度经营指引",
    eventDate: "2026-07-17",
    summary: "公司在正式公告中更新了下一财年的收入和现金流指引。",
    affectedThesis: holding.thesis,
    thesisBreakCondition: "下一季度客户留存率继续下降且自由现金流转负。",
    evidence: [
      { id: "e1", title: "监管文件确认新指引", sourceUrl: "https://example.com/filing", publishedAt: "2026-07-17", tier: "一手文件", nature: "事实", note: "确认收入区间" },
      { id: "e2", title: "公司业绩说明会解释原因", sourceUrl: "https://example.com/ir", publishedAt: "2026-07-17", tier: "公司口径", nature: "事实", note: "确认现金流节奏" },
      { id: "e3", title: "独立渠道数据验证趋势", sourceUrl: "https://example.com/research", publishedAt: "2026-07-17", tier: "独立来源", nature: "事实", note: "交叉验证客户留存" }
    ],
    scenarios: [
      { id: "s1", name: "兑现", probability: 60, portfolioImpact: 5, thesisEffect: "强化", rationale: "指引与渠道数据一致", signpost: "下一季度留存率" },
      { id: "s2", name: "延迟", probability: 25, portfolioImpact: 0, thesisEffect: "不变", rationale: "收入兑现但现金流延后", signpost: "现金流量表" },
      { id: "s3", name: "落空", probability: 15, portfolioImpact: -4, thesisEffect: "削弱", rationale: "需求恢复不及预期", signpost: "公司再次下调指引" }
    ],
    nextTrigger: "下一季度正式财报",
    reviewAt: "2026-10-17"
  };
}

describe("assessEventCase", () => {
  it("blocks a new event until evidence and scenarios are complete", () => {
    const result = assessEventCase(newEventCase(holding), [holding], defaultRules());
    expect(result.readiness).toBe("blocked");
    expect(result.suggestedAction).toBe("写入观察");
    expect(result.gates).toContain("至少需要 1 条一手/公司事实和 1 条交叉证据");
    expect(result.expectedPortfolioImpact).toBeNull();
  });

  it("computes probability-weighted portfolio impact only at 100 percent", () => {
    const eventCase = decisionGradeCase();
    const result = assessEventCase(eventCase, [holding], defaultRules());
    expect(result.probabilityTotal).toBe(100);
    expect(result.expectedPortfolioImpact).toBe(2.4);
    expect(result.evidenceLabel).toBe("证据较强");
    expect(result.readiness).toBe("ready");
    expect(result.suggestedAction).toBe("加仓");
  });

  it("hard-blocks a probability tree that does not sum to 100 percent", () => {
    const eventCase = decisionGradeCase();
    eventCase.scenarios[0].probability = 55;
    const result = assessEventCase(eventCase, [holding], defaultRules());
    expect(result.probabilityTotal).toBe(95);
    expect(result.expectedPortfolioImpact).toBeNull();
    expect(result.readiness).toBe("blocked");
    expect(result.gates.some((item) => item.includes("当前为 95%"))).toBe(true);
  });

  it("lets portfolio discipline veto an otherwise positive event", () => {
    const eventCase = decisionGradeCase();
    const concentratedHolding = { ...holding, weight: 25 };
    const result = assessEventCase(eventCase, [concentratedHolding], defaultRules());
    expect(result.warnings.some((item) => item.includes("加仓被硬规则阻止"))).toBe(true);
    expect(result.suggestedAction).toBe("不动");
  });

  it("surfaces thesis invalidation before positive expected value", () => {
    const eventCase = decisionGradeCase();
    eventCase.scenarios = [
      { id: "s1", name: "兑现", probability: 60, portfolioImpact: 8, thesisEffect: "强化", rationale: "经营趋势恢复", signpost: "季度财报" },
      { id: "s2", name: "证伪", probability: 40, portfolioImpact: -5, thesisEffect: "证伪", rationale: "客户与现金流同时恶化", signpost: "留存率跌破阈值" }
    ];
    const result = assessEventCase(eventCase, [holding], defaultRules());
    expect(result.expectedPortfolioImpact).toBe(2.8);
    expect(result.suggestedAction).toBe("减仓");
  });
});

describe("local backup privacy", () => {
  it("exports event cases but never exports the API key", () => {
    const eventCase = decisionGradeCase();
    const data: AppData = {
      holdings: [holding],
      rules: defaultRules(),
      aiSettings: { ...defaultAiSettings(), apiKey: "should-not-leave-browser" },
      decisionLogs: [],
      weeklyReviews: [],
      eventCases: [eventCase]
    };
    const payload = createBackupPayload(data);
    expect(payload.data.aiSettings.apiKey).toBe("");
    expect(payload.data.eventCases).toHaveLength(1);
  });
});
