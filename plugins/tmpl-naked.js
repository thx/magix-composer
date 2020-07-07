/*
    模板处理并回写，常用于打点等功能
 */
let path = require('path');
let configs = require('./util-config');
let fd = require('./util-fd');
let tmplCmd = require('./tmpl-cmd');
let attrType = require('./tmpl-attr-type');
let { artCommandReg } = require('./util-const');
let artExpr = require('./tmpl-art-ctrl');
let mxTailReg = /\.m?mx$/;
let templateReg = /<template([^>]*)>([\s\S]+?)<\/template>/i;
let pureTagReg = /<[\w-]+[^>]*>/g;
let htmlCommentCelanReg = /<!--[\s\S]*?-->/g;
let commentPHReg = /\x00\d+\x00/g;
let cmdReg = /\x07\d+\x07/g;
let processTmpl = (tmpl, shortFrom) => {
    let store = Object.create(null);
    let comment = Object.create(null);
    let cIdx = 0;
    tmpl = tmplCmd.store(tmpl, store);
    tmpl = tmplCmd.store(tmpl, store, artCommandReg);

    tmpl = tmpl.replace(htmlCommentCelanReg, m => {
        let key = '\x00' + cIdx++ + '\x00';
        comment[key] = m;
        return key;
    });
    let tempTmpl = tmpl.replace(pureTagReg, m => {
        return new Array(m.length + 1).join('x');
    });
    let loopRanges = [],
        ctrls = [];
    tempTmpl.replace(cmdReg, (m, index) => {
        let ref = store[m];
        if (ref.startsWith('{{each')) {
            let asValue = ref.slice(6, -2);
            let loop = {
                vars: artExpr.extractAsExpr(asValue),
                start: index
            };
            loopRanges.push(loop);
            ctrls.push(loop);
        } else if (ref.startsWith('{{/each}}')) {
            let loop = ctrls.pop();
            loop.end = index;
        }
    });
    let getLoops = index => {
        let loops = [];
        for (let e of loopRanges) {
            if (e.start < index && index < e.end) {
                loops.push(e);
            }
        }
        return loops;
    };
    tmpl = tmpl.replace(pureTagReg, (m, start) => {
        let loops = getLoops(start);
        let result = configs.tmplTagProcessor(m, loops, shortFrom);
        return result || m;
    });
    tmpl = tmpl.replace(commentPHReg, m => comment[m]);
    tmpl = tmplCmd.recover(tmpl, store);
    return tmpl;
};
let processMx = (content, shortFrom) => {
    content = content.replace(templateReg, (match, lang, body) => {
        let tLang = 'html';
        if (lang) {
            lang = attrType.extractLang(lang);
            if (lang) {
                tLang = lang;
            }
        }
        return '<template>' + processTmpl(body, shortFrom, tLang) + '</template>';
    });
    return content;
};
module.exports = {
    process(from) {
        return new Promise(resolve => {
            if (configs.tmplFileExtNamesReg.test(from) ||
                mxTailReg.test(from)) {
                let content = fd.read(from);
                let shortFrom = from.replace(configs.commonFolder, '');
                if (mxTailReg.test(from)) {
                    let mxContent = processMx(content, shortFrom);
                    if (content != mxContent) {
                        fd.write(from, mxContent);
                    }
                    resolve();
                } else {
                    let ext = path.extname(from);
                    let tmplContent = processTmpl(content, shortFrom, ext.substring(1));
                    if (tmplContent != content) {
                        fd.write(from, tmplContent);
                    }
                    resolve();
                }
            } else {
                resolve();
            }
        });
    }
};