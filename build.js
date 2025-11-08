#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const chokidar = require("chokidar");
const { minify } = require("terser");

// 获取命令行参数
const args = process.argv.slice(2);
const scriptName = args.find((arg) => !arg.startsWith("--")) || null;
const watchMode = args.includes("--watch");

// 构建单个脚本
async function buildScript(scriptDir) {
  const srcPath = path.join(scriptDir, "src", "index.js");
  const distPath = path.join(scriptDir, "index.js");

  // 检查源文件是否存在
  if (!fs.existsSync(srcPath)) {
    console.warn(`⚠️  源文件不存在: ${srcPath}`);
    console.log(`   如果这是新脚本，请创建 ${srcPath}`);
    return false;
  }

  try {
    // 读取源代码
    const sourceCode = fs.readFileSync(srcPath, "utf8");

    // 使用 Babel 编译
    const result = babel.transformSync(sourceCode, {
      configFile: path.join(__dirname, "babel.config.js"),
      filename: srcPath
    });

    if (!result || !result.code) {
      throw new Error("Babel 编译失败：没有生成代码");
    }

    // 提取 UserScript 头部注释
    const headerMatch = sourceCode.match(
      /^(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==)/
    );
    const header = headerMatch ? headerMatch[1] : "";

    // 使用 Terser 进行代码压缩和混淆
    const terserResult = await minify(result.code, {
      compress: {
        drop_console: false, // 保留 console，方便调试
        drop_debugger: true,
        pure_funcs: [], // 不移除任何函数调用
        passes: 2 // 多次压缩以获得更好的压缩效果
      },
      mangle: {
        toplevel: false, // 不混淆顶级作用域（保持 UserScript 头部）
        properties: false, // 不混淆对象属性（避免破坏功能）
        reserved: [
          // 保留 UserScript 头部中的变量名和重要 API
          "GM_addStyle",
          "GM_getValue",
          "GM_setValue",
          "GM_xmlhttpRequest",
          "unsafeWindow",
          "window",
          "document",
          "HTMLElement",
          "customElements"
        ]
      },
      format: {
        comments: false // 移除所有注释（我们手动保留头部）
      }
    });

    if (!terserResult || !terserResult.code) {
      throw new Error("Terser 压缩失败：没有生成代码");
    }

    // 修复 YouTube ES5 适配器兼容性问题
    // 将 _wrapNativeSuper(HTMLElement) 替换为 HTMLElement
    // 因为 YouTube 的适配器期望直接使用构造函数，而不是包装后的版本
    let finalCode = terserResult.code;

    // 替换 _wrapNativeSuper(HTMLElement) 为 HTMLElement
    // 匹配模式：_wrapNativeSuper(HTMLElement) 或 _wrapNativeSuper(HTMLElement) 的各种变体
    finalCode = finalCode.replace(
      /_wrapNativeSuper\s*\(\s*HTMLElement\s*\)/g,
      "HTMLElement"
    );

    // 修复 _callSuper 调用 HTMLElement 的问题
    // YouTube 的 ES5 适配器不允许直接调用 HTMLElement 构造函数
    // 我们需要替换 _callSuper(this, HTMLElement) 为特殊处理
    // 对于 Web Components，super() 调用应该由 customElements.define 处理
    // 所以我们替换为直接返回 this，让 customElements 系统处理构造
    finalCode = finalCode.replace(
      /_callSuper\s*\(\s*this\s*,\s*HTMLElement\s*\)/g,
      "(function(){var _this=Object.create(HTMLElement.prototype);Object.setPrototypeOf(_this,this.constructor.prototype);return _this})()"
    );

    // 实际上，更好的方法是修改 _callSuper 函数本身
    // 让它检测到 HTMLElement 时使用特殊处理
    // 修改 _callSuper 函数，添加 HTMLElement 的特殊处理
    // YouTube 适配器环境：直接返回 this（适配器已处理）
    // 正常环境：使用 Reflect.construct 或设置原型链
    finalCode = finalCode.replace(
      /function _callSuper\([^)]+\)\{[^}]*return[^}]*_getPrototypeOf\(t\)[^}]*_possibleConstructorReturn[^}]*\}/g,
      'function _callSuper(e,t,o){var parent=_getPrototypeOf(t);var isHTMLElement=t===HTMLElement||parent===HTMLElement||(parent&&parent.prototype===HTMLElement.prototype)||(t&&t.prototype&&t.prototype.__proto__===HTMLElement.prototype);if(isHTMLElement){if(window.HTMLElement&&window.HTMLElement.es5Shimmed){return e}if(!e||typeof e!=="object"){return e}if(Object.setPrototypeOf){Object.setPrototypeOf(e,HTMLElement.prototype)}else if(e.__proto__){e.__proto__=HTMLElement.prototype}return e}return t=parent,_possibleConstructorReturn(e,_isNativeReflectConstruct()?Reflect.construct(t,o||[],_getPrototypeOf(e).constructor):t.apply(e,o))}'
    );

    // 确保输出目录存在
    const distDir = path.dirname(distPath);
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    // 组合最终代码：UserScript 头部 + 修复后的代码
    finalCode = header ? header + "\n\n" + finalCode : finalCode;

    // 写入编译后的代码
    fs.writeFileSync(distPath, finalCode, "utf8");

    console.log(`✅ 构建成功: ${path.relative(process.cwd(), distPath)}`);
    return true;
  } catch (error) {
    console.error(`❌ 构建失败: ${path.relative(process.cwd(), srcPath)}`);
    console.error(`   错误: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

// 查找所有脚本目录
function findScripts() {
  const scriptsDir = __dirname;
  const entries = fs.readdirSync(scriptsDir, { withFileTypes: true });

  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== "node_modules" &&
        !entry.name.startsWith(".")
    )
    .map((entry) => path.join(scriptsDir, entry.name))
    .filter((scriptDir) => {
      // 检查是否有 src/index.js
      const srcPath = path.join(scriptDir, "src", "index.js");
      return fs.existsSync(srcPath);
    });
}

// 主函数
async function main() {
  if (scriptName) {
    // 构建指定脚本
    const scriptDir = path.join(__dirname, scriptName);
    if (!fs.existsSync(scriptDir)) {
      console.error(`❌ 脚本目录不存在: ${scriptName}`);
      process.exit(1);
    }

    if (watchMode) {
      console.log(`👀 监听模式: ${scriptName}`);
      const srcPath = path.join(scriptDir, "src", "index.js");

      // 立即构建一次
      await buildScript(scriptDir);

      // 监听文件变化
      const watcher = chokidar.watch(srcPath, {
        ignored: /node_modules/,
        persistent: true
      });

      watcher.on("change", async (filePath) => {
        console.log(`\n📝 文件变化: ${path.relative(process.cwd(), filePath)}`);
        await buildScript(scriptDir);
      });

      console.log(`   监听: ${path.relative(process.cwd(), srcPath)}`);
    } else {
      await buildScript(scriptDir);
    }
  } else {
    // 构建所有脚本
    const scripts = findScripts();

    if (scripts.length === 0) {
      console.log("⚠️  没有找到可构建的脚本");
      console.log("   请确保脚本目录下有 src/index.js 文件");
      return;
    }

    console.log(`📦 找到 ${scripts.length} 个脚本，开始构建...\n`);

    if (watchMode) {
      console.log("👀 监听模式: 所有脚本\n");

      // 立即构建一次
      for (const scriptDir of scripts) {
        await buildScript(scriptDir);
      }

      // 监听所有源文件
      const srcFiles = scripts.map((scriptDir) =>
        path.join(scriptDir, "src", "index.js")
      );
      const watcher = chokidar.watch(srcFiles, {
        ignored: /node_modules/,
        persistent: true
      });

      watcher.on("change", async (filePath) => {
        console.log(`\n📝 文件变化: ${path.relative(process.cwd(), filePath)}`);
        const scriptDir = path.dirname(path.dirname(filePath));
        await buildScript(scriptDir);
      });

      console.log(`\n   监听 ${srcFiles.length} 个文件...`);
    } else {
      for (const scriptDir of scripts) {
        await buildScript(scriptDir);
      }
      console.log(`\n✨ 构建完成！`);
    }
  }
}

main();
