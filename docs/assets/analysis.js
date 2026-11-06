/* Analysis page: all charts and tables are computed from window.MLFF / MLFF_BENCH. */
"use strict";
mountChrome("analysis.html");
const D = window.MLFF, B = window.MLFF_BENCH;
const $ = (id) => document.getElementById(id);
const famOf = (id) => (id && modelById(id) ? modelById(id).family : null);
const colorOf = (id) => (famOf(id) ? famColor(famOf(id)) : "#9ca3af");
const PAL = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#475569", "#ea580c"];
const POT = D.models.filter((m) => !["infrastructure", "long-range-module"].includes(m.family));
if (window.Chart) {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.maintainAspectRatio = false;
}
/* Draw `label` of each data point next to it (scatter charts). */
const pointLabels = {
  id: "pointLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#374151";
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden || meta.type === "line") return;
      meta.data.forEach((el, j) => {
        const lab = ds.data[j] && ds.data[j].label;
        if (lab) ctx.fillText(lab, el.x + 5, el.y - 5);
      });
    });
    ctx.restore();
  },
};
const famLegend = (ids) => {
  const fs = [...new Set(ids.map(famOf).filter(Boolean))];
  return fs.map((f) => `<span><i style="background:${famColor(f)}"></i>${esc(FAMILY[f].name)}</span>`).join("");
};
function sortableTable(el, cols, rows, defaultSort) {
  el.innerHTML = `<thead><tr>${cols.map((c) => `<th class="sortable" ${c.num ? 'data-type="num"' : ""}>${c.h}</th>`).join("")}</tr></thead><tbody>${
    rows.map((r) => `<tr class="${r._cls || ""}">${cols.map((c) => {
      const v = c.v(r);
      return `<td class="${c.num ? "num" : ""}" data-v="${v == null ? "" : esc(v)}">${c.f ? c.f(r) : c.num ? fmt(v) : esc(v)}</td>`;
    }).join("")}</tr>`).join("")}</tbody>`;
  makeSortable(el);
  if (defaultSort != null) el.querySelectorAll("th")[defaultSort].click();
}
const mlink = (r) => (r.modelId ? `<a href="model.html?id=${encodeURIComponent(r.modelId)}">${esc(r.name)}</a>` : esc(r.name));

/* ---------------- A2: combustion speed ---------------- */
const DIRECT_ARENA = new Set(["ORB", "ORBv2", "EquiformerV2(OC20)", "eSCN(OC20)", "eqV2(OMat)", "EquiformerV2(OC22)"]);
const comb = B.arenaCombustion.slice().sort((a, b) => b.sps - a.sps);
new Chart($("chart-comb"), {
  type: "bar",
  data: {
    labels: comb.map((r) => r.name + (DIRECT_ARENA.has(r.name) ? "（直接力）" : "")),
    datasets: [{ data: comb.map((r) => r.sps), backgroundColor: comb.map((r) => colorOf(r.modelId)) }],
  },
  options: {
    indexAxis: "y",
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c) => `${fmt(c.raw)} 步/秒`, afterLabel: (c) => { const r = comb[c.dataIndex]; return `完成度 ${fmt(r.finalFrac * 100)}% · 用时 ${fmt(r.hours)} h`; } } },
    },
    scales: { x: { title: { display: true, text: "MD 速度（步/秒，越高越快）" } } },
  },
});

/* ---------------- A3: scaling ---------------- */
const heat = B.arenaStability.filter((r) => r.kind === "heating" && r.points.length >= 10);
const scaleSets = [];
heat.forEach((r, i) => {
  const c = PAL[i % PAL.length];
  const pts = r.points.filter((p) => p[1] > 0).map((p) => ({ x: p[0], y: p[1] }));
  scaleSets.push({ type: "scatter", label: r.name, data: pts, backgroundColor: c + "88", borderColor: c, pointRadius: 2.2 });
  if (r.fit) {
    const xs = pts.map((p) => p.x);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    scaleSets.push({ type: "line", label: r.name + " 拟合", data: [lo, hi].map((x) => ({ x, y: r.fit.a * Math.pow(x, -r.fit.n) })), borderColor: c, borderWidth: 2, pointRadius: 0, fill: false });
  }
});
new Chart($("chart-scale"), {
  type: "scatter",
  data: { datasets: scaleSets },
  options: {
    plugins: { legend: { labels: { filter: (it) => !it.text.endsWith("拟合"), boxWidth: 10 } } },
    scales: {
      x: { type: "logarithmic", title: { display: true, text: "原子数 N" } },
      y: { type: "logarithmic", title: { display: true, text: "步/秒" } },
    },
  },
});
sortableTable($("tbl-scale"), [
  { h: "模型", v: (r) => r.name, f: mlink },
  { h: "体系数", num: true, v: (r) => r.runs },
  { h: "完整跑完", num: true, v: (r) => r.completed, f: (r) => fmt(r.completed * 100) + "%" },
  { h: "中位 步/秒", num: true, v: (r) => r.medianSps },
  { h: "n（∝N<sup>−n</sup>）", num: true, v: (r) => (r.fit ? r.fit.n : null) },
], B.arenaStability.filter((r) => r.kind === "heating"), 3);
$("tbl-scale").querySelectorAll("th")[3].click(); // descending speed

