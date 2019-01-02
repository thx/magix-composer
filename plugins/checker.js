/*
    检查器入口{样式，模板，js代码}
 */
let css = require('./checker-css');
let tmpl = require('./checker-tmpl');
module.exports = {
    CSS: css,
    Tmpl: tmpl,
    output() {
        css.output();
    }
};