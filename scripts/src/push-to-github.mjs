#!/usr/bin/env node
/**
 * Push file ke GitHub menggunakan Git Tree API (parallel blob upload)
 * Usage: node scripts/src/push-to-github.mjs
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
const OWNER = "rutetravelindonesia";
const REPO = "Rute-travel";
const BRANCH = "main";
const WORKSPACE = "/home/runner/workspace";
const CONCURRENCY = 10;

if (!TOKEN) { console.error("GITHUB_PERSONAL_ACCESS_TOKEN tidak ditemukan"); process.exit(1); }

const IGNORE = new Set([
  "node_modules", ".git", "dist", ".replit-artifact",
  "attached_assets", ".local", "tmp", ".cache", "coverage", "pnpm-lock.yaml",
]);
const IGNORE_EXT = new Set([".map", ".log"]);

async function ghFetch(path, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GitHub API ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

function collectFiles(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORE.has(entry) || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectFiles(full, base));
    } else {
      const ext = entry.includes(".") ? "." + entry.split(".").pop() : "";
      if (IGNORE_EXT.has(ext)) continue;
      if (stat.size > 1_000_000) continue;
      files.push({ path: relative(base, full), fullPath: full });
    }
  }
  return files;
}

async function createBlob(file) {
  let content;
  try { content = readFileSync(file.fullPath); } catch { return null; }
  const isBinary = content.includes(0);
  const blob = await ghFetch(`/repos/${OWNER}/${REPO}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({
      content: content.toString(isBinary ? "base64" : "utf-8"),
      encoding: isBinary ? "base64" : "utf-8",
    }),
  });
  return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
}

async function runInBatches(items, fn, concurrency) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    for (const r of batchResults) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
    }
    process.stdout.write(`  ${Math.min(i + concurrency, items.length)}/${items.length} diproses...\r`);
  }
  return results;
}

async function main() {
  console.log("Menghubungi GitHub...");
  const refData = await ghFetch(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const latestSha = refData.object.sha;
  const treeRes = await ghFetch(`/repos/${OWNER}/${REPO}/git/commits/${latestSha}`);
  const baseTreeSha = treeRes.tree.sha;
  console.log(`Base commit: ${latestSha.slice(0, 7)}`);

  const files = collectFiles(WORKSPACE);
  console.log(`Ditemukan ${files.length} file. Membuat blob (parallel)...\n`);

  const treeItems = await runInBatches(files, createBlob, CONCURRENCY);
  console.log(`\n${treeItems.length} blob berhasil dibuat.\n`);

  console.log("Membuat tree...");
  const newTree = await ghFetch(`/repos/${OWNER}/${REPO}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
  });

  console.log("Membuat commit...");
  const now = new Date().toLocaleString("id-ID", { timeZone: "Asia/Makassar" });
  const newCommit = await ghFetch(`/repos/${OWNER}/${REPO}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `chore: sync dari Replit — ${now} WITA`,
      tree: newTree.sha,
      parents: [latestSha],
    }),
  });

  console.log("Mengupdate branch main...");
  await ghFetch(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: newCommit.sha, force: true }),
  });

  console.log(`\n✓ Berhasil! Commit: ${newCommit.sha.slice(0, 7)}`);
  console.log(`  https://github.com/${OWNER}/${REPO}/commit/${newCommit.sha}`);
}

main().catch((err) => { console.error("\nError:", err.message); process.exit(1); });
