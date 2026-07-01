# OpenClaw / 微信 AI 插件配置

先在服务器启动本项目，再运行：

```bash
npx -y @tencent-weixin/openclaw-weixin-cli@latest install
```

如果安装过程要求填写大模型配置，优先使用 OpenAI 兼容配置：

| 配置项 | 推荐值 |
| --- | --- |
| Provider / 类型 | OpenAI Compatible / OpenAI 兼容 |
| Base URL | `http://127.0.0.1:8787/v1` |
| API Key | `.env` 里的 `OPENCLAW_PROXY_KEY` |
| Model | `deepseek-v4-pro` |

如果微信插件不在同一台服务器上运行，把 Base URL 改成：

```text
http://服务器公网IP:8787/v1
```

这种方式需要在云服务器安全组里放行 `8787` 端口。公网使用时建议通过 Nginx 加 HTTPS，并且一定要保留 `OPENCLAW_PROXY_KEY`。

如果 OpenClaw 安装器原生支持 DeepSeek，也可以直连：

| 配置项 | 值 |
| --- | --- |
| Base URL | `https://api.deepseek.com` |
| API Key | DeepSeek API Key |
| Model | `deepseek-v4-pro` |

直连会把 DeepSeek Key 放在插件侧；使用本项目桥接则可以把 DeepSeek Key 只放在服务器 `.env` 中。