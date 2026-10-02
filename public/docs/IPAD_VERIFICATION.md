# iPad 与局域网验证

验证日期：2026-10-02。当前工作包括手指点按、书写、拖动与洗澡手势、iPad 横竖屏布局、主屏幕独立窗口与局域网生产服务。

## 实现

- 添加 Apple 主屏幕元数据、`manifest.webmanifest`、167/180 像素 Apple 图标和 192/512 像素应用图标，`display: standalone`，横竖屏不锁定。
- 页面提供安装指引与能力检测后的全屏按钮；主屏幕独立窗口隐藏安装入口。
- 手指书写与拖动使用唯一活动指针，书写区域保留手势，普通页面可滚动；取消手势不会完成半笔。
- 生产服务监听 `0.0.0.0:5173`，支持 Safari 音频 Range、HEAD 和缓存校验；登录启动项独立于开发进程。
- 使用局域网 HTTP，不启用 Service Worker，不预缓存整个音频库，不声称离线运行。

## 当前验证

- LAN 服务的两项自动回归通过：音频范围请求与无效范围、HTTP 206、HEAD、304、缺失文件、隐藏文件与只读请求处理。
- PWA 主屏幕与应用窗口：生产构建在独立 Chromium 中8项通过、独立桌面WebKit中7项通过；WebKit跳过1项专属Chromium全屏检查。测试覆盖iPad桌面UA识别、standalone两种检测、图标加载、44×44入口、模态焦点、全屏进入/退出和拒绝时的引导。
- 两引擎在实际局域网HTTP origin加载生产构建，无JavaScript错误、无预请求音频；该origin不是secure context，Service Worker与CacheStorage不可用。
- 生产构建的触控矩阵19/19项通过，含书写、取消、越界、多指隔离、动物拖动、洗澡、草地正常滚动、图卡单点与原生滑块拖动。Chromium使用CDP合成Touch→Pointer事件，桌面WebKit使用原生tap与mouse Pointer连续拖动；其中Snow长按在独立组件fixture中验证，因为“雪”不在当前1000字课程中。全部使用隔离浏览器、合成测试存档与临时端口，没有修改实际儿童进度。
- Chromium 与 WebKit 在 375、600、820、1180 像素宽度的另外8项布局检查全部通过：首页、安装指南无横向溢出，工具栏按钮均在视口内，安装入口保持44×44像素。
- 可复查证据：`scripts/verification/ipad-touch-audit.json` 与 `scripts/verification/pwa-audit.json`，包含实际用例结果、事件方式和生产文件摘要。
- 正式生产构建已部署：`http://192.168.31.48:5173/`，macOS当前用户登录服务`com.nefeed.kidchineselearner`处于running，监听`0.0.0.0:5173`。本机对该局域网IP的首页、manifest、主屏幕图标、许可和文档请求均200；AAC范围请求返回206与1024字节。见`scripts/verification/lan-deployment-audit.json`。
- iPad需连接同一局域网，在Safari「分享」→「添加到主屏幕」，如提供「作为Web App打开」选项，保持开启，再从主屏幕图标启动。Mac须开机、登录并保持唤醒；IP若变化须使用新地址。此次未从实体iPad验证路由器隔离或访问。

## 证据边界

独立测试浏览器的 iPad viewport、触控模拟与桌面 WebKit 能验证代码路径和布局，不能证明真实 iPad Safari、屏幕边缘手势或主屏幕安装已经实测。本机没有接入可操作的真实 iPad；最终需在设备上通过本页提供的地址操作确认。
