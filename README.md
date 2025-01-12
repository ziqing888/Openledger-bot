# OpenLedger Bot

OpenLedger Bot 是一款为 OpenLedger 平台设计的自动化工具，用于简化节点交互和每日奖励领取流程。通过此工具，用户可以高效管理多个账户，并支持代理配置以增强隐私性和灵活性。

---

## 功能特点

- **多账户管理**：支持同时处理多个钱包地址的节点交互和奖励领取。
- **WebSocket 自动连接与心跳**：保持稳定的节点连接，自动发送心跳信息。
- **每日奖励自动领取**：定时检查并自动领取每日奖励。
- **代理支持**：支持 HTTP 和 SOCKS 代理，增强隐私性并适应复杂的网络环境。
- **GPU 分配**：从预定义的 GPU 列表中随机分配显卡资源。
- **账户数据持久化**：自动保存账户令牌、GPU 配置等数据，便于长期使用。

---

## 环境要求

- **Node.js**：版本 >= 14.0.0
- **npm**：版本 >= 6.0.0

---

## 安装指南

1. 克隆项目代码到本地：
   ```bash
   git clone https://github.com/ziqing888/Openledger-bot.git
    ```
   进入项目目录：
    ```
    cd openledger-bot
2.安装必要的依赖：
```
npm install
```
## 配置文件
account.txt
在项目根目录创建一个 account.txt 文件，用于存储钱包地址，每行一个。例如：
```
0x1234567890abcdef1234567890abcdef12345678
0xabcdef1234567890abcdef1234567890abcdef12
```
proxy.txt（可选）
如果需要使用代理，在项目根目录创建 proxy.txt 文件，按以下格式填写代理信息，每行一个：

```
http://proxy1.example.com:8080
socks5://proxy2.example.com:1080
http://username:password@proxy3.example.com:3128
```
## 运行程序
启动脚本：
```
node index.js
```
## 注意事项
data.json 文件：

运行时会自动生成 data.json 文件，用于保存账户数据（如令牌、GPU 分配等）。
请勿删除或修改此文件，否则会导致程序重置数据。
代理使用：

如果需要代理，请确保 proxy.txt 中的代理地址格式正确。
测试代理有效性：
```
curl -x http://proxy.example.com:8080 http://example.com
```


此工具仅供测试使用。滥用该工具可能违反 OpenLedger 平台的服务条款，导致账户被封禁。
请确保每次运行后检查日志输出，以避免操作异常。
