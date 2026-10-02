# 诗词课程来源、加工与审校覆盖

更新：2026-10-02。课程数据为 `src/data/poems.json`，可重复生成脚本为 `scripts/build-poems.py`。

## 内容范围与适龄路线

共 **300 首独立作品：219 首唐诗、81 首宋词**。首批 40 首按具体、短小、容易亲子互动的意象编排，先鹅、月亮、鸟、风、莲、小草，再走向亲情、友情、旅行和宋词；长句和复杂作品供后续亲子赏读。当前第 1 级 31 首，第 2 级 82 首，第 3 级 137 首，第 4 级 50 首。战争、深宫、愁怨等复杂内容至少归入第 3 级，不能仅凭字数少认定适合三岁独立理解。

300 首是长期资料库容量，**不是三岁背诵目标**。家长应按兴趣选取、允许休息；历史文本中饮酒、刀剑、下水等行为不作为幼儿现实活动。活动由本项目编写，围绕观察、画画、声音、分工、问候等今天可做的事情；没有用虚构新闻替代当代生活实践。

## 原文数据与许可

主要原文取自 [chinese-poetry/chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)，下载时保存原始快照。仓库标示 MIT，版权 `Copyright (c) 2016 JackeyGao`；完整许可保留在 `scripts/poetry-source/LICENSE`。古典作品原文本身属于公有领域，本项目仍保留作者署名与整理库的许可。

