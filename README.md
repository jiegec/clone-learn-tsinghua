# clone-learn-tsinghua

网络学堂文件、作业、公告同步工具

# Usage

首先把配置文件复制并修改该文件相应项

```
$ cp config.example.js config.js
```

然后安装依赖文件

```
$ npm install
```

最后运行

```
$ node index.js
```

# 打包成一个文件

```
$ npm install -g pkg
$ npm install
$ pkg index.js
```

这样就能生成一个 `index` （或者 `index.exe`）的可执行文件。

之后需要将 `config.example.js` 变成 `config.js`，然后将两个文件 `index` 和 `config.js` 放到一块，便可以双击运行 `index` 程序啦！