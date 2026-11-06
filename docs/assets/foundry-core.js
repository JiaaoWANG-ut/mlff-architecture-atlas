"use strict";

const FOUNDRY_CORE = (() => {
  class BlueprintError extends Error {}
  const maxBlueprintBytes = 1024 * 1024;
  const energyStages = ["geometry", "embedding", "interaction", "readout", "longrange", "dispersion", "repulsion", "energy"];
  const round = (n) => Math.round(n * 10) / 10;
  const rank = (n) => round(Math.max(1, Math.min(5, n)));
  const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  function requireValue(condition, message) {
    if (!condition) throw new BlueprintError(message);
  }
  function text(value, label, max, empty = false) {
    requireValue(typeof value === "string" && value.length <= max && (empty || value.trim().length > 0), `${label}须为${empty ? "不超过" : "非空且不超过"} ${max} 字符的文本。`);
    return value.trim();
  }
  function oneOf(value, choices, label) {
    requireValue(choices.includes(value), `${label}不是支持的取值。`);
    return value;
  }
  function createDesign(catalog, presetId) {
    const preset = catalog.presets.find((p) => p.id === presetId);
    requireValue(preset, `未找到模板：${presetId}`);
    return {
      name: `${preset.name} · 我的设计`, presetId, selections: { ...preset.selections },
      parameters: { ...preset.parameters }, boundary: preset.boundary, target: preset.target,
      labelDispersion: preset.labelDispersion, training: "", customModules: [],
    };
  }
  function validateCustom(catalog, raw) {
    requireValue(isRecord(raw), "自定义模块必须是对象。");
    const stage = catalog.stages.find((s) => s.id === raw.stage);
    requireValue(stage, "自定义模块的阶段不存在。");
    const id = text(raw.id, "自定义模块 ID", 64);
    requireValue(/^custom-[a-z0-9-]+$/.test(id), "自定义模块 ID 必须以 custom- 开头，且仅含小写字母、数字、连字符。");
    function contract(value, allowed, label) {
      requireValue(Array.isArray(value) && value.length <= Object.keys(catalog.tokens).length, `${label}须为接口列表。`);
      requireValue(value.every((v) => typeof v === "string" && allowed.includes(v)) && new Set(value).size === value.length, `${label}包含未知、重复或不属于此阶段的接口。`);
      return [...value];
    }
    const requires = contract(raw.requires, Object.keys(catalog.tokens), "输入契约");
    const provides = contract(raw.provides, stage.outputs, "输出契约");
    requireValue(stage.required.every((t) => provides.includes(t)), `${stage.name}必须提供：${stage.required.map((t) => catalog.tokens[t]).join("、")}`);
    requireValue(stage.id !== "geometry" || provides.length > 0, "几何模块至少须提供一种几何表示。");
    const requiredInputs = {
      graph: ["structure"], geometry: ["edges"], embedding: ["structure"], interaction: ["embedding"],
      readout: ["scalar"], longrange: ["structure"], dispersion: ["structure"], repulsion: ["structure"],
      energy: ["atomic-energy"], stress: ["energy", "cell"], output: ["energy", "forces"],
    };
    const physicalOutputs = { longrange: "lr-energy", dispersion: "dispersion-energy", repulsion: "repulsion-energy", stress: "stress" };
    requireValue((requiredInputs[stage.id] || []).every((t) => requires.includes(t)), `${stage.name}必须声明必要的上游输入：${(requiredInputs[stage.id] || []).map((t) => catalog.tokens[t]).join("、")}`);
    requireValue(!physicalOutputs[stage.id] || provides.includes(physicalOutputs[stage.id]), "自定义物理项必须提供该阶段的能量 / 应力；若不启用，请使用内置「不加 / 不请求」模块。");
    for (const [output, inputs] of Object.entries({
      "conservative-forces": ["energy"], hessian: ["conservative-forces"], dipole: ["charges"], charges: ["charge"],
      "charges-output": ["charges"], "density-output": ["final-density"],
    })) {
      requireValue(!provides.includes(output) || inputs.every((t) => requires.includes(t)), `声明 ${catalog.tokens[output]} 时，还必须依赖 ${inputs.map((t) => catalog.tokens[t]).join("、")}。`);
    }
    const source = text(raw.source, "来源", 500, true);
    if (source) {
      let url;
      try { url = new URL(source); }
      catch (error) {
        if (!(error instanceof TypeError)) throw error;
        throw new BlueprintError("自定义来源须为完整的 http(s) URL。");
      }
      requireValue(["https:", "http:"].includes(url.protocol) && !url.username && !url.password, "自定义来源只允许不含凭据的 http(s) URL。");
    }
    function optionalRank(value, label) {
      requireValue(value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5), `${label}须为 0–5 的数值，或 null（未知）。`);
      return value;
    }
    return {
      id, stage: stage.id, name: text(raw.name, "模块名称", 80),
      description: text(raw.description, "模块描述", 1600), source,
      requires, provides, custom: true, active: true, sources: [],
      boundary: oneOf(raw.boundary, ["both", "periodic", "molecule"], "边界支持"),
      derivatives: oneOf(raw.derivatives, [0, 1, 2, "unknown"], "可求导阶数"),
      smoothness: oneOf(raw.smoothness, [0, 1, 2, "unknown"], "截断光滑性"),
      symmetry: oneOf(raw.symmetry, ["exact", "approximate", "none", "unknown"], "对称性"),
      locality: oneOf(raw.locality, ["local", "message", "global", "unknown"], "通信范围"),
      extensive: oneOf(raw.extensive, ["yes", "no", "unknown"], "广延性声明"),
      cost: optionalRank(raw.cost, "开销自评"),
      expressiveness: optionalRank(raw.expressiveness, "表达力自评"),
      complexity: text(raw.complexity, "复杂度声明", 250),
    };
  }
  function normalizeDesign(catalog, raw) {
    requireValue(isRecord(raw), "蓝图缺少 design 对象。");
    requireValue(catalog.presets.some((p) => p.id === raw.presetId), "蓝图引用了未知模板。");
    requireValue(Array.isArray(raw.customModules) && raw.customModules.length <= 50, "自定义模块须为列表，最多 50 个。");
    const customModules = raw.customModules.map((m) => validateCustom(catalog, m));
    requireValue(new Set(customModules.map((m) => m.id)).size === customModules.length, "自定义模块 ID 重复。");
    const all = [...catalog.modules, ...customModules];
    requireValue(isRecord(raw.selections) && Object.keys(raw.selections).length === catalog.stages.length, "须为每个架构阶段选择且仅选择一个模块。");
    const selections = {};
    for (const stage of catalog.stages) {
      const id = raw.selections[stage.id];
      requireValue(typeof id === "string" && all.some((m) => m.id === id && m.stage === stage.id), `${stage.name}引用了未知模块，或模块属于其他阶段。`);
      selections[stage.id] = id;
    }
    requireValue(isRecord(raw.parameters), "蓝图缺少设计参数。");
    const parameters = {};
    for (const [key, spec] of Object.entries(catalog.parameters)) {
      const value = raw.parameters[key];
      requireValue(typeof value === "number" && Number.isFinite(value) && value >= spec.min && value <= spec.max && (spec.step !== 1 || Number.isInteger(value)), `${spec.label}须在 ${spec.min}–${spec.max} 之间${spec.step === 1 ? "且为整数" : ""}。`);
      requireValue(Math.abs((value - spec.min) / spec.step - Math.round((value - spec.min) / spec.step)) < 1e-7, `${spec.label}须使用 ${spec.step} 的步长。`);
      parameters[key] = value;
    }
    return {
      name: text(raw.name, "设计名称", 100), presetId: raw.presetId, selections, parameters, customModules,
      boundary: oneOf(raw.boundary, ["periodic", "molecule"], "体系边界"),
      target: oneOf(raw.target, ["conservative", "exploration"], "设计目标"),
      labelDispersion: oneOf(raw.labelDispersion, ["unknown", "included", "excluded"], "标签色散状态"),
      training: text(raw.training, "训练计划", 3000, true),
    };
  }
  function selectedModules(catalog, design) {
    const all = [...catalog.modules, ...design.customModules];
    return Object.fromEntries(catalog.stages.map((s) => [s.id, all.find((m) => m.id === design.selections[s.id])]));
  }
  function effectiveOutputs(module, design) {
    return module.provides.filter((t) =>
      !(t === "cell" && design.boundary === "molecule") &&
      !(t === "vector" && module.usesAngular && design.parameters.lmax === 0));
  }
  function isModified(catalog, design) {
    const preset = catalog.presets.find((p) => p.id === design.presetId);
    return Object.keys(preset.selections).some((k) => preset.selections[k] !== design.selections[k]) ||
      Object.keys(preset.parameters).some((k) => preset.parameters[k] !== design.parameters[k]) ||
      ["boundary", "target", "labelDispersion"].some((k) => preset[k] !== design[k]);
  }
  function evaluate(catalog, raw) {
    const design = normalizeDesign(catalog, raw);
    const selected = selectedModules(catalog, design);
    const issues = [];
    const available = new Set();
    const upstream = {};
    const add = (severity, code, stage, message) => issues.push({ severity, code, stage, message });
    for (const stage of catalog.stages) {
      const mod = selected[stage.id];
      upstream[stage.id] = [...available];
      const missing = mod.requires.filter((t) => !available.has(t));
      if (missing.length) add("error", "missing-interface", stage.id, `${mod.name}缺少上游接口：${missing.map((t) => catalog.tokens[t]).join("、")}。请调整前面的模块或此模块的契约。`);
      if (mod.boundary !== "both" && mod.boundary !== design.boundary) add("error", "boundary", stage.id, `${mod.name}只适用于${mod.boundary === "periodic" ? "周期体系" : "非周期分子"}；请更换边界条件或模块。`);
      if (!stage.required.every((t) => effectiveOutputs(mod, design).includes(t))) add("error", "stage-output", stage.id, `${stage.name}没有提供完整的阶段输出。`);
      for (const message of mod.warnings || []) add("warning", "source-caveat", stage.id, message);
      if (mod.custom) add("warning", "custom-contract", stage.id, `「${mod.name}」仅按用户声明检查；未验证实现、权重、张量维数、单位换算或导数。自评分不是文献结论。`);
      if (!missing.length && (mod.boundary === "both" || mod.boundary === design.boundary)) {
        for (const output of effectiveOutputs(mod, design)) available.add(output);
      }
    }
    const activeEnergy = energyStages.map((s) => selected[s]).filter((m) => m.active);
    const corrections = ["longrange", "dispersion", "repulsion"].filter((s) => selected[s].active);
    if (corrections.length && selected.energy.id === "local-sum") add("error", "missing-energy-terms", "energy", "已选择独立物理项，但局域求和不接收这些能量。请选择「Σ 原子能 + 所有已选物理项」，否则力会遗漏修正项。");
    if (selected.energy.custom && corrections.some((s) => !selected.energy.requires.includes(`${s === "longrange" ? "lr" : s}-energy`))) add("error", "custom-energy-terms", "energy", "自定义能量汇总必须显式声明接收所有已选物理项的能量接口。");
    const needsFirst = selected.stress.active || selected.forces.provides.includes("conservative-forces");
    const needsSecond = selected.output.provides.includes("hessian");
    for (const mod of activeEnergy) {
      if ((needsFirst || needsSecond) && (mod.derivatives === "unknown" || mod.derivatives < (needsSecond ? 2 : 1))) {
        add("error", "derivatives", mod.stage, `${mod.name}未声明可${needsSecond ? "二" : "一"}阶求导，不能连接当前的力 / 应力 / Hessian 路径。`);
      }
    }
    if (design.target === "conservative" && !selected.forces.provides.includes("conservative-forces")) add("error", "conservative-target", "forces", "目标要求能量一致的保守力；直接力头不能满足。请选择能量梯度，或将目标改为「非保守探索」。");
    if (!selected.forces.provides.includes("conservative-forces")) add("warning", "direct-force", "forces", "直接预测力与总能量 / 应力不保证一致，也不会自动加上已选静电、色散或排斥能的负梯度。");
    if (selected.dispersion.active && design.labelDispersion === "included") add("error", "double-dispersion", "dispersion", "训练标签已含色散，再叠加显式色散有重复计数风险。移除修正；若计划重训残差，先修改标签定义并记录训练计划。");
    if (selected.dispersion.active && design.labelDispersion === "unknown") add("warning", "unknown-dispersion", "dispersion", "标签是否含色散尚不清楚。使用显式色散前必须核对泛函、训练残差和阻尼参数。");
    if (selected.repulsion.active) add("warning", "repulsion-bridge", "repulsion", "ZBL 等短程项需要平滑桥接与匹配的训练残差；本页未实现桥接或避免能量双计数。");
    if (selected.longrange.id === "polar-field") add("warning", "polar-boundary", "longrange", design.boundary === "periodic" ? "周期 PolarMACE 需确定 Ewald、背景电荷、slab / 3D 等边界约定；不应读取普通总偶极。" : "非周期 PolarMACE 使用适当的实空间边界；带电体系偶极依赖原点，部分电荷也不是唯一可观测量。");
    if (activeEnergy.some((m) => m.smoothness !== 2) || selected.graph.smoothness !== 2) add("warning", "smoothness", "geometry", "能量路径未全部保证截断处 C² 光滑。可求导不等于全局光滑；MD 能量漂移、二阶响应及邻居交换仍须数值测试。");
    if (design.presetId === "dpa41") add("warning", "unverified-version", "interaction", "DPA-4.1 的独立版本尚未核对；当前仅以有来源的 DPA-4 / SeZM 作为参考骨架。");
    if (design.parameters.lmax === 0 && selected.interaction.usesAngular) add("warning", "scalar-limit", "interaction", "l_max=0 不提供方向向量通道；这里只是标量极限设计，并非原等变模板的完整配置。");
    if (selected.output.provides.includes("dipole") && design.boundary !== "molecule") add("error", "periodic-dipole", "output", "普通总偶极接口仅适用于非周期体系；周期极化需要另外的定义与算法，不能用边界声明绕过。");
    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");
    return {
      compatible: errors.length === 0, errors, warnings, upstream,
      modified: isModified(catalog, design), declared: Object.values(selected).some((m) => m.custom),
      receptiveField: selected.interaction.locality === "unknown" ? null : round(design.parameters.cutoff * (selected.interaction.locality === "local" ? 1 : design.parameters.layers + (selected.interaction.id === "alpha-mps" ? 2 : 0))),
      scores: errors.length ? null : score(catalog, design, selected),
      complexity: catalog.stages.filter((s) => selected[s.id].active).map((s) => ({ stage: s.id, name: selected[s.id].name, expression: selected[s.id].complexity, declared: Boolean(selected[s.id].custom) })),
    };
  }
  function score(catalog, design, selected) {
    const p = design.parameters, core = selected.interaction;
    const modules = Object.values(selected).filter((m) => m.active);
    const path = energyStages.map((s) => selected[s]).filter((m) => m.active);
    const depth = core.locality === "local" ? 1 : p.layers;
    const angular = core.usesAngular ? 0.1 * (p.lmax - 2) : 0;
    const correlation = core.usesCorrelation ? 0.15 * (p.correlation - 3) : 0;
    const sizing = 0.25 * Math.log2(p.atoms / 1000) + 0.25 * Math.log2(p.neighbors / 32) + 0.5 * Math.log2(p.channels / 64) + 0.5 * Math.log2(depth / 2) + angular + correlation;
    const knownCost = modules.every((m) => m.cost !== null);
    const cost = knownCost ? rank(modules.reduce((total, m) => total + m.cost, 0) + sizing) : null;
    const expressiveness = core.expressiveness === null ? null : rank(core.expressiveness + 0.15 * Math.log2(depth / 2) + 0.15 * Math.log2(p.channels / 64) + angular + correlation);
    const conservative = selected.forces.provides.includes("conservative-forces");
    const unknownPhysics = path.some((m) => m.symmetry === "unknown" || m.smoothness === "unknown") || (selected.energy.custom && selected.energy.extensive === "unknown");
    const invariant = path.every((m) => m.symmetry === "exact") ? 1 : path.some((m) => m.symmetry === "none") ? 0 : 0.5;
    const smooth = [...path, selected.graph].every((m) => m.smoothness === 2) ? 1 : [...path, selected.graph].every((m) => m.smoothness >= 1) ? 0.5 : 0;
    const extensive = selected.energy.extensive === "no" ? 0 : core.extensivityUncertain ? 0.5 : 1;
    const physics = unknownPhysics ? null : rank(1 + Number(conservative) + invariant + smooth + extensive);
    const longrange = rank(1 + (selected.longrange.active ? 2 : 0) + (selected.longrange.id === "polar-field" ? 1 : 0) + Number(selected.dispersion.active));
    const scalable = modules.some((m) => m.locality === "unknown") ? null : rank(5 - (core.locality === "message" ? Math.min(2, 0.25 * p.layers) : 0) - (modules.some((m) => m.locality === "global") ? 1.5 : 0) - (selected.graph.id === "pair-graph" ? 1 : 0));
    const extra = selected.output.provides.filter((t) => t !== "result").length;
    const coverage = rank(1 + (selected.stress.active ? 0.5 : 0) + 0.75 * extra);
    return [
      { key: "cost", label: "计算开销", value: cost, direction: "低分更省", why: knownCost ? `模块开销基数之和 ${round(modules.reduce((n, m) => n + m.cost, 0))}，规模 / 宽度 / 阶数修正 ${round(sizing)}。不是实测时延。` : "自定义模块未声明开销自评，因此不给出组合开销分。" },
      { key: "expressiveness", label: "表达力 / 精度潜力", value: expressiveness, direction: "高分容量更强", why: core.expressiveness === null ? "自定义主干没有表达力自评；真实准确度仍未知。" : `主干编辑基数 ${core.expressiveness}，按层数、通道和适用的方向 / 收缩阶作小幅修正；不是 MAE 或成功率预测。` },
      { key: "physics", label: "物理约束", value: physics, direction: "高分约束更多", why: unknownPhysics ? "存在未知的对称性、光滑性或广延性声明，暂不补分。" : `基线 1 + 保守力 ${Number(conservative)} + 对称性 ${invariant} + C² 光滑 ${smooth} + 广延求和 ${extensive}；仅基于结构声明。` },
      { key: "longrange", label: "显式长程 / 色散", value: longrange, direction: "高分物理项更多", why: "基线 1 + 显式静电 2 + PolarMACE 场更新 1 + 显式色散 1，上限 5。标签隐含色散与多跳传播不加分。" },
      { key: "scalability", label: "空间并行友好度", value: scalable, direction: "高分通信更少", why: "从 5 起，消息层扣 min(2, T/4)，有全局运算扣 1.5，全对枚举再扣 1；不代表已有 MPI / GPU 接口。" },
      { key: "coverage", label: "输出覆盖", value: coverage, direction: "高分输出更多", why: "E/F 基线 1，应力加 0.5，每种额外输出契约加 0.75，上限 5；覆盖不代表预测质量。" },
    ];
  }
  function blueprint(catalog, raw) {
    const design = normalizeDesign(catalog, raw);
    const assessment = evaluate(catalog, design);
    requireValue(assessment.compatible, "存在接口冲突，不能导出为相容蓝图。可以先保留草稿。");
    return {
      format: "mlff-architecture-foundry", schemaVersion: 1, catalogVersion: catalog.version,
      scope: "Conceptual architecture only; not executable, not trained, not an engineering compatibility guarantee.",
      accuracy: { status: "not-evaluated", mae: null },
      design, assessment,
      modules: Object.values(selectedModules(catalog, design)),
      sources: catalog.sources,
      conventions: { energy: "eV", length: "angstrom", force: "eV/angstrom", stress: "eV/angstrom^3", charge: "electron" },
    };
  }
  function draft(catalog, design) {
    return { format: "mlff-architecture-foundry", schemaVersion: 1, catalogVersion: catalog.version, draft: true, design: normalizeDesign(catalog, design) };
  }
  function parse(catalog, input) {
    requireValue(typeof input === "string" && input.length <= maxBlueprintBytes && new TextEncoder().encode(input).byteLength <= maxBlueprintBytes, "蓝图文件须为 UTF-8 文本，且不超过 1 MiB。");
    let raw;
    try { raw = JSON.parse(input); }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new BlueprintError("JSON 格式错误；没有修改当前设计。");
    }
    requireValue(isRecord(raw) && raw.format === "mlff-architecture-foundry", "不是 Architecture Foundry 蓝图。");
    requireValue(raw.schemaVersion === 1 && raw.catalogVersion === catalog.version, "蓝图格式 / 模块目录版本不受支持，请使用匹配版本导出。");
    return normalizeDesign(catalog, raw.design);
  }
  return { BlueprintError, maxBlueprintBytes, createDesign, validateCustom, normalizeDesign, selectedModules, effectiveOutputs, evaluate, blueprint, draft, parse, isModified };
})();

if (typeof module !== "undefined" && module.exports) module.exports = FOUNDRY_CORE;
else window.MLFF_FOUNDRY_CORE = FOUNDRY_CORE;
