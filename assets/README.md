# assets/display.woff2

页面显示字体，由 **Noto Serif CJK SC Bold** 裁子集而来（`tools/subset-font.mjs`），
只保留本站实际用到的 1279 个字形，woff2 约 228 KB，随页内嵌。

显示字体若听凭系统回退，同一张沙盘在 macOS、Windows、Linux 上会是三张不同的脸；
标题、国名、印记全靠它撑，故不能交给运气。

## 许可

Noto Serif CJK © Google 及其贡献者，依 **SIL Open Font License 1.1** 发布。
子集化与再分发为该许可所明确允许（字体不单独出售，且沿用同一许可）。

- 上游：https://github.com/notofonts/noto-cjk
- 许可全文：https://openfontlicense.org/

重新生成（需本机装有 Noto Serif CJK 与 `pyftsubset`）：

```bash
node tools/subset-font.mjs /usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc 2 pyftsubset
```
