# 本地 Qwen3 女声生成

本流程在 Apple Silicon Mac 上使用 Qwen3-TTS 1.7B CustomVoice 的 Vivian 女声，合成指导为明亮、灵动、亲切的年轻女生，普通话清晰、语速适中、句尾自然。声音是AI合成，不是真人录音。本次完整发布包含23917条文本映射、22865段AAC，总时长99180秒。完整性审计与逐段生成回执确认自然停止、有效编码和当前计划一致；这些检查不等于全部录音已由人类听审。

## 安装与模型

Python 3.12，Apple Silicon、macOS，自带的 `/usr/bin/afconvert` 用于AAC编码：

```sh
python3.12 -m venv .audio-cache/qwen3/venv
.audio-cache/qwen3/venv/bin/python -m pip install -r scripts/requirements-qwen3.txt
python3 scripts/download-qwen3-model.py
```

下载器只访问公开模型文件，不使用语音API或账号令牌。模型来自 [MLX转换版本](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-6bit)，固定版本 `1c6c0ff58c43afa8df571facde2efa077efd85e2`，上游为 [Qwen官方模型](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice)。两个权重文件下载完成后分别校验SHA256：

- 主模型：`097b66a8c63570b88abc2fb393d1dc2360394ca7741c818455ba9da257ac2f3b`
- 语音编解码器：`836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258`

下载断开可重新执行同一命令，已下载的字节会继续使用。模型、Python环境、分块、检查点和逐段生成回执均留在 `.audio-cache`，不提交Git。生成时开启Hugging Face与Transformers离线模式，并从进程环境中移除常用云语音密钥；课程文本不发往云端合成。

## 生成与恢复

```sh
.audio-cache/qwen3/venv/bin/python scripts/build-qwen3-audio.py --samples --batch-size 8
.audio-cache/qwen3/venv/bin/python scripts/build-qwen3-audio.py --batch-size 16
npx tsx scripts/audit-audio.mjs --complete --directory .audio-cache/qwen3/release --no-write
```

`--samples`会在独立的 `.audio-cache/qwen3/samples` 生成字卡、拼音、提示和诗词试听，附带文字与文件对应的sample-report。完整生成默认输出到私有暂存目录。`--limit 16`可先生成16段；它不会写入完整发布manifest。再次运行不带limit的同一命令会校验已有录音的SHA256与回执，再补齐剩余内容。批量大小仅影响计算调度，需根据本机内存和实测吞吐量调整。

每段文件名包含模型版本、声音、语气指令、采样设置、读音配置与实际朗读文本的哈希，前缀为 `qwen3-`。更换声音或读音配置不会误用旧缓存。生成器保留模型的完整波形，不通过临近结束时减速或削弱末字来柔化声音；录音后补180毫秒静音。达到生成token上限、异常短长、静音、编码失败或编码时长不符的段落会重试，最多六次，仍失败则停止该轮，保留其余已校验录音。生成上限按相同的时长验收标准换算，提前终止本来就会被拒绝的异常拖长；不会将达到上限的录音截短后交付。

全部完成后，再检查当前源代码的语音计划是否仍一致，逐文件校验，写入完整manifest。发布审计拒绝混入旧Kokoro文件、缺失文本、不匹配的女声/语气配置和不完整生成记录。只有完整暂存目录通过审计后，才可替换网站的公开音频；运行中的旧版本不由生成器自动改写。

## 字音与验收边界

多音字继续使用课程选择的例词语境。孤立教学位置及明确的引号问答使用局部同音提示，显示文字不变；拼音标签转换为中文教学提示，其他词语上下文不做全局替换。相关规则进入声音配置哈希。

自动检查能够发现资源缺失、文件损坏、计划不一致和明显截断，不能证明每个字的读音或每段声音的听感已经人工验收。旧Kokoro的音素检查结果不能用来证明Qwen3新声音已经通过同样听审。真实iPad的扬声器听感、儿童使用反馈与全量人工听审，需与浏览器媒体事件检查分别记录。

## 许可

官方Qwen模型与MLX转换模型的模型卡均标示Apache-2.0，完整许可正文副本见 [Qwen3-TTS Apache许可](licenses/qwen3-tts-Apache-2.0.txt)。本地运行库MLX Audio采用 [MIT许可](licenses/mlx-audio-MIT.txt)。模型不随本仓库分发，这些上游许可也不改为项目的非商业许可。项目原创代码、课程和编排仍遵循根目录的PolyForm Noncommercial 1.0.0，详见 [第三方声明](../THIRD_PARTY_NOTICES.md)。

正式局域网部署已完成，地址保持 http://192.168.31.48:5173/ 。本机对正式地址的页面、清单、试听和许可文档均返回200，AAC范围请求返回206且带内容哈希文件的长期缓存头；部署包摘要与验收包一致。正式origin的园区及原生AAC浏览器复测12项通过。旧dist与旧公开音频保留在私有回退目录，未修改日常儿童档案。Safari刷新或关闭主屏幕窗口后重新打开可加载新版。
