
let utils = require('./util');
let htmlParser = require('./html-parser');
let tmplArt = require('./tmpl-art');
let sourceTagReg = /<mx-source([^>]*)>([\s\S]+?)<\/mx-source[^>]*>/g;
let sourceArtTagReg = /<mx-source-whole[^>]*>([\s\S]+?)<\/mx-source-whole[^>]*>/g;
let braceReg = /[{}]/g;
let escapeAnd = /&/g;
let escapeHTMLReg = /[<>]/g;
let escapeHTMLMap = {
    '<': '&lt;',
    '>': '&gt;',
};
let escapeBraceMap = {
    '{': '&#x7b;',
    '}': '&#x7d;'
};
let whiteReg = /^[ \t\f]+$/;
let escapeHTMLProcessor = m => escapeHTMLMap[m] || m;
let escapeBraceProcessor = m => escapeBraceMap[m] || m;
let encodeHTML = str => str.replace(escapeAnd, '&amp;').replace(escapeHTMLReg, escapeHTMLProcessor);
let encodeArt = str => encodeHTML(str).replace(braceReg, escapeBraceProcessor);

let formatContent = content => {
    let lines = content.split('\n');
    let newLines = [];
    let lineWhites = [];
    for (let e of lines) {
        if (e) {
            let i = 0;
            for (let x = 0; x < e.length; x++) {
                let m = e[x];
                if (whiteReg.test(m)) {
                    i++;
                } else {
                    lineWhites.push(i);
                    break;
                }
            }
        }
    }
    let min = Math.min(...lineWhites);
    for (let e of lines) {
        let rest = e && e.substring(min);
        if (rest) {
            newLines.push(rest);
        }
    }
    return newLines.join('\n');
};
module.exports = {
    translate(tmpl, e) {
        let artAnchor = utils.uId('art', tmpl);
        let artAnchorIndex = 0;
        let recoverArtReg = new RegExp(`${artAnchor}\\-\\d+\\-${artAnchor}`, 'g');
        let store = {};
        tmpl = tmpl.replace(sourceArtTagReg, (m, $1) => {
            let key = `${artAnchor}-${artAnchorIndex++}-${artAnchor}`;
            store[key] = $1;
            return key;
        }).replace(sourceTagReg, (m, attrs, content) => {
            let openTag = `<mx-source${attrs}>`;
            let openTagInfo = htmlParser.parseStartTag(openTag);
            let translateArt = false;
            let tag = 'pre';
            let restAttrs = attrs;
            content = formatContent(content);
            if (openTagInfo &&
                openTagInfo.attrsMap) {
                if (openTagInfo.attrsMap.whole == 'true') {
                    translateArt = true;
                }
                if (openTagInfo.attrsMap.tag) {
                    tag = openTagInfo.attrsMap.tag;
                }
                restAttrs = '';
                for (let attr of openTagInfo.attrs) {
                    if (attr[1] != 'tag' &&
                        attr[1] != 'whole') {
                        restAttrs += attr[0];
                    }
                }
            }
            if (translateArt) {
                content = encodeArt(content);
            } else {
                let info = tmplArt.store(content, e);
                let tmpl = encodeHTML(info.content);
                content = tmplArt.recover(tmpl, info.recoverReg, info.store);
            }
            return `<${tag}${restAttrs}>${content}</${tag}>`;
        }).replace(recoverArtReg, m => {
            let src = store[m];
            if (src) {
                src = formatContent(src);
                return encodeArt(src);
            }
            return m;
        });
        return tmpl;
    },
    store(tmpl) {
        let sourceAnchor = utils.uId('source', tmpl);
        let sourceAnchorIndex = 0;
        let recoverSourceReg = new RegExp(`${sourceAnchor}\\-\\d+\\-${sourceAnchor}`, 'g');
        let store = {};
        tmpl = tmpl.replace(sourceArtTagReg, m => {
            let key = `${sourceAnchor}-${sourceAnchorIndex++}-${sourceAnchor}`;
            store[key] = m;
            return key;
        }).replace(sourceTagReg, m => {
            let key = `${sourceAnchor}-${sourceAnchorIndex++}-${sourceAnchor}`;
            store[key] = m;
            return key;
        });
        return {
            content: tmpl,
            recoverReg: recoverSourceReg,
            store
        };
    },
    recover(content, recoverReg, store) {
        while (recoverReg.test(content)) {
            recoverReg.lastIndex = -1;
            content = content.replace(recoverReg, m => store[m] || m);
        }
        return content;
    }
};