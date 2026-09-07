import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "dist");
const target = path.join(root, "desktop-dist");

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
fs.renameSync(path.join(target, "node_modules"), path.join(target, "runtime"));

// Next's traced server keeps some external packages under .next/node_modules.
// Keep the libSQL dependency tree available from that exact lookup location.
// The standalone server resolves external packages from .next/node_modules.
// Copy the complete traced runtime there so nested dependencies are available
// too (for example @libsql/core, libsql, and promise-limit).
const nextModulesTarget = path.join(target, ".next", "node_modules");
fs.cpSync(path.join(target, "runtime"), nextModulesTarget, { recursive: true });
fs.cpSync(path.join(root, "app", "icon.svg"), path.join(target, "public", "icon.svg"));
fs.cpSync(path.join(root, "build", "icon.png"), path.join(target, "public", "icon.png"));

// The offline desktop build does not include the optional Claude Code runtime.
for (const runtimePath of [
	path.join(target, "runtime", "@anthropic-ai"),
	path.join(target, ".next", "node_modules", "@anthropic-ai"),
]) {
	fs.rmSync(runtimePath, { recursive: true, force: true });
}
console.log("desktop-dist/ 준비 완료 — runtime/으로 의존성을 포함했습니다.");