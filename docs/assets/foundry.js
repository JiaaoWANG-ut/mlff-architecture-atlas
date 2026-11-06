"use strict";

(() => {
  const C = window.MLFF_FOUNDRY, F = window.MLFF_FOUNDRY_CORE;
  const $ = (id) => document.getElementById(id);
  if (!C || !F) {
    $("foundry-notice").hidden = false;
    $("foundry-notice").textContent = "模块目录或契约引擎加载失败，请刷新页面并检查本地资源是否完整。";
    $("foundry-notice").setAttribute("role", "alert");
    return;
  }
  mountChrome("foundry.html");
  const STORAGE_KEY = "mlff-foundry-draft-v1";
  let design = F.createDesign(C, "mace-polar");
  let activeStage = "interaction";
  let assessment;
  let editingId = null;
  let customSerial = 0;
  let initialMessage = "";
  let initialError = false;
  const selected = () => F.selectedModules(C, design);
  const stageName = (id) => C.stages.find((s) => s.id === id).name;
  const sourceLinks = (ids) => `<div class="foundry-source-links">${ids.map((id) => {
    const source = C.sources[id];
    return `<a href="${esc(source.url)}"${source.url.startsWith("https:") ? ' target="_blank" rel="noopener noreferrer"' : ""}>${esc(source.name)} →</a>`;
  }).join("")}</div>`;
  function notice(message, kind = "info") {
    const box = $("foundry-notice");
    box.textContent = message;
    box.className = `callout${kind === "error" ? " warn" : kind === "ok" ? " ok" : ""}`;
    box.setAttribute("role", kind === "error" ? "alert" : "status");
    box.hidden = false;
  }
  function storageError(error) {
    if (!(error instanceof DOMException)) throw error;
    $("storage-status").textContent = "本地保存不可用；当前选择仍在内存中，请导出蓝图备份。";
    $("storage-error").textContent = `浏览器存储失败（${error.name}）。没有上传或丢弃当前设计；其他操作提示不会清除此错误。`;
    $("storage-error").hidden = false;
  }
  function saveDraft() {
    let saved;
    try { saved = F.draft(C, design); }
    catch (error) {
      if (!(error instanceof F.BlueprintError)) throw error;
      $("storage-status").textContent = "输入尚未通过校验，未覆盖上一次保存的草稿。";
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      $("storage-error").hidden = true;
      $("storage-status").textContent = `草稿已保存在当前浏览器 · ${new Date().toLocaleTimeString("zh-CN")} · 不上传服务器${assessment.compatible ? "" : " · 尚有冲突，不能导出为相容蓝图"}`;
    } catch (error) { storageError(error); }
  }
  function renderSettings() {
    $("design-name").value = design.name;
    $("design-boundary").value = design.boundary;
    $("design-target").value = design.target;
    $("design-dispersion").value = design.labelDispersion;
    $("design-training").value = design.training;
    $("parameter-fields").innerHTML = Object.entries(C.parameters).map(([key, spec]) =>
      `<label>${esc(spec.label)}<input id="parameter-${key}" data-parameter="${key}" type="number" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${design.parameters[key]}" required></label>`).join("");
  }
  function renderPresets() {
    $("preset-list").innerHTML = C.presets.map((p) => `<button type="button" id="preset-${p.id}" class="foundry-preset" data-preset="${p.id}" aria-pressed="${p.id === design.presetId}">
      <strong>${esc(p.name)}</strong><span class="small muted">${esc(p.description)}</span>
      <span class="badge${p.id === "dpa41" ? " direct" : ""}">${esc(p.evidence)}</span></button>`).join("");
    const preset = C.presets.find((p) => p.id === design.presetId);
    $("template-context").innerHTML = `<h3>${assessment.modified ? "自定义组合" : "模板模块组合"} <span class="badge">参考 ${esc(preset.name)}</span></h3>
      <p class="small">${assessment.modified ? "你已经修改了模块、边界或参数。它不再代表原发布模型，也不继承其权重与基准结果。" : "当前选择对应参考骨架；示意参数、能量约定和训练方案仍不等同于完整发布模型。"}</p>
      <ul class="notes small">${preset.notes.map((note) => `<li>${esc(note)}</li>`).join("")}</ul>${sourceLinks(preset.sources)}`;
  }
  function renderStages() {
    const chosen = selected();
    $("stage-list").innerHTML = C.stages.map((stage, i) => {
      const invalid = assessment.errors.some((e) => e.stage === stage.id);
      return `<button type="button" id="stage-${stage.id}" data-stage="${stage.id}" class="foundry-stage${invalid ? " has-error" : ""}" aria-pressed="${stage.id === activeStage}">
        <span class="foundry-stage-number">${invalid ? "!" : String(i + 1).padStart(2, "0")}</span>
        <span><strong>${esc(stage.name)}</strong><small>${esc(chosen[stage.id].name)}${invalid ? " · 冲突" : ""}</small></span></button>`;
    }).join("");
  }
  function contractTags(tokens) {
    return tokens.length ? tokens.map((t) => `<span class="badge">${esc(C.tokens[t])}</span>`).join(" ") : '<span class="muted">无额外接口</span>';
  }
  function renderModules() {
    const stage = C.stages.find((s) => s.id === activeStage);
    $("module-heading").innerHTML = `<h3 id="module-stage-title">${esc(stage.name)}</h3><p class="small muted">${esc(stage.description)}</p>`;
    const query = $("module-search").value.trim().toLowerCase();
    const modules = [...C.modules, ...design.customModules].filter((m) => m.stage === activeStage && (!query || `${m.name} ${m.description}`.toLowerCase().includes(query)));
    const available = new Set(assessment.upstream?.[activeStage] || []);
    $("module-options").innerHTML = '<legend class="visually-hidden">选择本阶段的模块</legend>' + (modules.map((mod) => {
      const checked = design.selections[activeStage] === mod.id;
      const missing = mod.requires.filter((t) => !available.has(t));
      const hint = !assessment.upstream ? "参数无效，暂不评估接口" : mod.boundary !== "both" && mod.boundary !== design.boundary ? "需要不同的边界条件" : missing.length ? `需要上游：${missing.map((t) => C.tokens[t]).join("、")}` : "";
      return `<div class="foundry-module${checked ? " is-selected" : ""}">
        <label for="choose-${mod.id}"><input id="choose-${mod.id}" type="radio" name="architecture-module" value="${mod.id}"${checked ? " checked" : ""}>
          <span><strong>${esc(mod.name)}${mod.custom ? ' <span class="badge">用户定义</span>' : ""}</strong><span class="foundry-module-description">${esc(mod.description)}</span>${hint ? `<span class="foundry-module-hint">${esc(hint)}</span>` : ""}</span></label>
        ${checked ? `<div class="foundry-module-detail">
          <p><span class="foundry-contract-label">需要 → </span>${contractTags(mod.requires)}</p>
          <p><span class="foundry-contract-label">提供 → </span>${contractTags(F.effectiveOutputs(mod, design))}</p>
          <p><b>复杂度：</b>${esc(mod.complexity)}</p>
          <p class="muted">${mod.custom ? "用户自评" : "编辑基数"} · 开销 ${mod.cost === null ? "未知" : mod.cost}${mod.stage === "interaction" ? ` / 表达力 ${mod.expressiveness === null ? "未知" : mod.expressiveness}` : ""}；合成规则见页底。</p>
          ${sourceLinks(mod.sources)}${mod.custom && mod.source ? `<a href="${esc(mod.source)}" target="_blank" rel="noopener noreferrer">用户提供的来源 →</a>` : ""}
          ${mod.custom ? `<div class="foundry-module-actions"><button type="button" class="foundry-text-button" data-edit="${mod.id}">编辑模块</button><button type="button" class="foundry-text-button" data-delete="${mod.id}">删除模块</button></div>` : ""}
        </div>` : ""}</div>`;
    }).join("") || '<p class="muted">没有匹配模块。请清空搜索，或定义自己的模块。</p>');
  }
  function issueMarkup(issue) {
    return `<div class="foundry-issue ${issue.severity}">${esc(issue.message)}
      <button type="button" class="foundry-text-button" data-stage="${issue.stage}">查看 ${esc(stageName(issue.stage))} →</button></div>`;
  }
  function renderAssessment() {
    const { compatible, errors, warnings, scores, declared } = assessment;
    $("compatibility-summary").innerHTML = `<p class="foundry-status ${compatible ? declared ? "declared" : "ok" : "error"}">${compatible ? declared ? "声明相容 · 自定义实现待验证" : "规则内相容 · 非工程保证" : `${errors.length} 处冲突 · 暂不可导出`}</p>
      <p class="small muted">${compatible ? `已检查 ${C.stages.length} 个阶段；` : ""}${warnings.length} 条注意事项。${declared ? "包含用户声明，结论与分数均非独立验证。" : "相容蓝图仍需适配、训练与数值验证。"}</p>`;
    $("compatibility-issues").innerHTML = errors.map(issueMarkup).join("") +
      (warnings.length ? `<details><summary>展开 ${warnings.length} 条注意事项</summary>${warnings.map(issueMarkup).join("")}</details>` : "");
    $("foundry-scores").innerHTML = scores ? (declared ? '<p class="small foundry-error-text">含用户声明 / 自评；缺失的评分保持待定。</p>' : "") + scores.map((dim) =>
      `<div class="foundry-score" data-score="${dim.key}">
        <div class="foundry-score-head"><span id="score-label-${dim.key}">${esc(dim.label)}</span><b>${dim.value === null ? "待定" : `${dim.value} / 5`}</b></div>
        ${dim.value === null ? "" : `<meter min="1" max="5" low="2" high="4" optimum="${dim.key === "cost" ? 1 : 5}" value="${dim.value}" aria-labelledby="score-label-${dim.key}">${dim.value} / 5</meter>`}
        <details><summary>${esc(dim.direction)} · 依据</summary><p>${esc(dim.why)}</p></details></div>`).join("") :
      '<p class="small foundry-error-text">请先修复接口冲突或无效参数。不会给无法拼接的组合显示有效架构评分。</p>';
    $("export-blueprint").disabled = !compatible;
    $("export-blueprint").title = compatible ? "下载概念架构、契约、评分依据与来源；不是可执行配置" : "先修复冲突；草稿仍可保存在当前浏览器";
    const chosen = selected();
    $("receptive-field").textContent = assessment.receptiveField == null ? "参数或通信范围未确认，暂不给出感受野估计。" :
      `局域主干的名义感受野约 ${assessment.receptiveField} Å${chosen.interaction.id === "alpha-mps" ? "（含两次预聚合）" : ""}。${chosen.longrange.active ? "另有全局静电路径，不受这个局域半径约束。" : "没有显式长程静电；多跳传播不是无限程求解器。"} 此估计不等于有效物理作用范围。`;
    $("complexity-table").innerHTML = assessment.complexity ? `<table><thead><tr><th>阶段 / 模块</th><th>复杂度表达式</th></tr></thead><tbody>${assessment.complexity.map((item) =>
      `<tr><th scope="row">${esc(stageName(item.stage))}<br><span class="small muted">${esc(item.name)}</span></th><td>${esc(item.expression)}${item.declared ? "（用户声明）" : ""}</td></tr>`).join("")}</tbody></table>` : '<p class="foundry-error-text">请先修复无效参数。</p>';
  }
  function renderCustomLibrary() {
    $("custom-library").innerHTML = design.customModules.length ? `<div class="foundry-custom-library"><h3>我的模块库 <small>${design.customModules.length} / 50</small></h3><ul class="notes small">${design.customModules.map((m) =>
      `<li>${esc(m.name)} · ${esc(stageName(m.stage))}${design.selections[m.stage] === m.id ? " · 已选用" : ""}
      <button class="foundry-text-button" type="button" data-edit="${m.id}">编辑</button><button class="foundry-text-button" type="button" data-delete="${m.id}">删除</button></li>`).join("")}</ul></div>` : "";
  }
  function render(save = false, settings = false) {
    const focused = document.activeElement?.id;
    try {
      design = F.normalizeDesign(C, design);
      assessment = F.evaluate(C, design);
    } catch (error) {
      if (!(error instanceof F.BlueprintError)) throw error;
      assessment = { compatible: false, errors: [{ severity: "error", code: "invalid-input", stage: "input", message: error.message }], warnings: [], scores: null };
    }
    if (settings) renderSettings();
    const core = selected().interaction;
    $("parameter-layers").disabled = core.locality === "local";
    $("parameter-lmax").disabled = !core.usesAngular;
    $("parameter-correlation").disabled = !core.usesCorrelation;
    renderPresets();
    renderStages();
    renderModules();
    renderAssessment();
    renderCustomLibrary();
    if (focused && $(focused)) $(focused).focus({ preventScroll: true });
    if (save) saveDraft();
  }
  function chooseStage(id) {
    activeStage = id;
    $("module-search").value = "";
    render();
  }
  function choosePreset(id) {
    const customModules = design.customModules;
    design = F.createDesign(C, id);
    design.customModules = customModules;
    $("module-search").value = "";
    editingId = null;
    $("custom-builder").open = false;
    render(true, true);
    fillCustom(customReference(), false);
    notice("已载入参考骨架并替换选择；自定义模块库已保留。修改后的组合不会继承原模型的基准成绩。");
  }
  function checkboxes(id, tokens, checked) {
    $(id).innerHTML = tokens.map((t) => `<label><input type="checkbox" value="${t}"${checked.includes(t) ? " checked" : ""}>${esc(C.tokens[t])}</label>`).join("");
  }
  function customReference() {
    return C.modules.find((m) => m.id === design.selections[activeStage] && m.active) || C.modules.find((m) => m.stage === activeStage && m.active);
  }
  function fillCustom(mod, editing) {
    editingId = editing ? mod.id : null;
    $("custom-stage").value = mod.stage;
    $("custom-stage").disabled = editing;
    const candidates = C.modules.filter((m) => m.stage === mod.stage && m.active);
    $("custom-base").innerHTML = candidates.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("");
    $("custom-base").value = editing ? candidates[0].id : mod.id;
    $("custom-base").disabled = editing;
    $("custom-name").value = editing ? mod.name : "";
    $("custom-description").value = editing ? mod.description : "";
    $("custom-source").value = editing ? mod.source : "";
    checkboxes("custom-requires", Object.keys(C.tokens), mod.requires);
    checkboxes("custom-provides", C.stages.find((s) => s.id === mod.stage).outputs, mod.provides);
    for (const key of ["boundary", "derivatives", "smoothness", "symmetry", "locality"]) $("custom-" + key).value = String(mod[key]);
    $("custom-extensive").value = editing ? mod.extensive : mod.stage === "energy" ? "yes" : "unknown";
    $("custom-cost").value = editing && mod.cost !== null ? mod.cost : "";
    $("custom-expressiveness").value = editing && mod.expressiveness !== null ? mod.expressiveness : "";
    $("custom-complexity").value = editing ? mod.complexity : "未知，待评估";
    $("custom-ack").checked = false;
    $("custom-error").hidden = true;
    $("save-custom").textContent = editing ? "更新并选用模块" : "保存并选用模块";
  }
  function openCustom(id) {
    const existing = id ? design.customModules.find((m) => m.id === id) : null;
    const reference = existing || customReference();
    fillCustom(reference, Boolean(existing));
    $("custom-builder").open = true;
    $("custom-builder").scrollIntoView({ block: "start", behavior: "smooth" });
    $("custom-name").focus({ preventScroll: true });
  }
  function deleteCustom(id) {
    const mod = design.customModules.find((m) => m.id === id);
    if (!confirm(`删除自定义模块「${mod.name}」？如果正在使用，该阶段将恢复为当前参考模板的选择。`)) return;
    design.customModules = design.customModules.filter((m) => m.id !== id);
    let replacement = "";
    if (design.selections[mod.stage] === id) {
      design.selections[mod.stage] = C.presets.find((p) => p.id === design.presetId).selections[mod.stage];
      replacement = `该阶段已恢复为「${selected()[mod.stage].name}」，并重新检查兼容性。`;
    }
    if (editingId === id) {
      fillCustom(customReference(), false);
      $("custom-builder").open = false;
    }
    render(true);
    notice(`已删除「${mod.name}」。${replacement}`);
  }
  function customActions(event) {
    const edit = event.target.closest("[data-edit]");
    const remove = event.target.closest("[data-delete]");
    if (edit) openCustom(edit.dataset.edit);
    if (remove) deleteCustom(remove.dataset.delete);
  }

  const requested = new URLSearchParams(location.search).get("preset");
  if (requested) {
    try { design = F.createDesign(C, requested); }
    catch (error) {
      if (!(error instanceof F.BlueprintError)) throw error;
      initialMessage = `${error.message}。当前展示 MACE-POLAR 起点，未覆盖原有草稿。`;
      initialError = true;
    }
  } else {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          design = F.parse(C, saved);
          initialMessage = "已恢复当前浏览器中的草稿，并按当前规则重新检查；没有沿用文件中自报的评分。";
        } catch (error) {
          if (!(error instanceof F.BlueprintError)) throw error;
          initialMessage = `无法恢复草稿：${error.message} 当前展示参考模板，原存储尚未覆盖；修改设计后将保存新草稿。`;
          initialError = true;
        }
      }
    } catch (error) { storageError(error); }
  }
  $("foundry-stats").innerHTML = [
    [C.stages.length, "完整架构阶段"], [C.modules.length, "可选基础模块"], [C.presets.length, "参考架构"], ["JSON", "可携带设计蓝图"],
  ].map(([value, label]) => `<div class="stat"><b>${value}</b>${label}</div>`).join("");
  $("custom-stage").innerHTML = C.stages.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
  $("preset-matrix").innerHTML = `<table><thead><tr><th scope="col">阶段</th>${C.presets.map((p) =>
    `<th scope="col"><button type="button" class="foundry-text-button" data-preset="${p.id}">${esc(p.name)} →</button><br><small>${esc(p.evidence)}</small></th>`).join("")}</tr></thead>
    <tbody>${C.stages.map((s) => `<tr><th scope="row">${esc(s.name)}</th>${C.presets.map((p) => `<td>${esc(C.modules.find((m) => m.id === p.selections[s.id]).name)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  $("foundry-sources").innerHTML = sourceLinks([...new Set(C.presets.flatMap((p) => p.sources))]);
  $("catalog-date").textContent = C.reviewed;
  $("storage-status").textContent = "修改后自动保存到当前浏览器；可导出 JSON 备份。相容检查失败的草稿也会保留。";
  render(false, true);
  fillCustom(customReference(), false);
  if (initialMessage) notice(initialMessage, initialError ? "error" : "info");

  for (const id of ["preset-list", "preset-matrix"]) $(id).addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]");
    if (button) choosePreset(button.dataset.preset);
  });
  for (const id of ["stage-list", "compatibility-issues"]) $(id).addEventListener("click", (event) => {
    const button = event.target.closest("[data-stage]");
    if (button) chooseStage(button.dataset.stage);
  });
  $("module-search").addEventListener("input", renderModules);
  $("module-options").addEventListener("change", (event) => {
    if (event.target.name !== "architecture-module") return;
    design.selections[activeStage] = event.target.value;
    render(true);
  });
  $("module-options").addEventListener("click", customActions);
  $("custom-library").addEventListener("click", customActions);
  $("design-settings").addEventListener("submit", (event) => event.preventDefault());
  $("design-settings").addEventListener("input", (event) => {
    const field = event.target;
    if (field.dataset.parameter) design.parameters[field.dataset.parameter] = field.value === "" ? NaN : Number(field.value);
    else {
      const keys = { "design-name": "name", "design-boundary": "boundary", "design-target": "target", "design-dispersion": "labelDispersion", "design-training": "training" };
      if (!keys[field.id]) return;
      design[keys[field.id]] = field.value;
    }
    render(true);
  });
  $("open-custom").addEventListener("click", () => openCustom());
  $("custom-stage").addEventListener("change", () => fillCustom(C.modules.find((m) => m.stage === $("custom-stage").value && m.active), false));
  $("custom-base").addEventListener("change", () => fillCustom(C.modules.find((m) => m.id === $("custom-base").value), false));
  $("cancel-custom").addEventListener("click", () => {
    fillCustom(customReference(), false);
    $("custom-builder").open = false;
  });
  $("custom-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!$("custom-form").reportValidity()) return;
    const checked = (id) => [...$(id).querySelectorAll("input:checked")].map((el) => el.value);
    const numberOrNull = (id) => $(id).value === "" ? null : Number($(id).value);
    const mod = {
      id: editingId || `custom-${Date.now().toString(36)}-${++customSerial}`,
      stage: $("custom-stage").value, name: $("custom-name").value, description: $("custom-description").value,
      source: $("custom-source").value, requires: checked("custom-requires"), provides: checked("custom-provides"),
      boundary: $("custom-boundary").value, symmetry: $("custom-symmetry").value, locality: $("custom-locality").value,
      extensive: $("custom-extensive").value, cost: numberOrNull("custom-cost"), expressiveness: numberOrNull("custom-expressiveness"),
      complexity: $("custom-complexity").value,
    };
    for (const key of ["derivatives", "smoothness"]) mod[key] = $("custom-" + key).value === "unknown" ? "unknown" : Number($("custom-" + key).value);
    try {
      const validated = F.validateCustom(C, mod);
      if (!editingId && design.customModules.length >= 50) throw new F.BlueprintError("最多保留 50 个自定义模块。请先删除不再使用的模块。");
      design.customModules = editingId ? design.customModules.map((m) => m.id === editingId ? validated : m) : [...design.customModules, validated];
      design.selections[validated.stage] = validated.id;
      activeStage = validated.stage;
      editingId = null;
      $("module-search").value = "";
      $("custom-builder").open = false;
      render(true);
      fillCustom(customReference(), false);
      notice(`已保存并选用「${validated.name}」。兼容性基于用户声明，未知开销 / 表达力不会自动补分。`, "ok");
      $("workbench").scrollIntoView({ block: "start", behavior: "smooth" });
    } catch (error) {
      if (!(error instanceof F.BlueprintError)) throw error;
      $("custom-error").textContent = error.message;
      $("custom-error").hidden = false;
    }
  });
  $("reset-blueprint").addEventListener("click", () => {
    if (confirm("重置当前模板的模块选择、参数和训练计划？自定义模块库仍会保留。")) choosePreset(design.presetId);
  });
  $("export-blueprint").addEventListener("click", () => {
    let data;
    try { data = F.blueprint(C, design); }
    catch (error) {
      if (!(error instanceof F.BlueprintError)) throw error;
      notice(error.message, "error");
      return;
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${design.name.replace(/[^\p{L}\p{N}_.-]+/gu, "-").slice(0, 70) || "mlip-design"}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice("已生成 JSON 蓝图：包含模块契约、参数、训练计划、评分依据与来源。它不是可执行 MLIP 配置，实测准确度仍为未评测。", "ok");
  });
  $("import-blueprint").addEventListener("click", () => $("blueprint-file").click());
  $("blueprint-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > F.maxBlueprintBytes) throw new F.BlueprintError("蓝图文件超过 1 MiB，未修改当前设计。");
      const imported = F.parse(C, await file.text());
      design = imported;
      editingId = null;
      $("custom-builder").open = false;
      $("module-search").value = "";
      render(true, true);
      fillCustom(customReference(), false);
      notice(`已导入「${design.name}」并重新计算评估。${assessment.compatible ? "当前声明相容，但未验证实现或准确度。" : `有 ${assessment.errors.length} 处冲突；已作为草稿保留。`}`, assessment.compatible ? "ok" : "error");
    } catch (error) {
      if (!(error instanceof F.BlueprintError) && !(error instanceof DOMException)) throw error;
      notice(`导入失败：${error.message} 当前设计未被替换。`, "error");
    } finally { event.target.value = ""; }
  });
})();
