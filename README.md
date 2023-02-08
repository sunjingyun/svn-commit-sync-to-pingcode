### 测试环境:
> svn server: version 1.9.7 (r1800392) compiled Mar 28 2018, 08:49:13 on x86_64-pc-linux-gnu

> svn server: VisualSVN-Server-5.1.1 compiled Feb 8 2023, 15:56:13 on x86_64-pc-windows10-1809

> svn client: version 1.13.0 (r1867053) compiled Apr 7 2020, 16:42:44 on x86_64-apple-darwin18.7.0

### 效果展示:

![commit关联PingCode工作项.png](https://s1.ax1x.com/2020/04/28/J42Mxx.png)

### 配置svn的服务端
#### 1. 在服务器中安装`nodejs`环境

推荐版本10.0+：[官网下载地址](https://nodejs.org/en/download/)

#### 2. 在服务器下载并安装当前项目
```
mkdir -p /opt/pingcode
cd /opt/pingcode
git clone git@github.com:sunjingyun/svn-commit-sync-to-pingcode.git
cd svn-commit-sync-to-pingcode
npm install
```
#### 3. 配置ClientId和ClientSecret
1）进入PingCode的`企业后台管理` > `凭据管理`。
2）新建应用，输入`应用名`，将`开发`的权限设置为`读写`，点击确定。
3）在应用列表中找到创建的应用，分别复制`ClientID`和`Secret`。
4）回到服务器
```
vim /opt/pingcode/svn-commit-sync-to-pingcode/package.json
```
更新下列配置项中的`client_id`和`client_secret`：
```
"config": {
    "base_url": "https://open.pingcode.com",
    "client_id": "your-client-id",
    "client_secret": "your-client-secret",
    "product_name": "Subversion"
}
```
*注：私有部署需要将`base_url`修改为PingCode访问地址后面拼接`/open`*

#### 4. 配置svn的hooks，将svn的提交信息同步到PingCode中
我们假如svn某个repository的路径是`/opt/svn/my-repo`。
```
cd /opt/svn/my-repo/hooks
sudo mv post-commit.tmpl post-commit
sudo vim post-commit
sudo chmod +x post-commit
```
Linux平台：清空文件，拷贝下列命令到文件中（如果之前配置过，只需要拷贝最后一行到文件中即可）
```
#!/bin/sh

export LANG=zh_CN.UTF-8

REPOS="$1"
REV="$2"
TXN_NAME="$3"

node /opt/pingcode/svn-commit-sync-to-pingcode -r $2 -p $(cd "$(dirname "$0")" && pwd)
```
Windows平台：
```
#1、C:\nodejs\node.exe:NodeJS环境安装地址下的 node.exe 可执行文件路径
#2、C:\pingcode\svn-commit-sync-to-pingcode\index.js:本地仓库路径中的index.js脚本文件路径
#以上地址需视具体情况修改

C:\nodejs\node.exe C:\pingcode\svn-commit-sync-to-pingcode\index.js -r "%2" -p "%1\hooks"
```
配置位置(以VisualSVN Server配置为例)
右键仓库-properties-Hooks，选中Post-commit hook，Edit；将上面代码粘贴保存即可
### 客户端提交代码
向代码仓库提交代码，commit message中提及PingCode的工作项即可，例如：
```
svn commit -m 'feat(scope): #CD-7 some comment'
```
这里的`CD-7`是PingCode工作项（史诗、特性、用户故事、任务、缺陷）的编号，在PingCode中点开某一个工作项即可在左上角找到工作项编号。


C:\nodejs\node.exe C:\pingcode\svn-commit-sync-to-pingcode\index.js -r "%2" -p "%1\hooks"



