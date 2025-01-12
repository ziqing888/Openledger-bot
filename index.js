const fs = require('fs');
const WebSocket = require('ws');
const axios = require('axios');
const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { v4: generateUUID } = require('uuid');
const colors = require('colors'); // 用于彩色日志输出

// 设置时区为上海
const timeZone = 'Asia/Shanghai';

class OpenLedgerBot {
    constructor() {
        this.dataStore = this.loadDataStore();
        this.gpuList = this.loadGPUList();
        this.wallets = this.loadWallets('account.txt');
        this.proxies = this.loadProxies('proxy.txt');
        this.accountIDs = {};
        this.proxyIndex = 0;

        // 检查代理数量是否足够
        if (this.proxies.length > 0 && this.proxies.length < this.wallets.length) {
            console.error('代理的数量少于钱包数量。请提供足够的代理。'.red.bold);
            process.exit(1);
        }
    }

    // 加载或初始化数据存储
    loadDataStore() {
        try {
            const data = fs.readFileSync('data.json', 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.log('未找到现有数据存储，正在创建新的 data.json 文件。'.yellow);
            return {};
        }
    }

    // 加载 GPU 列表
    loadGPUList() {
        try {
            const gpuData = fs.readFileSync('src/gpu.json', 'utf8');
            return JSON.parse(gpuData);
        } catch (error) {
            console.error('加载 GPU 列表失败：'.red, error.message);
            process.exit(1);
        }
    }

    // 加载钱包地址列表
    loadWallets(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return content.trim().split(/\s+/).filter(Boolean);
        } catch (error) {
            console.error(`读取 ${filePath} 文件时出错：`.red, error.message);
            process.exit(1);
        }
    }