/* ---------------- A4: MBD MD cost on H200 + Pareto ---------------- */
const h200 = B.mbd.map((r) => ({ r, c: (r.costs || []).find((c) => c.task === "md" && c.hardware === "NVIDIA H200") }))
  .filter((x) => x.c).sort((a, b) => a.c.sec - b.c.sec);
$("box-cost").style.height = Math.max(420, h200.length * 17 + 80) + "px";
new Chart($("chart-cost"), {
  type: "bar",
  data: {
    labels: h200.map((x) => x.r.name),
    datasets: [{ data: h200.map((x) => x.c.sec / 3600), backgroundColor: h200.map((x) => colorOf(x.r.modelId)) }],
  },
  options: {
    indexAxis: "y",
    plugins: {
      legend: { display: false },
      title: { display: true, text: "MBD MD 任务总用时（17 个体系，NVIDIA H200，小时）" },
      tooltip: { callbacks: { label: (c) => `${fmt(c.raw)} h`, afterLabel: (c) => { const r = h200[c.dataIndex].r; return `参数量 ${fmt(r.params)} · F1 ${fmt(r.discovery?.F1)} · ${r.targets}`; } } },
    },
    scales: { x: { type: "logarithmic", title: { display: true, text: "小时（对数）" } }, y: { ticks: { autoSkip: false, font: { size: 10 } } } },
  },
});
const paretoPts = h200.filter((x) => x.r.discovery?.F1 != null);
const front = new Set();
let bestF1 = -1;
paretoPts.forEach((x) => { if (x.r.discovery.F1 > bestF1) { bestF1 = x.r.discovery.F1; front.add(x.r.key); } }); // h200 is sorted by time
const byFam = {};
paretoPts.forEach((x) => {
  const f = famOf(x.r.modelId) || "other";
  (byFam[f] = byFam[f] || []).push({ x: x.c.sec / 3600, y: x.r.discovery.F1, name: x.r.name, label: front.has(x.r.key) ? x.r.name.replace(/\s*\(.*\)$/, "") : "" });
});
new Chart($("chart-pareto"), {
  type: "scatter",
  data: { datasets: Object.entries(byFam).map(([f, pts]) => ({ label: FAMILY[f] ? FAMILY[f].name : "其他", data: pts, backgroundColor: FAMILY[f] ? famColor(f) : "#999", pointRadius: 4 })) },
  options: {
    plugins: { tooltip: { callbacks: { label: (c) => `${c.raw.name}: ${fmt(c.raw.x)} h, F1 ${fmt(c.raw.y)}` } }, title: { display: true, text: "F1 vs MD 用时（H200；标注的是帕累托前沿）" } },
    scales: { x: { type: "logarithmic", title: { display: true, text: "MD 总用时（小时，对数）" } }, y: { title: { display: true, text: "F1（越高越好）" } } },
  },
  plugins: [pointLabels],
});

/* ---------------- B3: receptive field ---------------- */
const rfm = POT.filter((m) => D.curated[m.id] && D.curated[m.id].rf != null).sort((a, b) => D.curated[a.id].rf - D.curated[b.id].rf);
$("box-rf").style.height = Math.max(420, rfm.length * 15 + 80) + "px";
new Chart($("chart-rf"), {
  type: "bar",
  data: {
    labels: rfm.map((m) => m.name + (D.curated[m.id].T === 0 ? "（严格局域）" : `（${D.curated[m.id].T} 层 × ${D.curated[m.id].rc} Å）`)),
    datasets: [{ data: rfm.map((m) => D.curated[m.id].rf), backgroundColor: rfm.map((m) => famColor(m.family)) }],
  },
  options: {
    indexAxis: "y",
    plugins: {
      legend: { display: false },
      title: { display: true, text: "名义感受野（Å）= 层数 × 截断；严格局域模型 = 截断" },
      tooltip: { callbacks: { afterLabel: (c) => D.curated[rfm[c.dataIndex].id].cfg } },
    },
    scales: { x: { type: "logarithmic", title: { display: true, text: "Å（对数）" } }, y: { ticks: { autoSkip: false, font: { size: 10 } } } },
  },
});

