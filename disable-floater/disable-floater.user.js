// ==UserScript==
// @name         悬浮元素控制器
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  手动控制浏览器插件的悬浮元素 - 使用Web Components封装，避免样式冲突
// @author       Marek Qin
// @match        *://*/*
// @icon         https://github.com/qinhua/tampermonkey-userscripts/blob/main/disable-floater/logo.png
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  // 检查组件是否已定义，避免重复定义
  if (customElements.get("disable-floater")) {
    return;
  }

  // 定义 DisableFloater Web Component
  class DisableFloater extends HTMLElement {
    constructor() {
      super();

      // 创建 Shadow DOM 以隔离样式
      this.attachShadow({ mode: "open" });

      // 定义要隐藏的悬浮元素选择器
      this.hideSelectors = [
        "icbu-ai-csui",
        "doubao-ai-csui",
        "floating-lens-root",
        "alibaba-lens-root",
        "#market-mate-for-1688"
        // "div[data-id='kphldkppgfpjadpabfkghmjbhpcmgpdg']" // 按插件 id 选择
      ];

      // 存储被隐藏元素的引用
      this.hiddenElements = new Map();

      // 存储图片的原始样式
      this.imageOriginalStyles = new Map();

      // 标记是否已移除图片的悬浮事件
      this.imageMouseoverRemoved = false;

      // 初始化组件
      this.init();
    }

    init() {
      this.createTrustedPolicy();
      this.render();
      this.bindEvents();
      console.log("DisableFloater 悬浮元素控制器-已加载 ✅");
    }

    // 创建 Trusted Types 策略以避免安全警告
    createTrustedPolicy() {
      if (window.trustedTypes && window.trustedTypes.createPolicy) {
        try {
          window.trustedTypes.createPolicy("default", {
            createHTML: (string, sink) => string
          });
        } catch (e) {
          console.warn("无法创建Trusted Types策略:", e);
        }
      }
    }

    // 渲染组件内容到 Shadow DOM
    render() {
      // 在 Shadow DOM 中定义样式，避免影响页面其他元素
      this.shadowRoot.innerHTML = `
        <style>
          .control-panel {
            position: fixed;
            left: 2px;
            bottom: 2px;
            padding: 4px;
            z-index: 999999;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 4px;
            background: #2c3e50;
            border-radius: 6px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
            font-family: Arial, sans-serif;
          }
          .control-panel:hover {
            left: 5px;
          }
          .control-btn {
            display: block;
            cursor: pointer;
            width: 24px;
            height: 24px;
            color: white;
            font-size: 12px;
            border: none;
            border-radius: 50%;
            background: #34495e;
            transition: all 0.2s ease;
          }
          .control-btn:hover {
            background: #1abc9c;
            transform: scale(1.1);
          }
          .control-btn:active {
            transform: scale(0.9);
          }
          
          /* 反馈信息样式 */
          .feedback {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #27ae60;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 999999;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: fadeInOut 2s ease-in-out;
            font-family: Arial, sans-serif;
          }
          
          @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(-20px); }
            20% { opacity: 1; transform: translateY(0); }
            80% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-20px); }
          }
          @keyframes fadeOut {
            to { opacity: 0; }
          }
        </style>
        
        <div class="control-panel">
          <button class="control-btn" id="btn-hide" title="隐藏悬浮元素">🚫</button>
          <button class="control-btn" id="btn-temp-hide" title="临时隐藏5秒">⏱️</button>
          <button class="control-btn" id="btn-show" title="显示悬浮元素">👁️</button>
          <button class="control-btn" id="btn-toggle-mouseover" title="移除图片悬浮事件">🌠</button>
        </div>
      `;
    }

    // 绑定事件监听器
    bindEvents() {
      const hideBtn = this.shadowRoot.getElementById("btn-hide");
      const tempHideBtn = this.shadowRoot.getElementById("btn-temp-hide");
      const showBtn = this.shadowRoot.getElementById("btn-show");
      const toggleMouseoverBtn = this.shadowRoot.getElementById(
        "btn-toggle-mouseover"
      );

      if (hideBtn) {
        hideBtn.addEventListener("click", () => this.hideAllFloaters());
      }

      if (tempHideBtn) {
        tempHideBtn.addEventListener("click", () => this.tempHideFloaters());
      }

      if (showBtn) {
        showBtn.addEventListener("click", () => this.showAllFloaters());
      }

      if (toggleMouseoverBtn) {
        toggleMouseoverBtn.addEventListener("click", () =>
          this.toggleImageMouseover(() => {
            toggleMouseoverBtn.textContent = this.imageMouseoverRemoved
              ? "🌌"
              : "🌠";
            toggleMouseoverBtn.title = this.imageMouseoverRemoved
              ? "恢复图片悬浮事件"
              : "移除图片悬浮事件";
          })
        );
      }
    }

    /**
     * 改进的元素查找函数，支持标签名、类名和ID
     * @param {string} selector - 选择器
     * @returns {Array} - 找到的元素数组
     */
    findElements(selector) {
      try {
        const elements = [];

        // 根据选择器类型选择不同的查找方法
        if (selector.startsWith("#")) {
          // ID选择器
          const element = document.getElementById(selector.substring(1));
          if (element) {
            elements.push(element);
          }
        } else if (selector.startsWith(".")) {
          // 类选择器
          const classElements = document.getElementsByClassName(
            selector.substring(1)
          );
          elements.push(...Array.from(classElements));
        } else if (selector.startsWith("[") && selector.endsWith("]")) {
          // 属性选择器
          const attrElements = document.querySelectorAll(selector);
          elements.push(...Array.from(attrElements));
        } else {
          // 标签选择器或其他CSS选择器
          try {
            const cssElements = document.querySelectorAll(selector);
            elements.push(...Array.from(cssElements));
          } catch (e) {
            // 如果querySelectorAll失败，尝试getElementsByTagName作为fallback
            const tagElements = document.getElementsByTagName(selector);
            elements.push(...Array.from(tagElements));
          }
        }

        return elements;
      } catch (e) {
        console.warn(`查找元素时出错 (选择器: ${selector}):`, e);
        return [];
      }
    }

    /**
     * 移除所有图片的悬浮事件
     */
    removeAllImageMouseover() {
      try {
        const images = document.querySelectorAll("img");
        let processedCount = 0;

        images.forEach((img) => {
          // 保存原始的onmouseover属性和style属性
          if (!this.imageOriginalStyles.has(img)) {
            this.imageOriginalStyles.set(img, {
              onmouseover: img.onmouseover,
              pointerEvents: img.style.pointerEvents,
              style: img.getAttribute("style")
            });
          }

          // 设置pointer-events为none来阻止所有鼠标事件
          img.style.pointerEvents = "none";

          // 清除onmouseover事件处理器
          img.onmouseover = null;

          // 添加一个自定义属性标记这个图片的事件已被移除
          img.dataset.mouseoverRemoved = "true";

          processedCount++;
        });

        this.imageMouseoverRemoved = true;
        this.showFeedback(`🌠 已移除 ${processedCount} 个图片的悬浮事件`);
      } catch (e) {
        console.error("移除图片悬浮事件时出错:", e);
        this.showFeedback(
          `⚠️ 移除图片悬浮事件时出现错误: ${e.message || "未知错误"}`
        );
      }
    }

    /**
     * 恢复所有图片的悬浮事件
     */
    restoreAllImageMouseover() {
      try {
        let processedCount = 0;

        // 恢复所有保存的图片状态
        for (const [img, originalData] of this.imageOriginalStyles) {
          if (img && img.nodeType === Node.ELEMENT_NODE) {
            // 恢复原始的onmouseover处理器
            img.onmouseover = originalData.onmouseover || null;

            // 恢复原始的pointer-events样式
            if (originalData.pointerEvents) {
              img.style.pointerEvents = originalData.pointerEvents;
            } else {
              img.style.removeProperty("pointer-events");
            }

            // 如果原始有style属性，恢复它
            if (originalData.style) {
              // 保留我们添加的其他样式，只移除pointer-events
              const originalStyle = originalData.style;
              img.setAttribute("style", originalStyle);
            }

            // 移除标记
            delete img.dataset.mouseoverRemoved;

            processedCount++;
          }
        }

        // 清空存储的样式信息
        this.imageOriginalStyles.clear();

        // 处理没有保存在map中的图片
        const remainingImages = document.querySelectorAll(
          "img[data-mouseover-removed]"
        );
        remainingImages.forEach((img) => {
          img.style.removeProperty("pointer-events");
          delete img.dataset.mouseoverRemoved;
          processedCount++;
        });

        this.imageMouseoverRemoved = false;
        this.showFeedback(`🌌 已恢复 ${processedCount} 个图片的悬浮事件`);
      } catch (e) {
        console.error("恢复图片悬浮事件时出错:", e);
        this.showFeedback(
          `⚠️ 恢复图片悬浮事件时出现错误: ${e.message || "未知错误"}`
        );
      }
    }

    /**
     * 启用/禁用图片的悬浮事件
     */
    toggleImageMouseover(callback) {
      if (this.imageMouseoverRemoved) {
        this.restoreAllImageMouseover();
      } else {
        this.removeAllImageMouseover();
      }
      callback && callback();
    }

    hideAllFloaters() {
      let hiddenCount = 0;

      try {
        this.hideSelectors.forEach((selector) => {
          const elements = this.findElements(selector);

          elements.forEach((element) => {
            if (element && element.nodeType === Node.ELEMENT_NODE) {
              // 保存原始样式以便恢复
              if (!element.dataset.originalDisplay) {
                element.dataset.originalDisplay = element.style.display || "";
                element.dataset.originalVisibility =
                  element.style.visibility || "";
              }

              // 应用隐藏样式
              element.style.cssText +=
                "; display: none !important; visibility: hidden !important;";

              // 存储被隐藏元素的引用，用于快速恢复
              const elementKey = this.getElementKey(element);
              this.hiddenElements.set(elementKey, element);

              hiddenCount++;
            }
          });
        });

        this.showFeedback(`🎯 已隐藏 ${hiddenCount} 个悬浮元素`);
      } catch (e) {
        console.error("隐藏元素时出错:", e);
        this.showFeedback(`⚠️ 隐藏元素时出现错误: ${e.message || "未知错误"}`);
      }

      // 同时移除图片的悬浮事件
      this.removeAllImageMouseover();
    }

    showAllFloaters() {
      let restoredCount = 0;

      try {
        // 方法1: 通过 stored references 恢复
        for (const [elementKey, element] of this.hiddenElements) {
          if (element && element.nodeType === Node.ELEMENT_NODE) {
            // 恢复原始样式
            element.style.display = element.dataset.originalDisplay || "";
            element.style.visibility = element.dataset.originalVisibility || "";

            // 清除数据属性
            delete element.dataset.originalDisplay;
            delete element.dataset.originalVisibility;

            restoredCount++;
          }
        }

        // 清空存储的元素引用
        this.hiddenElements.clear();

        // 方法2: 作为备用，查找所有带有原始样式数据属性的元素
        const allElements = document.querySelectorAll(
          "*[data-original-display], *[data-original-visibility]"
        );
        allElements.forEach((element) => {
          if (element.nodeType === Node.ELEMENT_NODE) {
            element.style.display = element.dataset.originalDisplay || "";
            element.style.visibility = element.dataset.originalVisibility || "";
            delete element.dataset.originalDisplay;
            delete element.dataset.originalVisibility;
            restoredCount++;
          }
        });

        this.showFeedback(`👁️ 已恢复 ${restoredCount} 个悬浮元素`);
      } catch (e) {
        console.error("显示元素时出错:", e);
        this.showFeedback(`⚠️ 显示元素时出现错误: ${e.message || "未知错误"}`);
      }

      // 同时恢复图片的悬浮事件
      this.restoreAllImageMouseover();
    }

    tempHideFloaters() {
      try {
        this.hideAllFloaters();
        this.showFeedback("⏱️ 已隐藏悬浮元素，5秒后恢复");

        // 临时隐藏时也恢复图片的悬浮事件
        setTimeout(() => {
          this.showAllFloaters();
        }, 5000);
      } catch (e) {
        console.error("临时隐藏元素时出错:", e);
        this.showFeedback(
          `⚠️ 临时隐藏元素时出现错误: ${e.message || "未知错误"}`
        );
      }
    }

    /**
     * 生成元素唯一标识符
     * @param {Element} element - 元素对象
     * @returns {string} - 元素唯一标识符
     */
    getElementKey(element) {
      // 尝试使用ID，如果不存在则使用其他属性组合
      if (element.id) {
        return `id:${element.id}`;
      } else if (element.tagName) {
        const classList = element.className ? element.className : "";
        const dataId = element.dataset.id ? element.dataset.id : "";
        return `tag:${element.tagName}-class:${classList}-dataid:${dataId}`;
      } else {
        return `element:${Date.now()}:${Math.random()}`;
      }
    }

    showFeedback(message) {
      try {
        // 移除旧的反馈
        const oldFeedback = document.getElementById("floatFeedback");
        if (oldFeedback) oldFeedback.remove();

        const feedback = document.createElement("div");
        feedback.id = "floatFeedback";
        feedback.className = "feedback";
        feedback.textContent = message;
        feedback.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: #27ae60;
          color: white;
          padding: 12px 20px;
          border-radius: 8px;
          z-index: 999999;
          font-size: 14px;
          font-weight: bold;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          animation: fadeInOut 2s ease-in-out;
          font-family: Arial, sans-serif;
        `;

        document.body.appendChild(feedback);

        setTimeout(() => {
          if (feedback && feedback.style) {
            feedback.style.animation = "fadeOut 0.5s ease-in-out";
            setTimeout(() => {
              if (feedback.parentNode) {
                feedback.parentNode.removeChild(feedback);
              }
            }, 500);
          }
        }, 1500);
      } catch (e) {
        console.error("显示反馈信息时出错:", e);
      }
    }
  }

  // 定义自定义元素
  customElements.define("disable-floater", DisableFloater);

  // 在DOM加载完成后将组件插入到页面末尾
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", insertFloaterComponent);
  } else {
    insertFloaterComponent();
  }

  function insertFloaterComponent() {
    try {
      // 创建组件实例
      const floater = document.createElement("disable-floater");
      // 插入到HTML标签的最末尾
      document.documentElement.appendChild(floater);
    } catch (e) {
      console.error("插入组件时出错:", e);
    }
  }
})();
