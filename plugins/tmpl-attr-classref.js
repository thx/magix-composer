let cssChecker = require('./checker-css');
let { selfCssRefReg } = require('./util-const');
let configs = require('./util-config');
let pureNumReg = /^\d+$/;

module.exports = (tmpl, e) => {
    let selfCssClass = (m, prefix, key) => {
        if (pureNumReg.test(key)) return m;
        let r;
        if (prefix == '@keyframes' ||
            prefix == '@font-face') {
            let selector = `${prefix} ${key}`;
            let dest = e.declaredFiles.atRules[selector];
            if (dest) {
                cssChecker.storeTemplateUsed(e.srcHTMLFile, {
                    atRules: {
                        [selector]: 1
                    }
                });
                return e.cssAtRules[selector];
            } else if (configs.selectorSilentErrorCss) {
                return m;
            } else {
                cssChecker.storeUnexist(e.srcHTMLFile, selector);
            }
            return m;
        }
        if (key.startsWith('--')) {
            r = e.cssVarsMap[key];
            if (r ||
                !configs.selectorSilentErrorCss) {
                cssChecker.storeTemplateUsed(e.srcHTMLFile, {
                    vars: {
                        [key]: 1
                    }
                });
            }
        } else {
            r = e.cssNamesMap[key];
            if (r ||
                !configs.selectorSilentErrorCss) {
                cssChecker.storeTemplateUsed(e.srcHTMLFile, {
                    selectors: {
                        [key]: 1
                    }
                });
            }
        }
        return r || key;
    };
    return tmpl.replace(selfCssRefReg, selfCssClass);
};