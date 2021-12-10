
let utils = require('./util');
let htmlParser = require('./html-parser');
let tmplArt = require('./tmpl-art');
let sourceTagReg = /<mx-source([^>]*)>([\s\S]+?)<\/mx-source>/g;
let artSourceTagReg = /\{{2}mx-source([^\}]*)\}{2}([\s\S]+?)\{{2}\/mx-source\}{2}/g;
let sourceArtTagReg = /(?:[\r\n]([ \t\f]*))?<mx-source-whole[^>]*>([\s\S]+?)<\/mx-source-whole>/g;
let artSourceWholeReg = /(?:[\r\n]([ \t\f]*))?\{{2}mx-source-whole[^\}]*\}{2}([\s\S]+?)\{{2}\/mx-source-whole\}{2}/g;
let sourceHTMLTagReg = /(?:[\r\n]([ \t\f]*))?<mx-source-origin[^>]*>([\s\S]+?)<\/mx-source-origin>/g;
let artSourceHTMLReg = /(?:[\r\n]([ \t\f]*))?\{{2}mx-source-origin[^\}]*\}{2}([\s\S]+?)\{{2}\/mx-source-origin\}{2}/g;
let braceReg = /[{}]/g;
let escapeAnd = /&/g;
let escapeHTMLReg = /[<>&]/g;
let escapeHTMLMap = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;'
};
let escapeBraceMap = {
    '{': '&#x7b;',
    '}': '&#x7d;'
};
let whiteReg = /^[ \t\f]+$/;
let returnReg = /\r|\n/;
let startReturnReg = /^\r|\n/;
let endReturnReg = /\r|\n$/;
let spaceReg = /^\s*$/i;
let escapeHTMLProcessor = m => escapeHTMLMap[m] || m;
let escapeBraceProcessor = m => escapeBraceMap[m] || m;
let encodeHTML = str => str.replace(escapeHTMLReg, escapeHTMLProcessor);
let encodeHTMLAndArt = str => encodeHTML(str).replace(braceReg, escapeBraceProcessor);

let formatContent = (content, offset = 0) => {
    let lines = content.split(returnReg);
    if (lines.length == 1) {
        return content;
    }
    if (spaceReg.test(lines[0])) {
        lines.shift();
    }
    if (lines.length &&
        spaceReg.test(lines[lines.length - 1])) {
        lines.pop();
    }
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
            if (newLines.length) {
                newLines.push(new Array(offset + 1).join(' ') + rest);
            } else {
                newLines.push(rest);
            }
        } else {
            newLines.push('');//追加空白行
        }
    }
    return newLines.join('\n');
};
module.exports = {
    translate(tmpl, e) {
        let innerAnchor = utils.uId('mxsi', tmpl);
        let innerAnchorIndex = 0;
        let recoverInnerReg = new RegExp(`${innerAnchor}\\-\\d+\\-${innerAnchor}`, 'g');
        let store = {};
        let storeInner = (m, $1, $2) => {
            let key = `${innerAnchor}-${innerAnchorIndex++}-${innerAnchor}`;
            let min,
                returned;
            if ($1) {
                min = $1.length;
                returned = '\n' + $1 + key;
            } else {
                min = 0;
                returned = key;
            }
            store[key] = {
                min,
                content: $2
            };
            return returned;
        };
        let recoverInner = m => {
            let src = store[m];
            if (src) {
                src = formatContent(src.content, src.min);
                // src = src.replace(startReturnReg, '')
                //     .replace(endReturnReg, '');
                return src;
            }
            return m;
        };
        let processSource = (m, attrs, content) => {
            if (attrs) {
                attrs = attrs.trim();
                if (attrs.startsWith('(') &&
                    attrs.endsWith(')')) {
                    attrs = attrs.slice(1, -1);
                }
            }
            let openTag = `<mx-source ${attrs}>`;
            let openTagInfo = htmlParser.parseStartTag(openTag);
            let translateArt = false;
            let tag = 'pre';
            let restAttrs = attrs;
            let translateHTML = true;
            content = formatContent(content);
            if (openTagInfo &&
                openTagInfo.attrsMap) {
                let { whole } = openTagInfo.attrsMap;
                if (whole == 'true') {
                    translateArt = true;
                }
                if (whole == 'none') {
                    translateHTML = false;
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
                content = encodeHTMLAndArt(content);
            } else if (translateHTML) {
                let info = tmplArt.store(content, e);
                //console.log(info.content);
                let tmpl = encodeHTML(info.content);
                content = tmplArt.recover(tmpl, info.recoverReg, info.store);
            }
            return `<${tag}${restAttrs}>${content}</${tag}>`;
        };
        tmpl = tmpl.replace(sourceArtTagReg, storeInner)
            .replace(artSourceWholeReg, storeInner)
            .replace(sourceHTMLTagReg, storeInner)
            .replace(artSourceHTMLReg, storeInner)
            .replace(sourceTagReg, processSource)
            .replace(artSourceTagReg, processSource)
            .replace(recoverInnerReg, recoverInner);
        //console.log(tmpl);
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