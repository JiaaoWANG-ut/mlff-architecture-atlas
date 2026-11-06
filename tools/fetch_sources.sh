#!/usr/bin/env bash
# Clone every source repo into sources/ and write sources/MANIFEST.tsv.
#   bash tools/fetch_sources.sh            # pinned commits from data/MANIFEST.tsv (reproduces the site exactly)
#   bash tools/fetch_sources.sh --latest   # newest default-branch HEAD of every repo in tools/repos.tsv
set -u
cd "$(dirname "$0")/.."
mkdir -p sources
export GIT_TERMINAL_PROMPT=0

clone_one() {
  name="$1"; url="$2"; commit="${3:-}"; d="sources/$name"
  if [[ -d "$d/.git" ]]; then echo "skip $name"; return 0; fi
  if [[ -z "$commit" ]]; then
    git clone --depth 1 --quiet "$url" "$d" 2>"sources/.$name.err"
  else
    # fetch exactly the pinned commit; fall back to a full clone if the host refuses fetch-by-SHA
    { git init -q "$d" && git -C "$d" remote add origin "$url" &&
      git -C "$d" fetch --depth 1 --quiet origin "$commit" && git -C "$d" checkout --quiet FETCH_HEAD; } 2>"sources/.$name.err" ||
    { rm -rf "$d" && git clone --quiet "$url" "$d" && git -C "$d" checkout --quiet "$commit"; } 2>>"sources/.$name.err"
  fi
  if [[ $? -eq 0 ]]; then
    rm -f "sources/.$name.err"; echo "ok   $name"
  else
    echo "FAIL $name ($(tail -1 "sources/.$name.err"))"
  fi
}
export -f clone_one

if [[ "${1:-}" != "--latest" && -f data/MANIFEST.tsv ]]; then
  tail -n +2 data/MANIFEST.tsv | cut -f1-3 | xargs -P 8 -L 1 bash -c 'clone_one "$0" "$1" "$2"'
  list_repos() { tail -n +2 data/MANIFEST.tsv | cut -f1,2; }
else
  xargs -P 8 -L 1 bash -c 'clone_one "$0" "$1"' < tools/repos.tsv
  list_repos() { cat tools/repos.tsv; }
fi

{
  printf "name\turl\tcommit\tdate\n"
  list_repos | while IFS=$'\t' read -r name url; do
    d="sources/$name"
    [[ -d "$d/.git" ]] || continue
    printf "%s\t%s\t%s\t%s\n" "$name" "$url" "$(git -C "$d" rev-parse HEAD)" "$(git -C "$d" log -1 --format=%cs)"
  done
} > sources/MANIFEST.tsv
echo "manifest: $(($(wc -l < sources/MANIFEST.tsv) - 1)) repos"
