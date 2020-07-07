let cssChecker = require('./checker-css');
let { selfCssRefReg } = require('./util-const');
let pureNumReg = /^\d+$/;

module.exports = (tmpl, e) => {
    let selfCssClass = (m, key) => {
        if (pureNumReg.test(key)) return m;
        let r;
        if (key.startsWith('--')) {
            r = e.cssVarsMap[key];
            cssChecker.storeTemplateUsed(e.srcHTMLFile, {
                vars: {
                    [key]: 1
                }
            });
        } else {
            r = e.cssNamesMap[key];
            cssChecker.storeTemplateUsed(e.srcHTMLFile, {
                selectors: {
                    [key]: 1
                }
            });
        }
        return r || key;
    };
    return tmpl.replace(selfCssRefReg, selfCssClass);
};