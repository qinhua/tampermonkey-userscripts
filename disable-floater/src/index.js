// ==UserScript==
// @name         悬浮元素控制器
// @namespace    https://github.com/qinhua/tampermonkey-userscripts/tree/main/disable-floater
// @version      1.0.0
// @tag          utilities
// @description  手动控制浏览器插件的悬浮元素，避免影响网页浏览
// @author       Marek Qin
// @match        *://*/
// @include      *
// @icon         https://raw.githubusercontent.com/qinhua/tampermonkey-userscripts/refs/heads/main/disable-floater/logo.png
// @grant        GM_addStyle
// @grant        unsafeWindow
// @noframes
// @license      MIT
// @downloadURL https://raw.githubusercontent.com/qinhua/tampermonkey-userscripts/refs/heads/main/disable-floater/index.js
// ==/UserScript==

(function () {
  "use strict";

  // 检查是否在 iframe 中运行（双重保险）
  if (window.self !== window.top) {
    return;
  }

  // 检查是否已经存在实例，避免重复创建
  if (document.getElementById("disable-floater-container")) {
    return;
  }

  // 定义 DisableFloater 控制器类
  class DisableFloater {
    constructor(container) {
      // 保存容器元素
      this.container = container;

      // 定义要隐藏的悬浮元素选择器
      this.hideSelectors = [
        "icbu-ai-csui",
        "doubao-ai-csui",
        "floating-lens-root",
        "alibaba-lens-root",
        "#market-mate-for-1688",
        ".floating-ball",
        "#tobeesx-fixed-node"
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

      // 定义需要移除的鼠标事件类型（统一管理，避免重复定义）
      this.mouseEvents = [
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

    // 渲染组件内容到普通 DOM
    render() {
      // 注入样式到页面
      this.injectStyles();

      // 创建控制面板内容
      this.container.innerHTML = `
        <div class="disable-floater-btn" id="btn-hide" title="隐藏悬浮元素">🚫</div>
        <div class="disable-floater-btn" id="btn-temp-hide" title="临时隐藏5秒">⏱️</div>
        <div class="disable-floater-btn" id="btn-show" title="显示悬浮元素">👁️</div>
        <div class="disable-floater-btn" id="btn-toggle-mouseover" title="移除图片悬浮事件">🌠</div>
      `;
    }

    // 注入样式到页面
    injectStyles() {
      // 定义样式内容
      const styles = `
        #disable-floater-container {
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
        #disable-floater-container:hover {
          right: 5px;
        }
        .disable-floater-btn {
          display: block;
          cursor: pointer;
          width: 24px;
          height: 24px;
          text-align: center;
          line-height: 24px;
          color: white;
          font-size: 12px;
          border: none;
          border-radius: 4px;
          background: #34495e;
          transition: all 0.2s ease;
        }
        .disable-floater-btn:hover {
          background: #1abc9c;
          transform: scale(1.1);
        }
        .disable-floater-btn:active {
          transform: scale(0.9);
        }
        .disable-floater-feedback {
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
          animation: disableFloaterFadeInOut 2s ease-in-out;
          font-family: Arial, sans-serif;
        }
        @keyframes disableFloaterFadeInOut {
          0% { opacity: 0; transform: translateY(-20px); }
          20% { opacity: 1; transform: translateY(0); }
          80% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-20px); }
        }
        @keyframes disableFloaterFadeOut {
          to { opacity: 0; }
        }
      `;

      // 使用 GM_addStyle 或 style 标签注入样式
      if (typeof GM_addStyle !== "undefined") {
        GM_addStyle(styles);
      } else {
        // 如果 GM_addStyle 不可用，使用 style 标签
        const style = document.createElement("style");
        style.textContent = styles;
        document.head.appendChild(style);
      }
    }

    // 绑定事件监听器
    bindEvents() {
      const hideBtn = this.container.querySelector("#btn-hide");
      const tempHideBtn = this.container.querySelector("#btn-temp-hide");
      const showBtn = this.container.querySelector("#btn-show");
      const toggleMouseoverBtn = this.container.querySelector(
        "#btn-toggle-mouseover"
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
     * 清除图片的所有鼠标事件处理器
     * @param {HTMLImageElement} img - 图片元素
     */
    clearImageEventHandlers(img) {
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
    }

    /**
     * 移除所有图片的悬浮事件（全面版本）
     * 包括：mouseover, mouseenter, mouseleave, mousemove, pointerover, pointerenter, pointermove
     */
    removeAllImageMouseover(showToast = true) {
      try {
        const images = document.querySelectorAll("img");
        let processedCount = 0;

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
          this.clearImageEventHandlers(img);

          // 方法3: 在捕获阶段阻止所有鼠标事件（更彻底）
          const stopEvent = (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            e.preventDefault();
          };

          // 为每个事件类型添加捕获阶段的拦截器
          this.mouseEvents.forEach((eventType) => {
            img.addEventListener(eventType, stopEvent, true); // true = 捕获阶段
          });

          // 保存拦截器引用以便后续移除
          this.eventInterceptors.set(img, {
            stopEvent,
            mouseEvents: this.mouseEvents
          });

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
      this.clearImageEventHandlers(img);

      const stopEvent = (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
      };

      this.mouseEvents.forEach((eventType) => {
        img.addEventListener(eventType, stopEvent, true);
      });

      this.eventInterceptors.set(img, {
        stopEvent,
        mouseEvents: this.mouseEvents
      });
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
      if (callback) callback();
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
        // setTimeout(() => {
        //   this.showAllFloaters();
        // }, 5000);
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
        const oldFeedback = document.getElementById("disable-floater-feedback");
        if (oldFeedback) oldFeedback.remove();

        const feedback = document.createElement("div");
        feedback.id = "disable-floater-feedback";
        feedback.className = "disable-floater-feedback";
        feedback.textContent = message;

        document.body.appendChild(feedback);

        setTimeout(() => {
          if (feedback && feedback.style) {
            feedback.style.animation = "disableFloaterFadeOut 0.5s ease-in-out";
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

  // 在DOM加载完成后创建并插入组件
  // 使用全局标记确保只执行一次
  if (window.__disableFloaterInitialized) {
    return;
  }

  function initDisableFloater() {
    try {
      // 检查是否已经存在实例或正在初始化
      if (
        window.__disableFloaterInitialized ||
        document.getElementById("disable-floater-container")
      ) {
        return;
      }

      // 标记为正在初始化
      window.__disableFloaterInitialized = true;

      // 创建容器元素
      const container = document.createElement("div");
      container.id = "disable-floater-container";

      // 创建控制器实例
      const controller = new DisableFloater(container);

      // 插入到页面
      if (document.documentElement) {
        document.documentElement.appendChild(container);
      } else if (document.body) {
        document.body.appendChild(container);
      } else {
        // 如果 body 和 documentElement 都不存在，等待一下再试
        window.__disableFloaterInitialized = false; // 重置标记，允许重试
        setTimeout(initDisableFloater, 100);
        return;
      }

      // 注意：不需要在这里打印日志，因为 init() 方法中已经打印了
    } catch (e) {
      console.error("初始化 DisableFloater 时出错:", e);
      // 如果出错，重置标记并尝试延迟重试
      window.__disableFloaterInitialized = false;
      setTimeout(() => {
        try {
          initDisableFloater();
        } catch (retryError) {
          console.error("重试初始化时出错:", retryError);
        }
      }, 500);
    }
  }

  // 在DOM加载完成后初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDisableFloater);
  } else {
    // DOM 已经加载完成，直接初始化
    setTimeout(initDisableFloater, 0);
  }
})();
