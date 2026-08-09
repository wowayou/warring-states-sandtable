// 把 Noto Serif CJK SC Bold 裁到本站真正用到的字，压成 woff2 内嵌。
// 显示字体若听凭系统回退，同一张沙盘在不同机器上会是不同的脸。
import { readFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = new URL('../', import.meta.url);

const SOURCES = ['src/history.js', 'src/atlas.js', 'src/app.js', 'src/table.js', 'index.html', 'src/style.css'];
// 运行时拼出来的字，源码里未必成串出现
const EXTRA = '〇一二三四五六七八九十百千万前年周秦楚齐赵魏韩燕晋越宋鲁郑卫吴巴蜀代中山义渠林胡楼烦匈奴东月氏羌百夷滇夜郎朝鲜郡带甲已亡幕第战变纵并都学工地易主分量约当田赋人口之厚薄计读法先看盘再本事收复位';

const [, , fontPath = '/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc', faceIndex = '2', pyftsubset = 'pyftsubset'] = process.argv;

let text = EXTRA;
for (const f of SOURCES) text += await readFile(new URL(f, root), 'utf8');

const chars = new Set();
for (const ch of text) {
  const c = ch.codePointAt(0);
  if (c > 0x2000 || (c >= 0x20 && c <= 0x7e)) chars.add(ch);
}
const unicodes = [...chars].map((ch) => 'U+' + ch.codePointAt(0).toString(16)).join(',');

await mkdir(new URL('assets/', root), { recursive: true });
const out = new URL('assets/display.woff2', root);

await run(pyftsubset, [
  fontPath,
  `--font-number=${faceIndex}`,
  `--unicodes=${unicodes}`,
  '--layout-features=',
  '--no-hinting',
  '--desubroutinize',
  '--drop-tables+=DSIG,GSUB,GPOS,vhea,vmtx',
  '--flavor=woff2',
  `--output-file=${out.pathname}`,
]);

const buf = await readFile(out);
console.log(`字符 ${chars.size} 个 · woff2 ${(buf.length / 1024).toFixed(0)} KB · base64 ${((buf.length * 4) / 3 / 1024).toFixed(0)} KB`);
