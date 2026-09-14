import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const failures = [];
let count = 0;
function walk(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, item.name);
    if (item.isDirectory()) {
      walk(file);
      continue;
    }
    if (!/\.(tsx?|css)$/.test(file) || /\.test\./.test(file)) continue;
    count++;
    const source = readFileSync(file, "utf8");
    for (const [index, line] of source.split(/\r?\n/).entries()) {
      const checks = [
        [/!?text-\[(?:\d|\.|calc\(|clamp\()/, "使用公共语义字号，避免页面自行定义数值字号"],
        [/!text-/, "通过组件变体或 cn() 合并样式，不使用 !text-*"],
        [/text-(?:muted-foreground|subtle|dark-muted)\//, "文字使用不透明语义色，避免降低对比度"],
        [/\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b/, "使用 text-body、text-table、text-caption 等项目字号"],
      ];
      for (const [pattern, message] of checks) if (pattern.test(line)) failures.push(`${relative(root, file)}:${index + 1} ${message}`);
      if (
        /font-size\s*:/.test(line) &&
        !/font-size:\s*var\(--text-[a-z-]+\)/.test(line) &&
        !(file === join(root, "styles.css") && /font-size:\s*100%/.test(line))
      )
        failures.push(`${relative(root, file)}:${index + 1} CSS 字号必须引用公共 token`);
    }
  }
}
walk(root);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log(`样式规范检查通过：${count} 个源码文件。`);
import console from "node:console";
import process from "node:process";
