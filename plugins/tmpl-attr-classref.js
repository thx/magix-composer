let cssChecker = require('./checker-css');
let pureNumReg = /^\d+$/;
let selfCssReg = /@\$\(\.([\w\-]+)\)/g;
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
    return tmpl.replace(selfCssReg, selfCssClass);
};