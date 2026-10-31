# 把程序接到你的公众号上

> 一句话：**代码不上传到微信**。程序跑在你自己的服务器（或内网穿透出来的地址）上，公众号后台只做一件事——把粉丝发的消息转发到你的 URL，并等你 5 秒内回一条。

```
粉丝发消息 ──▶ 微信服务器 ──POST https://你的域名/wechat──▶ 你的程序
                     ◀──XML 回复（5 秒内）──────────────────┘
```

---

## 一、先对号入座

| 你的情况 | 能做到什么 | 走哪节 |
| --- | --- | --- |
| 有服务器 + 域名，号已认证（企业主体） | 全自动：关键词回复 + 草稿箱推送 + 自定义菜单 | 路线 A，然后第 4 节 |
| 有服务器 + 域名，但没认证（含个人订阅号） | 关键词/随机/今日回复全自动；图文推送仍是"半自动" | 路线 A，然后第 3 节 |
| 没有服务器，只想先跑通 | 用内网穿透 + 微信接口测试号 | 路线 B |
| 还没有公众号 | 先在本地看效果，注册后在后台拿 AppID | 先看 README「快速开始」 |

> 个人主体订阅号**无法微信认证**，因此拿不到群发、草稿箱、自定义菜单接口（调用会返回 `48001`）。这不是程序的问题，是平台权限。

---

## 二、路线 A：部署到服务器

### 1. 服务器要满足的条件

- Node.js **20 及以上**（`node -v` 确认）
- 公网能访问 **80 / 443** 端口（微信只认这两个端口）
- 一个解析到这台机器的域名
- 国内主机需要 **ICP 备案**（80/443 会被抽查），境外主机不需要
- 1 核 1G 足够；这个程序常驻内存约 40MB

### 2. 把代码放上去

```bash
# 方式一：git
git clone <你的仓库> /opt/knowledge-share

# 方式二：本地打包上传
scp -r wechat-knowledge-share root@你的服务器:/opt/
```

不需要 `npm install`——这个项目零依赖。

### 3. 配置 `.env`

```bash
cd /opt/knowledge-share
cp .env.example .env
vi .env
```

至少要改这几项：

```ini
PORT=3000
ADMIN_PASSWORD=换成你的强密码
PUBLIC_BASE_URL=https://kb.example.com   # 必须是对外域名，用于生成文章链接
WECHAT_TOKEN=自己起一个随机字符串          # 等会儿要原样填进公众平台
WECHAT_MODE=mock                          # 先留 mock，跑通再改 live
TZ_NAME=Asia/Shanghai
```

### 4. 用 systemd 守护（挂了自动拉起）

`/etc/systemd/system/knowledge-share.service`：

```ini
[Unit]
Description=WeChat Knowledge Share
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/knowledge-share
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=3
EnvironmentFile=/opt/knowledge-share/.env
User=www-data
# 日志走 journald，用 journalctl -u knowledge-share -f 查看
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now knowledge-share
sudo systemctl status knowledge-share
```

> 不想用 systemd 也可以用 `pm2 start src/index.js --name kb`；Windows 服务器用 `nssm install`。

### 5. Nginx 反向代理 + HTTPS

```nginx
server {
    listen 80;
    server_name kb.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name kb.example.com;

    ssl_certificate     /etc/letsencrypt/live/kb.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kb.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

拿证书：`sudo certbot --nginx -d kb.example.com`

> 微信要求 5 秒内响应，反向代理不要配置过大的缓冲/重试，保持默认即可。

### 6. 自检（重要）

填公众平台之前，先确认这台机器自己认为链路是通的：

```bash
node scripts/doctor.mjs https://kb.example.com
# 或 npm run doctor
```

期望输出：

```
  ✓ GET /healthz 服务可访问  mode=mock
  ✓ GET /wechat 签名握手  回显 doctor-echostr
  ✓ POST /wechat 自动回复  📖 「知识小站」使用指南

  全部通过：把这个地址填到公众平台「服务器配置」的 URL 即可：
  https://kb.example.com/wechat     Token: 你配置的 Token
```

三项全绿再往下走；有一项 ✗，按它给的提示先修（连不上＝防火墙/域名/进程，回显不对＝Token 不一致）。

### 7. 在公众平台填服务器配置

1. 登录 [mp.weixin.qq.com](https://mp.weixin.qq.com) → 左侧 **设置与开发 → 基本配置**
2. 找到 **服务器配置**，点「修改配置」：
   - **URL**：`https://kb.example.com/wechat`
   - **Token**：与 `.env` 里的 `WECHAT_TOKEN` **完全一致**（区分大小写）
   - **EncodingAESKey**：点「随机生成」
   - **消息加解密方式**：选 **明文模式**
3. 点「提交」——微信会请求一次 `GET /wechat` 校验签名，通过后按钮才可用
4. 点「**启用**」

启用之后，粉丝发消息就会打到你的程序了。

### 8. 验证

- 微信里给自己的公众号发 `帮助`，应立刻收到菜单
- 发 `随机`、`复利`、`今日` 各试一次
- 后台 <https://kb.example.com/admin> → 「消息与数据」应看到刚才的记录
- 服务端日志：`journalctl -u knowledge-share -f`

---

## 三、路线 B：没有服务器，先跑通

用**微信接口测试号** + 内网穿透，30 分钟就能在手机上看到真实效果。

