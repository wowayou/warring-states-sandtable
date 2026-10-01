# assets/display.woff2

页面显示字体，由 **Noto Serif SC Bold**（Noto Serif CJK 的简体中文分包）裁子集而来（`tools/subset-font.mjs`），
只保留本站实际用到的 1463 个字形，woff2 约 265 KB，随页内嵌。

显示字体若听凭系统回退，同一张沙盘在 macOS、Windows、Linux 上会是三张不同的脸；
标题、国名、印记全靠它撑，故不能交给运气。

## 许可

Noto Serif CJK © Google 及其贡献者，依 **SIL Open Font License 1.1** 发布。
子集化与再分发为该许可所明确允许（字体不单独出售，且沿用同一许可）。

- 上游：https://github.com/notofonts/noto-cjk
- 许可全文：https://openfontlicense.org/

重新生成（需 `pyftsubset`，即 `pip install fonttools brotli`）。改了任何显示用的文字之后都要重跑，
否则新字会落回系统字体：

```bash
# 单独的 OTF：noto-cjk 仓库 Serif/SubsetOTF/SC/NotoSerifSC-Bold.otf
node tools/subset-font.mjs path/to/NotoSerifSC-Bold.otf 0 pyftsubset
# 或系统里的 TTC（第 2 号字面为简体中文）
node tools/subset-font.mjs /usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc 2 pyftsubset
```
