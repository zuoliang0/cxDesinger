#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const command = process.argv[2];
const pageId = process.argv[3];

function usage() {
  console.error("Usage: node scripts/project-data.mjs <list-pages|get-page|get-page-assets|get-page-selections> [pageId]");
  process.exit(1);
}

async function readJson(relativePath) {
  const absolutePath = path.resolve(projectRoot, relativePath);
  const relative = path.relative(projectRoot, absolutePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to read outside project: ${relativePath}`);
  }

  return JSON.parse(await fs.readFile(absolutePath, "utf8"));
}

async function readProjectIndex() {
  return readJson("pages.json");
}

async function findPageIndex(id) {
  const index = await readProjectIndex();
  const page = index.pages?.find((item) => item.id === id);

  if (!page) {
    throw new Error(`Page not found: ${id}`);
  }

  return page;
}

async function readPageFile(id, fileName) {
  const page = await findPageIndex(id);
  const dataDir = page.dataDir || `pages/${id}`;

  return readJson(`${dataDir}/${fileName}`);
}

try {
  if (!command) {
    usage();
  }

  if (command === "list-pages") {
    const index = await readProjectIndex();
    console.log(JSON.stringify(index.pages || [], null, 2));
  } else if (command === "get-page") {
    if (!pageId) usage();
    console.log(JSON.stringify(await readPageFile(pageId, "page.json"), null, 2));
  } else if (command === "get-page-assets") {
    if (!pageId) usage();
    console.log(JSON.stringify(await readPageFile(pageId, "assets.json"), null, 2));
  } else if (command === "get-page-selections") {
    if (!pageId) usage();
    console.log(JSON.stringify(await readPageFile(pageId, "slice-selections.json"), null, 2));
  } else {
    usage();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