/* ---------------- B4: weak-interaction matrix ---------------- */
const cnt = (k, vals) => POT.filter((m) => D.curated[m.id] && vals.includes(D.curated[m.id][k])).length;
$("weak-kpis").innerHTML = [
  [cnt("lr", ["none"]), `/ ${POT.length} 个完整势<b>没有</b>任何显式长程静电`],
  [cnt("lr", ["builtin", "core"]), "个默认内置长程静电（电荷 + 库仑 / Ewald）"],
  [cnt("disp", ["none"]), "个既无内置色散、官方也未提供 D3/D4 外挂"],
  [cnt("qs", ["builtin"]), "个内置总电荷 / 自旋输入"],
].map(([v, t]) => `<div class="card"><div class="kpi">${v}</div><div class="small">${t}</div></div>`).join("");
const li = $("weak-count-li");
const allIn = POT.filter((m) => D.curated[m.id] && D.curated[m.id].lr === "builtin" && D.curated[m.id].disp === "builtin");
if (li) li.innerHTML = `${POT.length} 个完整势中 <b>${cnt("lr", ["none"])}</b> 个没有任何显式静电、只有 <b>${cnt("lr", ["builtin", "core"])}</b> 个默认内置；同时内置“电荷 + 静电 + 色散”的 ${allIn.length} 个是 ${allIn.map((m) => `<a href="${modelLink(m)}">${esc(m.name)}</a>`).join("、")}，都来自分子 / 电解质 / 生物体系路线（详见 <a href="#weak-matrix">能力矩阵</a>）。`;
const weakRows = D.models.filter((m) => D.curated[m.id]).sort((a, b) => D.families.indexOf(a.family) - D.families.indexOf(b.family) || a.name.localeCompare(b.name));
const catCell = (m, k) => { const v = D.curated[m.id][k]; return `<span class="cell-${v}">${CAT_LABEL[k][v]}</span>`; };
sortableTable($("tbl-weak"), [
  { h: "模型", v: (m) => m.name, f: (m) => `<a href="${modelLink(m)}">${esc(m.name)}</a>` },
  { h: "家族", v: (m) => D.families.indexOf(m.family), f: (m) => `<span style="color:${famColor(m.family)}">●</span> ${esc(FAMILY[m.family].name)}` },
  { h: "长程静电", v: (m) => ["none", "optional", "builtin", "core"].indexOf(D.curated[m.id].lr), f: (m) => catCell(m, "lr") },
  { h: "色散", v: (m) => ["none", "addon", "optional", "builtin", "core"].indexOf(D.curated[m.id].disp), f: (m) => catCell(m, "disp") },
  { h: "总电荷 / 自旋", v: (m) => ["none", "optional", "builtin"].indexOf(D.curated[m.id].qs), f: (m) => catCell(m, "qs") },
  { h: "r<sub>c</sub> (Å)", num: true, v: (m) => D.curated[m.id].rc },
  { h: "层数", num: true, v: (m) => D.curated[m.id].T },
  { h: "感受野 (Å)", num: true, v: (m) => D.curated[m.id].rf },
  { h: "长程相关说明", v: (m) => m.arch.longRange, f: (m) => `<span class="small">${esc(m.arch.longRange)}</span>` },
], weakRows);

