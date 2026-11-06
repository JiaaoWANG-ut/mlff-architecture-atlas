#!/usr/bin/env python3
"""Write build/hints/<repo>.txt: a grep index of architecture-relevant lines per cloned repo.

Saves exploration time when authoring data/models/*.json.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "sources"
OUT = ROOT / "build" / "hints"
EXTS = {".py", ".jl", ".cu", ".cuh", ".cpp", ".cc", ".h", ".hpp", ".f90", ".F90"}
SKIP = re.compile(r"(^|/)(tests?|testing|docs?|examples?|benchmarks?|scripts|notebooks?|tutorials?|\.git|build|dist|third_party|3rdparty|legacy|deprecated)(/|$)", re.I)
PATTERNS = [
    ("classes/defs", r"^\s*(class \w+|def (forward|__call__|energy|compute_\w+|get_\w*(energy|force|stress)\w*)\b)"),
    ("neighbour list", r"neighbo(u)?r_?list|radius_graph|NeighborList|get_neighbo|build_nl|cell_list"),
    ("cutoff / envelope", r"cutoff_fn|cosine_cutoff|CosineCutoff|PolynomialCutoff|polynomial_cutoff|envelope|smooth_cutoff|switch(ing)?_func|fc\(|sw\("),
    ("radial basis", r"[Bb]essel|[Gg]aussian(Smearing|Basis|_rbf)|[Cc]hebyshev|RadialBasis|radial_basis|rbf\b|sinc\("),
    ("angular", r"spherical_harmonics|SphericalHarmonics|[Ll]egendre|cos_?theta|triplet|angle|dihedral|torsion"),
    ("tensor product / CG", r"TensorProduct|tensor_product|[Cc]lebsch|wigner|FullyConnectedTensorProduct|symmetric_contraction|SO2|so2_conv|einsum\("),
    ("message / aggregation", r"scatter(_add|_sum|_mean)?\(|index_add|segment_sum|propagate\(|aggregate|message\("),
    ("readout / energy", r"readout|Readout|atomic_energ|per_atom_energ|total_energy|scale_shift|ScaleShift|atom_ref|e0s?\b|energy_shift"),
    ("forces", r"autograd\.grad|jax\.grad|value_and_grad|GradientTape|tf\.gradients|torch\.func\.grad|grad_outputs|direct_force|force_head|forces\s*="),
    ("stress / virial", r"stress|virial|strain|displacement"),
    ("long-range / charge", r"[Ee]wald|[Cc]oulomb|electrostat|dispersion|dftd|[Dd]3\b|charge|qeq|[Ss]pin\b|dipole|polariz|magmom|[Zz]bl"),
    ("acceleration", r"cuequivariance|cue\.|openequivariance|triton|cuda|compile\(|jit|lammps|LAMMPS|half\(|bfloat16|float16"),
]
MAX_PER_PATTERN = 60


def scan(repo: Path):
    out = []
    files = [p for p in repo.rglob("*") if p.suffix in EXTS and p.is_file() and not SKIP.search(str(p.relative_to(repo)))]
    files.sort()
    out.append(f"# {repo.name}: {len(files)} code files (tests/docs/examples skipped)\n")
    for label, pat in PATTERNS:
        rx = re.compile(pat)
        hits = []
        for p in files:
            try:
                text = p.read_text(errors="replace").splitlines()
            except OSError:
                continue
            for i, line in enumerate(text, 1):
                if rx.search(line):
                    hits.append(f"{p.relative_to(repo)}:{i}: {line.strip()[:140]}")
        out.append(f"\n## {label} ({len(hits)} hits{', truncated' if len(hits) > MAX_PER_PATTERN else ''})")
        out += hits[:MAX_PER_PATTERN]
    return "\n".join(out) + "\n"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    names = sys.argv[1:] or sorted(p.name for p in SRC.iterdir() if p.is_dir())
    for name in names:
        repo = SRC / name
        if repo.is_dir():
            (OUT / f"{name}.txt").write_text(scan(repo))
            print("wrote", name)


if __name__ == "__main__":
    main()
