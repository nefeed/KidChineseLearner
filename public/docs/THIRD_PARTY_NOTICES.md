Required Notice: Copyright (c) 2026 nefeed and KidChineseLearner contributors (https://github.com/nefeed/KidChineseLearner).

# 许可范围与第三方声明

本项目原创程序、界面、动物图形、课程释义、题目、活动和文档采用 [PolyForm Noncommercial License 1.0.0](LICENSE)。未经权利人另行授权，不得将这些原创部分用于该许可未允许的商业目的。允许的使用、修改和分发以完整许可正文为准；其 Noncommercial Organizations 条款明确允许教育机构、公益组织等列举机构的使用，不以资金来源判断。分发本项目时应携带完整许可及上方 `Required Notice:` 行。

这是**非商业源码许可**，不是 OSI 定义下的开源许可。下列第三方材料、公有领域原文和第三方服务不因与本项目并列提供而改用非商业许可。本项目不对他人的材料追加商业使用限制，也不将上游许可证改写为本项目许可证。

## 随网页使用的第三方材料

| 材料 | 来源与版权 | 适用许可及本地原文 |
|---|---|---|
| 1000 份汉字笔画路径与中线 | [Hanzi Writer Data 2.0.1](https://github.com/chanind/hanzi-writer-data)，源自 [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) 的文鼎字体图形；Copyright (C) 1999 Arphic Technology Co., Ltd. | [Arphic Public License](licenses/hanzi-writer-data-ARPHICPL.TXT)，公开数据目录另附 `public/data/strokes/ARPHICPL.TXT`；笔画 JSON 逐文件未经修改。不得给接收者增加与此许可矛盾的限制。 |
| 唐诗宋词整理库原文快照 | [chinese-poetry/chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)；Copyright (c) 2016 JackeyGao | [MIT](licenses/chinese-poetry-MIT.txt)，源目录同时保留 `scripts/poetry-source/LICENSE`。古代作品原文本身为公有领域；本项目另行编写的现代解读有独立许可。 |
| React 19.3.0 | [facebook/react](https://github.com/facebook/react)；Meta Platforms, Inc. and affiliates | [MIT](licenses/react-MIT.txt) |
| React DOM 19.3.0 | [facebook/react](https://github.com/facebook/react)；Meta Platforms, Inc. and affiliates | [MIT](licenses/react-dom-MIT.txt) |
| Scheduler 0.28.0 | [facebook/react](https://github.com/facebook/react)；Meta Platforms, Inc. and affiliates | [MIT](licenses/scheduler-MIT.txt) |
| Lucide React 0.468.0 | [lucide-icons/lucide](https://github.com/lucide-icons/lucide)；Lucide Contributors 2022，继承的 Feather 部分为 Cole Bemis 2013–2022（MIT） | [上游完整 ISC 声明](licenses/lucide-react-ISC.txt)，保留其 Feather 署名。 |
| pinyin-pro 3.29.4 | [zh-lx/pinyin-pro](https://github.com/zh-lx/pinyin-pro)；Copyright (c) 2022-present zh-lx | [MIT](licenses/pinyin-pro-MIT.txt) |
| Vite 6.4.3，包括构建生成的 modulepreload 辅助程序 | [vitejs/vite](https://github.com/vitejs/vite) | [上游完整 LICENSE.md](licenses/vite-LICENSE.md)，包含其依赖声明。 |

数据的来源、版本、加工范围、逐文件校验和编辑边界详见 [汉字来源](HANZI_SOURCES.md) 与 [诗词来源](POETRY_SOURCES.md)。Make Me a Hanzi 的图形和字典文本适用不同许可；本项目的笔顺使用图形数据，不能拿 Hanzi Writer 程序的 MIT 许可替代图形的 Arphic Public License。

## 课程构建与来源核对材料

| 材料或工具 | 使用范围 | 许可原文 |
|---|---|---|
| [Chinese Xinhua](https://github.com/pwxcoo/chinese-xinhua)，Copyright (c) 2018 PWXCOO | 开发阶段字音与词典来源条目；网页课程的释义、例句已独立原创改写 | [上游 MIT](licenses/chinese-xinhua-MIT.txt) |
| [Jieba](https://github.com/fxsjy/jieba)，Copyright (c) 2013 Sun Junyi | 编辑候选词来源快照 | [MIT](licenses/jieba-MIT.txt) |
| [Unicode Unihan 17.0.0](https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip)，Copyright © 1991-2026 Unicode, Inc. | `kTGH` 规范汉字表序号、一级字集核对与来源审计元数据 | [Unicode License V3](licenses/unicode-LICENSE.txt) |
| [pypinyin 0.55.0](https://github.com/mozillazg/python-pinyin)，mozillazg、闲耘 | 诗词拼音初稿工具；不作为人类教学审核 | [MIT](licenses/pypinyin-MIT.txt) |
| [opencc-python-reimplemented 0.1.7](https://github.com/yichen0831/opencc-python) | 诗词快照繁简转换工具 | [Apache License 2.0](licenses/opencc-Apache-2.0.txt) |
| [Kokoro 0.9.4](https://github.com/hexgrad/kokoro) | 本地语音合成程序；在开发环境安装，不随网页分发 Python 包 | [上游 Apache License 2.0](licenses/kokoro-Apache-2.0.txt) |
| [Misaki 0.9.4](https://github.com/hexgrad/misaki) | 中文文本与读音前端；在开发环境安装，不随网页分发 Python 包 | [上游 Apache License 2.0](licenses/misaki-Apache-2.0.txt) |

Chinese Xinhua 上游说明数据为网上收集抓取，并承诺收到侵权反馈时删除。其 MIT 声明不能单独证明所有更早词典来源的授权链；本项目未把开发快照声称为已完成权利清查的出版词典。该限制与网页课程已经原创改写是两件事。

选字顺序参考 [enjalot 的公开字频资料](https://gist.github.com/enjalot/9244271) 中字符排序这一事实信息；该 Gist 没有可核实的独立许可证，本项目不复制其可视化程序。补充古诗文只采用公有领域原文和事实核对，不复制维基文库、古诗文网的现代译文、鉴赏、排版或录音。

其他开发依赖按 `package-lock.json` 固定版本安装，仍按各包自带的许可证使用；本文件不将 npm 依赖改授为非商业许可。未随本仓库分发操作系统字体、声音模型或 `node_modules`。

## 生成语音与音乐

自然语音采用 [hexgrad/Kokoro-82M-v1.1-zh](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh)，模型卡标示 Apache License 2.0。使用固定 revision `01e7505bd6a7a2ac4975463114c3a7650a9f7218`，官方模型 SHA256 为 `b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b`。模型及女声文件由生成脚本下载到本机缓存，不随本 Git 仓库分发；完整 Apache 许可原文见 [Kokoro 上游副本](licenses/kokoro-Apache-2.0.txt)。这项上游许可保持原状，不改为本项目的非商业许可。

课程生成语音的音源、版本、数量、听审覆盖和实际交付范围以 [README](README.md)、`public/audio/manifest.json` 及 [验证记录](VERIFICATION.md) 为准。输入使用项目原创课文及公有领域诗文。随项目提供的录音明确标为 AI 合成，不能描述为真人录音或完整人类听审通过。上游模型许可不等于取得个人声纹所有权，也不据此声称每份 AI 输出必然具有独占著作权。阿里云 Qwen 调用仅作候选方案核对，免费额度试调用被拒绝，不属于本次交付语音。

macOS 系统声音生成的旧录音不能通过本项目许可获得公共分发权：Apple 公开 macOS 许可第 2F 条明确限制系统声音录音的公共分享，包括非营利分享。这些旧录音不作为本项目公开发布的授权素材。浏览器使用者设备上实时选择的系统 TTS 后备声音，也不等于本仓库再分发声音资产。

《小岛微光》是为本项目编写的原创 16 小节音乐，采用 3/4 拍、72 BPM，40 秒循环，以 Web Audio 振荡器与谐波实时合成；没有使用外部录音、采样音源或既有曲谱。其原创程序、作曲和编排采用本项目非商业许可；模型与合成语音的权利边界按上文说明。古典原文、第三方许可证及依法不受著作权保护的部分保持其原有状态。
