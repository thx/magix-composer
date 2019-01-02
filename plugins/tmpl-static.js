/*
    分析模板中不变的html片断，加速虚拟dom的diff
    程序可自动识别哪些节点不会变化
    开发者也可通过在节点上添加<div mx-static>强制指定该节点下所有的节点不会变化　

    mxs的使用场景：整个节点(包括属性)及子节点内不包含任何变量
    mxa的使用场景：节点的属性不包含任何变量
    mxv的使用场景：

    <div>
        <div mx-view="path/to/view?a={{@a}}"></div>
    </div>

    对于这段代码，因为a是使用`@a`的引用方式，即使a发生了改变，这段代码有可能不会变化


*/
let md5 = require('./util-md5');
let tmplParser = require('./tmpl-parser');
let configs = require('./util-config');
let tagReg = /<([^>\s\/]+)([^>]*?)(\/)?>/g;
let staticKeyReg = /\s*_mxs="[^"]+"/g;
let staticRealKeyReg = /\s*_mxrs="[^"]+"/g;
let tmplCommandAnchorRegTest = /\u0007\d+\u0007/;
let forceStaticKey = /\s+mx-static(?:-attr)?(?:\s*=\s*(['"])[^'"]+\1)?/;
let ifForReg = /\s*(?:if|for|for_declare)\s*=\s*"[^"]+"/g;
let mxEventReg = /\bmx-[^\s"'<>/=]+=\s*['"]\s*\x1f/;
let mxSlogViewReg = /\s+mx-slot-view(?:\s*=\s*(['"])([^'"]+)\1)?/;

module.exports = (tmpl, file) => {
    let g = 0;
    let prefix = configs.projectName + md5(file, 'tmplFiles', '', true) + ':';
    tmpl = tmpl.replace(tagReg, (match, tag, attrs, close, tKey) => {
        tKey = ' _mxs="' + g++ + '"';
        tKey += ' _mxrs="' + g++ + '"';
        return '<' + tag + tKey + attrs + (close || '') + '>';
    });
    let tokens = tmplParser(tmpl, file);
    let keysMap = Object.create(null),
        userKeysMap = Object.create(null);
    let removeChildrenStaticKeys = (children, keys,
        prefix = '_mxs', valueKey = 'mxsKey') => {
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
                    let html = tmpl.substring(n.start, n.end)
                        .replace(staticKeyReg, '')
                        .replace(staticRealKeyReg, '');
                    html = html.replace(ifForReg, '');
                    keysMap[' _mxs="' + n.mxsKey + '"'] = html;
                    keysMap[' _mxrs="' + n.mxsRealKey + '"'] = html;
                    let attr = tmpl.substring(n.attrsStart, n.attrsEnd);
                    let hasEvent = mxEventReg.test(attr);
                    if (hasEvent || tmplCommandAnchorRegTest.test(html)) {
                        keys.push(' _mxrs="' + n.mxsRealKey + '"');
                    } else if (n.children) {
                        removeChildrenStaticKeys(n.children, keys, '_mxrs', 'mxsRealKey');
                    }
                    if (n.userStaticKey) {
                        userKeysMap[' _mxs="' + n.mxsKey + '"'] = n.userStaticKey;
                        if (n.children && n.userStaticKey !== 'false') {
                            removeChildrenStaticKeys(n.children, keys);
                        }
                    } else if (tmplCommandAnchorRegTest.test(html)) {
                        keys.push(' _mxs="' + n.mxsKey + '"');
                    } else if (n.children) {
                        let hasMxv = false;
                        for (let c of n.children) {
                            if (c.mxvKey ||
                                c.mxvAutoKey ||
                                c.tag == 'q:direct' ||
                                c.tag == 'q:group' ||
                                c.tag == 'input' ||
                                c.tag == 'textarea' ||
                                c.tag == 'option') {
                                hasMxv = true;
                                keys.push(' _mxs="' + n.mxsKey + '"');
                                break;
                            }
                        }
                        if (!hasMxv) {
                            removeChildrenStaticKeys(n.children, keys);
                        }
                    } else if (n.tag == 'input' ||
                        n.tag == 'textarea' ||
                        n.tag == 'option') {
                        keys.push(' _mxs="' + n.mxsKey + '"');
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
    tmpl = tmpl.replace(tagReg, m => {
        return m.replace(staticKeyReg, m => {
            let r = userKeysMap[m];
            if (r === 'false') return '';
            if (!r || r === true) {
                r = keysMap[m];
                r = md5(r, file + ':key', prefix, true);
            } else {
                r = md5(m, file + ':key', prefix, true) + ':' + r;
            }
            return ' mxs="' + r + '"';
        }).replace(staticRealKeyReg, m => {
            let r = keysMap[m];
            return ' _mxrs="' + md5(r, file + ':static_key', prefix, true) + '"';
        }).replace(mxSlogViewReg, (m, q, value) => {
            q = md5(m, file + ':slot', prefix, true);
            if (value) {
                return q += ':' + value;
            }
            return ` mxf="${q}"`;
        }).replace(forceStaticKey, '');
    });
    return tmpl;
};