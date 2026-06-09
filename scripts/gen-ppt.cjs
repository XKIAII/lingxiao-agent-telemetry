const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "凌霄";
pres.title = "凌霄 — Agent 可观测平台";

// Color palette: Cyber Security
const C = {
  bg: "0F172A",       // deep dark
  card: "1E293B",     // card bg
  accent: "F97316",   // orange accent
  green: "22C55E",
  red: "EF4444",
  blue: "3B82F6",
  purple: "A855F7",
  amber: "F59E0B",
  text: "E2E8F0",
  muted: "94A3B8",
  border: "334155",
};

// ========== Slide 1: Title ==========
{
  const s = pres.addSlide();
  s.background = { fill: C.bg };
  // Decorative bar
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent } });
  s.addText("凌霄", { x: 0.8, y: 1.2, w: 8, h: 1.4, fontSize: 56, fontFace: "Arial", color: C.text, bold: true });
  s.addText("Agent 可观测平台", { x: 0.8, y: 2.5, w: 8, h: 0.8, fontSize: 28, fontFace: "Arial", color: C.accent, bold: true });
  s.addText("安全护栏 + 实时监控 + 审计追踪 + 合规报告", {
    x: 0.8, y: 3.4, w: 8, h: 0.5, fontSize: 16, color: C.muted
  });
  // Tags
  const tags = ["5层架构", "Python SDK", "安全红队", "LangChain 兼容", "Docker部署"];
  tags.forEach((t, i) => {
    const tw = t.length * 0.14 + 0.3;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8 + i * 1.65, y: 4.2, w: tw, h: 0.35,
      fill: { color: C.card }, rectRadius: 0.05,
    });
    s.addText(t, { x: 0.8 + i * 1.65, y: 4.2, w: tw, h: 0.35, fontSize: 9, color: C.muted, align: "center", valign: "middle" });
  });
  s.addText("github.com/XKIAII/lingxiao-agent-telemetry", { x: 0.8, y: 4.85, w: 6, h: 0.3, fontSize: 10, color: C.blue });
}

// ========== Slide 2: 5层架构 ==========
{
  const s = pres.addSlide();
  s.background = { fill: C.bg };
  s.addText("5 层智能体架构", { x: 0.8, y: 0.4, w: 8, h: 0.7, fontSize: 30, fontFace: "Arial", color: C.text, bold: true });
  s.addText("每一层各司其职，互不侵入", { x: 0.8, y: 0.95, w: 8, h: 0.35, fontSize: 12, color: C.muted });

  const layers = [
    { name: "记忆层", en: "Memory", desc: "配置注册 + 规则引擎", color: C.purple },
    { name: "知识层", en: "Skills", desc: "可复用能力单元注册", color: C.blue },
    { name: "护栏层", en: "Hooks", desc: "Pre/Post 安全拦截", color: C.red },
    { name: "委派层", en: "Sub-Agents", desc: "并行任务分发执行", color: C.amber },
    { name: "分发层", en: "Plugins & MCP", desc: "第三方集成扩展", color: C.green },
  ];

  layers.forEach((l, i) => {
    const y = 1.6 + i * 0.76;
    s.addShape(pres.shapes.RECTANGLE, { x: 0.8, y, w: 0.08, h: 0.6, fill: { color: l.color } });
    s.addText(l.name, { x: 1.1, y, w: 1.4, h: 0.35, fontSize: 20, fontFace: "Arial", color: C.text, bold: true });
    s.addText(l.en, { x: 2.5, y, w: 1.5, h: 0.35, fontSize: 11, color: l.color, valign: "middle" });
    s.addText(l.desc, { x: 4, y, w: 5, h: 0.35, fontSize: 13, color: C.muted, valign: "middle" });
    if (i < 4) {
      s.addShape(pres.shapes.LINE, { x: 2.5, y: y + 0.7, w: 0, h: 0.1, line: { color: C.border, width: 1 } });
    }
  });
}

