/*
    处理class名称，前面我们把css文件处理完后，再自动处理掉模板文件中的class属性中的名称，不需要开发者界入处理
 */
let checker = require('./checker');
let deps = require('./util-deps');
let classRef = require('./tmpl-attr-classref');
let classReg = /\bclass\s*=\s*"([^"]+)"/g;
let classNameReg = /(\s|^|\u0007)([\w\-]+)(?=\s|$|\u0007)/g;
let numReg = /^\d+$/;
let tmplCommandAnchorReg = /\u0007\d+\u0007/g;
let tmplCmdReg = /<%([=@])?([\s\S]+?)%>/;
let stringReg = /\u0017([^\u0017]*?)\u0017/g;
let attrReg = /([\w\-:]+)(?:=(["'])[\s\S]*?\2)?/g;
module.exports = (tag, match, cssNamesMap, refTmplCommands, e, tagsCache, tempCache) => {
    let classResult = (m, h, key, fromCmd) => {
        if (numReg.test(key)) return m; //纯数字的是模板命令，选择器不可能是纯数字
        let r = cssNamesMap[key];
        if (!tempCache[key]) {
            tempCache[key] = 1;
            if (r) {
                let files = e.cssNamesInFiles[key + '!r'];
                if (files) {
                    checker.CSS.markUsed(files, key, e.from);
                    files.forEach(f => {
                        deps.addFileDepend(f, e.from, e.to);
                    });
                } else {
                    throw new Error(`[MXC Error(tmpl-attr-class)] can not find class name "${key}" at file "${e.from}"`);
                }
            } else if (!fromCmd) {
                checker.CSS.markUndeclared(e.srcHTMLFile, key);
            }
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
        return 'class="' + c.replace(classNameReg, (m, h, key) => classResult(m, h, key, false)) + '"';
    };
    match.replace(attrReg, (m, name) => {
        let attr = '[' + name + ']';
        if (!tagsCache[attr]) {
            tagsCache[attr] = 1;
            let files = e.cssTagsInFiles[attr];
            if (files) {
                checker.CSS.markUsedTags(Object.keys(files), attr, e.from);
            }
        }
    });
    if (!tagsCache[tag]) {
        tagsCache[tag] = 1;
        let files = e.cssTagsInFiles[tag];
        if (files) {
            checker.CSS.markUsedTags(Object.keys(files), tag, e.from);
        }
    }
    match = match.replace(classReg, classProcessor); //保证是class属性
    return classRef(match, e, tempCache);
};