/* ---------------- C1: F1 vs kappa ---------------- */
const TG = {
  EFS_G: ["能量求导得力 / 应力（保守）", "#2563eb"],
  EFS_GM: ["保守 + 磁矩", "#16a34a"],
  EFSH_G: ["保守 + Hessian 训练", "#7c3aed"],
  EFS_D: ["直接预测力 / 应力", "#dc2626"],
};
const LABEL_KEYS = new Set(["chgnet-0.3.0", "m3gnet", "mace-mp-0", "mace-mpa-0", "orb-v3", "prophet-oame-mbd", "esen-30m-oam", "sevennet-0", "alignn-ff-mptrj", "mattersim-v1-5m"]);
const fk = B.mbd.filter((r) => r.discovery?.F1 != null && r.phonons?.["κ_SRME"] != null);
new Chart($("chart-fk"), {
  type: "scatter",
  data: {
    datasets: Object.entries(TG).map(([t, [lab, c]]) => ({
      label: lab, backgroundColor: c, pointRadius: t === "EFS_D" ? 6 : 4, pointStyle: t === "EFS_D" ? "triangle" : "circle",
      data: fk.filter((r) => r.targets === t).map((r) => ({ x: r.discovery.F1, y: r.phonons["κ_SRME"], label: t === "EFS_D" || t === "EFSH_G" || LABEL_KEYS.has(r.key) ? r.name.replace(/\s*\(.*\)$/, "") : "", name: r.name })),
    })),
  },
  options: {
    plugins: { tooltip: { callbacks: { label: (c) => `${c.raw.name}: F1 ${fmt(c.raw.x)}, κ_SRME ${fmt(c.raw.y)}` } } },
    scales: { x: { title: { display: true, text: "F1（稳定性发现，越高越好）" } }, y: { min: 0, max: 2, title: { display: true, text: "κ_SRME（热导率误差，越低越好）" } } },
  },
  plugins: [pointLabels],
});
const dk = fk.filter((r) => r.targets === "EFS_D").map((r) => r.phonons["κ_SRME"]);
const ck = fk.filter((r) => r.targets !== "EFS_D").map((r) => r.phonons["κ_SRME"]).sort((a, b) => a - b);
const med = (xs) => xs.length ? (xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2) : null;
const byKey0 = Object.fromEntries(B.mbd.map((r) => [r.key, r]));
const kOf = (key) => byKey0[key]?.phonons?.["κ_SRME"];
$("kappa-callout").innerHTML = `<b>数据：</b>${dk.length} 个直接力条目的 κ<sub>SRME</sub> 为 ${dk.map((x) => fmt(x)).join("、")}，全部接近最差值 2；
  ${ck.length} 个保守力条目的中位数是 ${fmt(med(ck))}，最好的已到 ${fmt(ck[0])}。直接力的 F1 并不差（eqv2-m 达 0.917），说明它们“静态能量”学得很好；
  它们的失败也不是因为计算崩溃（因虚频等被判失败的比例只有 0–6%），而是总热导率本身就算错了：力不是能量的梯度，二阶力常数不对称、不自洽。
  Orb 从 v2（直接力，κ ${fmt(kOf("orb-v2"))}）到 v3（保守力，κ ${fmt(kOf("orb-v3"))}）是最直接的对照；
  同样没有结构等变、但力保守的 PET-OAM-XL 也达到 ${fmt(kOf("pet-oam-xl-1.0.0"))}——<b>对热导而言，“力是否为能量梯度”比“对称性是否精确”更关键</b>（对比 C3）。`;

/* ---------------- C2: data vs architecture ---------------- */
const PAIRS = [
  ["MACE-SOYO", "mace-soyo-mptrj", "mace-soyo-oam"], ["NequIP-L", "nequip-mp-l-0.1", "nequip-oam-l-0.1"], ["Allegro-L", "allegro-mp-l-0.1", "allegro-oam-l-0.1"],
  ["GRACE-2L", "grace-2l-mptrj", "grace-2l-oam"], ["AlphaNet", "alphanet-v1-mptrj", "alphanet-v1-oam"], ["MatRIS-10M", "matris-10m-mp", "matris-10m-oam"],
  ["eSEN-30M", "esen-30m-mp", "esen-30m-oam"], ["EquiformerV3", "equiformer-v3-mp", "equiformer-v3-oam"],
];
const byKey = Object.fromEntries(B.mbd.map((r) => [r.key, r]));
const pairs = PAIRS.filter(([, a, b]) => byKey[a] && byKey[b]);
new Chart($("chart-data"), {
  type: "bar",
  data: {
    labels: pairs.map((p) => p[0]),
    datasets: [
      { label: "只用 MPtrj", data: pairs.map((p) => byKey[p[1]].discovery.F1), backgroundColor: "#94a3b8" },
      { label: "MPtrj + OMat24 + sAlex", data: pairs.map((p) => byKey[p[2]].discovery.F1), backgroundColor: "#2563eb" },
    ],
  },
  options: { plugins: { title: { display: true, text: "同一架构、不同训练数据的 F1" } }, scales: { y: { min: 0.6, max: 1, title: { display: true, text: "F1" } } } },
});
$("tbl-data").innerHTML = `<thead><tr><th>架构</th><th class="num">F1 MPtrj → OAM</th><th class="num">κ<sub>SRME</sub> MPtrj → OAM</th></tr></thead><tbody>${
  pairs.map(([n, a, b]) => {
    const A = byKey[a], Bb = byKey[b];
    return `<tr><td>${A.modelId ? `<a href="model.html?id=${A.modelId}">${esc(n)}</a>` : esc(n)}</td><td class="num">${fmt(A.discovery.F1)} → <b>${fmt(Bb.discovery.F1)}</b></td><td class="num">${fmt(A.phonons?.["κ_SRME"])} → <b>${fmt(Bb.phonons?.["κ_SRME"])}</b></td></tr>`;
  }).join("")}</tbody>`;

