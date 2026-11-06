#!/usr/bin/env python3
"""Extract public benchmark numbers from the cloned benchmark repos into docs/data/benchmarks.js.

Sources (all read from the local shallow clones under sources/):
  * Matbench Discovery  sources/matbench-discovery/models/*/*.yml
  * MLIP Arena          sources/mlip-arena/benchmarks/{stability,combustion,eos_bulk}

Nothing is invented: every number is copied (or aggregated with a documented, trivial
statistic such as a median) from those files. Benchmark entries are linked to the
architecture pages through the `mbdKeys` / `arenaKeys` fields of data/models/*.json.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import yaml

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "sources"
OUT = ROOT / "docs" / "data" / "benchmarks.js"


def num(x):
    if isinstance(x, bool) or x is None:
        return None
    if isinstance(x, (int, float)):
        x = float(x)
        return x if math.isfinite(x) else None
    return None


def rnd(x, n=4):
    x = num(x)
    if x is None:
        return None
    if x == 0:
        return 0.0
    digits = n - int(math.floor(math.log10(abs(x)))) - 1
    return round(x, max(digits, 0))


def manifest():
    rows = {}
    p = SRC / "MANIFEST.tsv"
    for line in p.read_text().splitlines():
        parts = line.split("\t")
        if len(parts) >= 4:
            rows[parts[0]] = {"url": parts[1], "commit": parts[2], "date": parts[3]}
    return rows


def model_maps():
    mbd, arena = {}, {}
    for f in sorted((ROOT / "data" / "models").glob("*.json")):
        m = json.loads(f.read_text())
        for k in m.get("mbdKeys") or []:
            mbd[k] = m["id"]
        for k in m.get("arenaKeys") or []:
            arena[k] = m["id"]
    return mbd, arena


# --------------------------------------------------------------------------- MBD
DISC_KEYS = ["F1", "DAF", "Precision", "Recall", "Accuracy", "MAE", "RMSE", "R2"]
PHONON_KEYS = ["κ_SRME", "κ_SRE", "κ_SRD", "κ_failure_rate", "imaginary_mode_rate", "spectrum_w1"]
GEO_KEYS = ["rmsd", "n_sym_ops_mae", "symmetry_decrease", "symmetry_match", "symmetry_increase"]
DIA_KEYS = [
    "pbe_energy_mae", "pbe_force_mae", "pbe_bond_length_error", "pbe_well_depth_error",
    "pbe_vib_freq_error", "tortuosity", "energy_diff_flips", "energy_jump", "force_flips",
    "force_total_variation", "force_jump",
]
MD_KEYS = ["energy_rmse", "force_rmse", "rdf_error", "adf_error", "vdos_error", "pressure_mae",
           "pressure_error", "n_systems"]


def pick(d, keys):
    if not isinstance(d, dict):
        return None
    out = {k: rnd(d.get(k)) for k in keys}
    out = {k: v for k, v in out.items() if v is not None}
    return out or None


def find_costs(node, path=()):
    """Yield (task_path, cost_dict) for every `cost:` mapping inside metrics."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "cost" and isinstance(v, dict):
                yield "/".join(path), v
            else:
                yield from find_costs(v, path + (str(k),))


def names_of(ts):
    if isinstance(ts, dict):
        return list(ts.keys())
    if isinstance(ts, list):
        out = []
        for t in ts:
            out.append(t if isinstance(t, str) else (list(t.keys())[0] if isinstance(t, dict) and t else str(t)))
        return out
    if isinstance(ts, str):
        return [ts]
    return []


