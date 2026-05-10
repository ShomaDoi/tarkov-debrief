// One-shot map optimizer. For each unique map name in src/maps/, picks the
// largest available source (.png > .jpg > .webp), resizes so the long axis
// is at most a configured cap, and re-encodes to WebP. Replaces the source
// files in place. Intended to be run manually:
//
//   pnpm optimize:maps
//
// Idempotent: running it twice on already-optimized files just overwrites
// them with the same output (within encoder noise).

import { readdir, stat, unlink, rename } from "node:fs/promises";
import { join, parse } from "node:path";
import sharp from "sharp";

const MAPS_DIR = new URL("../src/maps/", import.meta.url).pathname;

// Long-axis caps and quality. Thumbnails are deliberately a separate budget.
const FULL = { maxLongAxis: 4000, quality: 82, effort: 6 };
const THUMB = { maxLongAxis: 400, quality: 80, effort: 6 };

// Format priority when multiple sources exist for the same logical map: the
// earlier in this list, the more authoritative as a source. `.webp` wins
// because that's the format new map sources arrive in for this project —
// preferring `.png` would silently regress to older snapshots whenever
// someone drops in an updated map.
const FORMAT_PREFERENCE = [".webp", ".png", ".jpg", ".jpeg"];

// File whose extension matches one of these is considered a candidate source.
const IS_IMAGE = /\.(png|jpg|jpeg|webp)$/i;

const fmt = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

async function listImageFiles(dir) {
  const entries = await readdir(dir);
  return entries.filter((f) => IS_IMAGE.test(f));
}

// Group files by logical map name (filename stem without extension).
function groupByStem(files) {
  const groups = new Map();
  for (const file of files) {
    const stem = parse(file).name;
    if (!groups.has(stem)) groups.set(stem, []);
    groups.get(stem).push(file);
  }
  return groups;
}

async function pickSource(dir, candidates) {
  // For each candidate, get its size + format. Prefer by FORMAT_PREFERENCE,
  // tie-break by larger file size (proxy for higher source resolution).
  const enriched = await Promise.all(
    candidates.map(async (f) => {
      const path = join(dir, f);
      const s = await stat(path);
      const ext = parse(f).ext.toLowerCase();
      return { file: f, path, size: s.size, ext };
    }),
  );
  enriched.sort((a, b) => {
    const ai = FORMAT_PREFERENCE.indexOf(a.ext);
    const bi = FORMAT_PREFERENCE.indexOf(b.ext);
    if (ai !== bi) return ai - bi;
    return b.size - a.size;
  });
  return enriched[0];
}

async function optimize(srcPath, outPath, { maxLongAxis, quality, effort }) {
  const meta = await sharp(srcPath).metadata();
  const beforeBytes = (await stat(srcPath)).size;

  // sharp's resize with width OR height won't touch the file if both are
  // smaller; we want max-of-(w, h) <= cap, so compute which axis is larger
  // and apply that side's cap. withoutEnlargement keeps already-small
  // images untouched.
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
  const needsResize = longest > maxLongAxis;
  const resizeOpt = needsResize
    ? meta.width >= meta.height
      ? { width: maxLongAxis, withoutEnlargement: true }
      : { height: maxLongAxis, withoutEnlargement: true }
    : null;

  let pipeline = sharp(srcPath);
  if (resizeOpt) pipeline = pipeline.resize(resizeOpt);
  pipeline = pipeline.webp({ quality, effort });

  // Write to a temp file then rename, so an in-place replace is atomic and
  // sharp's read of srcPath isn't racing with the same path being written.
  const tmpPath = `${outPath}.tmp-${process.pid}`;
  await pipeline.toFile(tmpPath);
  const afterBytes = (await stat(tmpPath)).size;
  const outMeta = await sharp(tmpPath).metadata();
  await rename(tmpPath, outPath);

  return {
    beforeBytes,
    afterBytes,
    beforeDims: `${meta.width}×${meta.height}`,
    afterDims: `${outMeta.width}×${outMeta.height}`,
  };
}

async function main() {
  const files = await listImageFiles(MAPS_DIR);
  const groups = groupByStem(files);

  // Split logical maps into "thumbnails" and "full" by filename suffix.
  // Anything ending in `-thumbnail` is a thumbnail; everything else is full.
  const fullGroups = new Map();
  const thumbGroups = new Map();
  for (const [stem, candidates] of groups) {
    if (stem.endsWith("-thumbnail")) thumbGroups.set(stem, candidates);
    else fullGroups.set(stem, candidates);
  }

  const rows = [];
  let totalBefore = 0;
  let totalAfter = 0;

  for (const [stem, candidates] of [...fullGroups, ...thumbGroups]) {
    const isThumb = stem.endsWith("-thumbnail");
    const opts = isThumb ? THUMB : FULL;
    const source = await pickSource(MAPS_DIR, candidates);
    const outPath = join(MAPS_DIR, `${stem}.webp`);

    const { beforeBytes, afterBytes, beforeDims, afterDims } = await optimize(
      source.path,
      outPath,
      opts,
    );

    // Delete the redundant other formats AND any extra originals for this
    // stem. Skip the just-written webp.
    for (const file of candidates) {
      if (file === `${stem}.webp`) continue;
      await unlink(join(MAPS_DIR, file));
    }

    totalBefore += beforeBytes;
    totalAfter += afterBytes;

    rows.push({
      stem,
      kind: isThumb ? "thumb" : "full",
      sourceFmt: source.ext,
      before: fmt(beforeBytes),
      after: fmt(afterBytes),
      delta: `${(((afterBytes - beforeBytes) / beforeBytes) * 100).toFixed(0)}%`,
      dims: beforeDims === afterDims ? beforeDims : `${beforeDims} → ${afterDims}`,
    });
  }

  console.log("\nMap | Kind  | Src   | Before    | After     | Δ      | Dims");
  console.log("----|-------|-------|-----------|-----------|--------|------");
  for (const r of rows) {
    console.log(
      [
        r.stem.padEnd(24),
        r.kind.padEnd(5),
        r.sourceFmt.padEnd(5),
        r.before.padEnd(9),
        r.after.padEnd(9),
        r.delta.padEnd(6),
        r.dims,
      ].join(" | "),
    );
  }
  console.log(
    `\nTotal: ${fmt(totalBefore)} → ${fmt(totalAfter)} (${(
      ((totalAfter - totalBefore) / totalBefore) *
      100
    ).toFixed(0)}%)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