// ========== Slide 3: 四象限 ==========
{
  const s = pres.addSlide();
  s.background = { fill: C.bg };
  s.addText("四象限产品矩阵", { x: 0.8, y: 0.4, w: 8, h: 0.7, fontSize: 30, fontFace: "Arial", color: C.text, bold: true });

  const quadrants = [
    { title: "监控台", sub: "给运维", items: "实时面板 · 告警推送\n成本追踪 · 多Agent筛选", x: 0.8, y: 1.4, color: C.blue },
    { title: "安全中心", sub: "给安全", items: "Hook护栏 · 漏洞检测\n红队引擎 · 合规报告", x: 5.2, y: 1.4, color: C.red },
    { title: "调试器", sub: "给开发者", items: "单步回放 · 操作对比\n参数Diff · 自动播放", x: 0.8, y: 3.3, color: C.purple },
    { title: "评测基准", sub: "给产品", items: "Agent对比 · A/B测试\n安全评分 · 效果评估", x: 5.2, y: 3.3, color: C.amber },
  ];

  quadrants.forEach(q => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: q.x, y: q.y, w: 4.1, h: 1.65, fill: { color: C.card }, rectRadius: 0.1,
    });
    s.addShape(pres.shapes.RECTANGLE, { x: q.x, y: q.y, w: 4.1, h: 0.06, fill: { color: q.color } });
    s.addText(q.title, { x: q.x + 0.3, y: q.y + 0.15, w: 2.5, h: 0.4, fontSize: 22, fontFace: "Arial", color: C.text, bold: true });
    s.addText(q.sub, { x: q.x + 0.3, y: q.y + 0.55, w: 2, h: 0.25, fontSize: 10, color: q.color });
    s.addText(q.items, { x: q.x + 0.3, y: q.y + 0.85, w: 3.5, h: 0.7, fontSize: 11, color: C.muted, lineSpacing: 20 });
  });
}

// ========== Slide 4: Dashboard Preview ==========
{
  const s = pres.addSlide();
  s.background = { fill: C.bg };
  s.addText("Dashboard 实时面板", { x: 0.8, y: 0.4, w: 8, h: 0.7, fontSize: 30, fontFace: "Arial", color: C.text, bold: true });

  // KPI row
  const kpis = [
    { v: "300+", label: "监控操作" },
    { v: "76%", label: "成功率" },
    { v: "14", label: "安全拦截" },
    { v: "$0.16", label: "累计成本" },
  ];
  kpis.forEach((k, i) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8 + i * 2.2, y: 1.3, w: 1.9, h: 0.9, fill: { color: C.card }, rectRadius: 0.06,
    });
    s.addText(k.v, { x: 0.8 + i * 2.2, y: 1.3, w: 1.9, h: 0.52, fontSize: 24, fontFace: "Arial", color: C.text, bold: true, align: "center", valign: "middle" });
    s.addText(k.label, { x: 0.8 + i * 2.2, y: 1.75, w: 1.9, h: 0.4, fontSize: 10, color: C.muted, align: "center", valign: "middle" });
  });

  // Charts placeholder
  const charts = [
    { label: "操作时序叠柱图", w: 4.2 },
    { label: "Hook 触发统计条形图", w: 4.2 },
  ];
  charts.forEach((c, i) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8 + i * 4.5, y: 2.5, w: 4.2, h: 1.6, fill: { color: C.card }, rectRadius: 0.06,
    });
    s.addText(c.label, { x: 0.8 + i * 4.5, y: 3.1, w: 4.2, h: 0.4, fontSize: 11, color: C.muted, align: "center", valign: "middle" });
  });

  // Logs placeholder
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.8, y: 4.3, w: 8.5, h: 1.0, fill: { color: C.card }, rectRadius: 0.06,
  });
  const sampleLogs = [
    "langchain-agent → agent.respond   成功  0.035s  1030 tokens",
    "langchain-agent → agent.analyze   成功  0.025s  842 tokens",
    "langchain-agent → tool.search     成功  0.002s  400 tokens",
    "test-suite → test.blocked      拦截  测试拦截",
  ];
  s.addText(sampleLogs.map((l, i) => ({
    text: l, options: { breakLine: i < 3, bullet: false }
  })), { x: 1, y: 4.35, w: 8, h: 0.9, fontSize: 10, color: C.text, lineSpacing: 18 });
}

