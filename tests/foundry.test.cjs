"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const C = require("../docs/data/foundry.js");
const F = require("../docs/assets/foundry-core.js");
const docs = path.resolve(__dirname, "../docs");
const make = (id = "mace") => F.createDesign(C, id);
const assess = (design) => F.evaluate(C, design);
const score = (design, key) => assess(design).scores.find((s) => s.key === key).value;
const hasError = (design, code, stage) => assess(design).errors.some((e) => e.code === code && (!stage || e.stage === stage));
function custom(baseId, changes = {}) {
  const base = C.modules.find((m) => m.id === baseId);
  return F.validateCustom(C, {
    ...base, id: `custom-${base.id}`, source: "", extensive: "unknown",
    cost: null, expressiveness: null, ...changes,
  });
}
function useCustom(design, mod) {
  design.customModules.push(mod);
  design.selections[mod.stage] = mod.id;
  return design;
}
function withCharges() {
  const design = make();
  design.selections.input = "state-input";
  design.selections.readout = "charge-readout";
  return design;
}

test("catalog has complete unique stages, modules, contracts, and sources", () => {
  assert.equal(C.stages.length, 13);
  assert.equal(C.modules.length, 48);
  assert.equal(C.presets.length, 8);
  assert.equal(new Set(C.modules.map((m) => m.id)).size, C.modules.length);
  for (const mod of C.modules) {
    const stage = C.stages.find((s) => s.id === mod.stage);
    assert.ok(stage, mod.id);
    assert.ok(mod.requires.every((t) => Object.hasOwn(C.tokens, t)), mod.id);
    assert.ok(mod.provides.every((t) => stage.outputs.includes(t)), mod.id);
    assert.ok(stage.required.every((t) => mod.provides.includes(t)), mod.id);
    assert.ok(mod.sources.every((s) => Object.hasOwn(C.sources, s)), mod.id);
    assert.ok(Number.isFinite(mod.cost), mod.id);
    assert.ok(mod.complexity.length > 0, mod.id);
  }
  for (const source of Object.values(C.sources)) {
    if (!source.url.startsWith("https:")) {
      assert.ok(fs.existsSync(path.join(docs, source.url.split(/[?#]/)[0] || "foundry.html")));
    }
  }
});

for (const preset of C.presets) {
  test(`${preset.id}: complete, compatible, finite scored reference blueprint`, () => {
    const design = make(preset.id);
    const result = assess(design);
    assert.deepEqual(result.errors, []);
    assert.equal(result.compatible, true);
    assert.equal(result.modified, false);
    assert.equal(result.declared, false);
    assert.equal(result.scores.length, 6);
    for (const dim of result.scores) assert.ok(Number.isFinite(dim.value) && dim.value >= 1 && dim.value <= 5);
    const exported = F.blueprint(C, design);
    assert.deepEqual(F.parse(C, JSON.stringify(exported)), design);
    assert.equal(exported.modules.length, C.stages.length);
    assert.deepEqual(exported.accuracy, { status: "not-evaluated", mae: null });
  });
}

test("requested model distinctions are explicit, not invented variants", () => {
  const polar = make("mace-polar");
  assert.equal(polar.selections.readout, "polar-density");
  assert.equal(polar.selections.longrange, "polar-field");
  assert.equal(polar.labelDispersion, "included");
  assert.match(C.modules.find((m) => m.id === "polar-field").description, /不是 SCF/);
  assert.ok(assess(make("dpa41")).warnings.some((w) => w.code === "unverified-version"));
  assert.equal(make("uma").selections.embedding, "conditioned");
  assert.equal(make("uma").selections.forces, "gradient");
  assert.equal(make("alphanet").selections.interaction, "alpha-mps");
  assert.equal(make("alphanet").selections.graph, "pair-graph");
});

test("representation mismatch blocks the pipeline, scores, and valid export", () => {
  const design = make();
  design.selections.geometry = "radial";
  assert.ok(hasError(design, "missing-interface", "interaction"));
  assert.ok(hasError(design, "missing-interface", "readout"));
  assert.equal(assess(design).scores, null);
  assert.throws(() => F.blueprint(C, design), F.BlueprintError);
  assert.deepEqual(F.parse(C, JSON.stringify(F.draft(C, design))), design);
});

test("Wigner frames and spherical harmonics are distinct contracts", () => {
  const design = make("uma");
  design.selections.geometry = "spherical";
  assert.ok(hasError(design, "missing-interface", "interaction"));
  design.selections.geometry = "wigner";
  design.selections.input = "structure";
  assert.ok(hasError(design, "missing-interface", "embedding"));
});

test("AlphaNet readout requires MPS features and polar readout requires directional density inputs", () => {
  const design = make();
  design.selections.readout = "alpha-readout";
  assert.ok(hasError(design, "missing-interface", "readout"));
  const radial = make("schnet");
  radial.selections.input = "polar-input";
  radial.selections.readout = "polar-density";
  assert.ok(hasError(radial, "missing-interface", "readout"));
});

test("l=0 removes directional force and multipole interfaces", () => {
  const design = make("mace-polar");
  design.parameters.lmax = 0;
  assert.ok(hasError(design, "missing-interface", "readout"));
  assert.ok(assess(design).warnings.some((w) => w.code === "scalar-limit"));
});

for (const [stage, mod] of [["longrange", "ewald"], ["dispersion", "d3"], ["repulsion", "zbl"]]) {
  test(`${stage}: independent energy terms must reach the total-energy sum`, () => {
    const design = withCharges();
    design.labelDispersion = "excluded";
    design.selections[stage] = mod;
    assert.ok(hasError(design, "missing-energy-terms", "energy"));
    design.selections.energy = "total-sum";
    assert.equal(assess(design).compatible, true);
    assert.equal(design.selections.forces, "gradient");
  });
}

test("dispersion labeling distinguishes double counting, unknown, and residual training", () => {
  const design = make("mace-polar");
  design.selections.dispersion = "d3";
  assert.ok(hasError(design, "double-dispersion"));
  design.labelDispersion = "unknown";
  assert.equal(assess(design).compatible, true);
  assert.ok(assess(design).warnings.some((w) => w.code === "unknown-dispersion"));
  design.labelDispersion = "excluded";
  assert.equal(assess(design).warnings.some((w) => w.code === "unknown-dispersion"), false);
});

test("direct force requires vectors, cannot meet conservative targets or supply a Hessian", () => {
  const scalar = make("schnet");
  scalar.target = "exploration";
  scalar.selections.forces = "direct";
  assert.ok(hasError(scalar, "missing-interface", "forces"));
  const design = make("uma");
  design.selections.forces = "direct";
  assert.ok(hasError(design, "conservative-target"));
  design.target = "exploration";
  assert.equal(assess(design).compatible, true);
  assert.ok(assess(design).warnings.some((w) => w.code === "direct-force"));
  design.selections.output = "hessian";
  assert.ok(hasError(design, "missing-interface", "output"));
});

test("molecular boundary excludes periodic stress and Ewald", () => {
  const design = withCharges();
  design.boundary = "molecule";
  assert.ok(hasError(design, "boundary", "stress"));
  design.selections.stress = "no-stress";
  design.selections.longrange = "ewald";
  design.selections.energy = "total-sum";
  assert.ok(hasError(design, "boundary", "longrange"));
  assert.ok(hasError(design, "missing-interface", "longrange"));
  design.selections.longrange = "coulomb";
  design.selections.output = "dipole";
  assert.equal(assess(design).compatible, true);
});

test("periodic polar density can be exported without an invalid total dipole", () => {
  const design = make("mace-polar");
  design.boundary = "periodic";
  assert.ok(hasError(design, "periodic-dipole"));
  design.selections.output = "density-output";
  design.selections.stress = "strain";
  assert.equal(assess(design).compatible, true);
});

test("latent LES channels never count as physical charge outputs", () => {
  const design = make();
  design.selections.readout = "latent-readout";
  design.selections.longrange = "les";
  design.selections.energy = "total-sum";
  assert.equal(assess(design).compatible, true);
  design.selections.output = "charges";
  assert.ok(hasError(design, "missing-interface", "output"));
  const uma = make("uma");
  uma.selections.output = "charges";
  assert.ok(hasError(uma, "missing-interface", "output"));
});

test("custom geometry can bridge representations but only with declared confidence", () => {
  const design = make("uma");
  useCustom(design, custom("spherical", { provides: ["radial", "spherical", "wigner"] }));
  const result = assess(design);
  assert.equal(result.compatible, true);
  assert.equal(result.declared, true);
  assert.equal(score(design, "cost"), null);
  assert.ok(result.warnings.some((w) => w.code === "custom-contract"));
  assert.deepEqual(F.parse(C, JSON.stringify(F.blueprint(C, design))), design);
});

test("custom unknown scores are not silently filled, and explicit self-scores can be used", () => {
  const design = make("schnet");
  useCustom(design, custom("schnet-cfconv"));
  assert.equal(score(design, "expressiveness"), null);
  assert.equal(score(design, "cost"), null);
  design.customModules[0].cost = 2;
  design.customModules[0].expressiveness = 3;
  assert.ok(Number.isFinite(score(design, "expressiveness")));
  assert.ok(Number.isFinite(score(design, "cost")));
  design.customModules[0].symmetry = "unknown";
  assert.equal(score(design, "physics"), null);
  design.customModules[0].locality = "unknown";
  assert.equal(score(design, "scalability"), null);
});

test("derivative checks cover every active energy branch, including custom corrections", () => {
  for (const [base, stage] of [["spherical", "geometry"], ["atomic-mlp", "readout"], ["d3", "dispersion"], ["zbl", "repulsion"]]) {
    const design = make();
    design.labelDispersion = "excluded";
    design.selections.energy = "total-sum";
    useCustom(design, custom(base, { derivatives: 0 }));
    assert.ok(hasError(design, "derivatives", stage));
    design.customModules[0].derivatives = "unknown";
    assert.ok(hasError(design, "derivatives", stage));
    design.customModules[0].derivatives = 1;
    assert.equal(assess(design).compatible, true);
    design.selections.output = "hessian";
    assert.ok(hasError(design, "derivatives", stage));
  }
});

test("custom energy must explicitly consume every selected correction", () => {
  const design = make();
  design.labelDispersion = "excluded";
  design.selections.dispersion = "d3";
  const mod = custom("total-sum");
  useCustom(design, mod);
  assert.ok(hasError(design, "custom-energy-terms", "energy"));
  mod.requires.push("dispersion-energy");
  assert.equal(assess(design).compatible, true);
  assert.equal(score(design, "physics"), null);
  mod.extensive = "no";
  assert.equal(score(design, "physics"), 4);
  mod.extensive = "yes";
  assert.equal(score(design, "physics"), 5);
});

test("custom stress requires a differentiable energy even with direct forces", () => {
  const design = make();
  design.target = "exploration";
  design.selections.forces = "direct";
  useCustom(design, custom("strain"));
  useCustom(design, custom("atomic-mlp", { derivatives: 0 }));
  assert.ok(hasError(design, "derivatives", "readout"));
});

test("custom claims cannot bypass primary stage contracts or physical output dependencies", () => {
  assert.throws(() => custom("spherical", { requires: [] }), F.BlueprintError);
  assert.throws(() => custom("spherical", { provides: ["energy"] }), F.BlueprintError);
  assert.throws(() => custom("spherical", { provides: [] }), F.BlueprintError);
  assert.throws(() => custom("gradient", { requires: ["scalar"] }), F.BlueprintError);
  assert.throws(() => custom("charge-readout", { requires: ["scalar"] }), F.BlueprintError);
  assert.throws(() => custom("dipole", { requires: ["energy", "forces"] }), F.BlueprintError);
  assert.throws(() => custom("d3", { provides: [] }), F.BlueprintError);
  assert.throws(() => custom("spherical", { provides: ["radial", "radial"] }), F.BlueprintError);
  const design = withCharges();
  useCustom(design, custom("dipole", { boundary: "both" }));
  assert.ok(hasError(design, "periodic-dipole"));
});

test("forward dependencies and cycles are rejected rather than satisfied by their own outputs", () => {
  const design = make();
  useCustom(design, custom("spherical", { requires: ["edges", "forces"] }));
  assert.ok(hasError(design, "missing-interface", "geometry"));
  assert.equal(assess(design).scores, null);
});

test("dimension scores use the documented formula and never invent measured accuracy", () => {
  const design = make("schnet");
  design.parameters.layers = 2;
  design.parameters.channels = 64;
  assert.equal(score(design, "cost"), 2.3);
  assert.equal(score(design, "expressiveness"), 2.5);
  assert.equal(score(design, "physics"), 5);
  assert.equal(score(design, "longrange"), 1);
  design.parameters.layers = 4;
  assert.equal(score(design, "cost"), 2.8);
  assert.equal(score(design, "expressiveness"), 2.7);
  assert.equal(assess(design).receptiveField, 20);
  design.parameters.atoms *= 2;
  assert.equal(score(design, "cost"), 3.1);
  const before = score(design, "cost");
  design.parameters.channels *= 2;
  assert.ok(score(design, "cost") > before);
  assert.equal(F.blueprint(C, design).accuracy.mae, null);
});

test("unused angular, correlation and message-depth settings do not affect scalar/local architectures", () => {
  const scalar = make("schnet");
  const initial = assess(scalar).scores;
  scalar.parameters.lmax = 6;
  scalar.parameters.correlation = 6;
  assert.deepEqual(assess(scalar).scores, initial);
  const local = make("deepmd");
  const localCost = score(local, "cost");
  local.parameters.layers = 24;
  assert.equal(score(local, "cost"), localCost);
  assert.equal(assess(local).receptiveField, 6);
  assert.equal(assess(make("alphanet")).receptiveField, 30);
});

test("score clamping, explicit terms and implementation caveats stay visible", () => {
  const huge = make();
  huge.parameters.atoms = 10000000;
  huge.parameters.channels = 1024;
  huge.parameters.layers = 24;
  assert.equal(score(huge, "cost"), 5);
  assert.ok(score(make("alphanet"), "physics") < score(make(), "physics"));
  assert.ok(score(make("uma"), "physics") < 5);
  const polar = make("mace-polar");
  assert.equal(score(polar, "longrange"), 4);
  polar.labelDispersion = "excluded";
  polar.selections.dispersion = "d3";
  assert.equal(score(polar, "longrange"), 5);
});

test("design changes detach a reference configuration without mutating catalog presets", () => {
  const design = make("mace");
  const original = JSON.stringify(C.presets);
  design.parameters.layers = 3;
  assert.equal(assess(design).modified, true);
  assert.equal(JSON.stringify(C.presets), original);
  assert.equal(make("mace").parameters.layers, 2);
});

test("import distrusts reported compatibility, scores, and code-bearing snapshots", () => {
  const exported = F.blueprint(C, make("mace"));
  exported.assessment = { compatible: true, scores: [{ key: "cost", value: 999 }] };
  exported.accuracy.mae = 0.001;
  exported.modules = [{ execute: "untrusted code is not evaluated" }];
  exported.design.selections.geometry = "radial";
  const imported = F.parse(C, JSON.stringify(exported));
  assert.equal(assess(imported).compatible, false);
  assert.equal(Object.hasOwn(imported, "assessment"), false);
  assert.equal(Object.hasOwn(imported, "modules"), false);
});

test("invalid files, versions, references and values fail loudly", () => {
  const encoded = () => F.draft(C, make());
  for (const mutate of [
    (x) => { x.format = "other"; }, (x) => { x.schemaVersion = 99; },
    (x) => { x.catalogVersion = 99; }, (x) => { x.design.presetId = "unknown"; },
    (x) => { x.design.selections.geometry = "missing"; }, (x) => { x.design.selections.geometry = "strain"; },
    (x) => { delete x.design.selections.energy; }, (x) => { x.design.parameters.layers = 1.5; },
    (x) => { x.design.parameters.cutoff = 5.05; },
    (x) => { x.design.parameters.atoms = 0; }, (x) => { x.design.parameters.channels = "128"; },
    (x) => { x.design.boundary = "vacuum"; }, (x) => { x.design.name = ""; },
    (x) => { x.design.training = "x".repeat(3001); }, (x) => { x.design.customModules = {}; },
  ]) {
    const value = encoded();
    mutate(value);
    assert.throws(() => F.parse(C, JSON.stringify(value)), F.BlueprintError);
  }
  for (const value of ["{", "null", "[]", "x".repeat(F.maxBlueprintBytes + 1), "字".repeat(Math.ceil(F.maxBlueprintBytes / 3))]) assert.throws(() => F.parse(C, value), F.BlueprintError);
  const design = make();
  design.parameters.channels = NaN;
  assert.throws(() => assess(design), F.BlueprintError);
  design.parameters.channels = Infinity;
  assert.throws(() => assess(design), F.BlueprintError);
});

test("large valid Unicode module libraries round-trip within the same byte limit used by the UI", () => {
  const design = make();
  design.training = "字".repeat(3000);
  design.customModules = Array.from({ length: 50 }, (_, i) => custom("spherical", {
    id: `custom-large-${i}`, name: "字".repeat(80), description: "字".repeat(1600),
    source: "https://example.org/" + "字".repeat(470), complexity: "字".repeat(250),
  }));
  const encoded = JSON.stringify(F.blueprint(C, design), null, 2);
  assert.ok(Buffer.byteLength(encoded) > 250000);
  assert.ok(Buffer.byteLength(encoded) <= F.maxBlueprintBytes);
  assert.deepEqual(F.parse(C, encoded), design);
});

test("custom module schema rejects executable URLs, duplicate IDs, invalid enums and score fallbacks", () => {
  for (const source of ["javascript:alert(1)", "data:text/html,evil", "file:///tmp/secret", "https://name:password@example.org/"]) {
    assert.throws(() => custom("spherical", { source }), F.BlueprintError);
  }
  assert.throws(() => custom("spherical", { id: "mace-ace" }), F.BlueprintError);
  assert.throws(() => custom("spherical", { cost: 6 }), F.BlueprintError);
  assert.throws(() => custom("spherical", { cost: undefined }), F.BlueprintError);
  assert.throws(() => custom("spherical", { symmetry: "trust-me" }), F.BlueprintError);
  const design = make();
  design.customModules = [custom("spherical"), custom("spherical")];
  assert.throws(() => assess(design), F.BlueprintError);
  design.customModules = Array.from({ length: 51 }, (_, i) => custom("spherical", { id: `custom-example-${i}` }));
  assert.throws(() => assess(design), F.BlueprintError);
});

test("new scripts parse and the static page links to local assets without adding CDN dependencies", () => {
  for (const file of ["data/foundry.js", "assets/foundry-core.js", "assets/foundry.js", "assets/common.js"]) {
    new vm.Script(fs.readFileSync(path.join(docs, file), "utf8"), { filename: file });
  }
  const html = fs.readFileSync(path.join(docs, "foundry.html"), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (match[1].startsWith("#")) assert.ok(ids.includes(match[1].slice(1)));
    else assert.ok(fs.existsSync(path.join(docs, match[1].split(/[?#]/)[0])), match[1]);
  }
  assert.match(fs.readFileSync(path.join(docs, "assets/common.js"), "utf8"), /\["foundry.html",/);
  for (const file of ["index.html", "compare.html", "about.html"]) {
    assert.match(fs.readFileSync(path.join(docs, file), "utf8"), /href="foundry.html(?:#method)?"/);
  }
});
