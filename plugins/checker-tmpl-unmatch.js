//https://github.com/marcosbasualdo/UnclosedHtmlTags/blob/master/index.js

//let chalk = require('chalk');
//let slog = require('./util-log');
let configs = require('./util-config');
let htmlParser = require('./html-parser');
//let tmplCmd = require('./tmpl-cmd');
let commentReg = /<!--[\s\S]*?-->/g;
let tagRemovedReg = /<(style|script)[^>]*>[\s\S]*?<\/\1>/g;
let tagReg = /<(\/)?([a-z0-9\-.:_\x11]+)/ig;
let brReg = /(?:\r\n|\r|\n)/;
let { microTmplCommand } = require('./util-const');
let hdreg = /\x1f\d+\s*\x1f/g;
let brPlaceholder = (m, store) => {
    let count = m.split(brReg).length;
    let key = `\x1f${++store.__idx}${new Array(count).join('\n')}\x1f`;
    store[key] = m;
    return key;
};
let cleanHTML = (tmpl, store) => {
    tmpl = tmpl.replace(commentReg, m => {
        return brPlaceholder(m, store);
    }).replace(tagRemovedReg, m => {
        return brPlaceholder(m, store);
    });
    tmpl = tmpl.replace(microTmplCommand, m => {
        return brPlaceholder(m, store);
    });
    if (configs.tmplCommand) {
        tmpl = tmpl.replace(configs.tmplCommand, m => {
            return brPlaceholder(m, store);
        });
    }
    return tmpl;
};

let markLine = tmpl => {
    tmpl = tmpl.replace(tagReg, (m, close, name) => {
        return `<${close || ''}${name} mc:line`;
    });
    return tmpl;
};
let lineReg = /mc:line/g;
let setLineNo = (tmpl, no) => {
    return tmpl.replace(lineReg, 'mc:line=' + no);
};
let lineNoReg = /\smc:line=(\d+)/;
let lineNoGReg = /\smc:line=\d+/g;
let readLineNo = tmpl => {
    let m = tmpl.match(lineNoReg);
    if (m) {
        return m[1];
    }
    return 'unknown';
};

module.exports = (tmpl, e) => {
    let store = Object.create(null);
    store.__idx = 0;
    tmpl = cleanHTML(tmpl, store);
    tmpl = markLine(tmpl);
    let tags = [];
    let lines = tmpl.split(brReg);
    let lineCount = 1;
    let newLines = [];
    for (let line of lines) {
        newLines.push(setLineNo(line, lineCount++));
    }
    tmpl = newLines.join('');
    htmlParser(tmpl, {
        start(tag, { unary, attrsMap, start, end }) {
            let a = tmpl.slice(start, end);
            if (!unary) {
                tags.push({
                    line: attrsMap['mc:line'],
                    match: a,
                    name: tag
                });
            }
        },
        end(tag, { start, end }) {
            let m = tmpl.slice(start, end);
            let no = readLineNo(m);
            tags.push({
                line: no,
                close: true,
                match: m,
                name: tag
            });
        }
    });
    let tagsStack = [];
    let recover = str => str.replace(lineNoGReg, '').replace(hdreg, m => store[m]);
    for (let tag of tags) {
        if (tag.close) {
            if (!tagsStack.length) {
                throw new Error(`[MXC Error(checker-tmpl-unmatch)] "${recover(tag.match)}" doesn't have corresponding open tag at line ${tag.line}`);
            }
            let last = tagsStack.pop();
            if (tag.name != last.name) {
                let before = `open tag "${recover(last.match)}"`;
                // if (last.name.startsWith('art\x11')) {
                //     before = `art "${last.close ? '/' : ''}${last.name.substring(4)}"`;
                // }
                let current = recover(tag.match);
                // if (tag.name.startsWith('art\x11')) {
                //     current = `art "${tag.close ? '/' : ''}${tag.name.substring(4)}"`;
                // }
                throw new Error(`[MXC Error(checker-tmpl-unmatch)] "${current}" at line ${tag.line} doesn't match ${before} at line ${last.line}`);
            }
        } else {
            tagsStack.push(tag);
        }
    }
    for (let tag of tagsStack) {
        throw new Error(`[MXC Error(checker-tmpl-unmatch)] unclosed tag "${recover(tag.match)}" at line ${tag.line}`);
    }
};