1. **拿测试号**：打开 <https://mp.weixin.qq.com/debug/cgi-bin/sandbox?t=sandbox/login>，微信扫码即可，无需注册、无需认证。页面上能直接看到 `appID` / `appsecret`，还能配「接口配置信息」和「自定义菜单」。
2. **起一个公网地址**：任选其一
   ```bash
   # cpolar
   cpolar http 3000
   # cloudflared
   cloudflared tunnel --url http://localhost:3000
   # ngrok
   ngrok http 3000
   ```
   会得到一个 `https://xxxx.cpolar.top` 之类的地址。
3. **填测试号后台**：接口配置信息 → URL 填 `https://xxxx.cpolar.top/wechat`，Token 与 `.env` 一致 → 提交。
4. **扫码关注测试号**，发 `帮助` 试试。
5. 注意：免费版穿透域名**重启就会变**，变了要回测试号后台同步改；后台「设置」里的 `PUBLIC_BASE_URL` 也要跟着改，否则回复里的文章链接是旧地址。

> 测试号没有 5 秒/频次之外的限制，但不能给真实粉丝用。演示完记得切回正式号。

---

## 四、认证号：把"全自动推送"打开

未认证号到第 8 步就结束了（被动回复已全自动）。认证号再补三件事：

### 1. 加 IP 白名单

**设置与开发 → 基本配置 → IP 白名单**，把服务器**出口 IP** 填进去（是服务器访问外网的 IP，不是域名解析的 IP）。不填会报 `40164`。

### 2. 拿封面 `media_id`

**素材管理 → 图片**，上传一张 900×383 左右的封面（图文消息要求），复制它的 `media_id`，填到后台 **设置 → 封面素材 media_id**。

### 3. 切真实模式

后台 → 设置 → 运行模式选 **真实模式** → 保存 → 点「测试连接」，出现 `access_token 获取成功` 即可。

然后：

- **每日推送** → 立即推送 → 图文进公众号**草稿箱** → 你去公众平台检查排版 → 手动发表（订阅号每天 1 次群发机会）
- 想让它自动提交发布：勾选「创建草稿后立即提交发布」，或 `.env` 里 `AUTO_PUBLISH=true`
- **自定义菜单**：`curl -X POST https://你的域名/admin/api/menu -H "Cookie: 登录后的cookie"`，或直接调 `client.createMenu()`；菜单结构在 `src/wechat/client.js` 的 `buildDefaultMenu()`

---

## 五、权限对照（决定你能用多少功能）

| 接口 | 未认证订阅号 | 认证订阅号 |
| --- | --- | --- |
| 接收消息 / 被动回复 | ✅ | ✅ |
| 获取 access_token | ✅ | ✅ |
| 素材管理（上传封面） | ❌ | ✅ |
| 草稿箱 / 发布 | ❌ | ✅ |
| 群发 | ❌ | ✅ |
| 自定义菜单 | ❌ | ✅ |
| 客服消息 | ❌ | ✅ |

来源：微信官方接口权限表（[说明页](https://developers.weixin.qq.com/doc/service/guide/dev/push/)）。调用没权限的接口会返回 `48001 api unauthorized`。

**所以个人订阅号的现实玩法是**：关键词回复、随机、今日、关注欢迎语全部自动；图文推送用后台生成预览 → 复制进公众平台编辑器（或直接把 `data/outbox/*.html` 的内容贴进去）→ 手动发表。

---

## 六、报错对照表

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 提交配置提示「token验证失败」 | Token 不一致 / URL 不通 / 返回不是 echostr | 先跑 `npm run doctor`，看握手那一项 |
| 微信里提示「该公众号暂时无法提供服务」 | 程序挂了、超时、返回了非法 XML | 看服务日志；确认 `journalctl` 无异常 |
| 后台日志 `invalid signature` | 同上，或中间有代理改了参数 | 检查 Nginx 是否原样透传 query |
| `40164 invalid ip` | 服务器出口 IP 不在白名单 | 公众平台加 IP |
| `48001 api unauthorized` | 未认证号调了需要认证的接口 | 见第 5 节，改用半自动流程 |
| `40001 invalid credential` | access_token 失效 | 程序会自动重取一次，仍失败就检查 AppSecret |
| `45003` / 封面相关报错 | 缺 `thumb_media_id` | 上传封面并填入设置 |
| `errcode -1` 系统繁忙 | 微信侧抖动 | 重试即可 |

---

## 七、上线检查清单

- [ ] `node -v` ≥ 20，`node scripts/doctor.mjs https://你的域名` 三项全绿
- [ ] `.env` 里 `ADMIN_PASSWORD` 已改，不是 `admin123`
- [ ] `PUBLIC_BASE_URL` 是真实域名（HTTPS），否则回复里的链接打不开
- [ ] 公众平台服务器配置已「启用」，加解密方式为明文
- [ ] `.env` 和 `data/` 没有提交到公开仓库（`.gitignore` 已包含）
- [ ] 备份策略：定期复制 `data/` 目录
- [ ] 认证号额外确认：IP 白名单、封面 media_id、真实模式、测试连接通过

---

## 八、安全提醒

- 后台暴露在公网，密码务必改强；登录失败 8 次会锁定该 IP 10 分钟
- `AppSecret` 只存在服务器 `.env` 或后台设置里，不要写进前端代码
- 建议只开 443，80 端口做 301 跳转
- 微信服务器 IP 段可以从「获取微信服务器 IP」接口拿到，需要更严格的话可以在 Nginx 里做来源限制
