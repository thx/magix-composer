/*
    mx-view属性处理
 */

let attrUri = require('./tmpl-attr-uri');
//let tmplCmd = require('./tmpl-cmd');

let mxViewAttrReg = /\bmx-view\s*=\s*(['"])([^'"]*?)\1/;
let cmdReg = /\x07\d+\x07/g;
let lazyloadAttr = /\bmx5?-lazyload\b/;
module.exports = (e, match, refTmplCommands) => {
    if (mxViewAttrReg.test(match)) { //带有mx-view属性才处理
        let hasLazyload = lazyloadAttr.test(match);
        match.replace(mxViewAttrReg, (m, q, content) => {
            let i = content.indexOf('?');
            if (i > -1) {
                content = content.slice(0, i);
            }
            cmdReg.lastIndex = 0;
            if (!cmdReg.test(content)) {
                if (!e.tmplExceptMxViews) {
                    e.tmplExceptMxViews = {};
                }
                if (!e.tmplMxViews) {
                    e.tmplMxViews = Object.create(null);
                }
                if (hasLazyload) {
                    e.tmplExceptMxViews[content] = 1;
                }
                if (!e.tmplMxViews[content] &&
                    !e.tmplExceptMxViews[content]) {
                    e.tmplMxViews[content] = 1;
                    e.tmplMxViewsArray = Object.keys(e.tmplMxViews);
                }
                if (hasLazyload &&
                    e.tmplMxViews[content]) {
                    delete e.tmplMxViews[content];
                    e.tmplMxViewsArray = Object.keys(e.tmplMxViews);
                }

            } else {
                cmdReg.lastIndex = 0;
            }
        });
        return attrUri(match, e, refTmplCommands, mxViewAttrReg, 'mx-view');
    }
    return match;
};