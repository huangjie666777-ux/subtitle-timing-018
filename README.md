# 字幕时间轴校准工作台

Vue与TypeScript基础项目，尚未实现字幕业务。

## 开发

Node.js22.16.0，npm10.9.2。依赖版本已锁定于package-lock.json。

```bash
npm ci
npm run dev
npm run build
npm test
```

Vite启动后以终端显示的本地地址为准。测试运行器已配置，业务测试由实现者补充。

当前WSL可用的Linux Node工具链位于以下路径。若终端找不到node或误用了Windows npm，先在当前终端设置：

```bash
export PATH="/home/hj/.local/share/cc-codex/toolchains/node-v22.16.0-case002/node-v22.16.0-linux-x64/bin:$PATH"
```
