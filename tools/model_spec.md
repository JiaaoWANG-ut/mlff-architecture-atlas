# Model-page authoring spec (for `data/models/<id>.json`)

Workspace root: `/global/cfs/cdirs/m4517/jiaao/test/foundation-model-architecture`

The site explains, in **plain Simplified Chinese (通俗易懂, but technically exact)**, how each machine-learning
force field (MLFF) turns an atomic configuration into energy → forces → stress → other properties, and analyses
its speed, weak-interaction/long-range ability and downstream capability. Every claim must be grounded in the
cloned source code under `sources/<repo>/` (shallow clones; list + commits in `sources/MANIFEST.tsv`).

**Template: read `data/models/mace.json` first and copy its structure exactly (same keys, same style, same depth).**

## Budget (critical — read first)
An authoring agent is stopped after ~45 assistant rounds (tool-call turns) and then cannot reply at all.
- Round 1: read this spec, `data/models/mace.json` and the grep index `build/hints/<repo>.txt` **in parallel**.
- Always batch independent reads/greps in the same round (3–6 tool calls per round).
- Do not read whole huge files; read the 30–120 line windows around the hint line numbers.
- **By round 20 at the latest, create the complete JSON file** (all keys present) with one create_file call
  (≤15 KB is fine). Then validate, and fix errors with small replace edits.
- Reply by round 40 at the latest, even if some refinement is left.

## Hard rules
1. Write ONLY your assigned `data/models/<id>.json` files. Do not edit anything else (no tools/, no sources/, no other models).
2. Validate: from the workspace root run
   `/global/common/software/nersc/pe/conda-envs/26.11.0/python-3.13/nersc-python/bin/python3 tools/build_data.py <id1> <id2> ...`
   It must print `0 error(s)`. Fix every error it reports (wrong line range, missing anchor, unknown key, …).
3. **Never invent numbers.** Hyper-parameters must come from code/config defaults you actually read (prefer adding a
   `code` ref in `hyper`). Benchmark numbers may only be quoted from `sources/matbench-discovery/models/*/*.yml`
   (say “Matbench Discovery”) or from the repo’s own README/docs; otherwise describe qualitatively.
4. Paper title/venue/url: take from README / CITATION.cff / docs in the repo. If not found and you are not certain, use `""` for url.
5. License: read the repo LICENSE file (e.g. "MIT", "BSD-3-Clause", "LGPL-3.0", "Apache-2.0", "学术许可(非商用)").
6. All prose fields in Simplified Chinese. Code identifiers / formulas stay as is.

## Code references (the core of the site)
Each ref: `{"repo": "<folder in sources/>", "file": "<path relative to repo root>", "start": N, "end": M, "must": "<exact substring>", "caption": "<中文说明>"}`
- `repo` may be omitted only if it equals `repos[0]` of the model.
- 1-based inclusive lines, **at most 45 lines**, pick the lines that *are* the computation (not imports/docstrings).
- `must` is an exact substring copied from inside those lines (a distinctive call such as `torch.autograd.grad(`).
- Get line numbers with grep_search (it prints line numbers), then read_file exactly [start,end] to confirm.
- Prefer the main-line implementation that the released/pretrained model actually uses.

## Field reference
- `id` (= file stem, lowercase-hyphen), `name` (short display name), `fullName`, `year` (first publication year, int),
  `authors` (short), `paper` `{title, venue, url}`, `repos` (list of folder names in `sources/`, main repo first).
- `family` — one of:
  - `descriptor-nn`: fixed hand-designed local descriptor + per-atom NN (BPNN/n2p2, ANI, aenet, DeePMD-se, NEP, HIP-NN)
  - `linear-kernel`: linear/polynomial/kernel regression on a descriptor (ACE/PACE, SNAP, GAP/SOAP, MTP, UF3)
  - `invariant-mpnn`: message passing on invariant features (distances/angles) (SchNet, PhysNet, DimeNet, GemNet, M3GNet, CHGNet, ALIGNN, MatterSim, SpookyNet…)
  - `cartesian-equivariant`: equivariance via Cartesian vectors/tensors (EGNN, PaiNN, TorchMD-ET, TensorNet, NewtonNet, ViSNet, HotPP, TACE, CACE, AlphaNet(frames)…)
  - `spherical-equivariant`: irreps / spherical harmonics + Clebsch–Gordan (NequIP, Allegro, MACE, SevenNet, GRACE, Equiformer(V2/V3), eSCN, eSEN, UMA…)
  - `unconstrained`: no built-in rotational symmetry, learned/augmented (ORB, PET)
  - `long-range-module`: add-on for long-range physics (LES, Ewald MP, DFT-D3)
  - `infrastructure`: libraries / kernels (e3nn, cuEquivariance)
  If an architecture is borderline, choose the dominant mechanism and mention the nuance in `tags`.
