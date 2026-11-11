# 当前配音与重建

当前204段讲解已统一替换为用户认可的参考声线，约30分15秒。模型为本地 **Qwen3-TTS-12Hz-0.6B-Base**，固定版本 `5d83992436eae1d760afd27aff78a71d676296fc`。这批音频是AI朗读的新文稿，**不是单田芳先生的原始录音**；页面持续标识，MP3元数据和离线说明也包含声明。

## 内容与来源

六幕开场、71条普通事件、30场战役的开场及97步讲解，共204段。历史原文来自 `src/history.js`；保留年代、“约”“一说”及史料括注。参考片段来自[央视《名家书场》20201219《薛家将》第二十六回](https://tv.cctv.com/2020/12/19/VIDEH4TqnKKY4nYfngAaYCo7201219.shtml)，约126.90—138.45秒，共11.55秒，官方简介标注表演者为单田芳。

参考音频 SHA-256：`7132d762cab4791317e15c1829ff190781a3be9d945341e52f54a6c1e4eaa20d`。来源、截取位置、参考文字、出镜画面及两份转写保存在本地 `work/revision-4/reference/`。参考原录音和模型权重不进入离线发布包。公开可访问不等于已取得原节目或声线的商用授权。

用户确认过9.44秒短样的声音方向，随后明确批准全量重录；这不等于真人逐句验收204段。8处读音/连读疑点保留在[QA.md](QA.md)，本地可打开 `release/reference-voice-review/index.html` 逐条听审。

## 生成与同步

合成采用284个有完整语义的片段，固定参考、模型与基础种子，不变调、不拉伸语速；只去首尾多余静音、保留短停顿并统一段落响度。当前发布时长为1815.48秒。为避免读法修订改变页面，发音提示单独保存，字幕继续使用原字。

423条显示字幕根据当前音频的识别词时间定位，合成边界使用实测长度；无可靠句首锚点时对齐工具报错，不按字数均分。音频、原文、字幕、参考和模型版本以校验值绑定。开场、普通事件和战役都读取同一播放进度；暂停、倍速、回拖会一起作用于声音、字幕、地图与行军。

页面按需加载，最多预加载下一段。配音失败或缓冲超时会停住，用户可重试或主动无声继续。切到后台暂停，返回后手动续播。地图探索保存当前页面内的一个断点，返回讲解可恢复；“从此处推演”建立新队列。

## 本地重建

需要Node.js 22+、FFmpeg和已有Python环境（本机qwen-tts 0.1.1、PyTorch 2.11.0+cu128）。本次复用相邻工程的环境，没有修改其他项目。所有推理离线运行，模型和参考缺失时停止，不切到云接口。

```bash
node tools/prepare-voice.mjs --reference
python3 tools/reference-voice-batch.py --plan  # 只规划，不推理
python3 tools/reference-voice-batch.py --check # 当前缓存一致性

# 仅在明确授权的本地运行额度内生成
../time-eigentime-org/.venv-qwen/bin/python -B tools/reference-voice-batch.py --generate

# 当前音频转写与句子对齐
python3 tools/bounded-verification.py -- ../.venv-asr/bin/python -B tools/voice-check.py --staged
../.venv-asr/bin/python -B tools/asr-review.py --staged
../.venv-asr/bin/python -B tools/align-reference-captions.py
python3 tools/bounded-verification.py -- node tools/verify-voice.mjs --staged
node tools/activate-reference-voice.mjs             # 检查可激活条件
node tools/activate-reference-voice.mjs --activate  # 完整通过后切换
node build.mjs
python3 tools/package-release.py
```

GPU累计上限7200秒、并发1；每个固定片段最多两次尝试，每次最多180秒。读法变化不会重置次数。预算与尝试记录保存在 `work/reference-voice/`；不要删除记录来绕过上限。CPU音频校验共享1800秒累计额度。17个片段做了第二次质量尝试，4个按证据保留首版；没有超限继续追求新版本。

`work/reference-voice/reading-overrides.json` 保存本轮定点读法提示，`take-selection.json` 保存版本选择原因。新生成先写独立目录，完整校验再激活。旧网页、音频清单和完整ZIP备份在 `work/reference-voice/previous-version/`；旧音频文件也保留，不依赖再次生成来回退。

前期CustomVoice 0.6B会忽略风格指令，1.7B及变调试听也未获用户接受；这些工具仅留作历史试验，不是当前生产配音路径。当前采用Base的真实参考输入接口。

## 备选声线短样

正式试听页提供 Dylan、Aiden、Ryan 三种原生预设短样，共26.08秒，使用已缓存的 **Qwen3-TTS-12Hz-1.7B-CustomVoice**（固定版本 `0c0e3051f131929182e2c023b9537f8b1c68adfe`）。Dylan复用前期缓存；Aiden、Ryan是本轮新生成。它们只供听音色，不是三套204段配音，当前正式讲解和423条字幕不变。

本轮另生成 Vivian 女声；与缓存 Serena 一起保留在本地草稿。Vivian的“卿／请”声调、Serena的“晋／敬”读音仍有识别分歧，未纳入正式试听页或正式ZIP。可用 `node build.mjs --local-review` 查看完整五条候选，草稿只写 `work/multi-voice/preview/`；不能用它代替验收通过的 `dist/`。

新增三条生成总音频23.44秒，本地GPU生成任务累计134.730秒（含模型加载），限额600秒、并发1、每种最多一次生成；所有生成均正常结束，没有触及240 token上限。NF4（Normal Float 4，四位浮点量化）用于降低声码生成器的显存占用，音频解码器保持CPU全精度。没有变调、拉伸语速、重写文稿或新增模型下载，仅统一响度。

CPU解码、两份独立转写与带声调拼音复核共41.845秒，共享240秒累计额度。原始转写、最初警告和失败日志保留；补查曾因缓存词表文件名在加载模型前停止，修复后仅在剩余额度内继续一次，没有重置记录或重录声音。繁简等价比对修正了“成為／成为”的语境误报，未把“敬”改成“晋”或把“请”改成“卿”。这些自动检查**不是声调正确的声学证明，也不是人工音色认可**。

点击「配音试听」或「8处读音待听审」会暂停主讲并保留进度；关闭试听标签后可继续。试听页只有点击「试听这条」才给播放器分配音频地址，避免WebKit忽略 `preload="none"` 而首屏下载全部短样；切换和后台均暂停其他声音。加载失败明确显示错误，不切换其他声线。

```bash
node tools/verify-voice-options.mjs  # 校验三条正式短样及其两份转写/读音证据
node tools/verify-dist.mjs           # 正式发布文件白名单、校验值与25MiB上限
node build.mjs --local-review        # 单独查看待听审草稿，不修改正式dist或ZIP
```

`assets/voice-options/manifest.json` 保存正式短样的文件哈希、解码记录和读音证据；`docs/pronunciation-review.json` 保存当前八条主配音听审说明，均绑定当前MP3。生成/转写缓存及预算仍在被忽略的 `work/voice-palette/`。新合成必须明确运行固定额度的本地工具，失败或已完成的缓存不能被隐式重试；整套备选配音的生成不在本次短样范围内。

## 验证与交付

运行 `npm test`、`../.venv-asr/bin/python -B test/reference-voice.test.py`；浏览器验证需临时本机服务（8765端口）及已有Playwright浏览器。`test/storyboard-browser.mjs` 检查实际画布变化和回拖，`test/live-audio.mjs` 检查真实新音频与清单一致，`test/browser-smoke.mjs` 检查操作流程。具体本轮实测结果与缺口见[QA.md](QA.md)。

本机Linux WebKit/WPE在离线多页流程中存在偶发原生崩溃。用户已明确接受将其作为已知限制，按已通过的三浏览器HTTP与Chromium解压断网范围发布；没有声称已修复该原生问题，也未验证真实iPhone Safari。

`release/warring-states-sandtable-offline.zip` 解压后双击 `index.html`，保留相邻 `assets/`、`voices/`、`review/`。ZIP内含204段当前MP3、三条正式短样、代码、内嵌字体、音频QA记录、8处读音复核页、`docs/` 说明和许可证；不含两条待审女声、参考原录音、模型、Python环境、node_modules或原始WAV。

项目代码沿用MIT、字体SIL OFL；Qwen代码与模型权重为Apache-2.0（版本信息见 `qwen-reference-model.json` 与 `qwen-style-model.json`）。没有付费语音服务、云渲染、套餐或预算变更。部署沿用既有GitHub Pages工作流，标准公开仓库runner的当前条件已核对；制品限定25MiB、1天保留，单次任务10分钟。不能把当前免费适用条件当作永久保证；本地电耗未计量，也不能宣称总成本为零。
