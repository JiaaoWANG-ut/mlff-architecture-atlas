/* Model detail page: model.html?id=<id> */
"use strict";
(async function () {
  const D = window.MLFF;
  const root = document.getElementById("root");
  const id = param("id");
  const meta = id && modelById(id);
  mountChrome("models.html");
  if (!meta) {
    root.innerHTML = `<h1>未找到模型</h1><p>请从 <a href="models.html">模型库</a> 选择一个模型。</p>`;
    return;
  }
  try {
    await loadScript(`data/models/${encodeURIComponent(meta.id)}.js`);
  } catch (e) {
    root.innerHTML = `<h1>${esc(meta.name)}</h1><p class="muted">数据加载失败：${esc(e.message)}</p>`;
    return;
  }
  const m = window.MLFF_MODEL;
  document.title = `${m.name} · 逐步拆解 · MLFF 架构图解`;
  const cur = D.curated[m.id];
  const stagesHave = new Set(m.steps.map((s) => s.stage));
  const firstStepOf = {};
  m.steps.forEach((s, i) => { if (!(s.stage in firstStepOf)) firstStepOf[s.stage] = i; });

  const repoLinks = Object.entries(m.sources || {}).map(([r, s]) =>
    `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(r)}</a> <span class="muted small">@${esc(String(s.commit).slice(0, 8))} · ${esc(s.date)}</span>`).join("<br>");
  const paper = m.paper && m.paper.title
    ? (m.paper.url ? `<a href="${esc(m.paper.url)}" target="_blank" rel="noopener">${esc(m.paper.title)}</a>` : esc(m.paper.title)) + (m.paper.venue ? ` <span class="muted">（${esc(m.paper.venue)}）</span>` : "")
    : '<span class="muted">—</span>';

  const sections = [
    ["steps", "逐步拆解"], ["arch", "架构参数表"], ["scores", "能力评分"], ["hyper", "关键超参数"],
    ["notes", "速度 / 弱相互作用 / 下游"], ["sw", "优势与局限"], ["pretrained", "预训练模型"], ["bench", "基准数据"], ["related", "同家族模型"],
  ];
  if (!m.scores) sections.splice(2, 1);

  let html = `
  <div class="model-head">
    <div class="tags">${famBadge(m.family)}${m.arch.forces !== "n/a" ? forcesBadge(m.arch.forces) : ""}${m.arch.strictlyLocal ? '<span class="badge local">严格局域</span>' : ""}${(m.tags || []).map((t) => `<span class="badge">${esc(t)}</span>`).join("")}</div>
    <h1>${esc(m.name)} <span class="muted" style="font-size:1rem;font-weight:400">${esc(m.year)}</span></h1>
    <div class="full">${esc(m.fullName)}</div>
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><p style="font-size:1.05rem;margin-top:0">${esc(m.oneLiner)}</p><div class="analogy">${esc(m.analogy)}</div></div>
    <div class="card"><dl class="kv">
      <dt>作者</dt><dd>${esc(m.authors || "—")}</dd>
      <dt>论文</dt><dd>${paper}</dd>
      <dt>源码</dt><dd>${repoLinks}</dd>
      <dt>框架</dt><dd>${esc(m.framework)}</dd>
      <dt>许可证</dt><dd>${esc(m.license)}</dd>
      ${cur ? `<dt>截断 / 层数</dt><dd>${cur.rc != null ? `r<sub>c</sub> = ${cur.rc} Å` : "无截断 / 全局"}，${cur.T === 0 ? "无消息传递（严格局域）" : cur.T != null ? `${cur.T} 层消息传递` : "层数见检查点"}，名义感受野 ${cur.rf != null ? cur.rf + " Å" : "全局 / 未知"} <span class="muted small">（${esc(cur.cfg)}）</span></dd>` : ""}
    </dl></div>
  </div>
  <div class="pipeline">${D.stages.map((s, i) => {
    const on = stagesHave.has(s);
    return `${on ? `<a class="node on" href="#step-${firstStepOf[s]}">` : '<span class="node off">'}${i + 1}. ${STAGE[s].short}${on ? "</a>" : "</span>"}${i < D.stages.length - 1 ? '<span class="arrow">→</span>' : ""}`;
  }).join("")}</div>
  <div class="layout"><aside class="toc">${sections.map(([a, t]) => `<a href="#${a}">${t}</a>`).join("")}
    <hr style="margin:10px 0"><a href="stages.html">↔ 逐步横向对比</a><a href="compare.html?ids=${encodeURIComponent(m.id)}">⇄ 与其他模型对比</a></aside><div>`;

  // ---- steps
  html += `<h2 id="steps">逐步拆解：从构型到${m.arch.forces === "n/a" ? "输出" : "能量与力"}</h2>
    <div class="flex"><span class="muted small">共 ${m.steps.length} 步 · 每段源码都链接到固定 commit 的原文件与行号</span><span class="spacer"></span><button class="btn ghost" id="toggle-code" style="padding:4px 12px">展开全部源码</button></div>`;
  m.steps.forEach((s, i) => {
    html += `<div class="card step" id="step-${i}"><span class="stage-tag">${i + 1} · ${esc(STAGE[s.stage]?.name || s.stage)}</span>
      <h3>${esc(s.title)}</h3><p>${esc(s.plain)}</p>${s.math ? `<div class="math" data-tex="${esc(s.math)}"></div>` : ""}
      ${(s.code || []).map((c) => codeBox(c)).join("")}</div>`;
  });

  // ---- arch table
  html += `<h2 id="arch">架构参数表</h2><div class="table-wrap free"><table><tbody>${Object.keys(ARCH_LABEL).map((k) => {
    let v = m.arch[k];
    if (k === "forces") v = FORCES_LABEL[v] || v;
    if (k === "strictlyLocal") v = v ? "是：原子能只依赖 r_c 球内原子" : "否：多层传递使感受野大于 r_c";
    return `<tr><th style="width:150px;position:static">${ARCH_LABEL[k]}</th><td>${esc(v)}</td></tr>`;
  }).join("")}</tbody></table></div>`;
  if (cur) {
    html += `<div class="callout small"><b>归类</b>长程静电：<b>${CAT_LABEL.lr[cur.lr]}</b> · 色散：<b>${CAT_LABEL.disp[cur.disp]}</b> · 总电荷/自旋：<b>${CAT_LABEL.qs[cur.qs]}</b>
      ${cur.props.length ? " · 额外输出：" + cur.props.map((p) => PROP_LABEL[p]).join("、") : ""}</div>`;
  }

  // ---- scores
  if (m.scores) {
    html += `<h2 id="scores">能力评分 <span class="muted small">（1–5，编辑判断，依据见右侧说明）</span></h2>
      <div class="grid g2"><div class="card"><div class="chart-box short"><canvas id="radar"></canvas></div></div>
      <div class="card">${SCORE_KEYS.map((k) => `<div class="score-row"><b>${SCORE_LABEL[k]}</b>${dots(m.scores[k].v)}<span class="small">${esc(m.scores[k].why)}</span></div>`).join("")}</div></div>`;
  }

  // ---- hyper
  html += `<h2 id="hyper">关键超参数</h2><div class="table-wrap free"><table><thead><tr><th>参数</th><th>取值</th><th>含义</th><th>源码</th></tr></thead><tbody>${
    (m.hyper || []).map((h) => `<tr><td><code>${esc(h.name)}</code></td><td>${esc(h.value)}</td><td>${esc(h.note || "")}</td><td>${h.code ? `<a href="${esc(h.code.url)}" target="_blank" rel="noopener">${esc(h.code.file.split("/").pop())}#L${h.code.start}</a>` : ""}</td></tr>`).join("")}</tbody></table></div>`;

  // ---- notes
  const ul = (xs) => `<ul class="notes">${(xs || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  html += `<h2 id="notes">速度 / 弱相互作用 / 下游性质</h2><div class="grid g3">
    <div class="card"><h3>⚡ 速度与计算开销</h3>${ul(m.speedNotes)}</div>
    <div class="card"><h3>🧲 长程与弱相互作用</h3>${ul(m.weakNotes)}</div>
    <div class="card"><h3>🔬 下游性质</h3>${ul(m.downstreamNotes)}</div></div>`;
  html += `<h2 id="sw">优势与局限</h2><div class="grid g2"><div class="card"><h3 style="color:var(--ok)">优势</h3>${ul(m.strengths)}</div><div class="card"><h3 style="color:var(--bad)">局限</h3>${ul(m.weaknesses)}</div></div>`;
  html += `<h2 id="pretrained">预训练模型 / 发布版本</h2><div class="card">${(m.pretrained || []).length ? ul(m.pretrained) : '<p class="muted">无公开预训练模型（或为方法/模块）。</p>'}</div>`;

  // ---- benchmarks
  html += `<h2 id="bench">基准数据</h2>` + benchHtml(m);

  // ---- related
  const rel = D.models.filter((x) => x.family === m.family && x.id !== m.id);
  html += `<h2 id="related">同家族模型（${esc(FAMILY[m.family].name)}）</h2><div class="tags">${rel.map((x) => `<a class="badge" href="${modelLink(x)}">${esc(x.name)} · ${esc(x.year)}</a>`).join("")}</div>`;
  html += `</div></div>`;
  root.innerHTML = html;

  renderAllTex(root);
  root.querySelectorAll("pre code").forEach((el) => { if (window.hljs) hljs.highlightElement(el); });
  const tg = document.getElementById("toggle-code");
  tg.addEventListener("click", () => {
    const ds = root.querySelectorAll("details.code");
    const open = tg.dataset.open !== "1";
    ds.forEach((d) => (d.open = open));
    tg.dataset.open = open ? "1" : "0";
    tg.textContent = open ? "收起全部源码" : "展开全部源码";
  });
  if (m.scores && window.Chart) {
    new Chart(document.getElementById("radar"), {
      type: "radar",
      data: {
        labels: SCORE_KEYS.map((k) => SCORE_LABEL[k]),
        datasets: [{ label: m.name, data: SCORE_KEYS.map((k) => m.scores[k].v), backgroundColor: famColor(m.family) + "33", borderColor: famColor(m.family), pointBackgroundColor: famColor(m.family) }],
      },
      options: { maintainAspectRatio: false, scales: { r: { min: 0, max: 5, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } },
    });
  }
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();

  function codeBox(c) {
    return `<details class="code"><summary>源码：${esc(c.repo)}/${esc(c.file)} · L${c.start}–${c.end}${c.caption ? " — " + esc(c.caption) : ""}</summary>
      <div class="codebox"><div class="bar"><span>${esc(c.repo)}/${esc(c.file)}</span><a href="${esc(c.url)}" target="_blank" rel="noopener">在 GitHub 查看（L${c.start}–${c.end}）↗</a></div>
      ${c.caption ? `<div class="cap">${esc(c.caption)}</div>` : ""}<pre><code class="language-${esc(c.lang)}">${esc(c.excerpt)}</code></pre></div></details>`;
  }

  function benchHtml(m) {
    const b = benchForModel(m.id);
    if (!b || (!b.mbd.length && !b.stab.length && !b.comb.length && !b.eos.length)) {
      return `<div class="card muted">该架构没有出现在 Matbench Discovery 或 MLIP Arena 的公开结果中（多为分子/专用势或方法模块）。</div>`;
    }
    let h = "";
    if (b.mbd.length) {
      h += `<h3>Matbench Discovery（材料稳定性发现 + 下游任务）</h3>
      <div class="table-wrap free"><table><thead><tr><th>模型</th><th>力</th><th class="num">参数量</th><th class="num">r<sub>c</sub></th><th class="num">F1↑</th><th class="num">DAF↑</th><th class="num">MAE↓<br><span class="small">eV/atom</span></th><th class="num">κ<sub>SRME</sub>↓</th><th class="num">RMSD↓</th><th>训练集</th><th class="num">MD 用时<br><span class="small">（硬件）</span></th></tr></thead><tbody>${
        b.mbd.map((r) => {
          const c = mdCost(r);
          return `<tr><td><a href="${esc(r.file)}" target="_blank" rel="noopener">${esc(r.name)}</a></td><td>${esc(r.targets || "")}</td><td class="num">${fmt(r.params)}</td><td class="num">${fmt(r.radius)}</td>
          <td class="num">${fmt(r.discovery?.F1)}</td><td class="num">${fmt(r.discovery?.DAF)}</td><td class="num">${fmt(r.discovery?.MAE)}</td><td class="num">${fmt(r.phonons?.["κ_SRME"])}</td><td class="num">${fmt(r.geo?.rmsd)}</td>
          <td class="small">${esc((r.trainingSets || []).join(", "))}</td><td class="num small">${c ? `${fmt(c.sec / 3600)} h<br>${esc(c.hardware || "")}` : "—"}</td></tr>`;
        }).join("")}</tbody></table></div>
      <p class="small muted">F1/DAF/MAE：unique-prototypes 测试集上的稳定性分类与形成能误差；κ<sub>SRME</sub>：103 个晶体晶格热导率的对称相对平均误差（0 最好，2 最差）；RMSD：结构弛豫后与 DFT 结构的偏差（symprec=1e-5）；力：EFS_G = 能量求导得到力和应力（保守），EFS_D = 直接预测。</p>`;
    }
    if (b.stab.length) {
      h += `<h3>MLIP Arena · MD 稳定性与速度</h3><div class="table-wrap free"><table><thead><tr><th>模型</th><th>测试</th><th class="num">体系数</th><th class="num">完整跑完比例</th><th class="num">平均完成度</th><th class="num">中位速度<br><span class="small">步/秒</span></th><th class="num">幂律拟合 n<br><span class="small">步/秒 ∝ N<sup>−n</sup></span></th></tr></thead><tbody>${
        b.stab.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.kind === "heating" ? "升温 NVT" : "加压 NPT"}</td><td class="num">${r.runs}</td><td class="num">${fmt(r.completed * 100, 3)}%</td><td class="num">${fmt(r.meanFinal * 100, 3)}%</td><td class="num">${fmt(r.medianSps)}</td><td class="num">${r.fit ? fmt(r.fit.n) : "—"}</td></tr>`).join("")}</tbody></table></div>`;
    }
    if (b.comb.length) {
      h += `<h3>MLIP Arena · 氢气燃烧反应 MD（H<sub>256</sub>O<sub>128</sub>，384 原子）</h3><div class="table-wrap free"><table><thead><tr><th>模型</th><th class="num">速度（步/秒）</th><th class="num">完成度</th><th class="num">水产率</th></tr></thead><tbody>${
        b.comb.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${fmt(r.sps)}</td><td class="num">${fmt(r.finalFrac * 100, 3)}%</td><td class="num">${fmt(r.yield)}</td></tr>`).join("")}</tbody></table></div>`;
    }
    if (b.eos.length) {
      h += `<h3>MLIP Arena · 体相状态方程（EOS）光滑性</h3><div class="table-wrap free"><table><thead><tr><th>模型</th><th class="num">排名</th><th class="num">能量差翻转次数↓</th><th class="num">曲折度↓</th><th class="num">压缩段 Spearman</th><th class="num">缺失</th></tr></thead><tbody>${
        b.eos.map((r) => `<tr><td>${esc(r.model)}</td><td class="num">${r.rank}</td><td class="num">${fmt(r["energy-diff-flip-times"])}</td><td class="num">${fmt(r.tortuosity)}</td><td class="num">${fmt(r["spearman-compression-energy"])}</td><td class="num">${r.missing}</td></tr>`).join("")}</tbody></table></div>`;
    }
    return h + `<p class="small"><a href="bench.html">查看全部基准数据 →</a></p>`;
  }
})();
