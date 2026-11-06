#!/usr/bin/env python3
"""Merge data/models/*.json, validate them, embed exact source excerpts, write docs/data/models.js."""
import json
import re
import sys
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "sources"
MODELS_DIR = ROOT / "data" / "models"
OUT = ROOT / "docs" / "data" / "models.js"

FAMILIES = [
    "descriptor-nn", "linear-kernel", "invariant-mpnn", "cartesian-equivariant",
    "spherical-equivariant", "unconstrained", "long-range-module", "infrastructure",
]
STAGES = [
    "input", "graph", "geometry", "embedding", "interaction", "readout",
    "energy", "longrange", "forces", "stress", "output",
]
FORCES = ["conservative", "direct", "both", "n/a"]
SCORE_KEYS = ["speed", "expressiveness", "longRange", "scalability", "physics", "coverage"]
ARCH_KEYS = [
    "geometry", "equivariance", "lmax", "bodyOrder", "layers", "cutoff", "receptiveField",
    "message", "readout", "forces", "forcesDetail", "stress", "longRange", "dispersion",
    "chargeSpin", "otherOutputs", "strictlyLocal", "complexity", "accel",
]
REQUIRED = [
    "id", "name", "fullName", "year", "paper", "repos", "family", "tags", "framework",
    "license", "oneLiner", "analogy", "arch", "scores", "steps", "hyper", "speedNotes",
    "weakNotes", "downstreamNotes", "strengths", "weaknesses", "pretrained", "mbdKeys",
]
COMPONENT_FAMILIES = ("infrastructure", "long-range-module")
ARENA_KEYS = [
    "MACE-MP(M)", "CHGNet", "M3GNet", "MatterSim", "ORBv2", "SevenNet", "eqV2(OMat)", "MACE-MPA",
    "eSEN", "EquiformerV2(OC22)", "EquiformerV2(OC20)", "eSCN(OC20)", "MACE-OFF(M)", "ANI2x",
    "ALIGNN", "DeepMD", "ORB", "PET-OAM", "PET-MAD", "NequIP-OAM-L", "UMA-S-1P1",
]
MAX_EXCERPT = 45


def load_mbd_keys():
    keys = set()
    for f in (SRC / "matbench-discovery" / "models").glob("*/*.yml"):
        m = re.search(r"^model_key:\s*(\S+)", f.read_text(errors="replace"), re.M)
        if m:
            keys.add(m.group(1).strip("'\""))
    return keys


def load_manifest():
    rows = {}
    lines = (SRC / "MANIFEST.tsv").read_text().splitlines()[1:]
    for line in lines:
        name, url, commit, date = line.split("\t")
        rows[name] = {"url": url, "commit": commit, "date": date}
    return rows


def permalink(repo_url, commit, file, start, end):
    base = repo_url.rstrip("/")
    if "gitlab.com" in base:
        return f"{base}/-/blob/{commit}/{file}#L{start}-{end}"
    return f"{base}/blob/{commit}/{file}#L{start}-L{end}"


def resolve_code(ref, default_repo, manifest, errs, where):
    repo = ref.get("repo", default_repo)
    if repo not in manifest:
        errs.append(f"{where}: unknown repo '{repo}'")
        return None
    path = SRC / repo / ref["file"]
    if not path.is_file():
        errs.append(f"{where}: missing file {repo}/{ref['file']}")
        return None
    lines = path.read_text(errors="replace").splitlines()
    start, end = int(ref["start"]), int(ref["end"])
    if not (1 <= start <= end <= len(lines)):
        errs.append(f"{where}: bad range {start}-{end} (file has {len(lines)} lines) in {repo}/{ref['file']}")
        return None
    if end - start + 1 > MAX_EXCERPT:
        errs.append(f"{where}: excerpt {start}-{end} longer than {MAX_EXCERPT} lines in {repo}/{ref['file']}")
        return None
    excerpt = "\n".join(lines[start - 1:end])
    must = ref.get("must")
    if not must:
        errs.append(f"{where}: code ref needs a 'must' anchor string")
    elif must not in excerpt:
        errs.append(f"{where}: anchor {must!r} not found in {repo}/{ref['file']}:{start}-{end}")
    lang = ref.get("lang") or {
        ".py": "python", ".jl": "julia", ".cu": "cpp", ".cuh": "cpp", ".cpp": "cpp", ".h": "cpp",
        ".hpp": "cpp", ".cc": "cpp", ".f90": "fortran", ".F90": "fortran", ".f95": "fortran",
        ".yaml": "yaml", ".yml": "yaml", ".json": "json",
    }.get(path.suffix, "plaintext")
    m = manifest[repo]
    return {
        "repo": repo, "file": ref["file"], "start": start, "end": end, "lang": lang,
        "excerpt": textwrap.dedent(excerpt), "caption": ref.get("caption", ""),
        "url": permalink(m["url"], m["commit"], ref["file"], start, end),
    }


