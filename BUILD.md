# 构建说明

本项目使用 Babel 将 ES6 源代码编译为 ES5 兼容代码，以支持 YouTube 等使用 ES5 适配器的网站。

## 项目结构

```
tampermonkey-userscripts/
├── disable-floater/
│   ├── src/
│   │   └── index.js      # ES6 源代码（可编辑）
│   └── index.js          # 编译后的 ES5 代码（自动生成）
├── package.json
├── babel.config.js
└── build.js
```

## 安装依赖

```bash
npm install
```

## 构建命令

### 构建所有脚本

```bash
npm run build
```

### 构建指定脚本

```bash
npm run build:disable-floater
```

### 监听模式（自动重新构建）

```bash
npm run watch
```

### 监听指定脚本

```bash
npm run watch:disable-floater
```

## 开发流程

1. **编辑源代码**：在 `disable-floater/src/index.js` 中使用 ES6 语法编写代码
2. **构建**：运行 `npm run build` 或 `npm run build:disable-floater` 编译代码
3. **测试**：在浏览器中测试编译后的 `disable-floater/index.js`

## 注意事项

- **不要直接编辑** `disable-floater/index.js`，它会被构建脚本覆盖
- **只编辑** `disable-floater/src/index.js` 中的源代码
- 构建后的代码会自动兼容 ES5 适配器（如 YouTube 使用的）

## 技术栈

- **Babel**: ES6+ 转 ES5
- **@babel/preset-env**: 根据目标浏览器自动转换语法
- **chokidar**: 文件监听（用于 watch 模式）
