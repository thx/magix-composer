/*
    处理class名称，前面我们把css文件处理完后，再自动处理掉模板文件中的class属性中的名称，不需要开发者界入处理
 */
let path = require('path');
let chalk = require('ansis');
let cssChecker = require('./checker-css');
let classRef = require('./tmpl-attr-classref');
let cssTransform = require('./css-transform');
let configs = require('./util-config');
let asyncReplacer = require('./util-asyncr');
let utils = require('./util');
let {
    styleInHTMLReg
} = require('./util-const');
let classReg = /\bclass\s*=\s*(["'])([^"]+)\1/g;
//let styleReg = /\bstyle\s*=\s*"[^"]+"/g;
let classNameReg = /(\s|^|\x07)([\w\-\u00c0-\uFFFF]+)(?=\s|$|\x07)/g;
//let cssVarReg = /var\s*\(\s*([^),]+)\s*(?=[,)])/g;
//let cssVarKeyReg = /--[^(),:;]+(?=:)/g;
let numReg = /^\d+$/;
let tmplCommandAnchorReg = /\x07\d+\x07/g;
let tmplCmdReg = /<%([=#])?([\s\S]+?)%>/;
let stringReg = /\x17([^\x17]*?)\x17/g;
let attrReg = /(?:\x1c\d+\x1c)?([\w\-:\x1c]+)(?:=(["'])[\s\S]*?\2)?/g;
module.exports = async (tag, match, cssNamesMap, refTmplCommands, e, toSrc) => {
    let selectors = Object.create(null);
    let vars = Object.create(null);
    let tagsOrAttrs = Object.create(null);
    let singleClassTemp,
        singleClassName;
    let checkDuplicate = key => {
        if (singleClassTemp[key] == 1 &&
            !configs.selectorDSEndReg.test(key)) {
            console.log(chalk.red('[MXC Tip(tmpl-attr-class)] duplicate class value:' + key), 'near:', chalk.magenta(toSrc(singleClassName)), 'at file:', chalk.gray(e.shortHTMLFile));
        }
        singleClassTemp[key] = 1;
    };
    let classResult = (m, h, key, fromCmd) => {
        if (numReg.test(key)) return m; //纯数字的是模板命令，选择器不可能是纯数字
        //console.log(key,JSON.stringify(key),cssNamesMap[key]);
        let r = cssNamesMap[key];
        let byJIT = false;
        if (!r) {
            let t = configs.cssJITGenerator(key);
            if (t === true) {//true表示已处理，且不生成相应的JIT样式
                byJIT = true;
            } else if (t === false ||
                t === '' ||
                t == null) {
                byJIT = false;
            } else if (t) {
                if (!e.styleJITLocker[key]) {
                    e.styleJITLocker[key] = 1;
                    let namesMap = Object.create(null),
                        varsMap = Object.create(null),
                        atRules = Object.create(null);
                    let z = cssTransform.cssContentProcessor(t, {
                        shortFile: `${e.from}.jit.style`,
                        file: `${e.from}.jit.style`,
                        namesKey: e.styleJITNamesKey,
                        namesMap,
                        varsMap, atRules
                    });
                    e.styleJITList.push(z.content);
                    Object.assign(cssNamesMap, namesMap);
                    r = cssNamesMap[key];
                }
                byJIT = true;
            }
        }
        if (!fromCmd) {
            if (!byJIT && (!configs.checker.tmplClassCheck ||
                configs.checker.tmplClassCheck(key))) {
                selectors[key] = 1;
            }
            checkDuplicate(key);
        }
        return h + (r || key);
    };
    let cmdProcessor = (m, key) => {
        if (key) {
            return key.replace(classNameReg, (m, h, key) => classResult(m, h, key, true));
        }
        return key;
    };
    let classProcessor = async (m, q, c) => {
        singleClassTemp = Object.create(null);
        singleClassName = m;
        tmplCommandAnchorReg.lastIndex = 0;
        if (tmplCommandAnchorReg.test(m)) {
            tmplCommandAnchorReg.lastIndex = 0;
            m.replace(tmplCommandAnchorReg, tm => {
                let cmd = refTmplCommands[tm];
                if (cmd && tmplCmdReg.test(cmd)) {
                    //console.log(JSON.stringify(cmd));
                    refTmplCommands[tm] = cmd.replace(stringReg, cmdProcessor);
                }
            });
        }
        //console.log(c);
        c = c.replace(classNameReg, (m, h, key) => classResult(m, h, key));
        c = await asyncReplacer(c, styleInHTMLReg, async (m, fn, tail, selector) => {
            checkDuplicate(fn);
            let { prefix,
                postfix } = utils.fillAndSplitId(fn);
            let styleFile = prefix + postfix + tail;
            let srcFile = e.srcHTMLFile;
            let styleFileDir = path.dirname(styleFile);
            let styleName = path.basename(styleFile).slice(0, -tail.length);
            let srcFileDir = path.dirname(srcFile);
            let relative = path.relative(srcFileDir, styleFileDir);
            if (!relative) {
                relative = '.';
            }
            let r = await cssTransform.refNameProcessor(e.srcHTMLFile, relative + path.sep + styleName, tail, selector, e, m);
            r = cssTransform.recoverAtReg(r);
            return r;
        });
        //console.log(c);
        return `class="${c}"`;
    };
    // let styleProcessor = m => {
    //     return m.replace(cssVarReg, (_, key) => {
    //         if (numReg.test(key) ) return _; //纯数字的是模板命令，选择器不可能是纯数字
    //         let r = e.cssVarsMap[key];
    //         vars[key] = 1;
    //         return `var(${r || key}`;
    //     }).replace(cssVarKeyReg, _ => {
    //         if (numReg.test(_)) return _; //纯数字的是模板命令，选择器不可能是纯数字
    //         let r = e.cssVarsMap[_];
    //         vars[_] = 1;
    //         return r || _;
    //     });
    // };
    match.replace(attrReg, (m, name) => {
        if (name != tag) {
            let attr = '[' + name + ']';
            tagsOrAttrs[attr] = 1;
        }
    });
    tagsOrAttrs[tag] = 1;
    //保证是class属性
    match = await asyncReplacer(match, classReg, classProcessor);
    //match = match.replace(styleReg, styleProcessor);
    //console.log(match);
    //console.log(e.cssAtRules);
    match = classRef(match, e);
    cssChecker.storeTemplateUsed(e.srcHTMLFile, {
        selectors,
        vars,
        tagsOrAttrs
    });
    return match;
};