def extract_mbd(mbd_map, man):
    base = SRC / "matbench-discovery" / "models"
    commit = man.get("matbench-discovery", {}).get("commit", "main")
    repo_url = man.get("matbench-discovery", {}).get("url", "https://github.com/janosh/matbench-discovery")
    rows, errors = [], []
    for f in sorted(base.glob("*/*.yml")):
        try:
            d = yaml.safe_load(f.read_text())
        except Exception as e:  # noqa: BLE001
            errors.append(f"{f.relative_to(base)}: {e.__class__.__name__}")
            continue
        if not isinstance(d, dict) or "model_key" not in d:
            continue
        hp = d.get("hyperparams") or {}
        arch_hp = hp.get("architecture") if isinstance(hp.get("architecture"), dict) else {}
        radius = num(hp.get("graph_construction_radius")) or num(arch_hp.get("graph_construction_radius"))
        max_nb = num(hp.get("max_neighbors")) or num(arch_hp.get("max_neighbors"))
        dates = d.get("dates") or {}
        met = d.get("metrics") or {}
        disc = met.get("discovery") if isinstance(met.get("discovery"), dict) else {}
        geo = met.get("geo_opt") if isinstance(met.get("geo_opt"), dict) else {}
        ph = (met.get("phonons") or {}) if isinstance(met.get("phonons"), dict) else {}
        costs = []
        for task, c in find_costs(met):
            sec = num(c.get("run_time_sec"))
            if sec is None:
                continue
            costs.append({
                "task": task,
                "hardware": c.get("hardware"),
                "sec": rnd(sec, 5),
                "shards": num(c.get("n_shards")),
                "source": c.get("source"),
            })
        lic = d.get("license") or {}
        row = {
            "key": d.get("model_key"),
            "name": d.get("model_name"),
            "version": str(d.get("model_version")) if d.get("model_version") is not None else None,
            "file": f"{repo_url}/blob/{commit}/models/{f.parent.name}/{f.name}",
            "added": str(dates.get("benchmark_added") or d.get("date_added") or "") or None,
            "published": str(dates.get("paper_published") or d.get("date_published") or "") or None,
            "paper": d.get("paper"),
            "repo": d.get("repo"),
            "openness": d.get("openness"),
            "trainTask": d.get("train_task"),
            "targets": d.get("targets"),
            "trainingSets": names_of(d.get("training_set") or d.get("training_sets")),
            "params": num(d.get("model_params")) or None,
            "licenseCode": lic.get("code") if isinstance(lic, dict) else None,
            "radius": radius,
            "maxNeighbors": max_nb,
            "discovery": pick(disc.get("unique_prototypes"), DISC_KEYS),
            "discoveryFull": pick(disc.get("full_test_set"), ["F1", "DAF", "MAE"]),
            "phonons": pick(ph.get("kappa_103"), PHONON_KEYS),
            "geo": pick(geo.get("symprec=1e-5"), GEO_KEYS),
            "diatomics": pick(met.get("diatomics"), DIA_KEYS),
            "md": pick(met.get("md"), MD_KEYS),
            "costs": costs or None,
            "modelId": mbd_map.get(d.get("model_key")),
        }
        rows.append({k: v for k, v in row.items() if v not in (None, [], {})})
    return rows, errors


# ------------------------------------------------------------------------ Arena
def extract_arena_stability(arena_map):
    import pandas as pd

    base = SRC / "mlip-arena" / "benchmarks" / "stability"
    out = []
    for f in sorted(base.glob("*/*.parquet")):
        stem = f.stem
        if stem.endswith("-heating"):
            name, kind = stem[: -len("-heating")], "heating"
        elif stem.endswith("-compression"):
            name, kind = stem[: -len("-compression")], "compression"
        else:
            continue
        df = pd.read_parquet(f, columns=["formula", "natoms", "steps_per_second", "normalized_final_step"])
        runs = df.groupby("formula").agg(
            natoms=("natoms", "first"),
            sps=("steps_per_second", "median"),
            fin=("normalized_final_step", "max"),
        )
        runs = runs[runs["sps"].notna()]
        pts = [[int(r.natoms), rnd(r.sps, 3), rnd(min(r.fin, 1.0), 3)] for r in runs.itertuples()]
        pts.sort()
        atom_steps = (runs["natoms"] * runs["sps"]).median()
        # same power-law fit as MLIP Arena's serve/tasks/stability.py: sps ≈ a · N^(-n)
        ok = runs[(runs["natoms"] > 0) & (runs["sps"] > 0)]
        fit = None
        if len(ok) >= 5:
            slope, icpt = np.polyfit(np.log(ok["natoms"].astype(float)), np.log(ok["sps"].astype(float)), 1)
            fit = {"a": rnd(math.exp(icpt), 4), "n": rnd(-slope, 3)}
        out.append({
            "name": name,
            "kind": kind,
            "family": f.parent.name,
            "runs": len(runs),
            "completed": rnd((runs["fin"] >= 0.98).mean(), 3),
            "meanFinal": rnd(runs["fin"].clip(upper=1.0).mean(), 3),
            "medianSps": rnd(runs["sps"].median(), 3),
            "medianAtomSteps": rnd(atom_steps, 3),
            "fit": fit,
            "points": pts,
            "modelId": arena_map.get(name),
        })
    return out