def validate_and_build(model, manifest, mbd_keys):
    errs = []
    mid = model.get("id", "?")
    component = model.get("family") in COMPONENT_FAMILIES
    for k in REQUIRED:
        if k not in model and not (component and k == "scores"):
            errs.append(f"{mid}: missing field '{k}'")
    if errs:
        return None, errs
    if model["family"] not in FAMILIES:
        errs.append(f"{mid}: bad family {model['family']}")
    for r in model["repos"]:
        if r not in manifest:
            errs.append(f"{mid}: unknown repo {r}")
    arch = model["arch"]
    for k in ARCH_KEYS:
        if k not in arch:
            errs.append(f"{mid}: arch missing '{k}'")
    if arch.get("forces") not in FORCES:
        errs.append(f"{mid}: arch.forces must be one of {FORCES}")
    if not isinstance(arch.get("strictlyLocal"), bool):
        errs.append(f"{mid}: arch.strictlyLocal must be bool")
    if model.get("scores") or not component:
        for k in SCORE_KEYS:
            s = model["scores"].get(k)
            if not (isinstance(s, dict) and isinstance(s.get("v"), int) and 1 <= s["v"] <= 5 and s.get("why")):
                errs.append(f"{mid}: scores.{k} must be {{v:1-5, why:str}}")
    else:
        model["scores"] = None
    for k in model["mbdKeys"]:
        if k not in mbd_keys:
            errs.append(f"{mid}: unknown Matbench Discovery model_key '{k}'")
    for k in model.setdefault("arenaKeys", []):
        if k not in ARENA_KEYS:
            errs.append(f"{mid}: unknown MLIP Arena key '{k}' (allowed: {ARENA_KEYS})")
    default_repo = model["repos"][0] if model["repos"] else None
    seen_stages = set()
    for i, st in enumerate(model["steps"]):
        where = f"{mid}.steps[{i}]"
        if st.get("stage") not in STAGES:
            errs.append(f"{where}: bad stage {st.get('stage')}")
        seen_stages.add(st.get("stage"))
        for k in ("title", "plain"):
            if not st.get(k):
                errs.append(f"{where}: missing {k}")
        resolved = []
        for j, ref in enumerate(st.get("code", [])):
            c = resolve_code(ref, default_repo, manifest, errs, f"{where}.code[{j}]")
            if c:
                resolved.append(c)
        st["code"] = resolved
    if not component:
        for need in ("interaction", "energy"):
            if need not in seen_stages:
                errs.append(f"{mid}: steps must include stage '{need}'")
        if arch.get("forces") != "n/a" and "forces" not in seen_stages:
            errs.append(f"{mid}: steps must include stage 'forces'")
    for i, h in enumerate(model["hyper"]):
        if "code" in h and h["code"]:
            h["code"] = resolve_code(h["code"], default_repo, manifest, errs, f"{mid}.hyper[{i}]")
    model["sources"] = {r: manifest[r] for r in model["repos"] if r in manifest}
    return model, errs


def main():
    manifest = load_manifest()
    mbd_keys = load_mbd_keys()
    only = set(sys.argv[1:])
    models, all_errs = [], []
    for f in sorted(MODELS_DIR.glob("*.json")):
        if only and f.stem not in only:
            continue
        try:
            model = json.loads(f.read_text())
        except json.JSONDecodeError as e:
            all_errs.append(f"{f.name}: JSON error {e}")
            continue
        if model.get("id") != f.stem:
            all_errs.append(f"{f.name}: id must equal file stem")
        built, errs = validate_and_build(model, manifest, mbd_keys)
        all_errs += errs
        if built:
            models.append(built)
    ids = [m["id"] for m in models]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        all_errs.append(f"duplicate ids: {dup}")
    for e in all_errs:
        print("ERROR", e)
    if only:
        print(f"checked {len(models)} model(s), {len(all_errs)} error(s)")
        return 1 if all_errs else 0
    models.sort(key=lambda m: (FAMILIES.index(m["family"]), m["year"], m["name"].lower()))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()
    per_dir = OUT.parent / "models"
    per_dir.mkdir(exist_ok=True)
    for old in per_dir.glob("*.js"):
        old.unlink()
    light = []
    steps = {}
    for m in models:
        (per_dir / f"{m['id']}.js").write_text(
            "window.MLFF_MODEL = " + json.dumps(m, ensure_ascii=False, separators=(",", ":")) + ";\n")
        lm = {k: v for k, v in m.items() if k not in ("steps", "hyper")}
        lm["steps"] = [{"stage": s["stage"], "title": s["title"]} for s in m["steps"]]
        light.append(lm)
        steps[m["id"]] = [{k: s.get(k, "") for k in ("stage", "title", "plain", "math")} for s in m["steps"]]
    curated = json.loads((ROOT / "data" / "curated.json").read_text())
    curated.pop("_doc", None)
    ids = {m["id"] for m in models}
    for k in sorted(ids ^ set(curated)):
        e = f"curated.json: id '{k}' {'missing' if k in ids else 'unknown'}"
        print("ERROR", e)
        all_errs.append(e)
    index = OUT.parent / "index.js"
    payload = {"families": FAMILIES, "stages": STAGES, "manifest": manifest, "models": light, "curated": curated}
    index.write_text("window.MLFF = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n")
    (OUT.parent / "steps.js").write_text(
        "window.MLFF_STEPS = " + json.dumps(steps, ensure_ascii=False, separators=(",", ":")) + ";\n")
    size = sum(p.stat().st_size for p in per_dir.glob("*.js"))
    print(f"wrote {index.relative_to(ROOT)} ({index.stat().st_size:,} B) + {len(models)} files in "
          f"{per_dir.relative_to(ROOT)} ({size:,} B), {len(all_errs)} error(s)")
    return 1 if all_errs else 0


if __name__ == "__main__":
    sys.exit(main())
