# macOS 启动方式说明

> 更新日期：2026-11-04
> 状态：双击启动在 macOS 27.0.1 上不可用，改用 LaunchAgent

## 1. 为什么不能双击

在本机（macOS 27.0.1、arm64）实测，`open`／双击／Launchpad 都无法启动本应用：

- 进程被 launchd 拉起后约 80 毫秒内以退出码 0 结束，主进程 JS 完全没有执行。
- 系统日志：`AMFI: .../libffmpeg.dylib has no CMS blob? → Unrecoverable CT signature issue, bailing out`。
- 崩溃报告：`Library not loaded: @rpath/Electron Framework.framework/Electron Framework`，
  `mapping process and mapped file (non-platform) have different Team IDs`。

对照实验证明与项目代码无关：

| 对象                              | `open` 启动 | 直接执行二进制 |
| --------------------------------- | ----------- | -------------- |
| 本项目 1.0.2 构建                 | 失败        | 正常           |
| 旧 1.0.1 迁移包内的 app（已删除） | 失败        | —              |
| 未改动的官方 Electron 45          | 失败        | —              |
| 系统自带计算器                    | 正常        | —              |

根因是官方 Electron 分发只带 linker 签名（zip 内不含 `_CodeSignature`），
而 `codesign --sign -` 产出的 ad-hoc 签名不满足 macOS 27 对 LaunchServices 启动应用的校验。
直接执行二进制不经过该路径，因此可用。

## 2. 当前方案：LaunchAgent

安装位置：

```text
~/Library/LaunchAgents/local.deskpet.launcher.plist
```

关键配置：

- `ProgramArguments` 直接指向 `~/Applications/日奈桌宠.app/Contents/MacOS/Electron`，绕开 LaunchServices。
- `RunAtLoad = true`：登录时自动启动。
- `KeepAlive = false`：从托盘“退出 Deskpet”后不会被自动拉起。
- `LimitLoadToSessionType = Aqua`、`ProcessType = Interactive`：保证是正常 GUI 应用。
- 日志：`~/Library/Logs/Deskpet/launcher.out.log` 与 `launcher.err.log`。

## 3. 常用命令

启动（已加载时可直接拉起）：

```bash
launchctl kickstart -k gui/$(id -u)/local.deskpet.launcher
```

查看状态：

```bash
launchctl print gui/$(id -u)/local.deskpet.launcher | grep -E "state|pid|last exit"
```

临时停用（退出应用并禁止本次登录内自动启动）：

```bash
launchctl bootout gui/$(id -u)/local.deskpet.launcher
```

重新启用：

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.deskpet.launcher.plist
```

彻底移除：

```bash
launchctl bootout gui/$(id -u)/local.deskpet.launcher
rm ~/Library/LaunchAgents/local.deskpet.launcher.plist
```

## 4. 重新打包后要注意

- 覆盖安装到同一路径时 plist 无需改动，直接
  `npm run package:app` 后再 `launchctl kickstart -k` 即可。
- 如果移动了 `.app` 位置或改了应用名，必须同步修改 plist 里的 `ProgramArguments`。
- 打包脚本本身不需要改；它产出的签名对“直接执行”路径是有效的。

## 5. 要让双击恢复正常

只有正规签名才能过 LaunchServices 校验，需要：

1. Apple Developer ID 证书；
2. `codesign` 使用该证书并对整个 bundle 做正确签名；
3. `notarytool` 提交公证并 stapling。

在拿到证书前，LaunchAgent 是本机唯一稳定的启动方式。

## 6. TCC 授权为什么每次更新都要重给

辅助功能（Accessibility）与自动化（Automation）属于 macOS 的 TCC 保护范围。
TCC 记录授权时绑定的是应用的**代码身份**：

- 使用 ad-hoc 签名（`codesign --sign -`）时，身份退化为 CDHash；
- 每次重新打包、资源变化都会产生新的 CDHash；
- macOS 因此把更新后的应用当成"另一个应用"，要求重新授权。

### 现在的做法：稳定的自签名身份

本机已创建自签名代码签名证书 `Deskpet Local Signing`，
打包脚本会优先用它签名（见 `scripts/package-macos-app.zsh`）：

```text
Authority=Deskpet Local Signing
designated => identifier "local.deskpet.hina" and certificate leaf = H"4c32b6b7..."
```

designated requirement 里只有 bundle id 与证书指纹，两者都不随构建变化，
因此 TCC 授权可以跨版本保留。

**切换身份后需要再授权一次**（因为身份从 ad-hoc 变成了证书），之后更新不再重复询问。

### 身份丢失如何恢复

私钥与证书保存在：

```text
~/Library/Deskpet/signing/deskpet.key
~/Library/Deskpet/signing/deskpet.crt
~/Library/Deskpet/signing/deskpet.p12
```

若换了 Mac 或误删，按以下步骤重建（CN 必须保持 `Deskpet Local Signing`）：

```bash
cd ~/Library/Deskpet/signing
openssl req -x509 -newkey rsa:2048 -keyout deskpet.key -out deskpet.crt -days 3650 -nodes \
  -subj "/CN=Deskpet Local Signing" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning" \
  -addext "basicConstraints=critical,CA:false"
openssl rsa -in deskpet.key -out deskpet-rsa.key -traditional
security import deskpet-rsa.key -k ~/Library/Keychains/login.keychain-db -f openssl \
  -T /usr/bin/codesign -T /usr/bin/security
security import deskpet.crt -k ~/Library/Keychains/login.keychain-db -f openssl \
  -T /usr/bin/codesign
security add-trusted-cert -r trustRoot -p codeSign \
  -k ~/Library/Keychains/login.keychain-db deskpet.crt
security find-identity -v -p codesigning   # 应看到 1 个有效身份
```

> PKCS#12 路线在当前 OpenSSL 3 上会报 `MAC verification failed`，
> 因此改用「传统 PEM 私钥 + 证书分别导入」的方式。

也可以通过环境变量临时指定其它身份：

```bash
DESKPET_SIGN_IDENTITY="Your Identity" npm run package:app
```