- `tags`: 3–6 short Chinese/English tags. `framework`: e.g. "PyTorch", "JAX/Flax", "TensorFlow", "C++/CUDA", "Julia".
- `oneLiner`: 1–2 sentences: what is the key idea, in plain Chinese.
- `analogy`: an everyday analogy that makes the key idea intuitive for a non-specialist.
- `arch` (all keys required, concise strings ≤ ~80 Chinese chars, used in comparison tables):
  `geometry` (what geometric info is used: r / angles / dihedrals / Y_lm / Cartesian tensors), `equivariance`
  (invariant / E(3)-equivariant / approximately via augmentation), `lmax`, `bodyOrder`, `layers`, `cutoff`,
  `receptiveField`, `message`, `readout`, `forces` (**enum**: `conservative` | `direct` | `both` | `n/a`),
  `forcesDetail`, `stress`, `longRange`, `dispersion`, `chargeSpin` (total charge/spin inputs?), `otherOutputs`,
  `strictlyLocal` (**bool**: true if energy of atom i depends only on atoms within one cutoff, i.e. no message
  passing beyond r_c — true for BPNN/ACE/Allegro/NEP; false for MPNNs), `complexity` (scaling with N, neighbours M,
  channels C, L), `accel` (GPU kernels, LAMMPS/ASE/i-PI interfaces, compile, multi-GPU…).
- `scores` — integer 1–5 + one-sentence Chinese `why`, judged *relative to the whole field* (omit entirely for
  `infrastructure` / `long-range-module`):
  - `speed` (inference throughput per atom on GPU/CPU): 5 = descriptor/linear models (NEP, SNAP, ACE, DeePMD-se compressed),
    4 = light invariant MPNN or strictly-local equivariant (SchNet, PaiNN, Allegro, TensorNet), 3 = MACE-class, 2 = deep
    equivariant (NequIP 4–6 layers, SevenNet-L, GemNet), 1 = large transformers (EquiformerV2, eSEN-30M, UMA-L).
  - `expressiveness` (body order + angular resolution + capacity): 5 = high-body-order equivariant (MACE, ACE complete), 1 = 2-body/radial only.
  - `longRange` (beyond-cutoff physics): 1 = strictly local, no add-ons; 2 = MPNN receptive field only; 3 = optional D3 /
    simple charges; 4 = built-in electrostatics or dispersion terms; 5 = explicit charge equilibration + electrostatics + dispersion (+ total charge/spin).
  - `scalability` (large systems, domain decomposition, multi-GPU MD): 5 = strictly local & LAMMPS-parallel (Allegro, NEP, DeePMD), 1 = whole-graph only.
  - `physics` (conservative forces, smoothness at cutoff, extensivity, short-range repulsion/ZBL, symmetry exactness): 5 = all of these.
  - `coverage` (official outputs beyond E/F/S: Hessian, dipole, polarizability, charges, magmom, BEC, spin…): 1 = E/F only.
- `steps`: 6–12 objects `{stage, title, plain, math, code:[...]}` walking from configuration to properties.
  `stage` ∈ `input, graph, geometry, embedding, interaction, readout, energy, longrange, forces, stress, output`
  (stages may repeat, order should follow the computation). Required for normal models: `interaction`, `energy`,
  and `forces` (unless `arch.forces == "n/a"`). Include `stress` if supported, `longrange` if the model has or
  officially offers dispersion/electrostatics/charges, `output` for extra properties. For descriptor/linear models
  the `interaction` stage is the descriptor/body-order construction step.
  - `plain`: 2–5 sentences Chinese, explain WHAT happens and WHY it matters physically (smoothness, symmetry, cost…).
  - `math`: one KaTeX display formula (JSON-escaped: `\\frac`, `\\sum`). No `\begin{align}`; separate parts with `\\qquad`.
    Must match what the code does (cite the actual functional form, e.g. cosine cutoff vs polynomial envelope).
  - `code`: 1–3 refs (see above). Every step should have ≥ 1 code ref.
