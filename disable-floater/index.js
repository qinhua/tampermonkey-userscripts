// ==UserScript==
// @name         悬浮元素控制器
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  手动控制浏览器插件的悬浮元素 - 使用Web Components封装，避免样式冲突
// @author       Marek Qin
// @match        *://*/*
// @icon         https://raw.githubusercontent.com/qinhua/tampermonkey-userscripts/refs/heads/main/disable-floater/logo.png
// @grant        GM_addStyle
// @noframes
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  // 检查是否在 iframe 中运行（双重保险）
  if (window.self !== window.top) {
    return;
  }

  // 检查组件是否已定义，避免重复定义
  if (customElements.get("disable-floater")) {
    // 如果组件已定义，检查是否已有实例存在
    const existingInstance = document.querySelector("disable-floater");
    if (existingInstance) {
      return;
    }
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

      // 存储图片的原始样式和事件监听器
      this.imageOriginalStyles = new Map();

      // 存储事件拦截器引用，用于移除
      this.eventInterceptors = new Map();

      // 标记是否已移除图片的悬浮事件
      this.imageMouseoverRemoved = false;

      // MutationObserver 用于监听动态添加的图片
      this.imageObserver = null;

      // 初始化组件
      this.init();
    }

    init() {
      // 防止重复初始化
      if (this._initialized) {
        return;
      }
      this._initialized = true;

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
            right: 2px;
            bottom: 2px;
            padding: 4px;
            z-index: 999999;
            display: flex;
            flex-direction: row;
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
            right: 5px;
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
     * 移除所有图片的悬浮事件（全面版本）
     * 包括：mouseover, mouseenter, mouseleave, mousemove, pointerover, pointerenter, pointermove
     */
    removeAllImageMouseover(showToast = true) {
      try {
        const images = document.querySelectorAll("img");
        let processedCount = 0;

        // 需要移除的所有鼠标事件类型
        const mouseEvents = [
          "mouseover",
          "mouseenter",
          "mouseleave",
          "mousemove",
          "mouseout",
          "pointerover",
          "pointerenter",
          "pointerleave",
          "pointermove",
          "pointerout"
        ];

        images.forEach((img) => {
          // 保存原始的属性和事件监听器
          if (!this.imageOriginalStyles.has(img)) {
            const originalData = {
              onmouseover: img.onmouseover,
              onmouseenter: img.onmouseenter,
              onmouseleave: img.onmouseleave,
              onmousemove: img.onmousemove,
              pointerEvents: img.style.pointerEvents,
              style: img.getAttribute("style"),
              eventListeners: []
            };

            // 尝试获取所有事件监听器（如果可能）
            // 注意：浏览器通常不允许直接获取事件监听器列表
            // 但我们可以保存一个标记，表示我们已经处理过这个元素
            this.imageOriginalStyles.set(img, originalData);
          }

          // 方法1: 设置 pointer-events 为 none 来阻止所有鼠标事件
          img.style.pointerEvents = "none";

          // 方法2: 清除所有内联事件处理器
          img.onmouseover = null;
          img.onmouseenter = null;
          img.onmouseleave = null;
          img.onmousemove = null;
          img.onmouseout = null;
          img.onpointerover = null;
          img.onpointerenter = null;
          img.onpointerleave = null;
          img.onpointermove = null;
          img.onpointerout = null;

          // 方法3: 在捕获阶段阻止所有鼠标事件（更彻底）
          const stopEvent = (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            e.preventDefault();
          };

          // 为每个事件类型添加捕获阶段的拦截器
          mouseEvents.forEach((eventType) => {
            img.addEventListener(eventType, stopEvent, true); // true = 捕获阶段
          });

          // 保存拦截器引用以便后续移除
          this.eventInterceptors.set(img, { stopEvent, mouseEvents });

          // 添加标记
          img.dataset.mouseoverRemoved = "true";

          processedCount++;
        });

        // 启动 MutationObserver 监听动态添加的图片
        this.startImageObserver();

        this.imageMouseoverRemoved = true;
        showToast &&
          this.showFeedback(`🌠 已移除 ${processedCount} 个图片的悬浮事件`);
      } catch (e) {
        console.error("移除图片悬浮事件时出错:", e);
        showToast &&
          this.showFeedback(
            `⚠️ 移除图片悬浮事件时出现错误: ${e.message || "未知错误"}`
          );
      }
    }

    /**
     * 启动 MutationObserver 监听动态添加的图片
     */
    startImageObserver() {
      if (this.imageObserver) {
        return; // 已经启动
      }

      this.imageObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // 检查新添加的节点是否是图片
              if (node.tagName === "IMG" && !node.dataset.mouseoverRemoved) {
                this.processNewImage(node);
              }
              // 检查新添加的节点内部是否有图片
              const images = node.querySelectorAll
                ? node.querySelectorAll("img:not([data-mouseover-removed])")
                : [];
              images.forEach((img) => this.processNewImage(img));
            }
          });
        });
      });

      this.imageObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    /**
     * 处理新添加的图片
     */
    processNewImage(img) {
      if (!img || img.dataset.mouseoverRemoved) {
        return;
      }

      const mouseEvents = [
        "mouseover",
        "mouseenter",
        "mouseleave",
        "mousemove",
        "mouseout",
        "pointerover",
        "pointerenter",
        "pointerleave",
        "pointermove",
        "pointerout"
      ];

      // 保存原始数据
      if (!this.imageOriginalStyles.has(img)) {
        this.imageOriginalStyles.set(img, {
          onmouseover: img.onmouseover,
          onmouseenter: img.onmouseenter,
          onmouseleave: img.onmouseleave,
          onmousemove: img.onmousemove,
          pointerEvents: img.style.pointerEvents,
          style: img.getAttribute("style")
        });
      }

      // 阻止所有鼠标事件
      img.style.pointerEvents = "none";
      img.onmouseover = null;
      img.onmouseenter = null;
      img.onmouseleave = null;
      img.onmousemove = null;
      img.onmouseout = null;
      img.onpointerover = null;
      img.onpointerenter = null;
      img.onpointerleave = null;
      img.onpointermove = null;
      img.onpointerout = null;

      const stopEvent = (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
      };

      mouseEvents.forEach((eventType) => {
        img.addEventListener(eventType, stopEvent, true);
      });

      this.eventInterceptors.set(img, { stopEvent, mouseEvents });
      img.dataset.mouseoverRemoved = "true";
    }

    /**
     * 停止 MutationObserver
     */
    stopImageObserver() {
      if (this.imageObserver) {
        this.imageObserver.disconnect();
        this.imageObserver = null;
      }
    }

    /**
     * 恢复所有图片的悬浮事件
     */
    restoreAllImageMouseover(showToast = true) {
      try {
        // 停止 MutationObserver
        this.stopImageObserver();

        let processedCount = 0;

        // 恢复所有保存的图片状态
        for (const [img, originalData] of this.imageOriginalStyles) {
          if (img && img.nodeType === Node.ELEMENT_NODE) {
            // 移除事件拦截器
            const interceptor = this.eventInterceptors.get(img);
            if (interceptor) {
              interceptor.mouseEvents.forEach((eventType) => {
                img.removeEventListener(eventType, interceptor.stopEvent, true);
              });
              this.eventInterceptors.delete(img);
            }

            // 恢复原始的事件处理器
            img.onmouseover = originalData.onmouseover || null;
            img.onmouseenter = originalData.onmouseenter || null;
            img.onmouseleave = originalData.onmouseleave || null;
            img.onmousemove = originalData.onmousemove || null;

            // 恢复原始的pointer-events样式
            if (originalData.pointerEvents) {
              img.style.pointerEvents = originalData.pointerEvents;
            } else {
              img.style.removeProperty("pointer-events");
            }

            // 如果原始有style属性，恢复它
            if (originalData.style) {
              const originalStyle = originalData.style;
              img.setAttribute("style", originalStyle);
            }

            // 移除标记
            delete img.dataset.mouseoverRemoved;

            processedCount++;
          }
        }

        // 清空存储的样式信息和拦截器
        this.imageOriginalStyles.clear();
        this.eventInterceptors.clear();

        // 处理没有保存在map中的图片
        const remainingImages = document.querySelectorAll(
          "img[data-mouseover-removed]"
        );
        remainingImages.forEach((img) => {
          // 尝试移除可能存在的拦截器
          const interceptor = this.eventInterceptors.get(img);
          if (interceptor) {
            interceptor.mouseEvents.forEach((eventType) => {
              img.removeEventListener(eventType, interceptor.stopEvent, true);
            });
          }
          img.style.removeProperty("pointer-events");
          delete img.dataset.mouseoverRemoved;
          processedCount++;
        });

        this.imageMouseoverRemoved = false;
        showToast &&
          this.showFeedback(`🌌 已恢复 ${processedCount} 个图片的悬浮事件`);
      } catch (e) {
        console.error("恢复图片悬浮事件时出错:", e);
        showToast &&
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
      // this.removeAllImageMouseover(false);
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
      // this.restoreAllImageMouseover(false);
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
      // 检查是否已经存在组件实例，避免重复创建
      const existingInstance = document.querySelector("disable-floater");
      if (existingInstance) {
        console.log("DisableFloater 组件实例已存在，跳过创建");
        return;
      }

      // 创建组件实例
      const floater = document.createElement("disable-floater");
      // 插入到HTML标签的最末尾
      document.documentElement.appendChild(floater);
    } catch (e) {
      console.error("插入组件时出错:", e);
    }
  }
})();
