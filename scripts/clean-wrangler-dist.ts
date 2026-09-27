import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const targetPath = resolve(process.cwd(), "dist/monthexpense/wrangler.json");

if (existsSync(targetPath)) {
  try {
    const content = JSON.parse(readFileSync(targetPath, "utf-8"));
    delete content.exports;
    delete content.connect;
    delete content.agent_memory;
    writeFileSync(targetPath, JSON.stringify(content), "utf-8");
  } catch (error) {
    console.warn("Failed to sanitize dist/monthexpense/wrangler.json:", error);
  }
}
