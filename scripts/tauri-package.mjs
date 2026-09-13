import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const runtime = path.join(root, "src-tauri", "runtime");
const app = path.join(runtime, "app");
const nodePath = process.execPath;

if (!fs.existsSync(path.join(root, "dist", "server.js"))) {
  console.error("dist/server.js가 없습니다. 먼저 npm run package를 실행하세요.");
  process.exit(1);
}

fs.rmSync(runtime, { recursive: true, force: true });
fs.mkdirSync(runtime, { recursive: true });
fs.cpSync(path.join(root, "dist"), app, { recursive: true, dereference: true });
fs.rmSync(path.join(app, ".next", "node_modules"), { recursive: true, force: true });
fs.cpSync(path.join(app, "node_modules"), path.join(app, ".next", "node_modules"), {
  recursive: true,
  dereference: true,
});
const tracedLibsqlSource = path.join(root, "dist", ".next", "node_modules", "@libsql");
const tracedLibsqlTarget = path.join(app, ".next", "node_modules", "@libsql");
for (const entry of fs.readdirSync(tracedLibsqlSource, { withFileTypes: true })) {
  if (!entry.isSymbolicLink()) continue;
  const sourcePath = path.join(tracedLibsqlSource, entry.name);
  fs.cpSync(fs.realpathSync(sourcePath), path.join(tracedLibsqlTarget, entry.name), {
    recursive: true,
  });
}
fs.copyFileSync(nodePath, path.join(runtime, "node.exe"));

console.log("Tauri 리소스 준비 완료");