/* ---------------- C3: symmetry ---------------- */
const SYM = {
  nc: ["无结构等变（Orb、PET）", "#64748b"],
  direct: ["直接预测力", "#dc2626"],
  noinv: ["非严格旋转不变（AlphaNet）", "#f59e0b"],
  grid: ["S² 网格非线性（近似等变）", "#a855f7"],
  so3: ["仅 SO(3)，不含宇称", "#0ea5e9"],
  exact: ["精确等变 / 不变 + 保守力", "#16a34a"],
};
function symClass(r) {
  const id = r.modelId || "";
  if (["orb", "pet"].includes(id)) return "nc";
  if (r.targets === "EFS_D") return "direct";
  if (id === "alphanet") return "noinv";
  if (["esen", "equiformer-v3", "dpa4", "equiformer-v2", "escn"].includes(id)) return "grid";
  if (/^sevennet-(0|l3i5)$/.test(r.key) || id === "hienet") return "so3";
  return "exact";
}
const sym = B.mbd.filter((r) => r.modelId && r.geo?.symmetry_match != null).sort((a, b) => a.geo.symmetry_match - b.geo.symmetry_match);
$("box-sym").style.height = Math.max(420, sym.length * 15 + 80) + "px";
new Chart($("chart-sym"), {
  type: "bar",
  data: {
    labels: sym.map((r) => r.name),
    datasets: [{ data: sym.map((r) => r.geo.symmetry_match * 100), backgroundColor: sym.map((r) => SYM[symClass(r)][1]) }],
  },
  options: {
    indexAxis: "y",
    plugins: {
      legend: { display: false },
      title: { display: true, text: "弛豫后空间群与 DFT 一致的比例（%，symprec = 1e-5）" },
      tooltip: { callbacks: { label: (c) => `${fmt(c.raw)}%`, afterLabel: (c) => { const r = sym[c.dataIndex]; return `${SYM[symClass(r)][0]} · 对称性降低 ${fmt(r.geo.symmetry_decrease * 100)}% · RMSD ${fmt(r.geo.rmsd)} Å`; } } },
    },
    scales: { x: { min: 0, max: 100, title: { display: true, text: "%" } }, y: { ticks: { autoSkip: false, font: { size: 10 } } } },
  },
});
$("legend-sym").innerHTML = Object.values(SYM).map(([t, c]) => `<span><i style="background:${c}"></i>${t}</span>`).join("");

/* ---------------- C4: diatomics ---------------- */
const diat = B.mbd.filter((r) => r.diatomics).map((r) => ({ ...r, _cls: (r.diatomics.energy_jump || 0) > 10 ? "hl" : "" }));
sortableTable($("tbl-diat"), [
  { h: "模型", v: (r) => r.name, f: mlink },
  { h: "家族", v: (r) => FAMILY[famOf(r.modelId)]?.name || "", f: (r) => famOf(r.modelId) ? `<span style="color:${colorOf(r.modelId)}">●</span> ${esc(FAMILY[famOf(r.modelId)].name)}` : "—" },
  { h: "力", v: (r) => r.targets },
  { h: "力翻转次数↓<br><span class='small'>理想≈1</span>", num: true, v: (r) => r.diatomics.force_flips },
  { h: "曲折度↓<br><span class='small'>理想=1</span>", num: true, v: (r) => r.diatomics.tortuosity },
  { h: "能量跳变↓<br><span class='small'>eV</span>", num: true, v: (r) => r.diatomics.energy_jump },
  { h: "力跳变↓", num: true, v: (r) => r.diatomics.force_jump },
  { h: "势阱深度误差↓<br><span class='small'>eV，对 PBE</span>", num: true, v: (r) => r.diatomics.pbe_well_depth_error },
  { h: "键长误差↓<br><span class='small'>Å</span>", num: true, v: (r) => r.diatomics.pbe_bond_length_error },
], diat, 3);

