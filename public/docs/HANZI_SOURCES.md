# 1000 字课程：来源、编辑范围与笔顺审计

审计日期：2026-10-02。本文件记录目前的真实状态；完整数量和文件结构不代表幼儿内容已经全部验收。

## 当前交付

- `src/data/hanzi.json`：恰好 1000 个不同汉字，固定 ID 为 `hz-001` 到 `hz-1000`；每条包含规格要求的 11 个字段。
- `public/data/strokes/{字}.json`：1000 个字各有一份本地笔顺文件，共 7912 条笔画路径和 7912 条中线。
- 全部笔顺逐文件与下载的 `hanzi-writer-data@2.0.1` 原包比对，1000 份文件的字节完全一致。没有用文字轮廓、随机线条或猜测中线伪造笔顺。
- **1000 / 1000 字已逐条原创精编，词典底稿 0 条。** 每条都有中文释义、至少两个例词、含目标字的完整生活短句、场景主题、图标和关联动作提示；原有词典短语与古文例句已全部替换。
- 原创覆盖完整不等于人工教学审校通过。全部记录仍为 `authored-pending-review`；`authorshipComplete: true`、`humanReviewComplete: false`、`humanReviewPendingCharacters: 1000` 明确记录这一区别。较抽象的字、历史词和词语中的音译字放在家长陪读场景，不把它们当作三岁启蒙前置要求。
- 每条的编辑状态保存在 `public/data/strokes/manifest.json` 的 `editorial.entries`。当前全部项为 `authored-pending-review`，没有 `dictionary-draft`。`scripts/build-hanzi-audit.json` 给出两个完整的 ID 清单，范围覆盖全部 1000 字，不重叠。

## 课程选择与顺序

前 100 字采用原创主题排序，每组 10 字：自然天地、动物朋友、我的身体、我的家人、数一数、好好吃饭、生活物品、一起动起来、比较和方位、颜色和植物。先通过可看见、可触摸、可行动的事物建立字义，再进入生活功能词和阅读表达。

