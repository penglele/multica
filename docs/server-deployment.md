# 服务器部署说明

服务器：`39.100.67.26`，SSH 免密（本地 `~/.ssh/id_rsa`）

## 服务

| 服务 | 地址 |
|------|------|
| 前端 | http://39.100.67.26:3000 |
| 后端 | http://39.100.67.26:8080 |
| 数据库 | Docker 容器 `multica-postgres-1` |

## 登录

输入邮箱，验证码固定 `888888`（`.env` 中 `MULTICA_DEV_VERIFICATION_CODE=888888`）

## 启动命令

```bash
# 数据库
cd /root/multica && docker compose up -d postgres

# 后端
export $(grep -v '^#' /root/multica/.env | grep -v '^$' | xargs)
/root/multica/server/bin/multica-server-linux > /var/log/multica-server.log 2>&1 &

# 前端
bash /tmp/start_web.sh
```

## 关键 .env 配置

```
NEXT_PUBLIC_API_URL=http://39.100.67.26:8080
NEXT_PUBLIC_WS_URL=ws://39.100.67.26:8080/ws
MULTICA_DEV_VERIFICATION_CODE=888888
```

## 更新代码后重新部署后端

```bash
# 本地交叉编译
cd /path/to/multica/server
GOOS=linux GOARCH=amd64 go build -o /tmp/multica-server-linux ./cmd/server
scp /tmp/multica-server-linux root@39.100.67.26:/root/multica/server/bin/

# 服务器上重启
ssh root@39.100.67.26 "pkill -f multica-server-linux; sleep 1; export \$(grep -v '^#' /root/multica/.env | grep -v '^\$' | xargs) && setsid /root/multica/server/bin/multica-server-linux > /var/log/multica-server.log 2>&1 &"
```
