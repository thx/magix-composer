/*
<div each="{{list as user index}}" if="{{user.age>20}}">
    <input value="{{:user.name}}"/>
    <input type="checkbox" @checked="{{=user.gender=='female'}}"/>
    {{=user.age}}
    {{if user.age>30}}
        <span>~~~</span>
    {{/if}}
    {{=user.origin}}
    <div mx-view="path/to/user/card" user="{{@user}}">
        <mx-loading/>
    </div>
</div>
*/
let htmlParser = require('./html-parser');
let tmplCmd = require('./tmpl-cmd');
let configs = require('./util-config');
let artExpr = require('./tmpl-art-ctrl');
let consts = require('./util-const');
let utils = require('./util');
let util = require('util');
let regexp = require('./util-rcache');
let slog = require('./util-log');
let attrMap = require('./tmpl-attr-map');
let tmplUnescape = require('html-entities-decoder');
let chalk = require('chalk');
let viewIdReg = /\x1f/g;
let artCtrlReg = /(?:<%'(\d+)\x11([^\x11]+)\x11'%>)?<%([@=:&])?([\s\S]+?)%>/g;
let inReg = /\(([\s\S]+?)\s*,\s*([^),]+),\s*([^),]+),\s*([^),]+)\)\s*in\s+(\S+)/;
let mathcer = /<%([@=*])?([\s\S]*?)%>|$/g;
let escapeSlashRegExp = /\\|'/g;
let escapeBreakReturnRegExp = /\r|\n/g;
let suffixReg = /\+'';\s*/g;
let endReg = /;\s*$/;
let condPlus = /\+''\+/g;
let loopReg = /\b(each|forin)\s*=\s*(['"])([^'"]+)\2/g;
let ifReg = /\b(if|elif|for)\s*=\s*(['"])([^'"]+)\2/g;
let tagHReg = /\x03\d+\x03/g;
let tmplCommandAnchorReg = /\u0007\d+\u0007/g;
let ifExtractReg = /^\s*(?:for|if)\s*\(([\s\S]+?)\)\s*;?\s*$/;
let commaExprReg = /(?:,''\)|(%>'));/g;
let directReg = /\{\{&[\s\S]+?\}\}/g;
let spreadAttrsReg = /\{\{\*[\s\S]+?\}\}/g;
let condPrefix = /^\x1c\d+\x1c/;
let tagReg = /<(\/?)[^>]+>/g;
let matchedTagReg = /(<([^>\s\/]+)[^>]*>)([^<>]*?)(<\/\2>)/g;
let condEscapeReg = /^((?:\u0007\d+\u0007)+\s*\\*?)\\\?/;
let tmplFnParams = ['$n', '$eu', '$_ref', '$i', '$eq', '$_is_array'];
let storeInnerMatchedTags = (tmpl, store) => {
    let idx = store.___idx || 0;
    return tmpl.replace(matchedTagReg, (m, prefix, tag, content, suffix) => {
        let groups = [prefix, content, suffix];
        let returned = '';
        for (let g of groups) {
            let key = '\x03' + idx++ + '\x03';
            store[key] = {
                tag: g == prefix,
                src: g
            };
            returned += key;
        }
        store.___idx = idx;
        return returned;
    });
};
let storeHTML = (tmpl, store) => {
    let idx = store.___idx || 0;
    return tmpl.replace(tagReg, (m, closed) => {
        let key = '\x03' + idx++ + '\x03';
        store[key] = {
            tag: closed ? false : true,
            src: m
        };
        store.___idx = idx;
        return key;
    });
};
let extractArtAndCtrlFrom = tmpl => {
    let result = [];
    //console.log(tmpl);
    tmpl.replace(artCtrlReg, (match, line, art, operate, ctrl) => {
        result.push({
            origin: match,
            line,
            operate,
            art,
            ctrl
        });
    });
    return result;
};
let toFn = (key, tmpl, fromAttr, e, decode) => {
    //tmpl = tmpl.replace(/%>\s+<%/g, '%><%');
    //console.log(tmpl);
    let index = 0,
        hasCtrl = false,
        hasOut = false,
        hasCmdOut = false,
        source = `${key}='`,
        snippet,
        preArt = -1,
        ctrlCount = 0,
        hasSnippet = false,
        hasCharSnippet = false,
        setStart = false,
        hasVarOut = false,
        reg = regexp.get(`${regexp.escape(key)}\\+='';+`, 'g');
    tmpl.replace(mathcer, (match, operate, content, offset) => {
        snippet = tmpl.substring(index, offset)
            .replace(escapeSlashRegExp, `\\$&`)
            .replace(escapeBreakReturnRegExp, `\\n`);
        if (snippet) {
            hasSnippet = hasSnippet || !content || !setStart;
            hasCharSnippet = hasCharSnippet || !!snippet.trim();
            hasOut = true;
            if (preArt == index) {
                source += `'')+'`;
            }
        }
        setStart = true;
        if (decode) {
            snippet = tmplUnescape(snippet);
        }
        source += snippet;
        index = offset + match.length;
        let ctrl = tmpl.substring(index - match.length + 2 + (operate ? 1 : 0), index - 2);
        let artReg = /^'(\d+)\x11([^\x11]+)\x11'$/;
        let artMatch = ctrl.match(artReg);
        let art = '', line = -1;
        ctrl = ctrl.replace(escapeSlashRegExp, `\\$&`).replace(escapeBreakReturnRegExp, `\\n`);
        if (artMatch) {
            ctrl = '';
            art = artMatch[2];
            line = artMatch[1];
        }
        if (operate == '@') {
            hasOut = true;
            hasCmdOut = true;
            hasVarOut = true;
            let out = `$i($_ref,${content})`;
            if (configs.debug) {
                if (preArt == offset) {
                    source += `$__ctrl='<%@${ctrl}%>',${out})+'`;
                } else {
                    source += `'+($__ctrl='<%@${ctrl}%>',${out})+'`;
                }
            } else {
                source += `'+${out}+'`;
            }
        } else if (operate == '=') {
            hasOut = true;
            hasCmdOut = true;
            hasVarOut = true;
            let safe = ``;
            if (fromAttr && (!content.startsWith('$eq(') &&
                !content.startsWith('$i(') &&
                !content.startsWith('$eu(') &&
                !content.startsWith('$n('))) {
                safe = '$n';
            }
            let out = `${safe}(${content})`;
            if (configs.debug) {
                if (preArt == offset) {
                    source += `$__ctrl='<%=${ctrl}%>',${out})+'`;
                } else {
                    source += `'+($__ctrl='<%=${ctrl}%>',${out})+'`;
                }
            } else {
                source += `'+${out}+'`;
            }
        } else if (operate == '*') {
            hasOut = true;
            hasCmdOut = true;
            hasVarOut = true;
            if (configs.debug) {
                if (preArt == offset) {
                    source += `$__ctrl='<%*${ctrl}%>',${content})+'`;
                } else {
                    source += `'+($__ctrl='<%*${ctrl}%>',${content})+'`;
                }
            } else {
                source += `'+${content}+'`;
            }
        } else if (content) {
            if (line > -1) {
                preArt = index;
                source += `'+($__line=${line},$__art='{{${art}}}',`;
                hasVarOut = true;
            } else {
                ctrlCount++;
                if (preArt == offset) {
                    source += `'')+'`;
                }
                hasCtrl = true;
                source += `';`;
                if (configs.debug) {
                    source += `$__ctrl='<%${ctrl}%>';`;
                }
                source += `${content};${key}+='`;
            }
        }
        return match;
    });
    source += `';`;
    source = source
        .replace(viewIdReg, `'+$_viewId+'`)
        .replace(reg, '');
    reg = regexp.get(`^${regexp.escape(key)}=''\\+`);
    source = source
        .replace(reg, regexp.encode(key + '='))
        .replace(suffixReg, ';')
        .replace(condPlus, '+')
        .replace(endReg, '');
    //console.log(source, reg);
    //like '($__line=2,$__art=\'{{checked}}\',\'\');$__ctrl=\'<%$$.checked%>\';$$.checked' 
    if (configs.debug && fromAttr && !hasOut && ctrlCount == 1) {
        source = source.replace(commaExprReg, '$1,') + ')';
    }
    if (ctrlCount > 1 && !hasOut) {//如果超出1条控制语句，即使没有输出，也要认为有输出
        hasOut = true;
    }
    if (!hasOut || !hasCtrl) {
        reg = regexp.get(`^${regexp.escape(key)}=(?:'';+)?`);
        source = source.replace(reg, '');
    }
    return {
        source,
        hasOut,
        hasSnippet,
        hasCharSnippet,
        hasVarOut,
        hasCmdOut,
        hasCtrl
    };
};
let serAttrs = (key, value, fromAttr, e) => {
    if (value === true) {
        return {
            hasOut: true,
            direct: true,
            returned: true
        };
    }
    let { source,
        hasCtrl,
        hasOut,
        hasSnippet,
        hasCharSnippet,
        hasCmdOut,
        hasVarOut } = toFn(key, value, fromAttr, e, true);
    if (hasCtrl && hasOut) {
        return {
            direct: false,
            hasCmdOut,
            hasCharSnippet,
            returned: source,
            hasSnippet,
            hasVarOut
        };
    } else {
        return {
            direct: true,
            hasCmdOut,
            hasCharSnippet,
            returned: source,
            hasVarOut
        };
    }
};
let getForContent = (cnt, e) => {
    let fi = extractArtAndCtrlFrom(cnt);
    if (fi.length > 1 || fi.length < 1) {
        throw new Error('[MXC-Error(tmpl-quick)] bad loop ' + cnt + ' at ' + e.shortHTMLFile);
    }
    fi = fi[0];
    let m = fi.ctrl.match(inReg);
    if (m) {
        return {
            art: fi.art,
            line: fi.line,
            first: m[3],
            last: m[4],
            value: m[1],
            list: m[5],
            key: m[2]
        };
    }
    throw new Error('[MXC-Error(tmpl-quick)] bad loop ' + cnt + ' at ' + e.shortHTMLFile);
};
let getIfContent = (cnt, e) => {
    let fi = extractArtAndCtrlFrom(cnt);
    if (fi.length > 1 || fi.length < 1) {
        throw new Error('[MXC-Error(tmpl-quick)] bad if ' + cnt + ' at ' + e.shortHTMLFile);
    }
    fi = fi[0];
    let m = fi.ctrl.match(ifExtractReg);
    if (m) {
        return {
            art: fi.art,
            line: fi.line,
            value: m[1]
        };
    }
    throw new Error('[MXC-Error(tmpl-quick)] bad if ' + cnt + ' at ' + e.shortHTMLFile);
};
let parser = (tmpl, e) => {
    //console.log(tmpl);
    let cmds = Object.create(null);
    tmpl = tmplCmd.store(tmpl, cmds);
    let current = {
        children: []
    };
    let stack = [current],
        textareaCount = 0;
    htmlParser(tmpl, {
        start(tag, attrs, unary, {
            start
        }) {
            let token = {
                tag,
                type: 1,
                ctrls: [],
                children: []
            };
            if (textareaCount) {
                token.start = start;
            }
            if (tag == 'textarea') {
                textareaCount++;
            }
            let aList = [],
                auto = false;
            for (let a of attrs) {
                if (a.name == '_code') {
                    let t = tmplCmd.recover(a.value, cmds);
                    let fi = extractArtAndCtrlFrom(t);
                    if (fi.length > 1 || fi.length < 1) {
                        throw new Error('[MXC-Error(tmpl-quick)] bad direct tag ' + t + ' at ' + e.shortHTMLFile);
                    }
                    fi = fi[0];
                    token.directArt = fi.art;
                    token.directLine = fi.line;
                    token.directCtrl = fi.ctrl;
                } else if (a.name == '_mxo') {
                    auto = true;
                } else if (a.name == 'each' ||
                    a.name == 'forin') {
                    let t = tmplCmd.recover(a.value, cmds);
                    let fi = getForContent(t, e);
                    token.ctrls.push({
                        type: a.name,
                        line: fi.line,
                        art: fi.art,
                        first: fi.first,
                        last: fi.last,
                        key: fi.key,
                        value: fi.value,
                        list: fi.list
                    });
                    token.hasCtrls = true;
                } else if (a.name == 'if' ||
                    a.name == 'elif') {
                    let t = tmplCmd.recover(a.value, cmds);
                    let fi = getIfContent(t, e);
                    token.ctrls.push({
                        type: a.name,
                        line: fi.line,
                        art: fi.art,
                        cond: fi.value
                    });
                    token.hasCtrls = true;
                } else if (a.name == 'else') {
                    token.ctrls.push({
                        type: 'else'
                    });
                    token.hasCtrls = true;
                } else if (a.name == 'for') {
                    let t = tmplCmd.recover(a.value, cmds);
                    let fi = extractArtAndCtrlFrom(t);
                    if (fi.length > 1 || fi.length < 1) {
                        throw new Error('[MXC-Error(tmpl-quick)] bad for ' + t + ' at ' + e.shortHTMLFile);
                    }
                    fi = fi[0];
                    token.ctrls.push({
                        type: 'for',
                        line: fi.line,
                        art: fi.art,
                        cond: fi.ctrl.replace(ifExtractReg, '$1')
                    });
                    token.hasCtrls = true;
                } else if (a.name == '_mxrs') {
                    token.canHoisting = true;
                    token.staticValue = a.value;
                } else if (a.name == 'x-html' ||
                    a.name == 'inner-html') {
                    token.xHTML = a.value;
                    token.hasXHTML = true;
                } else if (a.name != 'var_declare') {
                    if (a.name == 'type' &&
                        !a.unary &&
                        tag == 'input') {
                        token.inputType = a.value;
                    } else if (a.name.startsWith('mx') &&
                        a.value &&
                        a.value.startsWith('\x1f')) {
                        token.attrHasEvent = true;
                    } else if (condPrefix.test(a.name)) {
                        let cond = '';
                        a.name = a.name.replace(condPrefix, m => {
                            cond = m;
                            return '';
                        });
                        a.cond = e.tmplConditionAttrs[cond];
                    } else if (!a.unary && a.value.startsWith('\x07')) {
                        a.value = a.value.replace(condEscapeReg, '$1?');
                    }
                    aList.push(a);
                }
            }
            token.attrs = aList;
            token.unary = unary;
            token.auto = auto;
            current.children.push(token);
            if (!unary) {
                stack.push(token);
                current = token;
            }
        },
        end(tag, start, end) {
            let e = stack.pop();
            if (tag == 'textarea') {
                textareaCount--;
                let { children } = e;
                e.children = [];
                let value = '';
                for (let c of children) {
                    value += c.content;
                }
                e.attrs.push({
                    name: 'value',
                    value,
                    assign: '=',
                    quote: '"'
                });
            }

            if (textareaCount) {
                e.content = tmpl.slice(e.start, end);
            }
            if (e.hasXHTML) {
                e.children = [{
                    type: 3,
                    isXHTML: true,
                    content: e.xHTML
                }];
            }
            current = stack[stack.length - 1];
        },
        chars(text) {
            if (text.trim()) {
                current.children.push({
                    type: 3,
                    content: text
                });
            }
        }
    });
    return {
        tokens: current.children,
        cmds,
        tmpl
    };
};
let Directives = {
    'if'(ctrl, start, end, auto) {
        if (configs.debug) {
            let art = `${auto ? '{{if ' : 'if="{{'}${ctrl.art}}}${auto ? '' : '"'}`;
            start.push(`$__line=${ctrl.line};$__art=${JSON.stringify(art)};`);
            start.push(`$__ctrl=${JSON.stringify('if(' + ctrl.cond + '){')};`);
        }
        start.push(`if(${ctrl.cond}){`);
        end.push('}');
    },
    'elif'(ctrl, start, end, auto) {
        start.push(`else if(`);
        if (configs.debug) {
            let art = `${auto ? '{{else if ' : 'elif="{{'}${ctrl.art}}}${auto ? '' : '"'}`;
            start.push(`($__line=${ctrl.line},$__art=${JSON.stringify(art)},`);
            start.push(`$__ctrl=${JSON.stringify('else if(' + ctrl.cond + '){')}),`);
        }
        start.push(ctrl.cond, '){');
        end.push('}');
    },
    'else'(ctrl, start, end) {
        start.push(`else{`);
        end.push('}');
    },
    'each'(ctrl, start, end, auto) {
        let shortList = utils.uId('$q_a_', '', 1);
        let listCount = utils.uId('$q_c_', '', 1);
        let initial = ctrl.value.startsWith('$q_v_') ? '' : `let ${ctrl.value}=${shortList}[${ctrl.key}];`;
        if (ctrl.first != -1) {
            initial += `let ${ctrl.first}=${ctrl.key}===0;`;
        }
        let decs = `let ${ctrl.key}=0,${shortList}=${ctrl.list},${listCount}=${shortList}.length`;
        if (ctrl.last != -1) {
            let last = utils.uId('$q_lc_', '', 1);
            decs += `,${last}=${listCount}-1`;
            initial += `let ${ctrl.last}=${ctrl.key}===${last};`;
        }
        if (configs.debug) {
            let art = `${auto ? '{{each ' : 'each="{{'}${ctrl.art}}}${auto ? '' : '"'}`;
            start.push(`$__line=${ctrl.line};$__art=${JSON.stringify(art)};`);
            start.push(`$__ctrl=${JSON.stringify(`for(${decs};${ctrl.key}<${listCount};${ctrl.key}++){${initial}`)};`);
        }
        start.push(`for(${decs};${ctrl.key}<${listCount};${ctrl.key}++){${initial}`);
        end.push('}');
    },
    'forin'(ctrl, start, end, auto) {
        let initial = ctrl.value.startsWith('$q_v_') ? '' : `{let ${ctrl.value}=${ctrl.list}[${ctrl.key}];`;
        if (configs.debug) {
            let art = `${auto ? '{{forin ' : 'forin="{{'}${ctrl.art}}}${auto ? '' : '"'}`;
            start.push(`$__line=${ctrl.line};$__art=${JSON.stringify(art)};`);
            start.push(`$__ctrl=${JSON.stringify(`for(let ${ctrl.key} in ${ctrl.list}){${initial}`)};`);
        }
        start.push(`for(let ${ctrl.key} in ${ctrl.list}){${initial}`);
        end.push('}');
    },
    'for'(ctrl, start, end, auto) {
        if (configs.debug) {
            let art = `${auto ? '{{for ' : 'for="{{'}${ctrl.art}}}${auto ? '' : '"'}`;
            start.push(`$__line=${ctrl.line};$__art=${JSON.stringify(art)};`);
            start.push(`$__ctrl=${JSON.stringify(`for(${ctrl.cond}){`)};`);
        }
        start.push(`for(${ctrl.cond}){`);
        end.push('}');
    }
};
let preProcess = (src, e) => {
    let cmds = Object.create(null),
        tags = Object.create(null);
    src = src.replace(directReg, m => {
        return `<q:direct _code="${m.replace(/"/g, '&quot;')}"/>`;
    }).replace(spreadAttrsReg, m => {
        return `__sa__="${m.replace(/"/g, '&quot;')}"`;
    });
    src = artExpr.addLine(src);
    src = tmplCmd.store(src, cmds);
    src = tmplCmd.store(src, cmds, consts.artCommandReg);
    //以上处理模板命令，然后是合法的html标签
    /*
        我们要区别对待
        1.
         <div>
            a
                {{if cond}}
                    b
                {{/if}}
            c
         </div>
        2.
         <div>
            {{if cond}}
                <div>cond</div>
            {{/if}}
         </div>
        
        在文本中的命令语句与在标签中的命令语句处理不同，所以要先把最内部的处理下
    */
    src = storeInnerMatchedTags(src, tags);
    src = storeHTML(src, tags);
    src = src.replace(tmplCommandAnchorReg, m => {
        let ref = cmds[m];
        if (ref) {
            let i = artExpr.extractArtInfo(ref);
            if (i) {
                let { art, ctrls, line } = i;
                if (ctrls[0] == 'each') {
                    return `<q:group _mxo _open="<%{%>" each="{{\x1e${line}${art.substring(5)}}}">`;
                } else if (ctrls[0] == 'forin') {
                    return `<q:group _mxo _open="<%{%>" forin="{{\x1e${line}${art.substring(6)}}}">`;
                } else if (ctrls[0] == 'for') {
                    return `<q:group _mxo _open="<%{%>" for="{{\x1e${line}${art.substring(4)}}}">`;
                } else if (ctrls[0] == 'if') {
                    return `<q:group _mxo _open="<%{%>" if="{{\x1e${line}${art.substring(3)}}}">`;
                } else if (ctrls[0] == 'else') {
                    if (ctrls[1] == 'if') {
                        return `</q:group _close="<%}%>"><q:group _mxo _open="<%{%>" elif="{{\x1e${line}${art.substring(7)}}}">`;
                    }
                    return `</q:group _close="<%}%>"><q:group _mxo _open="<%{%>" else>`;
                } else if (art.startsWith('/each') ||
                    art.startsWith('/forin') ||
                    art.startsWith('/for') ||
                    art.startsWith('/if')) {
                    return '</q:group _close="<%}%>">';
                }
            } else {
                return m;
            }
        }
        return m;
    });

    src = tmplCmd.store(src, cmds, consts.artCommandReg);
    src = storeHTML(src, tags);
    while (tagHReg.test(src)) {
        tagHReg.lastIndex = 0;
        src = src.replace(tagHReg, m => {
            m = tags[m];
            if (m.tag) {
                m = m.src;
                m = m.replace(loopReg, (_, k, $, c) => {
                    c = tmplCmd.recover(c, cmds);
                    let li = artExpr.extractArtInfo(c);
                    if (li) {
                        let ctrls = li.art.split(/\s+/),
                            expr;
                        if (ctrls.length == 1) {
                            expr = {
                                vars: utils.uId('$q_v_', '', 1)
                            };
                            ctrls[1] = 'as';
                        } else {
                            let asValue = ctrls.slice(2).join(' ');
                            expr = artExpr.extractAsExpr(asValue);
                        }
                        if (expr.bad || ctrls[1] != 'as') {
                            slog.ever(chalk.red(`[MXC-Error(tmpl-quick)] unsupport or bad ${k} {{${li.art}}} at line:${li.line}`), 'file', chalk.grey(e.shortHTMLFile));
                            throw new Error(`[MXC-Error(tmpl-quick)] unsupport or bad ${k} {{${li.art}}}`);
                        }
                        if (!expr.key) {
                            expr.key = utils.uId('$q_key_', '', 1);
                        }
                        let firstAndLastVars = '';
                        let flv = '';
                        if (expr.first) {
                            firstAndLastVars += ',' + expr.first;
                            flv += ',' + expr.first;
                        } else {
                            firstAndLastVars += ',-1';
                        }
                        if (expr.last) {
                            firstAndLastVars += ',' + expr.last;
                            flv += ',' + expr.last;
                        } else {
                            firstAndLastVars += ',-1';
                        }
                        return `var_declare="<%let ${expr.key},${expr.vars}=${ctrls[0]}[${expr.key}]${flv}%>" ${k}="<%'${li.line}\x11${li.art.replace(escapeSlashRegExp, '\\$&')}\x11'%><%(${expr.vars},${expr.key}${firstAndLastVars}) in ${ctrls[0]}%>"`;
                    }
                    return _;
                }).replace(ifReg, (_, k, $, c) => {
                    c = tmplCmd.recover(c, cmds);
                    let li = artExpr.extractArtInfo(c);
                    if (li) {
                        let expr = artExpr.extractIfExpr(li.art);
                        let key = k == 'for' ? 'for' : 'if';
                        return `${k}="<%'${li.line}\x11${li.art.replace(escapeSlashRegExp, '\\$&')}\x11'%><%${key}(${expr});%>"`;
                    }
                    return _;
                });
            } else {
                m = m.src;
            }
            return m;
        });
    }
    for (let c in cmds) {
        let v = cmds[c];
        if (util.isString(v)) {
            v = artExpr.removeLine(v);
            cmds[c] = v;
        }
    }
    src = tmplCmd.recover(src, cmds);
    src = artExpr.recoverEvent(src);
    //console.log(src);
    return src;
};
let combineSamePush = (src, pushed) => {
    let start = -1,
        prev = '',
        ranges = [],
        lastChar = '';
    for (let p of pushed) {
        let i = src.indexOf(p.src, start);
        if (i >= 0) {
            if (i == start && prev == p.key) {
                if (!lastChar) {
                    lastChar = src.charAt(i - 2);
                }
                ranges.push({
                    char: ',',
                    start: i - 2,//$vnode_.push($_create());  trim );
                    srcEnd: i + p.src.length,
                    end: i + p.key.length + 6 //$vnode_.push($_create()); trim $vnode_.push(
                });
            } else {
                if (lastChar) {
                    let last = ranges[ranges.length - 1];
                    ranges.push({
                        char: lastChar,
                        start: last.srcEnd - 2,
                        end: last.srcEnd - 1
                    });
                    lastChar = '';
                }
            }
            start = i + p.src.length;
            prev = p.key;
        }
    }
    if (lastChar) {
        let last = ranges[ranges.length - 1];
        ranges.push({
            char: lastChar,
            start: last.srcEnd - 2,
            end: last.srcEnd - 1
        });
    }
    for (let i = ranges.length; i--;) {
        let r = ranges[i];
        src = src.substring(0, r.start) + r.char + src.substring(r.end);
    }
    return src;
};
let process = (src, e) => {
    let { cmds, tokens } = parser(`${src}`, e);
    let snippets = [];
    let vnodeDeclares = Object.create(null),
        vnodeInited = Object.create(null),
        combinePushed = [],
        staticVars = [],
        staticNodes = Object.create(null),
        staticObjects = Object.create(null),
        staticCounter = 0;
    let genElement = (node, level, inStaticNode) => {
        if (node.type == 3) {
            let cnt = tmplCmd.recover(node.content, cmds);
            let text = serAttrs('$text', cnt, false, e);
            vnodeDeclares.$text = 1;
            if (text.hasCmdOut || text.hasCharSnippet) {
                let outText = '',
                    safeguard = false;
                if (text.direct) {
                    outText = text.returned;
                } else {
                    snippets.push(text.returned + ';');
                    outText = '$text';
                    safeguard = !text.hasSnippet;
                }
                let xHTML = node.isXHTML ? '1' : '0';
                if (vnodeInited[level] === 1) {
                    if (!safeguard) {
                        combinePushed.push({
                            key: `$vnode_${level}`,
                            src: `$vnode_${level}.push($_create(0,${xHTML},${outText}));`
                        });
                    }
                    snippets.push(`$vnode_${level}.push($_create(0,${xHTML},${outText}));`);
                } else {
                    vnodeInited[level] = 1;
                    snippets.push(`$vnode_${level}=[$_create(0,${xHTML},${outText})];`);
                }
            } else {
                snippets.push(text.returned + ';');
            }
        } else {
            let attrs = {},
                attrsStr = '',
                ctrlAttrs = [],
                hasInlineCtrl = false,
                hasAttrs = false,
                hasCmdOut = node.attrHasEvent,
                dynamicAttrs = '',
                hasRestElement = false,
                attrKeys = Object.create(null);
            if (node.attrs.length) {
                hasAttrs = true;
                for (let a of node.attrs) {
                    if (a.unary) {
                        a.value = true;
                    } else {
                        a.value = tmplCmd.recover(a.value, cmds);
                    }
                    if (attrKeys[a.name] === 1 &&
                        e.checker.tmplDuplicateAttr) {
                        let v = a.unary ? '' : `="${a.value}"`;
                        slog.ever(chalk.red('[MXC Tip(tmpl-quick)] duplicate attr:' + a.name), 'near:', chalk.magenta(a.name + v), ' at file:', chalk.grey(e.shortHTMLFile));
                        continue;
                    }
                    attrKeys[a.name] = 1;
                    let bProps = attrMap.getBooleanProps(node.tag, node.inputType);
                    let bAttr = bProps[a.name];
                    if (a.name == a.value || !a.value) {
                        if (bAttr) {
                            a.value = true;
                        }
                    }

                    let oKey = a.name.replace(escapeSlashRegExp, '\\$&');
                    let key = `$$_${a.name.replace(/[^a-zA-Z]/g, '_')}`;
                    let attr = serAttrs(key, a.value, !bAttr, e);
                    if (attr.hasCmdOut || attr.hasVarOut || a.cond) {
                        hasCmdOut = true;
                    }
                    if (a.name == '__sa__') {
                        attr.direct = false;
                    }
                    let cond = '';
                    let tempKey = configs.tmplVarTempKey;
                    let outputBoolean = false;
                    if (a.cond) {
                        let { line,
                            art,
                            content,
                            hasContent,
                            origin,
                            valuable } = a.cond;
                        outputBoolean = !valuable && !hasContent;
                        if (a.value === true || outputBoolean) {
                            attr.returned = '';
                            cond += '(';
                        } else if (attr.direct) {
                            let v = hasContent ? '' : tempKey + '=';
                            let p = valuable ? '' : '!';
                            cond += `${p}(${v}(`;
                        } else {
                            cond += `${valuable ? '' : '!'}((`;
                        }
                        if (configs.debug) {
                            cond += `$__line=${line},$__art='{{${art}}}',$__ctrl='<%${origin}%>',`;
                        }
                        cond += `${content})`;
                        if (a.value !== true && !outputBoolean) {
                            if (valuable) {
                                cond += ')!=null&&';
                            } else {
                                cond += ')?null:';
                            }
                            if (!hasContent) {
                                attr.returned = tempKey;
                            }
                        }
                    }
                    if (configs.debug &&
                        attr.direct &&
                        (bAttr ||
                            (a.cond &&
                                !a.cond.hasContent &&
                                !a.cond.valuable)) &&
                        (a.value !== true ||
                            outputBoolean ||
                            a.cond)) {
                        if (a.value === true || outputBoolean) {
                            cond = `(${tempKey}=${cond},${tempKey}!==true&&${tempKey}!==false&&console.error('make sure attr:"${a.name}" returned only true or false value\\r\\nat line:'+$__line+'\\r\\nat file:${e.shortHTMLFile}\\r\\ncurrent returned value is:',JSON.stringify(${tempKey})),${tempKey})`;
                        } else if (attr.direct) {
                            let assign = attr.returned == tempKey ? '' : `${tempKey}=${attr.returned},`;
                            attr.returned = `(${assign}${tempKey}!==true&&${tempKey}!==false&&console.error('make sure attr:"${a.name}" returned only true or false value\\r\\nat line:'+$__line+'\\r\\nat file:${e.shortHTMLFile}\\r\\ncurrent returned value is:',JSON.stringify(${tempKey})),${tempKey})`;
                        }
                    }
                    if (attr.direct) {
                        if (hasRestElement) {
                            ctrlAttrs.push({
                                ctrl: cond + attr.returned,
                                type: 'direct',
                                oKey
                            });
                        } else {
                            attrs[oKey] = cond + attr.returned;
                        }
                    } else {
                        hasInlineCtrl = true;
                        if (a.name == '__sa__') {
                            hasRestElement = true;
                            ctrlAttrs.push({
                                type: 'mixed',
                                ctrl: attr.returned
                            });
                        } else {
                            vnodeDeclares[key] = 1;
                            ctrlAttrs.push({
                                ctrl: attr.returned,
                                oKey,
                                key: cond + key
                            });
                        }
                    }
                    if (configs.debug && bAttr && !attr.direct) {
                        ctrlAttrs.push({
                            ctrl: `(${key}!==true&&${key}!==false&&console.error('make sure attr:"${a.name}" returned only true or false value\\r\\nat line: '+$__line+'\\r\\nat file:${e.shortHTMLFile}\\r\\ncurrent returned value is:',JSON.stringify(${key})));`
                        });
                    }
                }
                if (hasInlineCtrl) {
                    if (hasRestElement) {
                        for (let c of ctrlAttrs) {
                            if (c.type != 'mixed' && c.type != 'direct') {
                                dynamicAttrs += c.ctrl;
                            }
                        }
                        attrsStr = '{';
                        for (let p in attrs) {
                            attrsStr += `'${p}': ${attrs[p]}, `;
                        }
                        for (let c of ctrlAttrs) {
                            if (c.type == 'direct') {
                                attrsStr += `'${c.oKey}': ${c.ctrl}, `;
                            } else if (c.type == 'mixed') {
                                attrsStr += `...${c.ctrl}, `;
                            } else {
                                attrsStr += `'${c.oKey}': ${c.key}, `;
                            }
                        }
                        attrsStr += '}';
                    } else {
                        dynamicAttrs += ';';
                        for (let c of ctrlAttrs) {
                            dynamicAttrs += c.ctrl;
                        }
                        attrsStr = '{';
                        for (let p in attrs) {
                            attrsStr += `'${p}': ${attrs[p]}, `;
                        }
                        for (let c of ctrlAttrs) {
                            attrsStr += `'${c.oKey}': ${c.key}, `;
                        }
                        attrsStr = attrsStr.slice(0, -1) + '}';
                    }
                } else {
                    attrsStr = '{';
                    for (let p in attrs) {
                        attrsStr += `'${p}': ${attrs[p]}, `;
                    }
                    attrsStr = attrsStr.slice(0, -1) + '}';
                    if (!hasCmdOut &&
                        !node.canHoisting &&
                        node.tag != 'q:group' &&
                        node.tag != 'q:direct') {
                        let i = staticObjects[attrsStr];
                        if (i) {
                            attrsStr = i.key;
                            i.used++;
                            if (!inStaticNode) {
                                i.inStatic = false;
                            }
                        } else {
                            let key = '$_quick_vnode_attr_static_' + staticCounter++;
                            staticObjects[attrsStr] = {
                                key,
                                used: 1,
                                inStatic: inStaticNode
                            };
                            attrsStr = key;
                        }
                    }
                }
            }
            let ctrls = node.ctrls;
            let start = [], end = [];
            if (ctrls.length) {
                for (let ctrl of ctrls) {
                    let fn = Directives[ctrl.type];
                    if (fn) {
                        fn(ctrl, start, end, node.auto);
                    }
                }
            }
            snippets.push(`${start.join('')}`);
            let key = '';
            if (node.canHoisting) {
                key = staticNodes[node.staticValue];
                if (!key) {
                    key = '$_quick_static_node_' + staticCounter++;
                    staticVars.push({
                        key
                    });
                    staticNodes[node.staticValue] = key;
                }
                snippets.push(`if(${key}){`);
                if (vnodeInited[level] === 1) {
                    snippets.push(`$vnode_${level}.push(${key});`);
                } else {
                    snippets.push(`$vnode_${level}=[${key}];`);
                }
                snippets.push(`}else{`);
            }
            if (node.children.length) {
                vnodeDeclares['$vnode_' + (level + 1)] = 1;
                delete vnodeInited[level + 1];
                for (let e of node.children) {
                    if (e.hasCtrls) {
                        snippets.push(`$vnode_${level + 1}=[];`);
                        vnodeInited[level + 1] = 1;
                        break;
                    }
                }
                for (let e of node.children) {
                    genElement(e, level + 1, inStaticNode || node.canHoisting);
                }
            }
            if (node.tag == 'q:group') {
                if (node.children.length) {
                    if (vnodeInited[level] === 1) {
                        combinePushed.push({
                            key: `$vnode_${level}`,
                            src: `$vnode_${level}.push(...$vnode_${level + 1});`
                        });
                        if (vnodeInited[level + 1]) {
                            snippets.push(`$vnode_${level}.push(...$vnode_${level + 1});`);
                        }
                    } else if (vnodeInited[level + 1]) {
                        vnodeInited[level] = 1;
                        snippets.push(`$vnode_${level}=$vnode_${level + 1};`);
                    }
                }
            } else if (node.tag == 'q:direct') {
                snippets.push(`$__line=${node.directLine}; $__art='{{${node.directArt}}}'; $__ctrl='${node.directCtrl.replace(escapeSlashRegExp, '\\$ & ')}';`);
                if (vnodeInited[level] === 1) {
                    snippets.push(`if(${node.directCtrl}){$_is_array(${node.directCtrl})?$vnode_${level}.push(...${node.directCtrl}):$vnode_${level}.push(${node.directCtrl});}`);
                } else {
                    vnodeInited[level] = 1;
                    vnodeDeclares.$_empty_arr = '[]';
                    snippets.push(`$vnode_${level}=${node.directCtrl}?$_is_array(${node.directCtrl})?${node.directCtrl}:[${node.directCtrl}]: $_empty_arr;`);
                }
            } else {
                let unary = node.unary ? '1' : '';
                let children = node.children.length ? `$vnode_${level + 1}` : (unary ? '0' : '');
                let props = hasAttrs ? attrsStr : children ? '0' : '';
                if (dynamicAttrs && !dynamicAttrs.endsWith(';')) {
                    dynamicAttrs += ';';
                }
                snippets.push(dynamicAttrs);
                let content = '';
                if (props) {
                    content += ',' + props;
                    if (children || unary) {
                        content += ',' + children;
                        if (unary) {
                            content += ',' + unary;
                        }
                    }
                }
                let prefix = node.canHoisting ? `${key}=` : '';
                if (vnodeInited[level] === 1) {
                    let src = `$vnode_${level}.push(${prefix}$_create('${node.tag}'${content}));`;
                    combinePushed.push({
                        key: `$vnode_${level}`,
                        src
                    });
                    snippets.push(src);
                } else {
                    let src = `$vnode_${level}=[${prefix}$_create('${node.tag}'${content})];`;
                    combinePushed.push({
                        key: `$vnode_${level}`,
                        src
                    });
                    snippets.push(src);
                    vnodeInited[level] = 1;
                }
                if (node.canHoisting) {
                    snippets.push('}');
                }
            }
            snippets.push(end.join(''));
        }
    };
    vnodeInited[0] = 1;
    for (let t of tokens) {
        genElement(t, 0);
    }
    let source = `let ${configs.tmplVarTempKey},$vnode_0=[]`;
    if (e.globalVars.length) {
        let vars = ',\r\n{';
        for (let key of e.globalVars) {
            vars += `\r\n\t${key},`;
        }
        source += vars + '}=$$';
    }
    for (let vd in vnodeDeclares) {
        source += ',\r\n' + vd;
        let v = vnodeDeclares[vd];
        if (v !== 1) {
            source += `=${v}`;
        }
    }
    source = `${source};\r\n${snippets.join('')} \r\nreturn $_create($_viewId,0,$vnode_0);`;
    source = combineSamePush(source, combinePushed);
    if (configs.debug) {
        source = `let $__art, $__line, $__ctrl; try { ${source} } catch (ex) { let msg = 'render view error:' + (ex.message || ex); msg += '\\r\\n\\tsrc art: ' + $__art + '\\r\\n\\tat line: ' + $__line; msg += '\\r\\n\\ttranslate to: ' + $__ctrl + '\\r\\n\\tat file:${e.shortHTMLFile}'; throw msg; } `;
    }
    let params = '', idx = tmplFnParams.length - 1;
    for (idx; idx >= 0; idx--) {
        let test = '(';
        if (idx == 2) {
            test = ',';
        }
        if (source.indexOf(tmplFnParams[idx] + test) > -1) {
            break;
        }
    }
    for (let i = 0; i <= idx; i++) {
        params += ',' + tmplFnParams[i];
    }
    source = `($$, $_create,$_viewId${params})=> { \r\n${source} } `;
    for (let i in staticObjects) {
        let v = staticObjects[i];
        if (!v.inStatic || v.used > 1) {
            staticVars.push({
                key: v.key,
                value: i
            });
        } else {
            source = source.replace(v.key, i);
        }
    }
    return {
        source,
        statics: staticVars
    };
};
module.exports = {
    preProcess,
    process
};