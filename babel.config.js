module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        // 明确指定需要支持 IE 11，这样会强制转换类为 ES5
        targets: {
          ie: "11"
        },
        modules: false, // 保持 ES6 模块语法，因为我们使用的是 IIFE
        loose: false, // 使用严格模式，确保兼容性
        useBuiltIns: false
      }
    ]
  ],
  plugins: []
};