/* ---------------- C5: MD quality + Arena stability ---------------- */
const mdRows = B.mbd.filter((r) => r.md);
sortableTable($("tbl-md"), [
  { h: "模型", v: (r) => r.name, f: mlink },
  { h: "力", v: (r) => r.targets },
  { h: "RDF 误差↓", num: true, v: (r) => r.md.rdf_error },
  { h: "ADF 误差↓", num: true, v: (r) => r.md.adf_error },
  { h: "VDOS 误差↓", num: true, v: (r) => r.md.vdos_error },
  { h: "压强 MAE↓<br><span class='small'>GPa</span>", num: true, v: (r) => r.md.pressure_mae },
  { h: "F1", num: true, v: (r) => r.discovery?.F1 },
], mdRows, 2);
const corr = (xs, ys) => {
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
};
const mdF = mdRows.filter((r) => r.discovery?.F1 != null);
$("md-corr").innerHTML = `${mdRows.length} 个条目；F1 与 RDF 误差的皮尔逊相关系数 r = ${fmt(corr(mdF.map((r) => r.discovery.F1), mdF.map((r) => r.md.rdf_error)))}，与 ADF 误差 r = ${fmt(corr(mdF.map((r) => r.discovery.F1), mdF.map((r) => r.md.adf_error)))}（负相关：F1 越高，结构误差越小）。`;
const stabNames = [...new Set(B.arenaStability.filter((r) => r.kind === "heating").map((r) => r.name))];
const getS = (n, k) => B.arenaStability.find((r) => r.name === n && r.kind === k);
stabNames.sort((a, b) => (getS(b, "heating").completed - getS(a, "heating").completed));
new Chart($("chart-stab"), {
  type: "bar",
  data: {
    labels: stabNames.map((n) => `${n}（${getS(n, "heating").runs}）`),
    datasets: [
      { label: "升温：完整跑完比例", data: stabNames.map((n) => getS(n, "heating").completed * 100), backgroundColor: "#2563eb" },
      { label: "升温：平均完成度", data: stabNames.map((n) => getS(n, "heating").meanFinal * 100), backgroundColor: "#93c5fd" },
      { label: "加压：平均完成度", data: stabNames.map((n) => (getS(n, "compression") ? getS(n, "compression").meanFinal * 100 : null)), backgroundColor: "#f59e0b" },
    ],
  },
  options: { plugins: { title: { display: true, text: "MLIP Arena 稳定性（括号内为升温测试体系数）" } }, scales: { y: { min: 0, max: 100, title: { display: true, text: "%" } }, x: { ticks: { font: { size: 10 } } } } },
});

/* ---------------- C6: combustion table ---------------- */
$("tbl-comb").innerHTML = `<thead><tr><th>模型</th><th class="num">步/秒</th><th class="num">完成度</th><th class="num">水产率</th></tr></thead><tbody>${
  comb.map((r) => `<tr class="${r.finalFrac < 0.98 ? "muted" : ""}"><td>${mlink(r)}${DIRECT_ARENA.has(r.name) ? ' <span class="badge direct">直接力</span>' : ""}</td><td class="num">${fmt(r.sps)}</td><td class="num">${fmt(r.finalFrac * 100)}%</td><td class="num">${r.finalFrac < 0.98 ? `<span title="未跑完，不可比">(${fmt(r.yield)})</span>` : `<b>${fmt(r.yield)}</b>`}</td></tr>`).join("")}</tbody>`;

/* ---------------- C7: property coverage ---------------- */
const pr = D.models.filter((m) => D.curated[m.id] && D.curated[m.id].props.length);
const PK = Object.keys(PROP_LABEL);
$("tbl-props").innerHTML = `<thead><tr><th>模型</th>${PK.map((k) => `<th>${PROP_LABEL[k]}</th>`).join("")}</tr></thead><tbody>${
  pr.map((m) => `<tr><td><a href="${modelLink(m)}">${esc(m.name)}</a></td>${PK.map((k) => `<td style="text-align:center">${D.curated[m.id].props.includes(k) ? '<span class="cell-builtin">✓</span>' : ""}</td>`).join("")}</tr>`).join("")}</tbody>`;

renderAllTex();
if (location.hash) setTimeout(() => document.querySelector(location.hash)?.scrollIntoView(), 300);