| 本地快照 | 上游出处 | SHA-256 |
|---|---|---|
| `tang300.json` | [蒙学/唐诗三百首](https://github.com/chinese-poetry/chinese-poetry/blob/master/蒙学/tangshisanbaishou.json) | `8423b65d938d0327e369972e790549b42609fa7ac4a2a72df59f4cb5a49c08f8` |
| `qianjiashi.json` | [蒙学/千家诗](https://github.com/chinese-poetry/chinese-poetry/blob/master/蒙学/qianjiashi.json) | `cf34d01ed29528052da5d96543e725ab67814a6cb093183808c889400ff62417` |
| `song300.json` | [宋词/宋词三百首](https://github.com/chinese-poetry/chinese-poetry/blob/master/宋词/宋词三百首.json) | `ca5d74f7fdb9d5a6acc22a7c8b4395228cad4bb8be53df44c19ba83ab6983b20` |

快照下载于 2026-10-01；生成脚本离线读取这些快照，不依赖上游日后的修改。链接使用上游分支地址，**复现依据是保存的快照和校验值**，不能把分支地址当作永久固定版本。

补充的经典短篇使用公有领域原文，并逐项保留核对入口。维基文库的现代编注、网页版式、现代翻译和录音不被复制；课程释义、理解题和活动为本项目另行编写。部分古诗文网页面提供版本和背景参考，未将其长篇鉴赏复制进数据。

| 补充或背景核对作品 | 核对入口与版本说明 |
|---|---|
| 咏鹅 | [原文及背景参考](https://www.gushiwen.cn/shiwenv_eeb3869b6242.aspx)；七岁作诗故事只称流传说法 |
| 静夜思 | [原文及背景参考](https://www.gushiwen.cn/shiwenv_c35a60c1a8e2.aspx)；不把精确年月地点断言为定论 |
| 春晓 | [孟浩然《春晓》](https://m.gushiwen.cn/shiwenv_ccee5691ba93.aspx) |
| 悯农·其二 | [浙江师范大学诗文资料](https://rw.zjnu.edu.cn/_upload/article/files/0b/61/2d54affb4443a594305bf9ecea79/18144959-03b8-45eb-a83f-40fbe4b3da1b.pdf)；采用当代通行“盘中餐”，其他古本可见“盘中飧” |
| 风 | [《风》（李峤）](https://zh.wikisource.org/zh-hans/風_(李嶠)) |
| 池上 | [《池上二绝》](https://zh.wikisource.org/zh-hans/池上二絕)；本课为完整其二 |
| 鸟鸣涧 | [《皇甫岳云溪杂题五首·鸟鸣涧》](https://zh.wikisource.org/zh-hans/皇甫嶽雲溪雜題五首/鳥鳴澗) |
| 小儿垂钓 | [原文参考](https://www.gushiwen.cn/shiwenv_200d28227643.aspx) |
| 绝句·迟日江山丽 | [完整绝句](https://zh.wikisource.org/zh-hans/絕句（遲日江山麗）) |
| 咏柳 | [原文参考](https://www.gushiwen.cn/gushiwen_495585c71e.aspx) |
| 望庐山瀑布 | [《望庐山瀑布》](https://zh.wikisource.org/zh-hans/望廬山瀑布)；本课为完整七言绝句其二，不是从长诗截取四句 |
| 夜宿山寺 | [原文与归属参考](https://m.gushiwen.cn/shiwenv_85f036fcc038.aspx)；保留归属、具体地点的考证不确定性 |
| 山行 | [《山行》（杜牧）](https://zh.wikisource.org/zh-hans/山行_(杜牧))；采用“白云生处”，不把“深处”另计一首 |
| 赠汪伦 | [原文](https://zh.wikisource.org/zh-hans/贈汪倫) |
| 望天门山 | [原文](https://zh.wikisource.org/zh-hans/望天門山) |
| 江畔独步寻花·其六 | [七首组诗原文](https://zh.wikisource.org/zh-hans/江畔獨步尋花七絕句)；本课为完整其六 |
| 如梦令·常记溪亭日暮 | [原文及背景参考](https://www.gushiwen.cn/shiwenv.aspx?id=3e33bfbb8f79)；只说回忆和通常的早期归属 |
| 如梦令·昨夜雨疏风骤 | [原文](https://zh.wikisource.org/zh-hans/如夢令_(李清照)/如夢令_(昨夜雨疏風驟)) |
| 清平乐·村居 | [原文及背景参考](https://www.gushiwen.cn/shiwenv_03e80e28a0c2.aspx)；农家人物不被编成作者家属 |
| 西江月·夜行黄沙道中 | [原文及背景参考](https://www.gushiwen.cn/shiwenv_f090d65212f4.aspx)；“见”按“现”的语境读 `xiàn` |
| 破阵子·燕子来时新社 | [完整原文](https://www.gushiwen.cn/gushiwen_99548c0eea.aspx) |

每条记录的 `backgroundSource` 指向原文、古代词评或支持主要背景断言的具体古籍。全库的原文快照匹配关系另见 `scripts/poetry-source/editorial-review-audit.json` 的 `sourceRecord`，不会用只有诗文的 JSON 假称已证明额外历史事实。未知年月地点明说不详或未确证；原序明确交代的线索予以保留，例如姜夔《踏莎行》自序的丁未年元日、金陵江上。

## 拼音与文本加工

- `pypinyin==0.55.0` 产生普通话带声调初稿，MIT 许可保存在 `scripts/poetry-source/pypinyin-LICENSE.txt`。
- `opencc-python-reimplemented==0.1.7` 将繁体快照转为简体，Apache 许可保存在 `scripts/poetry-source/opencc-LICENSE.txt`。
- `pinyin` 为二维数组，与每行汉字顺序一一对应，标点不占音节。汉字识别包含 CJK 扩展区与兼容汉字，避免跳过 `𫛸` 等罕见字而使后续注音错位；为 `𫛸 tí` 和初版异本所见 `𫓩 cōng` 补充字音。最终保留的晏殊池塘篇使用底本“琮 cóng”。默认按现代普通话朗读，不要求儿童掌握中古音和古韵读法。启蒙课对“一”的部分常用口语变调作了词组校订，不能把朗读变调当成另一种本调。
- 上游正文内的括号版本注记被移除，防止把“某字一作某字”朗读进诗歌。完整快照仍保留这些注记。
- 规范化汉字全文去重；异署的同一作品也不能另算一首。同名而独立的作品用首句或组诗编号区分。
- 上游《千家诗》错把谢枋得标为唐人，相关作品已从唐诗候选中排除；《题松汀驿》的“张佑”已据[原文署名](https://zh.wikisource.org/zh-hant/題松汀驛)改为“张祜”。《社日》有王驾/张演异署，保留所用《千家诗》的张演，并在背景中说明异署。《寻隐者不遇》也说明孙革异署。王安石误署的“留春不住”未纳入选集。
- `poem-133` 原始快照误将“暮云收尽溢清寒”署为杜牧唐诗；已据苏轼自己的[《书彭城观月诗》](https://zh.wikisource.org/wiki/書彭城觀月詩)改为苏轼《阳关曲·中秋月》宋词，因此最终朝代数量是 219/81。
- 保存了 7 处原文校订记录：`043`“呜”据[《全唐诗》卷139](https://zh.wikisource.org/wiki/全唐詩/卷139)校“鸣”（第二句仍沿《千家诗》“春来”异文）；`181` 去掉上游错配括号版本注记，字句可核[《夜上受降城闻笛》](https://zh.wikisource.org/wiki/夜上受降城聞笛)；`244`“春折威”据[《绝妙好词笺》卷一](https://zh.wikisource.org/wiki/絶妙好詞箋_(四庫全書本)/卷1)校“春威折”；`271`“把洒”校“把酒”；`273` 补“罥”；`277` 补“縠”；`280`“守著”按现代助词规范作“守着”。原始快照没有改写，校订在编辑映射内完成。
- 开发阶段仅替换四个重复作品 ID：`poem-231` 改为苏轼《水调歌头·明月几时有》、`poem-235` 改为苏轼《定风波·莫听穿林打叶声》、`poem-279` 改为辛弃疾《青玉案·元夕》、`poem-280` 改为李清照《声声慢·寻寻觅觅》。四首完整原文均已在原始宋词快照中，其他课程 ID 保持原作品。原来的两首《生查子·关山魂梦长》、两首《点绛唇·新月娟娟》及两组欧阳修/晏殊异署《玉楼春》各仅计一首。
- 逐篇核对语境易错音并保存词组映射，例如 `卷帘 juǎn`、`飞将 jiàng`、`场圃 cháng`、`矰缴 zhuó`、`掞天 yàn`、`燕草 yān`、`飞沈 chén`、`尽 jìn`、`泊 bó`、`缝 féng`、`还 huán`、`蹊 xī`、`长 cháng`、`亡 wú`、`见 xiàn`。`返景`按通“影”读 `yǐng`，`斜`用现代音 `xié`。本库所有“似”均是相像、似乎义，读 `sì`；姜夔“郎行”的“行”按人称后处所义读 `háng`，可核[教育部《重编国语辞典》](https://dict.revised.moe.edu.tw/dictView.jsp?ID=4915)。审计直接检查生成后的音节，防止较长的词典条目覆盖短词修正。

## 编辑覆盖和完成边界

目前 **300 首 `edited`，0 首 `draft`**。`edited` 表示本轮由自动化助手逐首编写了专门的诗意说明、问题、理由、现实活动，并检查语境注音；**不代表已经通过人类语文教师、学者或儿童教学验证**。后 80 首由另一位内容编写助手单独交付，随后交叉复查高风险作品并校正生成结果。

首批精编范围为 `poem-001` 至 `poem-040`：咏鹅、静夜思、春晓、登鹳雀楼、悯农·其二、风、池上、江雪、寻隐者不遇、鹿柴、鸟鸣涧、竹里馆、相思、小儿垂钓、绝句·两个黄鹂鸣翠柳、绝句·迟日江山丽、咏柳、回乡偶书·其一、九月九日忆山东兄弟、游子吟、望庐山瀑布、早发白帝城、独坐敬亭山、夜宿山寺、山行、清明、赠汪伦、望天门山、赋得古原草送别、江畔独步寻花·其六、宿建德江、问刘十九、终南望余雪、如梦令·常记溪亭日暮、如梦令·昨夜雨疏风骤、清平乐·村居、西江月·夜行黄沙道中、破阵子·燕子来时新社、卜算子·咏梅、浣溪沙·一曲新词酒一杯。

`poem-041` 至 `poem-220` 已逐篇重写，涵盖咏物、送别、思乡、田园、怀古、边塞、宫怨和神话典故；理解题解释真实诗意，活动转化为观察、表达、陪伴与纸上创作。首批 40 首的背景也已逐项复查，清除了由意象词生成的“构成本课故事”说明，并补具体原典链接。神话明确为想象，文学比喻不当作真实事件，未知年月地点明说不详。古代饮酒、战争、殉夫、宫廷身份等内容由家长陪读，课程不把旧价值观转成幼儿行为要求。

`poem-221` 至 `poem-300` 的逐篇补丁保存为 `scripts/poetry-source/edits-221-300.json`，80 首均有涵盖全篇的说明、活动和理解题。最终 300 条释义、背景、活动和题干分别各有 300 个不同值；这只证明未重复同一份内容，不作为语义正确的充分证据。

全 300 条编辑映射与原文来源对应关系已核验：274 条可逐字匹配规范化原始快照，19 条为首批补充经典或通行异文，7 条有显式校订记录。另选 20 首进行独立于该批编写者的完整语义复查，重点检查后半篇、讽刺、典故、异署、未知史实与活动边界。前段覆盖 `111、112、127、133、137、141、152、163、174、208`，后段覆盖 `236、247、258、265、271、279、280、284、287、288`；证据分别在 `review-spotchecks-early.json` 和 `review-spotchecks-late.json`。额外修正了 `269` 以泪研墨的想象、`274` 题解误提水花、`299` 原序与郎行字音。

真实边界：300 首已完成本轮内容编辑；20 首完成额外交叉语义复查，不能把这个数字说成 300 首独立专家审核。下一步教学验证应由教师和亲子实际使用检查解释深度、问题难度、情绪负担与音频清晰度，古音及文学争议应保留讨论空间。课程 ID 发布后必须保留，调整顺序或替换作品需要显式迁移本地进度。

## 可重复审计

```sh
python3 -m venv /tmp/kidchinese-poetry-venv
/tmp/kidchinese-poetry-venv/bin/pip install pypinyin==0.55.0 opencc-python-reimplemented==0.1.7
/tmp/kidchinese-poetry-venv/bin/python scripts/build-poems.py
/tmp/kidchinese-poetry-venv/bin/python scripts/build-poems.py --check
/tmp/kidchinese-poetry-venv/bin/python scripts/build-poems-review.py
/tmp/kidchinese-poetry-venv/bin/python scripts/build-poems-review.py --check
```

构建脚本检查 300 首、ID 与独立全文唯一性、标题作者可区分、朝代体裁、每行拼音长度和合法字符、背景链接、释义活动、问题答案、正文无版本注记，以及已校订的易错语境；`edited` 不允许保留初版背景模板。结果保存在 `scripts/poetry-source/coverage-audit.json`，原始快照与编辑补丁分别记录校验值。

`build-poems-review.py` 将 300 条映射、原文匹配、20 首交叉复查记录与具体修正绑定到最终数据哈希，并独立用 Unicode `Script=Han` 核对 **10,156 个汉字对应 10,156 个音节**。它对所有作者之间的全文相似度进行筛查，当前没有超过 0.88 的近似重复对。结果保存在 `editorial-review-audit.json`。后批的 85 条编辑指定语境短语还在持久化数据中逐个定位，共 85 处全部匹配、0 缺失、0 不一致，证据为 `pinyin-final-verification.json`；这不等于试听了全部音频，也不证明其他字音绝无错漏。结构检查不代替内容与教学审核。