余下 900 字参考 [enjalot 的公开字频数据](https://gist.github.com/enjalot/9244271)，按其排序取前 900 个未入选字符。结果是“1000 个常用课程字”，并不声称严格等于某一语料库排名前 1000 位，也不把成人书面语字频当作三岁儿童的教学顺序或掌握指标。该 Gist 本身未给出可核实的语料方法和独立许可证，因此只参考字符排序这一事实信息，不复制其可视化程序。

### 与权威常用字名单交叉核查

[教育部对《通用规范汉字表》的官方说明](https://www.moe.gov.cn/jyb_xwfb/xw_fbh/moe_2069/s7135/s7562/s7569/201308/t20130827_156353.html)确认一级字表含 3500 个常用字。使用 [Unicode 官方 Unihan 17.0.0 数据](https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip)的 `kTGH` 属性，将值 `2013:1` 到 `2013:3500` 解码为一级字表字符集，再逐字检查课程选字的成员身份。[Unicode 属性说明](https://www.unicode.org/reports/tr38/#kTGH)明确该属性对应规范汉字表的年份和序号；`kTGHZ2013` 是另一项字典读音索引，不能误用为名单序号。

源文件验证得到恰好 8105 个连续、唯一的表序号，三级数量为 3500、3000、1605；本课程 **1000 / 1000 字均属于一级常用字集，无表外字**。一级集合及源 ZIP 的 SHA256 存在 `scripts/build-hanzi-common-source.json`，逐字对应序号存在 `scripts/build-hanzi-common-audit.json`，可离线复核。Unicode 的此属性标注为 Provisional，是官方规范表的编码转录；本检查没有逐字比对政府 PDF 印刷字形。Unicode 原许可证保存在 [unicode-LICENSE.txt](licenses/unicode-LICENSE.txt)。

这项交叉检查证明选字属于权威常用字集，**不能证明 Gist 的统计方法，也不能把字表的笔画排序序号当作字频排名**。所以不宣称“严格最常用 top 1000”，也不把一级 3500 字作为三岁幼儿的掌握要求。

课程顺序在 `scripts/build-hanzi-source.json` 的 `orderedCharacters` 固定保存。每 10 字一课，`level` 为 1 到 100。ID 与顺序固定，后续内容编辑不重编号，不破坏已有儿童进度。

## 中文词典与词语

[Chinese Xinhua 项目](https://github.com/pwxcoo/chinese-xinhua) 的 `data/word.json` 提供中文字义、带声调字音和原词典示例。项目声明 MIT，原许可证已原样保存在 [chinese-xinhua-MIT.txt](licenses/chinese-xinhua-MIT.txt)。本项目仅保存入选 1000 字的所需来源条目，以便重建和审校。

其 README 的 Copyright 段说明数据来自网站收集抓取，并承诺收到侵权反馈时删除。仓库的 MIT 声明不能单独证明所有上游词典文字的授权链已经核实。当前网页课程的 1000 条释义和例句均已独立原创改写，不再直接使用自动词典底稿。原来源快照保留在开发脚本目录，未导入网页；其上游授权链仍未单独核实，不能因为课程已改写就将开发快照称为已完成权利清查的出版词典。

底稿提取保留实际词义；缺失或截断的内容触发构建检查，不使用“这是一个汉字”等占位释义。发现“品”的来源只有字本身，已用原创条目补齐；派、您等来源读音错误也已通过原创条目修订。此前自动提取可能选到古义或不完整释义，故已逐字替换；全范围编辑状态继续保留，便于后续校审。

为避免从旧辞典连续文字中截出不成词的片段，编辑前的词典底稿曾使用 [Jieba 原词典](https://github.com/fxsjy/jieba/blob/master/jieba/dict.txt) 中实际存在的词条，按词频选择短词。原 MIT 许可证保存在 [jieba-MIT.txt](licenses/jieba-MIT.txt)。词条中的目标字读音由项目安装的 [pinyin-pro](https://github.com/zh-lx/pinyin-pro) 3.29.4 辅助筛选，必须与当前选定读音相同。其 MIT 许可证附在 [pinyin-pro-MIT.txt](licenses/pinyin-pro-MIT.txt)。候选词快照仍可供后续编辑参考；最终网页例词以 1000 行原创 TSV 的逐字选择为准。该筛选只减少多音错配，不代替逐条编辑。

## 读音处理与校订记录

- 将词典中排印用的 `ɡ` 统一为普通拉丁字母 `g`，保留所有声调和 `ü`。
- 轻声的 `de / le / men / zhe / me / ba` 保持无调号；不凭空给轻声加声调。
- 精编字明确按当前语境选读音，例如为 `wéi`（成为）、地 `dì`（草地）、得 `dé`（得到）、行 `xíng`（行走）、还 `hái`（还有）、只 `zhǐ`（只有）。
- 朝使用 `cháo`，配“朝向”；与使用 `yǔ`，配“与其、与人为善”，不把读 `yù` 的“参与”作为该读音的例词。
- 一的单字本调为 `yī`；“一个”中的变调可读 `yí gè`。字卡单字拼音和句子语音采用各自语境，不把变调误标为多音字错误。
- 额外修订包括品、死、杀、血、罪、敌、枪、确、间、重、场、传、联、车、单、连、况、参、围、朝、欢、肯、秘、寻、吧、派、您。生命、武器、法律和历史词放在长期阅读路径，由家长陪同；不把它们当作三岁启蒙的前置要求。
- 全部精编条目的所有例词及例句内每个目标字出现位置已做语境读音交叉检查；亲属叠词第二音节轻声、“一”和“不”的变调明确记录。“友”以友好作首词，“睛”以目不转睛作首词，避免把口语轻声直接当作单字本调。
- 拼音工具错误不能覆盖正确字音：“教书”的 `jiāo`、“切开”的 `qiē`、“北斗”的 `dǒu` 已分别参照[教育部简编辞典“教”](https://dict.concised.moe.edu.tw/dictView.jsp?ID=22351&la=0&powerMode=0)、[“切”](https://dict.concised.moe.edu.tw/dictView.jsp?ID=24798&la=0&powerMode=0)、[“北斗”](https://dict.concised.moe.edu.tw/dictView.jsp?ID=538&la=0&powerMode=0)核实。检查脚本只对明确记录的句子和词语接受这些人工校订，不整体忽略多音字问题。
- “背书包”的 `bēi` 参照[简编辞典“背”](https://dict.concised.moe.edu.tw/dictView.jsp?ID=488&la=0&powerMode=0)，“率先”的 `shuài` 参照[简编辞典“率先”](https://dict.concised.moe.edu.tw/dictView.jsp?ID=35584&la=0&powerMode=0)，“勒紧”的 `lēi` 参照[教育部 GF 0015—2010](https://www.moe.gov.cn/jyb_sjzl/ziliao/A19/201010/W020220124393643101738.pdf)词汇表第 1883 项及保存的词典 `勒lēi` 分支核实。大陆与台湾词典可能存在异读差别，实际课程选定大陆生活语境；不能用台湾同字的另一种读音覆盖大陆语境。
- 全库仍需独立的幼教编辑审校。自动拼音工具和字段正则不能证明教学适龄性，也不能证明浏览器朗读引擎会采用同样的读音。

## 真正的笔顺来源与许可

[Hanzi Writer Data](https://github.com/chanind/hanzi-writer-data) 2.0.1 来自 [Make Me a Hanzi](https://github.com/skishore/makemeahanzi)。上游提供按顺序排列的 SVG 笔画路径 `strokes` 以及逐笔的 `medians`，并说明关注中国大陆笔顺。

图形源于文鼎开源字体，使用 **Arphic Public License**，与 Hanzi Writer 的 MIT 程序许可证不同。原完整许可证已原样附在 [hanzi-writer-data-ARPHICPL.TXT](licenses/hanzi-writer-data-ARPHICPL.TXT)。本项目选择并复制 1000 个 JSON，文件本身未作任何修改；再分发必须保留该许可证和对应署名。各文件仍遵循 Arphic Public License，独立原创的课程文本不因并列存放而改用字体许可证。

`manifest.json` 是本项目新增的来源、逐文件 SHA256 和编辑状态元数据；它不是上游笔画文件。后续若确实修订某个上游笔画文件，应单独保留修改说明和时间，不能继续声称未经修改。

Make Me a Hanzi 的坐标系不是网页坐标系：图形单位为 1024，纵轴朝上，上沿约为 900。渲染时需按上游规范转换纵轴；不能把倒置的几何当作源数据缺失。

当前验证证明了真实来源和完整复制；仍需按照课程验收对全部字的笔顺和描写体验进行教学与运行时复核。上游开源数据身份不等于官方标准逐字认证。

## 来源快照 SHA256

| 来源文件 | SHA256 |
|---|---|
| 完整 Xinhua `word.json` | `8ae3453eacc5b0f3fdfba47eac8bb686cd73914d278e8b851ae6ef81082f80e7` |
| Gist `freq.json` | `23146c6b34fd05ba4daaf746044d0a6ce5c42b6b56a990437a2694153ef9b463` |
| `hanzi-writer-data-2.0.1.tgz` | `72baf3d82b114e60d6e40ea05f24d2262a05cd39d544e2f322ba2fceb7beff15` |

Jieba 的完整源文件 SHA256 及读音筛选方法保存在 `scripts/build-hanzi-source.json` 的 `termSource`。每份最终笔顺文件的 SHA256 保存于公开 manifest，不用少数样例代表全部 1000 字。

## 重建与审计

已经保存本地课程来源快照和全部笔顺，无需在网页学习时联网请求字形数据。

```sh
node scripts/build-hanzi.mjs
node scripts/build-hanzi-validate.mjs
node scripts/build-hanzi-common.mjs
node scripts/build-hanzi-pronunciation.mjs
```

首次准备或重新核对笔顺源时，下载并解开固定版本的 npm 包，将解包后的 `package` 目录传给脚本：

```sh
mkdir -p /tmp/kid-hanzi-source
npm pack hanzi-writer-data@2.0.1 --pack-destination /tmp/kid-hanzi-source
tar -xzf /tmp/kid-hanzi-source/hanzi-writer-data-2.0.1.tgz -C /tmp/kid-hanzi-source
node scripts/build-hanzi.mjs --stroke-source /tmp/kid-hanzi-source/package
node scripts/build-hanzi-validate.mjs --stroke-source /tmp/kid-hanzi-source/package
```

需要更新例词来源时，在完整 Jieba `dict.txt` 上运行以下可选准备脚本，然后重建课程。当前本地快照已经包含筛选结果，日常重建不依赖临时下载文件。

```sh
node scripts/build-hanzi-terms.mjs /path/to/jieba/dict.txt
node scripts/build-hanzi.mjs
```

结构审计检查全部 1000 字：唯一性、稳定 ID、合法拼音音节、中文释义、目标字在词句中存在、11 字段契约、100 课顺序、动作类型、1000 本地字形文件、路径格式、中线点格式、逐笔数量一致、源哈希一致，以及逐字编辑状态覆盖。带 `--stroke-source` 时还对每份文件做上游字节比较。

常用字核查和读音核查分别生成完整报告。读音核查覆盖全部 1000 条精编记录的 3085 个目标字出现位置，记录 21 个变调或叠词轻声位置、14 个由真实词典和官方标准确认的拼音工具差异（教、切、斗、背、率、勒），没有未解释的读音错配。结构审计结果保存在 `scripts/build-hanzi-validation-audit.json`。此结果不是幼儿内容认证。

可以对同一份固定 Unicode 源 ZIP 重跑名单转录和 SHA256 比对，确认本地 3500 字快照与原始 kTGH 数据完全一致：

```sh
node scripts/build-hanzi-common.mjs --unihan-source /path/to/Unihan-17.0.0.zip
```

```sh
node scripts/build-hanzi-validate.mjs --strict-editorial
```

此严格原创覆盖门禁当前通过，报告 **0 条 dictionary draft**。其作用是排除未精编底稿，不能授予人工教学审批。输出同时保持 `humanReviewComplete: false` 和 `editorialComplete: false`，避免把结构与原创覆盖通过写成已获幼教认证。仍应由家长、幼教编辑结合真实儿童的理解情况、朗读和笔顺体验完成内容验收。

## 工作审视报告

### 原定目标

交付固定顺序的 1000 字、真实笔顺资产、可重复生成的原创生活释义和例句，以及完整来源和校验依据。

### 完成情况

- [x] 1000 行原创 TSV 与 1000 条最终 JSON，全部词句含目标字，100 课和 ID 保持稳定。
- [x] 1000 份字形与固定源包逐文件字节相同，7912 笔与对应中线完整。
- [x] 1000 字都在权威一级常用字集中；词句读音检查覆盖所有例词和例句。
- [ ] 独立的人工幼教审校、真实儿童试学、全部运行时朗读和规范笔顺教学复核尚未进行。

### 发现的问题

| 程度 | 具体问题 | 原因 | 已采取的修正或下一步 |
|---|---|---|---|
| 已修正 | `hanzi.json` 最初 773 条仍是词典底稿，部分是古义或短语 | 自动抽取只能建立完整底稿，不能代替幼儿课程写作 | 已把全库 1000 条逐字原创改写，底稿降为 0 |
| 已修正 | 拼音工具将教、切、斗、背、率、勒的部分语境错读 | 自动库对多音字语境的覆盖不完整 | 根据真实词典和标准保存精确语境例外，保留正确读音；不整体跳过多音字检查 |
| 已修正 | `build-hanzi-validate.mjs` 原先可能把无底稿称为 editorialComplete | 混淆原创覆盖、自动检查和人工审批的含义 | 分开记录 authorshipComplete 与 humanReviewComplete；人工审批保持未完成 |
| 待复核 | `authored-pending-review` 全部 1000 条仍未经过独立幼教审校 | 编写和自动核查不能代替实际理解与教学反馈 | 优先校审家长陪读词、轻声与多音词、图标辨识和动作提示；不宣称三岁掌握标准 |

### 可保留的做法

固定 ID 和课程顺序；每 50 字保存、生成并核查；源包逐文件比较；每条公开编辑状态；说明权威常用集成员核查与字频排名证明的区别。

### 下次重点关注

幼儿和家长是否理解具体释义，所有例词的口语轻声及浏览器朗读差别，笔顺规范与描写手感，历史和抽象字的家长陪读说明。后续任务可直接沿用本报告作为审校上下文。
