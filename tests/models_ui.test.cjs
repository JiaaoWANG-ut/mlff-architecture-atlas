"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function setup(family = "") {
  const window = {};
  vm.runInNewContext(read("docs/data/index.js"), { window });
  const data = window.MLFF;
  const elements = {};
  let chips = [];

  function element() {
    const listeners = {};
    return {
      value: "", textContent: "", innerHTML: "",
      addEventListener(type, fn) { listeners[type] = fn; },
      dispatch(type) { listeners[type]?.(); },
    };
  }
  for (const id of ["total-models", "total-families", "total-literature", "q", "forces", "local", "lr", "sort", "reset-filters", "count", "cards"]) {
    elements[id] = element();
  }
  elements.sort.value = "family";
  elements["fam-chips"] = element();
  Object.defineProperty(elements["fam-chips"], "innerHTML", {
    set(html) {
      chips = [...html.matchAll(/data-f="([^"]+)"/g)].map((match) => {
        const chip = element();
        const classes = new Set();
        chip.dataset = { f: match[1] };
        chip.attributes = {};
        chip.classList = {
          toggle(name, on) { on ? classes.add(name) : classes.delete(name); },
          remove(name) { classes.delete(name); },
        };
        chip.setAttribute = (name, value) => { chip.attributes[name] = value; };
        chip.click = () => chip.dispatch("click");
        return chip;
      });
    },
  });
  const document = {
    getElementById: (id) => elements[id],
    querySelectorAll: () => chips,
    querySelector: (selector) => chips.find((chip) => selector.includes(`data-f="${chip.dataset.f}"`)),
  };
  const context = {
    window, document,
    mountChrome() {},
    param: () => family,
    FAMILY: Object.fromEntries(data.families.map((f) => [f, { name: f }])),
    famColor: () => "#123456",
    esc: (value) => String(value ?? ""),
    fmt: (value) => value == null ? "—" : String(value),
    forcesBadge: (value) => value,
    modelLink: (model) => `model.html?id=${model.id}`,
  };
  const script = read("docs/models.html").match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, context);
  return { elements, chips, data };
}

test("search and force filters narrow the catalog without losing provisional models", () => {
  const { elements } = setup();
  elements.q.value = "FACTO";
  elements.q.dispatch("input");
  assert.equal(elements.count.textContent, "1");
  assert.match(elements.cards.innerHTML, /FACTO/);
  assert.match(elements.cards.innerHTML, /文献初录/);
  elements.forces.value = "direct";
  elements.forces.dispatch("input");
  assert.equal(elements.count.textContent, "0");
  assert.match(elements.cards.innerHTML, /没有找到匹配的模型/);
});

test("family links initialize filtering and reset clears every control", () => {
  const { elements, chips, data } = setup("spherical-equivariant");
  const selected = chips.find((chip) => chip.dataset.f === "spherical-equivariant");
  assert.equal(selected.attributes["aria-pressed"], "true");
  assert.equal(Number(elements.count.textContent), data.models.filter((m) => m.family === "spherical-equivariant").length);
  elements.q.value = "FACTO";
  elements.forces.value = "unknown";
  elements.local.value = "0";
  elements.lr.value = "none";
  elements.sort.value = "year";
  elements["reset-filters"].dispatch("click");
  assert.equal(Number(elements.count.textContent), data.models.length);
  assert.equal(selected.attributes["aria-pressed"], "false");
  for (const id of ["q", "forces", "local", "lr"]) assert.equal(elements[id].value, "");
  assert.equal(elements.sort.value, "family");
});