    // 加载代理列表
    loadProxies(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                console.log('代理文件未找到，将不使用代理。'.yellow);
                return [];
            }
            const content = fs.readFileSync(filePath, 'utf8');
            return content.trim().split(/\s+/).filter(Boolean);
        } catch (error) {
            console.error(`读取 ${filePath} 文件时出错：`.red, error.message);
            return [];
        }
    }

    // 显示欢迎信息
    displayWelcome() {
        console.log(colors.cyan('<|============================================|>'));
        console.log(colors.cyan('             OpenLedger 机器人'));
        console.log(colors.cyan('        电报频道：https://t.me/ksqxszq'));
        console.log(colors.cyan('<|============================================|>'));
    }

    // 询问是否使用代理
    async askProxyUsage() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            const question = () => {
                rl.question('是否使用代理？(y/n): ', (answer) => {
                    if (answer.toLowerCase() === 'y') {
                        rl.close();
                        resolve(true);
                    } else if (answer.toLowerCase() === 'n') {
                        rl.close();
                        resolve(false);
                    } else {
                        console.log('请输入 y 或 n。'.red);
                        question();
                    }
                });
            };
            question();
        });
    }

    // 生成令牌
    async generateToken(address, proxy = null) {
        try {
            const config = {
                headers: { 'Content-Type': 'application/json' },
                timeout: 20000,
            };
            if (proxy) {
                config.httpsAgent = new HttpsProxyAgent(proxy);
            }
            const response = await axios.post('https://apitn.openledger.xyz/api/v1/auth/generate_token', { address }, config);
            return response.data?.data?.token || null;
        } catch (error) {
            console.error(`为钱包 ${address} 生成令牌时出错：`.red, error.message);
            return null;
        }
    }

    // 获取或初始化钱包数据
    async initializeWallet(address, proxy) {
        if (!this.dataStore[address]) {
            this.dataStore[address] = {
                address,
                workerID: Buffer.from(address).toString('base64'),
                id: generateUUID(),
                token: null,
                gpu: null,
                storage: null
            };
        }

        if (!this.dataStore[address].token) {
            const token = await this.generateToken(address, proxy);
            if (!token) {
                console.log(`无法生成钱包 ${address} 的令牌，暂时跳过。`.yellow);
                return null;
            }
            this.dataStore[address].token = token;
            this.saveDataStore();
        }

        return this.dataStore[address];
    }

    // 保存数据存储到文件
    saveDataStore() {
        try {
            fs.writeFileSync('data.json', JSON.stringify(this.dataStore, null, 2));
        } catch (error) {
            console.error('保存数据存储到 data.json 时出错：'.red, error.message);
        }
    }

    // 获取下一个代理
    getNextProxy() {
        if (this.proxies.length === 0) {
            console.error('没有可用的代理！'.red.bold);
            return null;
        }
        const proxy = this.proxies[this.proxyIndex];
        this.proxyIndex = (this.proxyIndex + 1) % this.proxies.length;
        return this.ensureProxyScheme(proxy);
    }

    // 确保代理包含协议
    ensureProxyScheme(proxy) {
        const schemes = ["http://", "https://", "socks4://", "socks5://"];
        if (schemes.some(scheme => proxy.startsWith(scheme))) {
            return proxy;
        }
        return `http://${proxy}`; // 默认使用 http 协议
    }

    // 获取账户ID
    async fetchAccountID(token, address, index, useProxy, delay = 60000) {
        const proxy = useProxy ? this.getNextProxy() : null;
        const config = {
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 20000,
        };
        if (proxy) {
            config.httpsAgent = new HttpsProxyAgent(proxy);
        }

        let attempt = 1;
        while (true) {
            try {
                const response = await axios.get('https://apitn.openledger.xyz/api/v1/users/me', config);
                const accountID = response.data.data.id;
                this.accountIDs[address] = accountID;
                console.log(colors.yellow(`[${index + 1}]`).yellow, `账户ID ${colors.cyan(accountID)}，代理：${colors.cyan(proxy || '无')}`);
                return;
            } catch (error) {
                console.error(colors.yellow(`[${index + 1}]`).yellow, `获取账户ID失败，第 ${attempt} 次尝试：`.red, error.message);
                console.log(colors.yellow(`[${index + 1}]`).yellow, `将在 ${delay / 1000} 秒后重试...`.yellow);
                await this.delay(delay);
                attempt++;
            }
        }
    }

    // 获取账户详情
    async fetchAccountDetails(token, address, index, useProxy, retries = 3, delay = 60000) {
        const proxy = useProxy ? this.getNextProxy() : null;
        const config = {
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 20000,
        };
        if (proxy) {
            config.httpsAgent = new HttpsProxyAgent(proxy);
        }

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const [realtime, history, reward] = await Promise.all([
                    axios.get('https://rewardstn.openledger.xyz/api/v1/reward_realtime', config),
                    axios.get('https://rewardstn.openledger.xyz/api/v1/reward_history', config),
                    axios.get('https://rewardstn.openledger.xyz/api/v1/reward', config)
                ]);

                const totalHeartbeats = parseInt(realtime.data.data[0]?.total_heartbeats || 0, 10);
                const totalPoints = parseFloat(reward.data.data?.totalPoint || 0);
                const epochName = reward.data.data?.name || '';

                const total = totalHeartbeats + totalPoints;

                console.log(
                    colors.yellow(`[${index + 1}]`).yellow,
                    `钱包 ${colors.cyan(address)}，账户ID ${colors.cyan(this.accountIDs[address])}，总心跳 ${colors.green(totalHeartbeats)}，总积分 ${colors.green(total.toFixed(2))} (${colors.yellow(epochName)})，代理：${colors.cyan(proxy || '无')}`
                );
                return;
            } catch (error) {
                console.error(colors.yellow(`[${index + 1}]`).yellow, `获取账户详情失败，第 ${attempt} 次尝试：`.red, error.message);
                if (attempt < retries) {
                    console.log(colors.yellow(`[${index + 1}]`).yellow, `将在 ${delay / 1000} 秒后重试...`.yellow);
                    await this.delay(delay);
                } else {
                    console.error('所有重试次数均失败，无法获取账户详情。'.red);
                }
            }
        }
    }

    // 检查并领取奖励
    async checkAndClaimReward(token, address, index, useProxy, retries = 3, delay = 60000) {
        const proxy = useProxy ? this.getNextProxy() : null;
        const config = {
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 20000,
        };
        if (proxy) {
            config.httpsAgent = new HttpsProxyAgent(proxy);
        }

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const claimDetails = await axios.get('https://rewardstn.openledger.xyz/api/v1/claim_details', config);
                const claimed = claimDetails.data.data?.claimed;

                if (!claimed) {
                    const claimReward = await axios.get('https://rewardstn.openledger.xyz/api/v1/claim_reward', config);
                    if (claimReward.data.status === 'SUCCESS') {
                        console.log(
                            colors.yellow(`[${index + 1}]`).yellow,
                            `钱包 ${colors.cyan(address)}，账户ID ${colors.cyan(this.accountIDs[address])} `,
                            colors.green('成功领取每日奖励！').green
                        );
                    }
                }
                return;
            } catch (error) {
                console.error(colors.yellow(`[${index + 1}]`).yellow, `领取奖励失败，第 ${attempt} 次尝试：`.red, error.message);
                if (attempt < retries) {
                    console.log(colors.yellow(`[${index + 1}]`).yellow, `将在 ${delay / 1000} 秒后重试...`.yellow);
                    await this.delay(delay);
                } else {
                    console.error('所有重试次数均失败，无法领取奖励。'.red);
                }
            }
        }
    }

    // 定期检查并领取奖励
    async periodicRewardCheck(useProxy) {
        const processRewards = async () => {
            const tasks = this.wallets.map(async (address, index) => {
                const { token } = this.dataStore[address] || {};
                if (!token) return;
                await this.checkAndClaimReward(token, address, index, useProxy);
            });
            await Promise.all(tasks);
        };

        await processRewards();

        setInterval(async () => {
            await processRewards();
        }, 12 * 60 * 60 * 1000); // 每12小时执行一次
    }

    // 建立 WebSocket 连接
    connectWebSocket(record, index, useProxy) {
        const { token, workerID, id, address } = record;
        const proxy = useProxy ? this.getNextProxy() : null;
        const wsURL = `wss://apitn.openledger.xyz/ws/v1/orch?authToken=${token}`;
        const options = {
            headers: {
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'zh-CN,zh;q=0.9',
                'Cache-Control': 'no-cache',
                'Connection': 'Upgrade',
                'Host': 'apitn.openledger.xyz',
                'Origin': 'chrome-extension://ekbbplmjjgoobhdlffmgeokalelnmjjc',
                'Pragma': 'no-cache',
                'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits',
                'Sec-WebSocket-Key': '0iJKzoEtY2vsWuXjR8ZSng==',
                'Sec-WebSocket-Version': '13',
                'Upgrade': 'websocket',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        };
        if (proxy) {
            options.agent = new HttpsProxyAgent(proxy);
        }

        const ws = new WebSocket(wsURL, options);
        let heartbeatInterval;

        ws.on('open', () => {
            console.log(
                colors.yellow(`[${index + 1}]`).yellow,
                `账户ID ${colors.cyan(this.accountIDs[address])} 已连接 WebSocket，workerID ${colors.yellow(workerID)}，代理：${colors.cyan(proxy || '无')}`
            );

            const registerMessage = {
                workerID,
                msgType: 'REGISTER',
                workerType: 'LWEXT',
                message: {
                    id,
                    type: 'REGISTER',
                    worker: {
                        host: 'chrome-extension://ekbbplmjjgoobhdlffmgeokalelnmjjc',
                        identity: workerID,
                        ownerAddress: address,
                        type: 'LWEXT'
                    }
                }
            };
            ws.send(JSON.stringify(registerMessage));

            // 启动心跳机制
            heartbeatInterval = setInterval(() => {
                this.sendHeartbeat(ws, address, workerID, index, proxy);
            }, 30000); // 每30秒发送一次心跳
        });

        ws.on('message', (data) => {
            console.log(
                colors.yellow(`[${index + 1}]`).yellow,
                `账户ID ${colors.cyan(this.accountIDs[address])} 接收到消息：${data}，代理：${colors.cyan(proxy || '无')}`
            );
        });

        ws.on('error', (error) => {
            console.error(colors.yellow(`[${index + 1}]`).yellow, `账户ID ${colors.cyan(this.accountIDs[address])} WebSocket 错误：`.red, error);
        });

        ws.on('close', () => {
            console.log(
                colors.yellow(`[${index + 1}]`).yellow,
                `账户ID ${colors.cyan(this.accountIDs[address])} WebSocket 连接已关闭，workerID ${colors.yellow(workerID)}，代理：${colors.cyan(proxy || '无')}`
            );
            clearInterval(heartbeatInterval);

            // 30秒后尝试重新连接
            setTimeout(() => {
                console.log(
                    colors.yellow(`[${index + 1}]`).yellow,
                    `尝试重新连接 WebSocket，workerID ${colors.yellow(workerID)}，代理：${colors.cyan(proxy || '无')}`
                );
                this.connectWebSocket(record, index, useProxy);
            }, 30000); // 30秒后重连
        });
    }

    // 发送心跳信息
    sendHeartbeat(ws, address, workerID, index, proxy) {
        this.assignResources(address);
        const assignedGPU = this.dataStore[address].gpu || '';
        const assignedStorage = this.dataStore[address].storage || '';
        const heartbeatMessage = {
            message: {
                Worker: {
                    Identity: workerID,
                    ownerAddress: address,
                    type: 'LWEXT',
                    Host: 'chrome-extension://ekbbplmjjgoobhdlffmgeokalelnmjjc'
                },
                Capacity: {
                    AvailableMemory: (Math.random() * 32).toFixed(2),
                    AvailableStorage: assignedStorage,
                    AvailableGPU: assignedGPU,
                    AvailableModels: []
                }
            },
            msgType: 'HEARTBEAT',
            workerType: 'LWEXT',
            workerID
        };

        console.log(
            colors.yellow(`[${index + 1}]`).yellow,
            `账户ID ${colors.cyan(this.accountIDs[address])} 正在发送心跳信息，workerID：${colors.yellow(workerID)}，代理：${colors.cyan(proxy || '无')}`
        );
        ws.send(JSON.stringify(heartbeatMessage));
    }

    // 分配资源
    assignResources(address) {
        if (!this.dataStore[address].gpu || !this.dataStore[address].storage) {
            const randomGPU = this.gpuList[Math.floor(Math.random() * this.gpuList.length)];
            const randomStorage = (Math.random() * 500).toFixed(2);

            this.dataStore[address].gpu = randomGPU;
            this.dataStore[address].storage = randomStorage;

            this.saveDataStore();
        }
    }

    // 延迟函数
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 处理所有钱包
    async processWallets(useProxy) {
        const tasks = this.wallets.map(async (address, index) => {
            const proxy = useProxy ? this.getNextProxy() : null;
            const walletData = await this.initializeWallet(address, proxy);
            if (!walletData || !walletData.token) {
                console.log(`跳过钱包 ${address}，因为缺少令牌。`.yellow);
                return;
            }

            await this.fetchAccountID(walletData.token, address, index, useProxy);
            if (!this.accountIDs[address]) {
                console.log(`钱包 ${address} 没有有效的账户ID，跳过后续步骤...`.yellow);
                return;
            }

            this.assignResources(address);
            await this.fetchAccountDetails(walletData.token, address, index, useProxy);
            await this.checkAndClaimReward(walletData.token, address, index, useProxy);

            this.connectWebSocket(walletData, index, useProxy);
        });

        await Promise.all(tasks);
    }

    // 定期更新账户详情
    async periodicUpdateAccountDetails(useProxy) {
        setInterval(async () => {
            const tasks = this.wallets.map(async (address, index) => {
                const { token } = this.dataStore[address] || {};
                if (!token) return;
                await this.fetchAccountDetails(token, address, index, useProxy);
            });
            await Promise.all(tasks);
        }, 5 * 60 * 1000); // 每5分钟执行一次
    }

    // 启动程序
    async start() {
        this.displayWelcome();
        const useProxy = await this.askProxyUsage();
        await this.periodicRewardCheck(useProxy);
        await this.processWallets(useProxy);
        this.periodicUpdateAccountDetails(useProxy);
    }
}

// 实例化并启动助手
const bot = new OpenLedgerBot();
bot.start().catch(error => {
    console.error('程序运行时出错：'.red, error);
});
