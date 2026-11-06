# MLFF 架构图谱

68 种主流机器学习力场（MLFF）和原子尺度基础模型，按同一条 11 步流水线拆开讲：从原子构型（坐标、元素、晶胞）出发，经过建图、特征嵌入、消息传递、读出，一步步得到能量、力、应力，以及电荷、偶极等其他性质。每一步都附有源码片段，片段链接到固定 commit 的原始文件。

在此基础上，结合 Matbench Discovery 和 MLIP Arena 的公开基准，从底层结构出发横向分析三类能力：

- 速度
- 弱相互作用：长程静电、色散
- 下游性质：热导、声子、分子动力学稳定性等

- 网站：https://jiaaowang-ut.github.io/mlff-architecture-atlas/
- 发布：https://github.com/JiaaoWANG-ut/mlff-architecture-atlas/releases

## 页面

| 页面 | 内容 |
|---|---|
| `index.html` | 总览：通用流水线、8 个架构家族、主要结论 |
| `models.html` | 68 个模型的可筛选、可排序列表 |
| `model.html?id=mace` | 单个模型逐步推导，附源码片段 |
| `stages.html` | 按流水线阶段横向对比所有模型 |
| `compare.html` | 任选多个模型并排比较 |
| `analysis.html` | 底层结构分析：速度、弱相互作用、下游性质 |
| `bench.html` | 基准数据表：Matbench Discovery 74 个条目，以及 MLIP Arena 的稳定性、燃烧、状态方程数据 |
| `glossary.html` | 术语表 |
| `about.html` | 方法、整理规则、已知局限、源码清单、复现方法 |

## 目录

```
docs/        静态网站（GitHub Pages 发布目录）
  assets/    样式与页面脚本
  data/      由 tools/ 生成的数据（index.js、steps.js、models/*.js、benchmarks.js）
data/
  models/    每个模型的人工整理描述（JSON，含源码行号引用）
  curated.json  截断半径、层数、长程/色散/电荷等结构化字段
  MANIFEST.tsv  64 个源码仓库及其固定 commit
tools/       抓取源码、提取基准、生成数据的脚本
sources/     源码快照（不入库，由 fetch_sources.sh 生成）
```

## 复现

需要 git 与 Python 3；`extract_benchmarks.py` 还需要 numpy 和 PyYAML。

```bash
bash tools/fetch_sources.sh              # 按 data/MANIFEST.tsv 的固定 commit 浅克隆 64 个仓库到 sources/
python3 tools/extract_benchmarks.py      # 提取 Matbench Discovery / MLIP Arena 基准 -> docs/data/benchmarks.js
python3 tools/build_data.py              # 校验每条源码引用（文件、行号、锚点文本）并生成 docs/data/*.js
python3 -m http.server -d docs 8000      # 本地预览 http://localhost:8000
```

`bash tools/fetch_sources.sh --latest` 会改为拉取各仓库的最新版本。源码更新后行号可能偏移，`build_data.py` 会逐条报出失效的引用。

## 说明

- 网页中引用的源码片段版权归原作者所有，各自的许可证见对应模型页面。片段只用于说明和评析，均链接到原仓库的固定 commit。
- 基准数值直接取自 Matbench Discovery 和 MLIP Arena 仓库的固定 commit，见 `bench.html`。不同条目的训练数据、硬件和设置并不相同，横向比较时需注意，详见 `about.html` 的“已知局限”一节。