- `hyper`: 5–12 `{name, value, note, code?}` default hyper-parameters of the main released model (from code/configs).
- `speedNotes`, `weakNotes`, `downstreamNotes`: 3–5 Chinese bullets each, specific to this architecture.
  - speedNotes: where the FLOPs go, what scales badly, which kernels/compression/precision tricks exist.
  - weakNotes (弱相互作用/长程): cutoff and receptive field; training data functional (PBE/PBE+U/r2SCAN/ωB97M-D3…, if
    stated in repo); dispersion & electrostatics presence; charge/spin inputs; which systems will fail (layered vdW
    materials, molecular crystals, physisorption, ionic liquids, charged defects, interfaces) and official fixes.
  - downstreamNotes: phonons/thermal conductivity (needs smooth conservative forces & Hessians), MD stability,
    geometry optimisation, elastic constants, spectra (dipole/polarizability), magnetism, reactions, etc.
- `strengths`, `weaknesses`: 3–5 short Chinese items each.
- `pretrained`: names of released checkpoints/foundation models (from README/code), else [].
- `mbdKeys`: Matbench Discovery `model_key`s for this architecture (exact strings, else []):
  alignn-ff alignn-ff-mptrj allegro-mp-l-0.1 allegro-oam-l-0.1 alphanet-v1-mptrj alphanet-v1-oam bam-mp-core bam-mp-dens
  chgnet-0.3.0 dpa-3.1-3m-ft dpa-3.1-mptrj dpa3-v1-mptrj dpa3-v1-openlam dpa3-v2-mptrj dpa3-v2-openlam dpa-4.0.1-pro-mptrj
  dpa-4.0-pro-mptrj dpa-4.1-air-oam dpa-4.1c-air-oam dpa-4.1-max-oam-pft dpa-4.1-max-oam eqnorm-mptrj equflash-29m-oam
  equflashv2-45m-oam equiformer-v3-mp equiformer-v3-oam eqv2-m-omat-salex-mp eqv2-s-dens-mp esen-30m-mp esen-30m-oam
  gnome grace-1l-oam grace-2l-mptrj grace-2l-oam-l grace-2l-oam grace-3l-oam-l hienet m3gnet mace-mp-0 mace-mpa-0
  mace-soyo-mptrj mace-soyo-oam matris-10m-mp matris-10m-oam matris-v050-mptrj mattersim-v1-5m nequip-mp-l-0.1
  nequip-oam-l-0.1 nequip-oam-xl-0.1 nequix-mp-1-pft nequix-mp-1 orb-v2-mptrj orb-v2 orb-v3 pet-oam-xl-1.0.0
  prophet-oame-mbd sevennet-0 sevennet-l3i5 sevennet-mf-ompa sevennet-omni-i12 tace-oam-l tace-oam-rra-preview
  tace-v1-oam-m tece-oam-rra-1.0
  (The YAML files `sources/matbench-discovery/models/<dir>/<key>.yml` also list hyperparams such as
  graph_construction_radius, model_params, training_set, targets — use them to cross-check.)
- `arenaKeys`: MLIP Arena names for this architecture (exact strings, else []):
  MACE-MP(M) CHGNet M3GNet MatterSim ORBv2 SevenNet eqV2(OMat) MACE-MPA eSEN EquiformerV2(OC22) EquiformerV2(OC20)
  eSCN(OC20) MACE-OFF(M) ANI2x ALIGNN DeepMD ORB PET-OAM PET-MAD NequIP-OAM-L UMA-S-1P1

## Final message to the main agent
Reply with ≤150 words: ids written, validation result, and any genuine uncertainties (e.g. "could not find
stress implementation", "paper url unknown").
