"use strict";

const FOUNDRY_CATALOG = (() => {
  const stages = [
    ["input", "输入与状态", "定义结构、边界条件，以及电荷、自旋、外场等全局输入。", ["structure"], ["structure", "cell", "charge", "spin", "task", "field"]],
    ["graph", "邻居图", "明确邻居搜索、周期镜像与邻居截断策略。", ["edges"], ["edges"]],
    ["geometry", "几何编码", "把距离与方向变成主干能够读取的表示。", [], ["radial", "spherical", "wigner", "frame", "descriptor"]],
    ["embedding", "化学嵌入", "将元素与全局状态编码为初始节点特征。", ["embedding"], ["embedding", "context"]],
    ["interaction", "相互作用主干", "选择消息传递、多体收缩或严格局域描述符。", ["scalar"], ["scalar", "tensor", "vector", "mps"]],
    ["readout", "原子量读出", "输出原子能，或为长程模块准备电荷与多极矩。", ["atomic-energy"], ["atomic-energy", "charges", "latent-charges", "spin-density"]],
    ["longrange", "长程静电", "显式处理截断之外的库仑作用；多跳感受野不等于长程静电。", [], ["lr-energy", "charges", "final-density"]],
    ["dispersion", "色散修正", "单独选择显式色散，并核对训练标签，避免重复计算。", [], ["dispersion-energy"]],
    ["repulsion", "短程排斥", "可选近距离排斥项；工程实现仍需设计与学习能量的衔接。", [], ["repulsion-energy"]],
    ["energy", "总能量汇总", "先收集所有能量项，再统一求力与应力。", ["energy"], ["energy"]],
    ["forces", "力", "能量负梯度保证保守性；直接力头则没有这一保证。", ["forces"], ["forces", "conservative-forces"]],
    ["stress", "应力 / 维里", "周期体系可对晶胞应变求导；分子蓝图可以不请求应力。", [], ["stress"]],
    ["output", "性质与输出", "选择实际有上游接口支持的物理量。", ["result"], ["result", "hessian", "charges-output", "dipole", "density-output"]],
  ].map(([id, name, description, required, outputs]) => ({ id, name, description, required, outputs }));

  const tokens = {
    structure: "结构 R[N,3] / Z[N]（Å）", cell: "周期晶胞 [3,3]（Å）",
    charge: "总电荷 Q（e）", spin: "总自旋 / 多重度", task: "任务 / DFT 标签", field: "外电场 [3]",
    edges: "边索引与相对位移 [E,3]", radial: "径向特征 [E,R]",
    spherical: "球谐方向基", wigner: "边坐标系 Wigner-D", frame: "局部标架 [E,3,3]", descriptor: "不变环境描述符",
    embedding: "初始标量嵌入 [N,C]", context: "体系条件嵌入",
    scalar: "不变标量特征 [N,C]", tensor: "球谐 irreps 特征", vector: "等变向量通道 [N,C,3]", mps: "复数 MPS 特征",
    "atomic-energy": "原子能 [N]（eV）", charges: "守恒原子电荷 [N]（e）",
    "latent-charges": "隐式静电通道（非物理电荷）", "spin-density": "初始自旋分辨多极矩",
    "lr-energy": "长程 / 非局域能量（eV）", "final-density": "更新后的自旋分辨密度",
    "dispersion-energy": "显式色散能（eV）", "repulsion-energy": "短程排斥能（eV）",
    energy: "总能量 E（eV）", forces: "原子力 [N,3]（eV/Å）", "conservative-forces": "F = −∂E/∂R",
    stress: "应力 [3,3]（eV/Å³）", result: "E / F 输出包", hessian: "Hessian [3N,3N]",
    "charges-output": "原子电荷输出", dipole: "非周期总偶极 [3]", "density-output": "自旋密度 / 多极矩输出",
  };
  const sources = {
    method: { name: "Foundry 的契约与评分方法", url: "#method" },
    mace: { name: "MACE · 源码级拆解", url: "model.html?id=mace" },
    polar: { name: "MACE-POLAR · 官方指南（核对于 2026-11-06）", url: "https://mace-docs.readthedocs.io/en/latest/guide/polar_mace.html" },
    "polar-paper": { name: "MACE-POLAR-1 · 论文", url: "https://arxiv.org/abs/2602.19411" },
    dpa4: { name: "DPA-4 / SeZM · 固定源码版本", url: "https://github.com/deepmodeling/deepmd-kit/blob/b5bc7fc9eebb90bc1c61a365bdb2b8ace1aae14a/doc/model/dpa4.md" },
    uma: { name: "UMA · 源码级拆解", url: "model.html?id=uma" },
    alphanet: { name: "AlphaNet · 源码级拆解及实现局限", url: "model.html?id=alphanet" },
    nequip: { name: "NequIP · 源码级拆解", url: "model.html?id=nequip" },
    schnet: { name: "SchNet · 源码级拆解", url: "model.html?id=schnet" },
    deepmd: { name: "DeepPot-SE · 源码级拆解", url: "model.html?id=deepmd-se" },
    les: { name: "LES · 隐式电荷与 Ewald", url: "model.html?id=les" },
    d3: { name: "DFT-D3 · 色散模块", url: "model.html?id=dftd3" },
  };
  function mod(stage, id, name, description, requires, provides, options = {}) {
    return {
      stage, id, name, description, requires, provides, sources: ["method"],
      boundary: "both", derivatives: 2, smoothness: 2, symmetry: "exact",
      locality: "local", cost: 0, complexity: "O(N)", active: true, ...options,
    };
  }
  const modules = [
    mod("input", "structure", "结构输入 · R / Z / cell", "元素、坐标与边界条件；不声明电荷、自旋或任务输入。", [], ["structure", "cell"]),
    mod("input", "state-input", "结构 + 电荷 / 自旋 / 任务", "用于全局条件化。总电荷输入本身不意味着有原子电荷或长程静电。", [], ["structure", "cell", "charge", "spin", "task"], { sources: ["uma", "dpa4"] }),
    mod("input", "polar-input", "结构 + 电荷 / 自旋 / 外场", "外场需与几何使用一致的坐标系。MACE-POLAR 在全局更新中使用这些量。", [], ["structure", "cell", "charge", "spin", "field"], { sources: ["polar"] }),
    mod("graph", "radius-graph", "半径邻居表 · 周期镜像", "概念上采用空间分箱邻居搜索；固定密度与截断下近似线性，不截断邻居数量。", ["structure"], ["edges"], { complexity: "O(N + E)，固定密度与截断；E = N·M", sources: ["mace", "dpa4"] }),
    mod("graph", "capped-graph", "半径图 + 邻居数量上限", "限制每个原子的邻居数。若上限实际触发，邻居交换可能破坏光滑性。", ["structure"], ["edges"], { complexity: "邻居搜索依实现；保留边数 E ≤ N·M", smoothness: 0, warnings: ["邻居上限若触发，平滑包络也不能消除截断邻居带来的不连续。"], sources: ["uma"] }),
    mod("graph", "pair-graph", "全原子对枚举 · AlphaNet PyTorch", "先枚举周期原子对，再截断并保留近邻；不要把局域网络等同于线性建图。", ["structure"], ["edges"], { complexity: "O(N²·I)，I 为周期镜像数", cost: 1, smoothness: 0, locality: "global", warnings: ["此模板使用 PyTorch 建图；JAX 的 matscipy 邻居表是另一条路径。"], sources: ["alphanet"] }),
    mod("geometry", "radial", "径向基 + 光滑包络", "只编码距离，不提供方向 irreps 或局部标架。", ["edges"], ["radial"], { complexity: "O(E·R)，R 为径向基数", sources: ["schnet"] }),
    mod("geometry", "spherical", "径向基 + 球谐方向", "Bessel / 平滑径向基与球谐 Y_l^m；用于 CG 张量积主干。", ["edges"], ["radial", "spherical"], { complexity: "O(E·(R + (l+1)²))", sources: ["mace", "nequip"] }),
    mod("geometry", "wigner", "径向基 + Wigner-D 边坐标系", "将球谐特征旋到边对齐的坐标系，让主干使用 SO(2) 分块运算。", ["edges"], ["radial", "wigner"], { complexity: "O(E·P_D(l))，P_D 为 Wigner 旋转路径成本", sources: ["uma", "dpa4"] }),
    mod("geometry", "local-frame", "Bessel + 等变局部标架", "以键方向和邻域质心建立标架，再投影向量。保留 AlphaNet 源码的光滑性局限。", ["edges"], ["radial", "frame"], { smoothness: 0, symmetry: "approximate", complexity: "O(E·R + E·C)", warnings: ["AlphaNet 的硬邻域质心、部分未乘包络的径向分支，不能构造性保证全局光滑。"], sources: ["alphanet"] }),
    mod("geometry", "se-descriptor", "DeepPot-SE 环境矩阵", "平滑 1/r 与单位方向构成环境矩阵，经不变收缩得到局域描述符。", ["edges"], ["descriptor"], { complexity: "O(N·M·P_emb + N·D·D_axis)", sources: ["deepmd"] }),
    mod("embedding", "element", "元素嵌入", "将元素映射为初始标量通道；状态可由其他显式模块使用。", ["structure"], ["embedding"], { sources: ["mace", "alphanet", "schnet"] }),
    mod("embedding", "conditioned", "元素 + Q / S / task 条件化", "将总电荷、自旋和任务加入体系嵌入；可供 UMA 的 MoLE 路由使用。", ["structure", "charge", "spin", "task"], ["embedding", "context"], { sources: ["uma"] }),
    mod("interaction", "mace-ace", "MACE · ACE 高体序收缩", "先以球谐张量积聚合 A 基，再做 ν 阶对称收缩得到多体 B 基。", ["embedding", "radial", "spherical"], ["scalar", "tensor", "vector"], { cost: 3, expressiveness: 4.5, locality: "message", usesAngular: true, usesCorrelation: true, complexity: "O(T·[E·C·P_TP(l) + N·C·P_ν(l,ν)])", sources: ["mace"] }),
    mod("interaction", "nequip-tp", "NequIP · CG 张量积消息", "逐边 CG 张量积与门控，多层传播方向与多体信息。末层可收缩为标量。", ["embedding", "radial", "spherical"], ["scalar", "tensor", "vector"], { cost: 3.5, expressiveness: 4, locality: "message", usesAngular: true, complexity: "O(T·E·C·P_TP(l))", sources: ["nequip"] }),
    mod("interaction", "dpa4-so2", "DPA-4 / SeZM · SO(2) + EMFA", "边系 SO(2) 混合、包络门控注意力、SO(3) 网格双线性非线性。", ["embedding", "radial", "wigner"], ["scalar", "tensor", "vector"], { cost: 3.5, expressiveness: 4.3, locality: "message", usesAngular: true, symmetry: "approximate", complexity: "O(T·E·[(l+1)²·C + (1+3l)·C²·L_mix])，m_max=1", warnings: ["网格非线性的等变精度依赖求积；这里不是 DPA-4.1 独立版本的验证。"], sources: ["dpa4"] }),
    mod("interaction", "uma-mole", "UMA · eSEN / SO(2) + MoLE", "由体系条件混合线性专家；固定体系与任务后可合并专家，不能按专家总数简单乘推理成本。", ["embedding", "context", "radial", "wigner"], ["scalar", "tensor", "vector"], { cost: 3.5, expressiveness: 4.3, locality: "message", usesAngular: true, complexity: "O(T·[E·P_SO2(l,m,C) + N·C²])，专家合并后的路径", warnings: ["MoLE 的合并依赖固定组成、任务与状态；不能由此推断任意混搭都有官方加速内核。", "部分 UMA-S-1.2 组成嵌入会影响广延性，具体 checkpoint 需另行核对。"], extensivityUncertain: true, sources: ["uma"] }),
    mod("interaction", "alpha-mps", "AlphaNet · 标架投影 + 复数 MPS", "以标架标量和笛卡尔向量传递消息，再进行复数矩阵乘积态收缩。", ["embedding", "radial", "frame"], ["scalar", "vector", "mps"], { cost: 3, expressiveness: 4, locality: "message", symmetry: "approximate", smoothness: 0, complexity: "O(T·[E·C² + E·χ₂·χ₁² + N·C·χ₁²])", warnings: ["源码 FTE 的 L1 范数不是严格旋转不变量；不能把此模板视为严格 E(3) 等变证明。"], sources: ["alphanet"] }),
    mod("interaction", "schnet-cfconv", "SchNet · 连续滤波卷积", "距离滤波器逐通道调制邻居特征；隐藏通道都是不变标量。", ["embedding", "radial"], ["scalar"], { cost: 2, expressiveness: 2.5, locality: "message", complexity: "O(T·[E·(R·C+C²) + N·C²])，含径向滤波 MLP", sources: ["schnet"] }),
    mod("interaction", "se-local", "DeepPot-SE · 局域不变收缩", "没有跨层图消息传递；在单个截断邻域内构造不变描述符。", ["embedding", "descriptor"], ["scalar"], { cost: 1, expressiveness: 3.5, complexity: "O(N·M·P_emb + N·D·D_axis)，严格局域", sources: ["deepmd"] }),
    mod("readout", "atomic-mlp", "标量 MLP → 原子能", "从不变标量通道读出每个原子的能量；包含按元素的参考能与缩放约定。", ["scalar"], ["atomic-energy"], { complexity: "O(N·P_fit)", sources: ["schnet", "nequip", "deepmd", "uma"] }),
    mod("readout", "mace-readout", "MACE · 各层原子能读出", "中间层线性、末层非线性读出，各层贡献相加。", ["scalar", "tensor"], ["atomic-energy"], { complexity: "O(T·N·P_read)", sources: ["mace"] }),
    mod("readout", "dpa-readout", "DPA-4 · l=0 拟合头", "网格 FFN 后的标量描述符进入 dpa4_ener，并加入元素偏置。", ["scalar", "tensor"], ["atomic-energy"], { sources: ["dpa4"] }),
    mod("readout", "alpha-readout", "AlphaNet · 标量 + 复数 MPS 读出", "结合标量与 MPS 实部、虚部，再做元素相关仿射变换。", ["scalar", "mps"], ["atomic-energy"], { complexity: "O(N·[C+χ₁])", sources: ["alphanet"] }),
    mod("readout", "polar-density", "局域能 + 自旋分辨 GTO 多极矩", "为非局域场更新提供初始自旋电荷密度；不是普通偶极预测头。", ["scalar", "tensor", "vector", "charge", "spin"], ["atomic-energy", "spin-density"], { sources: ["polar", "polar-paper"] }),
    mod("readout", "charge-readout", "原子能 + 守恒电荷头", "概念模块：由标量预测电荷，并按总电荷约束归一化；约束算法仍需实现。", ["scalar", "charge"], ["atomic-energy", "charges"], { locality: "global", cost: 0.2 }),
    mod("readout", "latent-readout", "原子能 + 隐式静电通道", "为 LES 输出潜在通道；这些量不应标成可解释的物理部分电荷。", ["scalar"], ["atomic-energy", "latent-charges"], { sources: ["les"] }),
    mod("longrange", "no-longrange", "不加显式静电", "只保留局域 / 多跳主干，不把状态条件化算作库仑项。", [], [], { active: false, complexity: "无额外项" }),
    mod("longrange", "polar-field", "PolarMACE · 非自洽场更新 + Fukui", "GTO 多极密度构造非局域电场，有限次更新多极矩；每轮用 Fukui 函数约束总电荷与自旋。输出显式静电与学习到的非局域能。不是 SCF 迭代至收敛。", ["structure", "spin-density", "tensor", "charge", "spin", "field"], ["lr-energy", "charges", "final-density"], { cost: 1.2, locality: "global", complexity: "实空间 O(U·N²)；倒空间含 O(U·N·K·P_ρ)，并加实空间项；非自动 O(N log N)", sources: ["polar", "polar-paper"] }),
    mod("longrange", "ewald", "物理电荷 + 周期 Ewald", "含电荷约束、周期边界与带电晶胞的背景 / 自能约定；这些数值细节仍需工程核对。", ["structure", "cell", "charges"], ["lr-energy"], { boundary: "periodic", cost: 1, locality: "global", complexity: "O(N·M_real + N·K)，直接倒空间求和；PME 是另一种实现", sources: ["schnet"] }),
    mod("longrange", "coulomb", "物理电荷 + 非周期 Coulomb", "分子全对库仑项；短程需阻尼 / 正则化，电荷对坐标的响应也须参与求导。", ["structure", "charges"], ["lr-energy"], { boundary: "molecule", cost: 1, locality: "global", complexity: "O(N²)", sources: ["schnet"] }),
    mod("longrange", "les", "LES · 隐式通道 + Ewald", "用潜在通道构造长程能；不能用该通道直接报告物理电荷或偶极。", ["structure", "cell", "latent-charges"], ["lr-energy"], { boundary: "periodic", cost: 1, locality: "global", complexity: "O(N·K·D_latent)，另加实空间 / 自能项", sources: ["les"] }),
    mod("dispersion", "no-dispersion", "不加显式色散", "训练标签可能已含色散，但局域拟合不保证正确的远距离渐近尾项。", [], [], { active: false, complexity: "无额外项" }),
    mod("dispersion", "d3", "DFT-D3(BJ) 能量修正", "须选择匹配参考泛函的参数，并检查标签中是否已含 D3 / VV10 等色散。", ["structure"], ["dispersion-energy"], { cost: 0.3, complexity: "截断两体项 O(N·M_D3)；开启 ATM 三体项还含 O(N·M_D3²)", sources: ["d3"] }),
    mod("repulsion", "no-repulsion", "不加显式排斥", "短程行为由学习能量承担，不保证高能碰撞下的排斥渐近形式。", [], [], { active: false, complexity: "无额外项" }),
    mod("repulsion", "zbl", "ZBL 短程排斥修正", "需要平滑开关 / 桥接以及一致的训练残差定义，不等同于直接复制其他框架的权重。", ["structure", "edges"], ["repulsion-energy"], { cost: 0.2, complexity: "O(E_ZBL)", sources: ["dpa4", "mace"] }),
    mod("energy", "local-sum", "Σ 原子能 + 元素参考能", "局域原子能的广延求和；此契约不接收独立长程或修正能量项。", ["atomic-energy"], ["energy"]),
    mod("energy", "total-sum", "Σ 原子能 + 所有已选物理项", "汇总长程、学习非局域、色散、排斥能量，再从同一个总能量求导。", ["atomic-energy"], ["energy"]),
    mod("forces", "gradient", "保守力 · −∂E_total/∂R", "必须对完整能量及电荷 / 密度响应求导，不能遗漏外挂能量项。", ["energy"], ["forces", "conservative-forces"], { cost: 0.3, complexity: "反向传播与能量路径同阶；常数与内存依实现" }),
    mod("forces", "direct", "等变向量头 · 直接预测力", "需要方向通道；不保证与能量梯度一致，也不自动包含所选修正能的力。", ["vector"], ["forces"], { complexity: "O(N·C)", sources: ["uma", "method"] }),
    mod("stress", "no-stress", "不请求应力", "适合非周期分子，或暂不设计晶胞响应。", [], [], { active: false, complexity: "无额外项" }),
    mod("stress", "strain", "总能量的应变导数", "周期晶胞及所有能量项都必须参与应变变换；不同引擎的应力 / 维里符号需要换算。", ["energy", "cell"], ["stress"], { boundary: "periodic", complexity: "与总能量求导同阶", sources: ["mace", "uma", "alphanet", "dpa4"] }),
    mod("output", "ef", "能量 / 力（+ 已选应力）", "输出基本势能与力；如果选择应力模块，也将其纳入输出蓝图。", ["energy", "forces"], ["result"]),
    mod("output", "hessian", "E / F + Hessian / 声子入口", "需要可二阶求导的完整能量；Hessian 不等于已经验证的声子或热导精度。", ["energy", "conservative-forces"], ["result", "hessian"], { cost: 0.5, complexity: "完整 Hessian 输出 / 存储 O(N²)，计算还需多次导数", sources: ["mace", "uma"] }),
    mod("output", "charges", "E / F + 原子电荷", "仅对真实、受总电荷约束的电荷头开放；部分电荷的物理解读依分区约定。", ["energy", "forces", "charges"], ["result", "charges-output"]),
    mod("output", "dipole", "E / F + 电荷与分子偶极", "非周期体系的总偶极；带电体系还需指定原点。周期极化不是直接求 ΣqR。", ["energy", "forces", "charges"], ["result", "charges-output", "dipole"], { boundary: "molecule" }),
    mod("output", "polar-output", "E / F + 自旋密度 / 电荷 / 分子偶极", "PolarMACE 的自旋分辨多极矩与非周期总偶极；不是直接声称具有极化率预测精度。", ["energy", "forces", "charges", "final-density"], ["result", "charges-output", "density-output", "dipole"], { boundary: "molecule", sources: ["polar"] }),
    mod("output", "density-output", "E / F + 电荷 / 自旋密度", "周期或非周期多极矩输出；不报告周期体系中没有唯一意义的总偶极。", ["energy", "forces", "charges", "final-density"], ["result", "charges-output", "density-output"], { sources: ["polar"] }),
  ];

  const base = {
    input: "structure", graph: "radius-graph", geometry: "spherical", embedding: "element",
    interaction: "mace-ace", readout: "mace-readout", longrange: "no-longrange",
    dispersion: "no-dispersion", repulsion: "no-repulsion", energy: "local-sum",
    forces: "gradient", stress: "strain", output: "ef",
  };
  const parameters = {
    atoms: { label: "体系原子数 N", min: 1, max: 10000000, step: 1, value: 1000 },
    neighbors: { label: "平均邻居数 M", min: 1, max: 2048, step: 1, value: 32 },
    layers: { label: "消息层 / 更新块 T", min: 1, max: 24, step: 1, value: 2 },
    channels: { label: "设计通道宽度 C", min: 8, max: 1024, step: 1, value: 128 },
    lmax: { label: "方向阶数 l_max", min: 0, max: 6, step: 1, value: 3 },
    correlation: { label: "MACE 收缩阶 ν", min: 1, max: 6, step: 1, value: 3 },
    cutoff: { label: "局域截断 r_c（Å）", min: 1, max: 16, step: 0.1, value: 6 },
  };
  function preset(id, name, description, selections, options = {}) {
    return {
      id, name, description, selections: { ...base, ...selections },
      parameters: Object.fromEntries(Object.entries(parameters).map(([k, v]) => [k, v.value])),
      boundary: "periodic", labelDispersion: "unknown", target: "conservative",
      evidence: "源码参考骨架", sources: [], notes: [], ...options,
      ...("parameters" in options ? { parameters: { ...Object.fromEntries(Object.entries(parameters).map(([k, v]) => [k, v.value])), ...options.parameters } } : {}),
    };
  }
  const presets = [
    preset("mace-polar", "MACE-POLAR", "局域高体序 MACE + 非自洽极化场更新。", {
      input: "polar-input", readout: "polar-density", longrange: "polar-field", energy: "total-sum", stress: "no-stress", output: "polar-output",
    }, { boundary: "molecule", labelDispersion: "included", evidence: "官方架构 + 源码骨架", sources: ["polar", "polar-paper", "mace"],
      notes: ["MACE-POLAR-1 的 OMol25 标签来自 ωB97M-V，不能默认再加 D3。", "有限次非自洽更新，不是传统迭代至收敛的极化模型；分子总偶极不适用于周期体系。"] }),
    preset("dpa41", "DPA-4.1 · 参考骨架", "按已核对的 DPA-4 / SeZM 拆解；4.1 版本待核对。", {
      geometry: "wigner", interaction: "dpa4-so2", readout: "dpa-readout",
    }, { parameters: { layers: 3, lmax: 3 }, evidence: "4.1 版本待核对", sources: ["dpa4"],
      notes: ["当前固定源码与官方文档确认 DPA-4 / SeZM 及 v20260911 预设，未确认名为 DPA-4.1 的独立配置；不把两者视为同一发布版本。", "展示 SO(2)、包络注意力、网格非线性与保守读出；ZBL / NLH 桥接和状态条件化属于可选项。"] }),
    preset("uma", "UMA", "体系条件化的 SO(2) 主干 + 可合并线性专家 MoLE。", {
      input: "state-input", graph: "capped-graph", geometry: "wigner", embedding: "conditioned", interaction: "uma-mole", readout: "atomic-mlp",
    }, { parameters: { layers: 4, lmax: 2 }, sources: ["uma"],
      notes: ["使用发布模型的保守力路径，不把预训练直接力头当作发布默认。", "task 必须与训练参考一致：omol / omc / odac 等可能已含色散；电荷、自旋输入不等于原子电荷输出。"] }),
    preset("alphanet", "AlphaNet", "局部标架 + 标量 / 向量消息 + 复数 MPS。", {
      graph: "pair-graph", geometry: "local-frame", interaction: "alpha-mps", readout: "alpha-readout",
    }, { parameters: { layers: 4, cutoff: 5 }, sources: ["alphanet"],
      notes: ["这里展示 PyTorch 路径；JAX 邻居搜索与部署性能不能直接移植到此评分。", "保留源码的 L1 范数、硬邻域质心等局限，不宣称严格等变 / 全局光滑；论文、发布配置、基准记录的层数与截断也存在差异。"] }),
    preset("mace", "MACE · 局域基线", "球谐张量积 + ACE 对称收缩，不默认添加静电。", {}, {
      sources: ["mace"], notes: ["以两层、ν=3 为结构示意；方向球谐截断与隐藏 irreps 阶数不是同一个超参数。"],
    }),
    preset("nequip", "NequIP", "球谐 CG 张量积消息 + 标量原子能。", {
      interaction: "nequip-tp", readout: "atomic-mlp",
    }, { parameters: { layers: 6, lmax: 2 }, sources: ["nequip"], notes: ["用六层基础模型说明多跳主干；末层只保留标量，实际向量头需接在此前的方向特征上。"] }),
    preset("schnet", "SchNet", "径向滤波卷积：便于理解的标量消息基线。", {
      geometry: "radial", interaction: "schnet-cfconv", readout: "atomic-mlp",
    }, { parameters: { layers: 6, cutoff: 5 }, sources: ["schnet"], notes: ["距离标量主干不能直接接等变向量力头；SchNetPack 的库仑扩展并不是 SchNet 默认模块。"] }),
    preset("deepmd", "DeepPot-SE", "严格局域环境描述符 + 元素相关拟合网络。", {
      geometry: "se-descriptor", interaction: "se-local", readout: "atomic-mlp",
    }, { parameters: { layers: 1 }, sources: ["deepmd"], notes: ["无跨层消息传递，名义感受野为 r_c；DPLR 是另一个需要 Wannier 电荷中心的扩展，未自动加入。"] }),
  ];
  return { version: 1, reviewed: "2026-11-06", stages, tokens, sources, modules, presets, parameters };
})();

if (typeof module !== "undefined" && module.exports) module.exports = FOUNDRY_CATALOG;
else window.MLFF_FOUNDRY = FOUNDRY_CATALOG;