def extract_arena_combustion(arena_map):
    base = SRC / "mlip-arena" / "benchmarks" / "combustion"
    out = []
    for f in sorted(base.glob("*/*.json")):
        recs = json.loads(f.read_text())
        for r in recs if isinstance(recs, list) else [recs]:
            tgt = num(r.get("target_steps")) or None
            fin = num(r.get("final_step"))
            out.append({
                "name": r.get("method"),
                "natoms": r.get("natoms"),
                "sps": rnd(r.get("steps_per_second"), 4),
                "hours": rnd((num(r.get("total_time_seconds")) or 0) / 3600, 3),
                "finalFrac": rnd(fin / tgt, 4) if (fin is not None and tgt) else None,
                "yield": rnd(r.get("yield"), 4),
                "modelId": arena_map.get(r.get("method")),
            })
    return out


def extract_arena_eos(arena_map):
    import pandas as pd

    p = SRC / "mlip-arena" / "benchmarks" / "eos_bulk" / "leaderboard.csv"
    df = pd.read_csv(p)
    out = []
    for r in df.to_dict("records"):
        row = {k: (rnd(v) if isinstance(v, float) else v) for k, v in r.items()}
        row["modelId"] = arena_map.get(r["model"])
        out.append(row)
    return out


def main():
    man = manifest()
    mbd_map, arena_map = model_maps()
    mbd, errs = extract_mbd(mbd_map, man)
    stab = extract_arena_stability(arena_map)
    comb = extract_arena_combustion(arena_map)
    eos = extract_arena_eos(arena_map)
    mbd_c = man.get("matbench-discovery", {})
    ar_c = man.get("mlip-arena", {})
    data = {
        "sources": {
            "mbd": {"url": mbd_c.get("url"), "commit": mbd_c.get("commit"), "date": mbd_c.get("date")},
            "arena": {"url": ar_c.get("url"), "commit": ar_c.get("commit"), "date": ar_c.get("date")},
        },
        "mbd": mbd,
        "arenaStability": stab,
        "arenaCombustion": comb,
        "arenaEos": eos,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text("window.MLFF_BENCH=" + txt + ";\n", encoding="utf-8")
    linked = sorted({r["modelId"] for r in mbd if r.get("modelId")})
    missing = sorted(set(mbd_map) - {r["key"] for r in mbd})
    print(f"MBD: {len(mbd)} entries ({len(errs)} yaml errors), linked to {len(linked)} architecture pages")
    if errs:
        print("  yaml errors:", *errs, sep="\n    ")
    if missing:
        print("  WARNING mbdKeys not found in MBD:", missing)
    a_missing = sorted(set(arena_map) - {r["name"] for r in stab} - {r["name"] for r in comb} - {r["model"] for r in eos})
    print(f"Arena: stability {len(stab)} sets, combustion {len(comb)}, eos {len(eos)}")
    if a_missing:
        print("  note: arenaKeys without stability/combustion/eos data:", a_missing)
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
