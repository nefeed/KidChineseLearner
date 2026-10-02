# 发布许可与语音条款核对

核对日期：2026-10-02。这里只记录实际查到的官方条款、项目中的许可副本及结论范围，不将公共文档等同于账号的全部订购约定。

## 原创部分的非商业许可

[PolyForm Project 官方 Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0) 提供面向软件的使用、修改、分发和专利许可，许可目的限于其列明的允许用途。根目录 [LICENSE](../LICENSE) 从官方 [plain text](https://polyformproject.org/licenses/noncommercial/1.0.0.txt) 逐字保存，没有添加或删改条款。原文件 SHA256 为 `ffcca38841adb694b6f380647e15f17c446a4d1656fed51a1e2041d064c94cc8`，4563 字节。

完整许可明确将列举的教育、公益、政府等机构的使用视为许可用途，不受资金来源或资金义务影响。因此“禁止商业用途”的项目说明应引用完整许可，不能扩写成“任何收费教育均被禁止”。要求分发者保留许可及 `Required Notice:` 行；项目的 Required Notice 位于 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) 首行。

这是非商业源码许可。它限制商业目的，不满足 [OSI 开源定义第 6 项](https://opensource.org/osd) 中对商业领域不能歧视的要求，所以 README 不应称其为 OSI 开源。第三方材料继续遵守自己的原许可；尤其 Arphic Public License 第 5 条禁止给其接收者追加限制，独立原创程序和课程内容与字体图形并列不会把字体改成非商业许可。

## 本地 Kokoro 中文合成语音

公开语音替换采用 [hexgrad/Kokoro-82M-v1.1-zh 官方模型卡](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh)，其许可字段为 `apache-2.0`。模型卡说明中文训练材料由 LongMaoData 授予上游使用；这是上游对训练来源的说明，本项目没有重新核验其全部训练合同。当前生成脚本固定 revision `01e7505bd6a7a2ac4975463114c3a7650a9f7218`，对应 [固定版本的模型卡](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh/blob/01e7505bd6a7a2ac4975463114c3a7650a9f7218/README.md)，并校验模型 SHA256 `b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b`。

Python 合成程序 [Kokoro 官方 LICENSE](https://github.com/hexgrad/kokoro/blob/main/LICENSE) 与中文读音前端 [Misaki 官方 LICENSE](https://github.com/hexgrad/misaki/blob/main/LICENSE) 均为 Apache License 2.0。原文逐字保存在 [kokoro-Apache-2.0.txt](licenses/kokoro-Apache-2.0.txt) 与 [misaki-Apache-2.0.txt](licenses/misaki-Apache-2.0.txt)；两份文件均为 11357 字节、SHA256 `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4`。模型许可的映射依据是模型卡，Kokoro 的副本提供该完整许可正文，不将程序许可证自行视为另一模型的授权证明。

Kokoro 模型和工具保留 Apache 许可，不能因与本项目并列使用而改为非商业许可。输入采用项目有权使用的原创课程文本与公有领域诗文；输出明确标注 AI 合成，不作为真人录音。模型许可与声音文件的使用不等于取得任何个人的声纹所有权，也不据此保证每份生成输出必然具有独占著作权。项目可许可的原创程序、课程文本、音乐与编排仍按本项目许可使用，古典原文及第三方材料保持原有状态。

合成在本机运行，没有付费语音 API 调用；首次下载公开权重后，课程文本不需要发送给语音云服务。权重、所选女声文件、Python 环境和缓存不随 Git 仓库分发。当前采用女声 `zf_001`、速度 `0.85`，CPU 生成；样本与生成记录用于核对音源和数量，文件结构审计不能证明全部发音已经听审通过。完整依赖与恢复命令见 [README](../README.md)，最终交付范围见 [验证记录](VERIFICATION.md) 与公开 manifest。

## Apple 系统声音旧录音

已直接核对 [macOS 27 软件许可](https://www.apple.com/legal/sla/docs/macOS27.pdf)、[macOS Sequoia 软件许可](https://www.apple.com/legal/sla/docs/macOSSequoia.pdf) 与 [macOS Tahoe 软件许可](https://www.apple.com/legal/sla/docs/macOSTahoe.pdf) 的英文第 3 页（PDF 零基索引第 2 页）、2F Voices; Live Captions 条款。它们许可系统声音用于运行系统时的使用及个人非商业创作，并明确禁止在 profit、non-profit、public sharing 或 commercial 语境中录制、发布、再分发系统声音。给项目加上非商业许可不能取得 Apple 没有授予的公开分享权。

本次 `sw_vers` 返回 27.0.1，已查到对应 macOS 27 的 Apple 官方公开许可，2F 条款确有上述系统声音限制。[Apple 官方许可索引](https://www.apple.com/legal/sla/) 同时说明购买时随产品的许可可能与网上当前版本不同。本次依据已核对的公开条款，旧 Tingting 系统声音录音不随新仓库推送。

## 未交付的 Qwen 候选方案

阿里云百炼 Qwen 曾作为候选音源核对，但本次试调用返回 HTTP 403、`FreeTierOnly`，未采用该方案，也未交付其生成音频。公开发行使用上述本地 Kokoro 流程，不把候选方案、免费额度限制或付费服务评估写成已交付成果。

保留历史核对入口：[百炼相关协议](https://help.aliyun.com/zh/model-studio/related-agreements) 链接的 [百炼服务协议](https://terms.alicdn.com/legal-agreement/terms/common_platform_service/20230728213935489/20230728213935489.html) 区分客户业务数据控制权、合法输入情况下的合成内容权利和另外约定等条件；模型权重许可与云服务合同也不是同一授权。若将来改用该服务，应按实际账号的订购页面、适用服务说明与协议重新核对，不能把本次公开文档核对代替账号专有约定。

## 现有第三方材料的明确边界

1000 份笔顺 JSON 的上游公开许可为 Arphic Public License，保留完整原文且未修改。诗词整理库、字音工具和网页程序依赖的上游许可副本按原文保留，具体范围见第三方声明。运行时依赖版本从当前 `package-lock.json` 读取，许可证直接从安装包复制；字体图形的许可未混同于 Hanzi Writer 程序的 MIT。

Chinese Xinhua 的 [上游 README Copyright 段](https://github.com/pwxcoo/chinese-xinhua#copyright) 说明其数据来自网站抓取，并在侵权反馈后删除。虽然仓库提供 MIT，这不足以单独核实更早来源文字的授权链；网页课程的独立改写不会自动清除开发来源快照的这一未知项。字频 Gist 也未列可核实的独立许可证，项目仅参考字符排序事实，不复制其可视化程序。没有把这些未知项写成已取得全链权利的证明。
