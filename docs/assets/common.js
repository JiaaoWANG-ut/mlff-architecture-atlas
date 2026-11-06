/* Shared constants and helpers for every page. Data comes from data/*.js (window.MLFF, MLFF_BENCH, ...). */
"use strict";

const FAMILY = {
  "descriptor-nn": {
    name: "描述符 + 神经网络", color: "#8b5cf6",
    desc: "先用手工设计的“对称函数/描述符”把每个原子周围的环境压成一串固定数字，再交给一个小神经网络算出原子能。严格局域、速度快、天然好并行；表达力受描述符设计限制。",
  },
  "linear-kernel": {
    name: "线性 / 核方法（多体展开）", color: "#0ea5e9",
    desc: "把原子环境展开成一组系统完备的多体基函数（ACE、MTP、SNAP、SOAP、样条），能量就是这些基函数的线性组合或核回归。可解释、极快、需要的数据少，精度上限由基函数截断决定。",
  },
  "invariant-mpnn": {
    name: "不变消息传递网络", color: "#10b981",
    desc: "把结构看成一张图，原子之间多轮“传话”（消息传递）；消息只用距离、键角等标量，天然对旋转不变。通过堆层扩大视野，代表了第一批通用材料大模型（M3GNet、CHGNet、MatterSim）。",
  },
  "cartesian-equivariant": {
    name: "笛卡尔张量等变", color: "#f59e0b",
    desc: "隐藏特征里除了标量还带矢量、矩阵等笛卡尔张量，旋转时跟着一起转；只用点积、外积、矩阵乘这类简单运算保持等变，避开球谐函数和 Clebsch–Gordan 系数，GPU 上更省。",
  },
  "spherical-equivariant": {
    name: "球谐等变", color: "#ef4444",
    desc: "特征按角动量 l 分组（球谐函数系数），用 Clebsch–Gordan 张量积严格地组合方向信息。精度与数据效率最高的一类，也是计算最贵的一类；eSCN 的 SO(2) 技巧和 cuEquivariance 等内核在不断降低其代价。",
  },
  "unconstrained": {
    name: "无约束（学习对称性）", color: "#64748b",
    desc: "不在网络结构上强制旋转等变，而是靠随机旋转数据增强让网络“学会”对称性，换来全是普通 MLP / 注意力的 GPU 友好运算和很高的速度（Orb、PET）。",
  },
  "long-range-module": {
    name: "长程 / 色散模块", color: "#ec4899",
    desc: "不单独作为完整势函数，而是挂在局域模型上的长程项：隐式电荷 + Ewald（LES）、Ewald 消息传递、DFT-D3 色散校正。",
  },
  "infrastructure": {
    name: "基础设施 / 算子库", color: "#334155",
    desc: "提供等变运算的数学库与 GPU 内核，被大量模型复用：e3nn（球谐、CG 张量积）、NVIDIA cuEquivariance（融合内核）。",
  },
};

const STAGE = {
  input: { name: "输入构型", short: "输入", desc: "原子坐标 R、元素 Z、晶胞与周期性；部分模型还要总电荷、自旋。" },
  graph: { name: "建图（邻居表）", short: "建图", desc: "在截断半径 r_c 内找邻居（含周期镜像），得到边集合。" },
  geometry: { name: "几何编码", short: "几何", desc: "距离 → 径向基 × 平滑包络；方向 → 球谐 / 笛卡尔张量 / 键角。" },
  embedding: { name: "原子嵌入", short: "嵌入", desc: "元素（及电荷、自旋等）→ 初始特征向量。" },
  interaction: { name: "相互作用 / 消息传递", short: "交互", desc: "按几何关系混合邻居特征，多体信息在这里产生。" },
  readout: { name: "读出", short: "读出", desc: "把每个原子的特征变成一个原子能（或其他原子量）。" },
  energy: { name: "能量汇总", short: "能量", desc: "E = Σ_i E_i（+ 参考能、缩放、平移）。" },
  longrange: { name: "长程项", short: "长程", desc: "静电（电荷 + Coulomb/Ewald）、色散（D3/D4）等截断之外的物理。" },
  forces: { name: "力", short: "力", desc: "F = −∂E/∂R（自动微分，保守）或网络直接输出（非保守）。" },
  stress: { name: "应力 / 维里", short: "应力", desc: "σ = (1/V) ∂E/∂ε：对应变求导。" },
  output: { name: "其他性质", short: "其他", desc: "Hessian/声子、电荷、偶极、极化率、磁矩、不确定度……" },
};

const ARCH_LABEL = {
  geometry: "几何输入", equivariance: "对称性 / 等变性", lmax: "角动量阶 l_max", bodyOrder: "体序（多体阶数）",
  layers: "层数", cutoff: "截断半径 r_c", receptiveField: "感受野", message: "消息函数", readout: "读出",
  forces: "力的类型", forcesDetail: "力的计算", stress: "应力", longRange: "长程静电", dispersion: "色散（vdW）",
  chargeSpin: "总电荷 / 自旋", otherOutputs: "其他输出", strictlyLocal: "严格局域", complexity: "计算复杂度",
  accel: "加速 / 部署",
};

const SCORE_KEYS = ["speed", "expressiveness", "longRange", "scalability", "physics", "coverage"];
const SCORE_LABEL = {
  speed: "速度", expressiveness: "表达力", longRange: "长程 / 弱相互作用", scalability: "并行可扩展性",
  physics: "物理约束", coverage: "性质覆盖",
};

const FORCES_LABEL = {
  conservative: "保守力（−∂E/∂R）", direct: "直接预测力", both: "保守 / 直接均支持", "n/a": "不适用",
};
const FORCES_CLASS = { conservative: "cons", direct: "direct", both: "both", "n/a": "" };

