/*
    处理class名称，前面我们把css文件处理完后，再自动处理掉模板文件中的class属性中的名称，不需要开发者界入处理
 */

let cssChecker = require('./checker-css');
let classRef = require('./tmpl-attr-classref');
let classReg = /\bclass\s*=\s*"([^"]+)"/g;
let styleReg = /\bstyle\s*=\s*"[^"]+"/g;
let classNameReg = /(\s|^|\x07)([\w\-\u00c0-\uFFFF]+)(?=\s|$|\x07)/g;
let cssVarReg = /var\s*\(\s*([^)\s,]+)\s*(?=[,)])/g;
let numReg = /^\d+$/;
let tmplCommandAnchorReg = /\x07\d+\x07/g;
let tmplCmdReg = /<%([=@])?([\s\S]+?)%>/;
let stringReg = /\x17([^\x17]*?)\x17/g;
let attrReg = /([\w\-:]+)(?:=(["'])[\s\S]*?\2)?/g;
module.exports = (tag, match, cssNamesMap, refTmplCommands, e) => {
    let selectors = Object.create(null);
    let vars = Object.create(null);
    let tagsOrAttrs = Object.create(null);
    let classResult = (m, h, key, fromCmd) => {
        if (numReg.test(key)) return m; //纯数字的是模板命令，选择器不可能是纯数字
        let r = cssNamesMap[key];
        if (!fromCmd) {
            selectors[key] = 1;
        }
        return h + (r || key);
    };
    let cmdProcessor = (m, key) => {
        if (key) {
            return key.replace(classNameReg, (m, h, key) => classResult(m, h, key, true));
        }
        return key;
    };
    let classProcessor = (m, c) => {
        tmplCommandAnchorReg.lastIndex = 0;
        if (tmplCommandAnchorReg.test(m)) {
            tmplCommandAnchorReg.lastIndex = 0;
            m.replace(tmplCommandAnchorReg, tm => {
                let cmd = refTmplCommands[tm];
                if (cmd && tmplCmdReg.test(cmd)) {
                    refTmplCommands[tm] = cmd.replace(stringReg, cmdProcessor);
                }
            });
        }
        return 'class="' + c.replace(classNameReg, (m, h, key) => classResult(m, h, key)) + '"';
    };
    let styleProcessor = m => {
        return m.replace(cssVarReg, (_, key) => {
            if (numReg.test(key)) return _; //纯数字的是模板命令，选择器不可能是纯数字
            let r = e.cssVarsMap[key];
            vars[key] = 1;
            return `var(${r || key}`;
        });
    };
    match.replace(attrReg, (m, name) => {
        if (name != tag) {
            let attr = '[' + name + ']';
            tagsOrAttrs[attr] = 1;
        }
    });
    tagsOrAttrs[tag] = 1;
    match = match.replace(classReg, classProcessor); //保证是class属性
    match = match.replace(styleReg, styleProcessor);
    match = classRef(match, e);
    cssChecker.storeTemplateUsed(e.srcHTMLFile, {
        selectors,
        vars,
        tagsOrAttrs
    });
    return match;
};