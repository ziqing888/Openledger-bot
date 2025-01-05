#!/bin/bash

# =============================================================================
# 脚本名称：setup_openledger.sh
# 描述：自动安装和配置 Docker、OpenLedger 节点、VNC、XFCE 和 XRDP
# 子清 电报频道：https://t.me/ksqxszq
# 日期：2025-01-06
# =============================================================================

# 设置错误处理
set -e
export DEBIAN_FRONTEND=noninteractive

# 全局变量
GPG_KEY="/usr/share/keyrings/docker-archive-keyring.gpg"
DOCKER_REPO="https://download.docker.com/linux/ubuntu"
OPENLEDGER_URL="https://cdn.openledger.xyz/openledger-node-1.0.0-linux.zip"
PASSWORD_FILE="password_to_server.txt"
VNC_PASSWD_FILE="$HOME/.vnc/passwd"
SCREEN_SESSION="openledger"

# 日志函数
log() {
    local type="$1"
    local message="$2"
    case "$type" in
        INFO)
            echo -e "\e[34m[信息]\e[0m $message"
            ;;
        SUCCESS)
            echo -e "\e[32m[成功]\e[0m $message"
            ;;
        WARNING)
            echo -e "\e[33m[警告]\e[0m $message"
            ;;
        ERROR)
            echo -e "\e[31m[错误]\e[0m $message" >&2
            ;;
        *)
            echo "$message"
            ;;
    esac
}

# 移除旧版本 Docker
remove_old_docker() {
    log "INFO" "正在移除旧版本的 Docker..."
    sudo apt remove -y docker docker-engine docker.io containerd runc || true
    log "SUCCESS" "旧版本的 Docker 已移除。"
}

# 安装所需依赖项
install_dependencies() {
    log "INFO" "正在安装所需的依赖项..."
    sudo apt update
    sudo apt install -y apt-transport-https ca-certificates curl software-properties-common xvfb unzip screen
    log "SUCCESS" "依赖项安装完成。"
}

# 添加 Docker 的官方 GPG 密钥和软件仓库
add_docker_repo() {
    log "INFO" "正在添加 Docker GPG 密钥和软件仓库..."
    if [[ -f "$GPG_KEY" ]]; then
        log "WARNING" "Docker GPG 密钥已存在，跳过覆盖。"
    else
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o "$GPG_KEY" || {
            log "ERROR" "下载或写入 GPG 密钥失败，请检查权限或网络连接。"
            exit 1
        }
        log "SUCCESS" "Docker GPG 密钥已添加。"
    fi

    echo "deb [arch=$(dpkg --print-architecture) signed-by=$GPG_KEY] $DOCKER_REPO $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    log "SUCCESS" "Docker 软件仓库已添加。"
}

# 安装 Docker
install_docker() {
    log "INFO" "正在安装 Docker..."
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io || {
        log "ERROR" "Docker 安装失败，请检查仓库配置或包的可用性。"
        exit 1
    }
    sudo docker --version
    log "SUCCESS" "Docker 已安装。"
}

# 安装 OpenLedger 依赖项
install_openledger_dependencies() {
    log "INFO" "正在安装 OpenLedger 节点所需的额外依赖项..."
    sudo apt install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libsecret-1-0 libasound2
    log "SUCCESS" "OpenLedger 依赖项已安装。"
}

# 下载并安装 OpenLedger 节点
install_openledger() {
    log "INFO" "正在下载并安装 OpenLedger 节点..."
    wget "$OPENLEDGER_URL" -O openledger-node.zip || {
        log "ERROR" "下载 OpenLedger 节点失败，请检查 URL 或网络连接。"
        exit 1
    }

    unzip openledger-node.zip
    sudo dpkg -i openledger-node-1.0.0.deb || sudo apt-get install -f -y
    sudo apt install -y desktop-file-utils
    sudo dpkg --configure -a
    log "SUCCESS" "OpenLedger 节点已安装。"
}

# 安装并配置 VNC 和 XFCE
setup_vnc_xfce() {
    log "INFO" "正在安装 VNC 和 XFCE..."
    sudo apt install -y --no-install-recommends tightvncserver xfce4 xfce4-goodies mesa-utils libgl1-mesa-glx vainfo libva-glx2 libva-drm2 dbus-x11 libegl1-mesa
    sudo service dbus start
    log "SUCCESS" "VNC 和 XFCE 已安装。"
}

# 安装并配置 XRDP
setup_xrdp() {
    log "INFO" "正在安装并配置 XRDP..."
    sudo apt install -y xrdp
    sudo systemctl enable xrdp
    sudo systemctl start xrdp
    log "SUCCESS" "XRDP 已安装并启动。"
}

# 配置 SSH 以支持 X11 转发
configure_ssh() {
    log "INFO" "正在配置 SSH 以支持 X11 转发..."
    sudo sed -i '/^#X11Forwarding /c\X11Forwarding yes' /etc/ssh/sshd_config
    sudo sed -i '/^#X11DisplayOffset /c\X11DisplayOffset 10' /etc/ssh/sshd_config
    sudo sed -i '/^#X11UseLocalhost /c\X11UseLocalhost yes' /etc/ssh/sshd_config
    sudo systemctl restart sshd
    log "SUCCESS" "SSH 配置已更新并重启。"
}

# 生成或获取 VNC 密码
setup_vnc_password() {
    log "INFO" "正在设置 VNC 密码..."
    if [[ -s "$PASSWORD_FILE" ]]; then
        password=$(<"$PASSWORD_FILE")
        log "INFO" "使用现有密码。"
    else
        password="lazy$(shuf -i 1000-9999 -n 1)"
        echo "$password" > "$PASSWORD_FILE"
        log "INFO" "生成的新密码已保存。"
    fi

    mkdir -p "$HOME/.vnc"
    echo "$password" | vncpasswd -f > "$VNC_PASSWD_FILE"
    chmod 600 "$VNC_PASSWD_FILE"
    log "SUCCESS" "VNC 密码已设置。"
}

# 清理 VNC 锁文件
cleanup_vnc_locks() {
    log "INFO" "正在清理 VNC 锁文件..."
    rm -f /tmp/.X1-lock /tmp/.X11-unix/X1
    log "SUCCESS" "VNC 锁文件已清理。"
}

# 启动 VNC 服务器
start_vnc_server() {
    log "INFO" "正在启动 VNC 服务器..."
    vncserver :1
    log "SUCCESS" "VNC 服务器已启动。"
}

# 启动 OpenLedger 节点
start_openledger() {
    log "INFO" "正在在 screen 会话中启动 OpenLedger 节点..."
    screen -dmS "$SCREEN_SESSION" bash -c "DISPLAY=:1 openledger-node --no-sandbox &> openledger.logs"
    log "SUCCESS" "OpenLedger 节点已在 screen 会话中运行。日志保存在 'openledger.logs' 文件中。"
}

# 主执行函数
main() {
    remove_old_docker
    install_dependencies
    add_docker_repo
    install_docker
    install_openledger_dependencies
    install_openledger
    setup_vnc_xfce
    setup_xrdp
    configure_ssh
    setup_vnc_password
    cleanup_vnc_locks
    start_vnc_server
    start_openledger

    log "SUCCESS" "设置完成。OpenLedger 节点已在 screen 会话中运行。"
}

# 执行主函数
main