const CAT_LABEL = {
  lr: { none: "无", optional: "可选扩展", builtin: "内置", core: "本身即长程模块" },
  disp: { none: "无", addon: "外挂 D3/D4", optional: "可选内置项", builtin: "内置", core: "本身即色散模块" },
  qs: { none: "无", optional: "可选", builtin: "内置" },
};
const PROP_LABEL = {
  hessian: "Hessian / 二阶导", charges: "原子电荷", dipole: "偶极", polar: "极化率 / 极化", bec: "Born 有效电荷",
  spin: "磁矩 / 自旋", uq: "不确定度",
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function famColor(f) { return (FAMILY[f] || {}).color || "#888"; }
function famBadge(f) {
  return `<span class="badge fam" style="background:${famColor(f)}">${esc((FAMILY[f] || {}).name || f)}</span>`;
}
function forcesBadge(f) {
  return `<span class="badge ${FORCES_CLASS[f] || ""}">${esc(FORCES_LABEL[f] || f)}</span>`;
}
function param(name) { return new URLSearchParams(location.search).get(name); }
function fmt(x, d = 3) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  if (typeof x !== "number") return esc(x);
  if (Math.abs(x) >= 1e6) return (x / 1e6).toFixed(1) + "M";
  if (Math.abs(x) >= 1000) return x.toFixed(0);
  return Number(x.toPrecision(d)).toString();
}
function dots(v) {
  if (!v) return '<span class="muted">—</span>';
  return `<span class="dots">${"●".repeat(v)}<span class="off">${"●".repeat(5 - v)}</span></span>`;
}
function renderTex(el, tex, display = true) {
  if (!tex) return;
  if (window.katex) {
    try {
      katex.render(tex, el, { displayMode: display, throwOnError: false, strict: "ignore", trust: false });
      return;
    } catch (e) { /* fall through */ }
  }
  el.textContent = tex;
}
/* Render every element carrying data-tex (display) or data-itex (inline). */
function renderAllTex(root = document) {
  root.querySelectorAll("[data-tex]").forEach((el) => renderTex(el, el.getAttribute("data-tex"), true));
  root.querySelectorAll("[data-itex]").forEach((el) => renderTex(el, el.getAttribute("data-itex"), false));
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("加载失败: " + src));
    document.head.appendChild(s);
  });
}
function modelById(id) { return (window.MLFF?.models || []).find((m) => m.id === id); }
function modelLink(m) { return `model.html?id=${encodeURIComponent(m.id)}`; }

const PAGES = [
  ["index.html", "首页 · 通用流水线"],
  ["models.html", "模型库"],
  ["stages.html", "逐步对比"],
  ["compare.html", "架构对比"],
  ["analysis.html", "深度分析"],
  ["bench.html", "基准数据"],
  ["glossary.html", "术语表"],
  ["about.html", "数据与方法"],
];

function mountChrome(active) {
  const top = document.createElement("header");
  top.className = "topbar";
  top.innerHTML = `<div class="inner"><a class="brand" href="index.html">MLFF <span>架构图解</span></a>
    <nav class="nav">${PAGES.map(([h, t]) => `<a href="${h}" class="${h === active ? "active" : ""}">${t}</a>`).join("")}</nav></div>`;
  document.body.prepend(top);
  const foot = document.createElement("footer");
  foot.className = "footer";
  const n = window.MLFF ? window.MLFF.models.length : "";
  foot.innerHTML = `机器学习力场底层架构图解 · ${n} 个架构 · 源码快照见 <a href="about.html">数据与方法</a> ·
    代码片段均链接到对应 commit 的原始文件。评分为编辑判断，基准数字来自 Matbench Discovery 与 MLIP Arena 原始数据文件。`;
  document.body.appendChild(foot);
}

/* Make a table sortable by clicking headers that have class "sortable" (data-type="num" for numbers). */
function makeSortable(table) {
  const ths = table.querySelectorAll("th.sortable");
  ths.forEach((th, idx) => {
    th.addEventListener("click", () => {
      const col = Array.from(th.parentNode.children).indexOf(th);
      const body = table.tBodies[0];
      const rows = Array.from(body.rows);
      const num = th.dataset.type === "num";
      const dir = th.dataset.dir === "asc" ? "desc" : "asc";
      ths.forEach((x) => delete x.dataset.dir);
      th.dataset.dir = dir;
      rows.sort((a, b) => {
        let x = a.cells[col].dataset.v ?? a.cells[col].textContent;
        let y = b.cells[col].dataset.v ?? b.cells[col].textContent;
        if (num) {
          x = parseFloat(x); y = parseFloat(y);
          if (Number.isNaN(x)) return 1;
          if (Number.isNaN(y)) return -1;
          return dir === "asc" ? x - y : y - x;
        }
        return dir === "asc" ? String(x).localeCompare(String(y), "zh") : String(y).localeCompare(String(x), "zh");
      });
      rows.forEach((r) => body.appendChild(r));
    });
  });
}

/* Benchmarks helpers */
function benchForModel(id) {
  const B = window.MLFF_BENCH;
  if (!B) return null;
  return {
    mbd: B.mbd.filter((r) => r.modelId === id),
    stab: B.arenaStability.filter((r) => r.modelId === id),
    comb: B.arenaCombustion.filter((r) => r.modelId === id),
    eos: B.arenaEos.filter((r) => r.modelId === id),
  };
}
function mdCost(r) {
  const c = (r.costs || []).find((x) => x.task === "md");
  return c || null;
}
