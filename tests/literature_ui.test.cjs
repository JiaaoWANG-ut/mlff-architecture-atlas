"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(rootDir, file), "utf8");

async function renderModel(id) {
  const window = {};
  vm.runInNewContext(read("docs/data/index.js"), { window });
  const data = window.MLFF;
  const root = { innerHTML: "", querySelectorAll: () => [] };
  const button = { dataset: {}, addEventListener() {} };
  const document = {
    getElementById: (name) => name === "root" ? root : button,
    querySelector: () => null,
  };
  const context = {
    window, document, location: { hash: "" },
    param: () => id,
    modelById: (name) => data.models.find((m) => m.id === name),
    mountChrome() {},
    loadScript: async () => {
      vm.runInNewContext(read(`docs/data/models/${id}.js`), { window });
    },
    esc: (value) => String(value ?? ""),
    famBadge: () => "",
    forcesBadge: (value) => value,
    ARCH_LABEL: { forces: "力", strictlyLocal: "严格局域" },
    FORCES_LABEL: { unknown: "待核验", "n/a": "不适用", conservative: "保守" },
    STAGE: Object.fromEntries(data.stages.map((s) => [s, { short: s, name: s }])),
    FAMILY: Object.fromEntries(data.families.map((f) => [f, { name: f }])),
    modelLink: (m) => `model.html?id=${m.id}`,
    benchForModel: () => null,
    renderAllTex() {},
  };
  vm.runInNewContext(read("docs/assets/model.js"), context);
  await new Promise((resolve) => setImmediate(resolve));
  return root.innerHTML;
}

test("placeholder repository is not presented as implementation code", async () => {
  const html = await renderModel("mcsa");
  assert.match(html, /文献初录/);
  assert.match(html, /该固定版本仅含许可证，未包含实现代码/);
  assert.match(html, /未知 \/ 取决于配置/);
  assert.match(html, /本站暂无预训练模型信息/);
});

test("unknown source and force type remain visibly uncertain", async () => {
  const html = await renderModel("matlantis-pfp-v8");
  assert.match(html, /暂未找到公开源码/);
  assert.match(html, /待核验/);
});

test("FACTO presents its paper-reported conservative force without implying source audit", async () => {
  const html = await renderModel("facto");
  assert.match(html, /保守/);
  assert.match(html, /总能量解析求导/);
  assert.match(html, /尚未完成逐步源码审计/);
});

test("candidate repository is not claimed to be official", async () => {
  const html = await renderModel("mlanet");
  assert.match(html, /候选相关仓库，与论文的官方对应关系尚未确认/);
});

test("documentation-only repository is not presented as implementation code", async () => {
  const html = await renderModel("mara");
  assert.match(html, /该固定版本仅含文档和图片，未包含实现代码/);
});

test("nonlocal classification does not imply only message passing", async () => {
  const html = await renderModel("dpa4c-lr");
  assert.match(html, /可能存在多层传递或全局相互作用/);
});