// ========== Slide 5: Tech Stack ==========
{
  const s = pres.addSlide();
  s.background = { fill: C.bg };
  s.addText("技术栈 & 部署", { x: 0.8, y: 0.4, w: 8, h: 0.7, fontSize: 30, fontFace: "Arial", color: C.text, bold: true });

  const stacks = [
    { label: "后端", items: "TypeScript · Node.js · Express\nbetter-sqlite3 · ECharts" },
    { label: "SDK", items: "Python (纯标准库)\nnpm install agent-telemetry" },
    { label: "部署", items: "Docker · docker compose\nnpm start (开箱即用)" },
    { label: "测试", items: "23 项 API 集成测试\nnpm test (一键跑通)" },
  ];

  stacks.forEach((st, i) => {
    const x = 0.8 + i * 2.2;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.4, w: 2.0, h: 2.0, fill: { color: C.card }, rectRadius: 0.08,
    });
    s.addText(st.label, { x, y: 1.45, w: 2.0, h: 0.4, fontSize: 18, fontFace: "Arial", color: C.accent, bold: true, align: "center" });
    s.addText(st.items, { x: x + 0.15, y: 1.9, w: 1.7, h: 1.3, fontSize: 11, color: C.muted, lineSpacing: 18, align: "center" });
  });

  // Quick start
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.8, y: 3.8, w: 8.5, h: 1.5, fill: { color: "16213E" }, rectRadius: 0.1,
  });
  s.addText("快速开始", { x: 1.1, y: 3.9, w: 3, h: 0.35, fontSize: 14, fontFace: "Arial", color: C.accent, bold: true });
  const commands = [
    "git clone https://github.com/XKIAII/lingxiao-agent-telemetry",
    "cd agent-core-demo && npm install && npm start",
    "cd python-sdk && python red_team.py",
    "open http://localhost:3000/dashboard.html",
  ];
  s.addText(commands.map((c, i) => ({
    text: `$  ${c}`, options: { breakLine: i < 3, fontFace: "Consolas" }
  })), { x: 1.1, y: 4.3, w: 8, h: 0.9, fontSize: 10, color: C.green, lineSpacing: 16 });
}

// ========== Slide 6: Ending ==========
{
  const s = pres.addSlide();
  s.background = { fill: C.bg };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent } });
  s.addText("凌霄", { x: 0.8, y: 1.5, w: 8, h: 1.2, fontSize: 52, fontFace: "Arial", color: C.text, bold: true });
  s.addText("Agent 安全护栏 · 从第一天开始", { x: 0.8, y: 2.6, w: 8, h: 0.6, fontSize: 22, fontFace: "Arial", color: C.accent });
  s.addText("github.com/XKIAII/lingxiao-agent-telemetry", { x: 0.8, y: 3.5, w: 8, h: 0.4, fontSize: 14, color: C.blue });
  s.addText("Agent 生态从「能跑就行」到「安全可靠」，凌霄正好卡在转折点上。", {
    x: 0.8, y: 4.2, w: 8, h: 0.4, fontSize: 13, color: C.muted, italic: true
  });
}

// Write
const outDir = path.resolve(__dirname, "..");
fs.mkdirSync(outDir, { recursive: true });
pres.writeFile({ fileName: path.join(outDir, "凌霄产品介绍.pptx") }).then(() => {
  console.log("PPT 已生成: " + path.join(outDir, "凌霄产品介绍.pptx"));
});
