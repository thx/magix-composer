/*
    分析模板中不变的html片断，加速虚拟dom的diff
    程序可自动识别哪些节点不会变化

    mxs的使用场景：整个节点(包括属性)及子节点内不包含任何变量
    mxv的使用场景：

    <div>
        <div mx-view="path/to/view?a={{@a}}"></div>
    </div>

    对于这段代码，因为a是使用`@a`的引用方式，即使a发生了改变，这段代码有可能不会变化
    需要对包含这样的view的节点添加mxv属性来深入比较

*/
let md5 = require('./util-md5');
let tmplParser = require('./tmpl-parser');
let regexp = require('./util-rcache');
let htmlAttrs = require('./html-attrs');
let {
    quickGroupTagName,
    quickDirectTagName,
    tmplTempRealStaticKey,
    tmplTempStaticKey,
    tmplStaticKey
} = require('./util-const');
let tagReg = /<([^>\s\/]+)([^>]*?)(\/)?>/g;
let staticKeyReg = regexp.get(`\\s*${regexp.escape(tmplTempStaticKey)}="[^"]+"`, 'g');
let staticRealKeyReg = regexp.get(`\\s*${regexp.escape(tmplTempRealStaticKey)}="[^"]+"`, 'g');
let tmplCommandAnchorRegTest = /\x07\d+\x07/;
let tagsAcceptUsersInput = htmlAttrs.getInputTags();

module.exports = (tmpl, file) => {
    let g = 0;
    let prefix = '';//md5(file, 'tmplFiles', configs.projectName, true) + ':';
    tmpl = tmpl.replace(tagReg, (match, tag, attrs, close, tKey) => {
        tKey = ` ${tmplTempStaticKey}="${g++}"`;
        tKey += ` ${tmplTempRealStaticKey}="${g++}"`;
        return '<' + tag + tKey + attrs + (close || '') + '>';
    });
    let tokens = tmplParser(tmpl, file);
    let keysMap = Object.create(null),
        groupKeyNodeStatics = Object.create(null);
    let removeChildrenStaticKeys = (children, keys,
        prefix = tmplTempStaticKey, valueKey = 'mxsKey') => {
        for (let c of children) {
            let key = ' ' + prefix + '="' + c[valueKey] + '"';
            if (keys.indexOf(key) == -1) {
                keys.push(key);
            }
        }
    };
    let getRemovedStaticKeys = () => {
        let keys = [];
        let walk = nodes => {
            for (let n of nodes) {
                if (!n.isText) {
                    if (n.hasContent) {
                        if (n.children) {
                            walk(n.children);
                        }
                    }
                    if (n.groupKeyNode && n.pId) {
                        throw new Error(`[MXC(tmpl-static)] mx-group key="${n.groupKey}" can not nested in other elements`);
                    }
                    let html = tmpl.substring(n.start, n.end)
                        .replace(staticKeyReg, '')
                        .replace(staticRealKeyReg, ''),
                        removeStatic = false;
                    keysMap[` ${tmplTempStaticKey}="${n.mxsKey}"`] = html;
                    keysMap[` ${tmplTempRealStaticKey}="${n.mxsRealKey}"`] = html;
                    if (tmplCommandAnchorRegTest.test(html)) {
                        keys.push(` ${tmplTempStaticKey}="${n.mxsKey}"`);
                        removeStatic = true;
                    } else if (n.children) {
                        let hasMxv = false;
                        for (let c of n.children) {
                            if (c.hasMxEvent) {
                                n.hasMxEvent = true;
                            }
                            if (c.mxvKey ||
                                c.tag == quickDirectTagName ||
                                c.tag == quickGroupTagName ||
                                tagsAcceptUsersInput[c.tag] == 1) {
                                hasMxv = true;
                                removeStatic = true;
                                keys.push(` ${tmplTempStaticKey}="${n.mxsKey}"`);
                                break;
                            }
                        }
                        if (!hasMxv) {
                            removeChildrenStaticKeys(n.children, keys);
                        }
                        for (let c of n.children) {
                            if (c.groupUseNode &&
                                !groupKeyNodeStatics[c.groupUse]) {
                                n.groupUseNode = true;
                                removeStatic = true;
                                keys.push(` ${tmplTempStaticKey}="${n.mxsKey}"`);
                                break;
                            }
                        }
                    }
                    if (tagsAcceptUsersInput[n.tag] == 1 ||
                        (n.groupUseNode &&
                            !groupKeyNodeStatics[n.groupUse])) {
                        removeStatic = true;
                        keys.push(` ${tmplTempStaticKey}="${n.mxsKey}"`);
                    }


                    if (n.hasMxEvent ||
                        n.groupUseNode ||
                        tmplCommandAnchorRegTest.test(html)) {
                        keys.push(` ${tmplTempRealStaticKey}="${n.mxsRealKey}"`);
                    } else if (n.children) {
                        removeChildrenStaticKeys(n.children, keys, tmplTempRealStaticKey, 'mxsRealKey');
                    }
                    if (!removeStatic && n.groupKeyNode) {
                        groupKeyNodeStatics[n.groupKey] = 1;
                    }
                }
            }
        };
        walk(tokens);
        return keys;
    };
    let keys = getRemovedStaticKeys();
    for (let key of keys) {
        tmpl = tmpl.replace(key, '');
    }
    //console.log(tmpl);
    tmpl = tmpl.replace(tagReg, m => {
        return m.replace(staticKeyReg, m => {
            let r = keysMap[m];
            r = md5(r, file + ':key', prefix, true);
            return ` ${tmplStaticKey}="${r}"`;
        }).replace(staticRealKeyReg, m => {
            let r = keysMap[m];
            return ` ${tmplTempRealStaticKey}="${md5(r, file + ':static_key', prefix, true)}"`;
        });
    });
    //console.log(tmpl);
    return tmpl;
};