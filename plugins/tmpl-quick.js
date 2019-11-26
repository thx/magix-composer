/*
<--循环支持isLast isFirst-->
{{each list as value index isLast isFirst}}

{{/each}}

<--节点属性可以使用对象展开，展开操作可以使用*或...操作符-->
<div {{*attrs}} {{...attrs}}></div>

<--可以直接引用生成的虚拟节点-->
{{&virtualNodes}}

<--循环写法-->

{{each list as value}}
    <div>{{=value}}</div>
{{/each}}

or 

<div qk:each="{{list as value}}">{{=value}}</div>


{{forin list as value}}
    <div>{{=value}}</div>
{{/forin}}

or 

<div qk:forin="{{list as value}}">{{=value}}</div>


{{for(let i=0;i<10;i++)}}
    <div>{{=i}}</div>
{{/for}}

or 

<div qk:for="{{let i=;i<10;i++}}">{{=i}}</div>





*/
let htmlParser = require('./html-parser');
let tmplCmd = require('./tmpl-cmd');
let configs = require('./util-config');
let artExpr = require('./tmpl-art-ctrl');
let {
    quickDirectTagName,
    quickGroupTagName,
    quickDirectCodeAttr,
    quickSpreadAttr,
    quickAutoAttr,
    quickOpenAttr,
    quickCloseAttr,
    quickEachAttr,
    quickElseIfAttr,
    quickForAttr,
    quickIfAttr,
    quickForInAttr,
    quickDeclareAttr,
    quickConditionReg,
    quickLoopReg,
    quickElseAttr,
    tmplStoreIndexKey,
    tmplTempRealStaticKey,
    artCommandReg,
    tmplGroupTag,
    tmplCondPrefix,
    tmplGroupKeyAttr,
    tmplGroupUseAttr,
    tmplVarTempKey,
    tmplMxViewParamKey
} = require('./util-const');
let utils = require('./util');
let util = require('util');
let regexp = require('./util-rcache');
let slog = require('./util-log');
let attrMap = require('./html-attrs');
let tmplUnescape = require('html-entities-decoder');
let md5 = require('./util-md5');
let chalk = require('chalk');
let viewIdReg = /\x1f/g;
let artCtrlReg = /(?:<%'(\d+)\x11([^\x11]+)\x11'%>)?<%([@=:&])?([\s\S]+?)%>/g;
let inReg = /\(([\s\S]+?)\s*,\s*([^),]+),\s*([^),]+),\s*([^),]+),\s*(1|-1)\)\s*in\s+([\S\s]+)/;
let mathcer = /<%([@=*]|\.{3})?([\s\S]*?)%>|$/g;
let escapeSlashRegExp = /\\|'/g;
let escapeBreakReturnRegExp = /\r|\n/g;
let suffixReg = /\+'';\s*/g;
let endReg = /;\s*$/;
let condPlus = /\+''\+/g;
let tagHReg = /\x03\d+\x03/g;
let tmplCommandAnchorReg = /\x07\d+\x07/g;
let ifExtractReg = /^\s*(?:for|if)\s*\(([\s\S]+?)\)\s*;?\s*$/;
let commaExprReg = /(?:,''\)|(%>'));/g;
let directReg = /\{\{&[\s\S]+?\}\}/g;
let spreadAttrsReg = /\{\{(?:\*|\.{3})[\s\S]+?\}\}/g;
let condPrefix = /^\x1c\d+\x1c/;
let tagReg = /<(\/?)([^>\s]+)[^>]*>/g;
let matchedTagReg = /(<([^>\s\/]+)[^>]*>)([^<>]*?)(<\/\2>)/g;
let lastCloseReg = />([^>]*)$/;
let condEscapeReg = /^((?:\x07\d+\x07)+\s*\\*?)\\\?/;
let tmplFnParams = ['$n', '$eu', '$_ref', '$i', '$eq', '$_is_array'];
let tmplRadioOrCheckboxKey = 'tmpl_radio_or_checkbox_names';
let tmplStaticVarsKey = 'tmpl_static_vars_key';
let groupsReg = /(?:^|,)groups(?=,|$)/;
let longExpr = /[\.\[\]]/;
let storeInnerMatchedTags = (tmpl, store) => {
    let idx = store[tmplStoreIndexKey] || 0;
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
        store[tmplStoreIndexKey] = idx;
        return returned;
    });
};
let storeHTML = (tmpl, store) => {
    let idx = store[tmplStoreIndexKey] || 0;
    return tmpl.replace(tagReg, (m, closed, tag) => {
        let key = '\x03' + idx++ + '\x03';
        store[key] = {
            tag: closed ? false : true,
            special: tag == quickDirectTagName || tag == quickGroupTagName,
            src: m
        };
        store[tmplStoreIndexKey] = idx;
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
let toFn = (key, tmpl, fromAttr) => {
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
        //if (decode) {
        snippet = tmplUnescape(snippet);
        //}
        source += snippet;
        index = offset + match.length;
        let ctrl = tmpl.substring(index - match.length + 2 + (operate ? operate.length : 0), index - 2);
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
            //let a = tmplCmd.extractRefContent(content);
            //console.log(a);
            //let out = `($_ref[${a.key}]=${a.vars},${a.key})`;
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
            if ((!content.startsWith('$eq(') &&
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
        } else if (operate == '*' ||
            operate == '...') {
            hasOut = true;
            hasCmdOut = true;
            hasVarOut = true;
            if (configs.debug) {
                if (preArt == offset) {
                    source += `$__ctrl='<%${operate}${ctrl}%>',${content})+'`;
                } else {
                    source += `'+($__ctrl='<%${operate}${ctrl}%>',${content})+'`;
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
let serAttrs = (key, value, fromAttr) => {
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
        hasVarOut } = toFn(key, value, fromAttr);
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
            hasCtrl,
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
            list: m[6],
            key: m[2],
            asc: m[5] == 1
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
    //console.log('parser', tmpl);
    let cmds = Object.create(null);
    tmpl = tmplCmd.store(tmpl, cmds);
    let current = {
        children: []
    };
    let stack = [current],
        textareaCount = 0;
    htmlParser(tmpl, {
        start(tag, {
            attrs,
            unary,
            start,
            attrsMap
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
                if (a.name == quickDirectCodeAttr) {
                    let t = tmplCmd.recover(a.value, cmds);
                    let fi = extractArtAndCtrlFrom(t);
                    if (fi.length > 1 || fi.length < 1) {
                        throw new Error('[MXC-Error(tmpl-quick)] bad direct tag ' + t + ' at ' + e.shortHTMLFile);
                    }
                    fi = fi[0];
                    token.directArt = fi.art;
                    token.directLine = fi.line;
                    token.directCtrl = fi.ctrl;
                } else if (a.name == quickAutoAttr) {
                    auto = true;
                } else if (a.name == quickEachAttr ||
                    a.name == quickForInAttr) {
                    let t = tmplCmd.recover(a.value, cmds);
                    let fi = getForContent(t, e);
                    token.ctrls.push({
                        type: a.name == quickEachAttr ? 'each' : 'forin',
                        line: fi.line,
                        art: fi.art,
                        first: fi.first,
                        last: fi.last,
                        key: fi.key,
                        value: fi.value,
                        list: fi.list,
                        asc: fi.asc
                    });
                    token.hasCtrls = true;
                } else if (a.name == quickIfAttr ||
                    a.name == quickElseIfAttr) {
                    let t = tmplCmd.recover(a.value, cmds);
                    let fi = getIfContent(t, e);
                    token.ctrls.push({
                        type: a.name == quickIfAttr ? 'if' : 'elif',
                        line: fi.line,
                        art: fi.art,
                        cond: fi.value
                    });
                    token.hasCtrls = true;
                } else if (a.name == quickElseAttr) {
                    token.ctrls.push({
                        type: 'else'
                    });
                    token.hasCtrls = true;
                } else if (a.name == quickForAttr) {
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
                } else if (a.name == tmplTempRealStaticKey) {
                    token.canHoisting = true;
                    token.staticValue = a.value;
                } else if (a.name == 'x-html' ||
                    a.name == 'inner-html') {
                    token.xHTML = a.value;
                    token.hasXHTML = true;
                } else if (a.name == tmplGroupKeyAttr) {
                    token.groupKey = a.value;
                    token.groupKeyNode = tag == tmplGroupTag;
                } else if (a.name == tmplGroupUseAttr) {
                    token.groupUse = a.value;
                    token.groupUseNode = tag == tmplGroupTag;
                } else if (a.name == 'context') {
                    token.groupContextNode = tag == tmplGroupTag;
                    token.groupContext = a.value;
                } else if (a.name != quickDeclareAttr &&
                    a.name != quickOpenAttr &&
                    !a.name.startsWith(tmplCondPrefix)) {
                    if (a.name == 'type' &&
                        !a.unary &&
                        tag == 'input') {
                        token.inputType = a.value;
                    } else if (condPrefix.test(a.name)) {
                        let cond = '';
                        a.name = a.name.replace(condPrefix, m => {
                            cond = m;
                            return '';
                        });
                        let oCond = attrsMap[`${tmplCondPrefix}${cond}`];
                        let extract = tmplCmd.extractCmdContent(oCond, cmds);
                        let isRef = extract.operate == '@';
                        let refVar;
                        if (isRef) {
                            let ref = tmplCmd.extractRefContent(extract.content);
                            refVar = ref.vars;
                        }
                        let refCond = e.tmplConditionAttrs[cond];
                        let composer = {
                            hasExt: refCond.hasExt,
                            condContent: extract.content,
                            isRef,
                            refVar,
                            boolean: refCond.boolean,
                            valuable: refCond.valuable,
                            art: extract.art,
                            line: extract.line,
                            origin: extract.origin
                        };
                        a.cond = composer;
                        //console.log(a.name, a.value, refCond, cmds);
                    } else if (!a.unary) {
                        if (a.value.startsWith('\x07')) {
                            a.value = a.value.replace(condEscapeReg, '$1?');
                        } else if (a.value.startsWith('\x1f')) {
                            token.attrHasDynamicViewId = true;
                        } else if (a.name == 'mx-view') {
                            token.isMxView = true;
                        }
                    }
                    aList.push(a);
                }
            }
            token.attrs = aList;
            token.unary = unary;
            token.auto = auto;
            //let prev = current.children[current.children.length - 1];
            // we can exchange tag here
            // if (token.tag == 'input' && prev && prev.tag == 'span') {
            //     current.children.pop();
            //     current.children.push(token, prev);
            // } else {
            current.children.push(token);
            //}
            if (!unary) {
                stack.push(token);
                current = token;
            }
        },
        end(tag, { end }) {
            let e = stack.pop();
            if (tag == 'textarea') {
                textareaCount--;
                let { children } = e;
                e.children = [];
                //e.unary = true;
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
            let open = auto ? '{{if ' : quickIfAttr + '="{{';
            let art = `${open}${ctrl.art}}}${auto ? '' : '"'}`;
            start.push(`$__line=${ctrl.line};$__art=${JSON.stringify(art)};`);
            start.push(`$__ctrl=${JSON.stringify('if(' + ctrl.cond + '){')};`);
        }
        start.push(`\r\nif(${ctrl.cond}){\r\n`);
        end.push('\r\n}');
    },
    'elif'(ctrl, start, end, auto) {
        start.push(`else if(`);
        if (configs.debug) {
            let open = auto ? '{{else if ' : quickElseIfAttr + '="{{';
            let art = `${open}${ctrl.art}}}${auto ? '' : '"'}`;
            start.push(`($__line=${ctrl.line},$__art=${JSON.stringify(art)},`);
            start.push(`$__ctrl=${JSON.stringify('else if(' + ctrl.cond + '){')}),`);
        }
        start.push(ctrl.cond, '){\r\n');
        end.push('\r\n}');
    },
    'else'(ctrl, start, end) {
        start.push(`else{\r\n`);
        end.push('\r\n}');
    },
    'each'(ctrl, start, end, auto) {
        let shortList = utils.uId('$q_a_', '', 1);
        let listCount = utils.uId('$q_c_', '', 1);
        let decs = `let ${shortList}=${ctrl.list},`;
        if (!longExpr.test(ctrl.list)) {
            decs = 'let ';
            shortList = ctrl.list;
        }
        let initial = ctrl.value.startsWith('$q_v_') ? '' : `let ${ctrl.value}=${shortList}[${ctrl.key}];`;
        if (ctrl.asc) {
            decs += `${listCount}=${shortList}.length`;
            if (ctrl.first != -1) {
                initial += `let ${ctrl.first}=${ctrl.key}===0;`;
            }
            if (ctrl.last != -1) {
                let last = utils.uId('$q_lc_', '', 1);
                decs += `,${last}=${listCount}-1`;
                initial += `let ${ctrl.last}=${ctrl.key}===${last};`;
            }
            decs += `,${ctrl.key}=0`;
        } else {
            decs += `${ctrl.key}=${shortList}.length`;
            if (ctrl.first != -1) {
                let last = utils.uId('$q_lc_', '', 1);
                decs += `,${last}=${ctrl.key}-1`;
                initial += `let ${ctrl.first}=${ctrl.key}===${last};`;
            }
            if (ctrl.last != -1) {
                initial += `let ${ctrl.last}=${ctrl.key}===0;`;
            }
        }
        if (configs.debug) {
            let open = auto ? '{{each ' : quickEachAttr + '="{{';
            let art = `${open}${ctrl.art}}}${auto ? '' : '"'}`;
            start.push(`$__line=${ctrl.line};$__art=${JSON.stringify(art)};`);
            if (ctrl.asc) {
                start.push(`$__ctrl=${JSON.stringify(`for(${decs};${ctrl.key}<${listCount};${ctrl.key}++){${initial}`)};`);
            } else {
                start.push(`$__ctrl=${JSON.stringify(`for(${decs};${ctrl.key}--;){${initial}`)};`);
            }
        }
        //console.log(decs);
        if (ctrl.asc) {
            start.push(`\r\nfor(${decs};${ctrl.key}<${listCount};${ctrl.key}++){\r\n${initial}\r\n`);
        } else {
            start.push(`\r\nfor(${decs};${ctrl.key}--;){\r\n${initial}\r\n`);
        }
        end.push('\r\n}');
    },
    'forin'(ctrl, start, end, auto) {
        let initial = ctrl.value.startsWith('$q_v_') ? '' : `{let ${ctrl.value}=${ctrl.list}[${ctrl.key}];`;
        if (configs.debug) {
            let open = auto ? '{{forin ' : quickForInAttr + '="{{'
            let art = `${open}${ctrl.art}}}${auto ? '' : '"'}`;
            start.push(`$__line=${ctrl.line};$__art=${JSON.stringify(art)};`);
            start.push(`$__ctrl=${JSON.stringify(`for(let ${ctrl.key} in ${ctrl.list}){${initial}`)};`);
        }
        start.push(`\r\nfor(let ${ctrl.key} in ${ctrl.list}){\r\n${initial}\r\n`);
        end.push('\r\n}');
    },
    'for'(ctrl, start, end, auto) {
        if (configs.debug) {
            let open = auto ? '{{for ' : quickForAttr + '="{{'
            let art = `${open}${ctrl.art}}}${auto ? '' : '"'}`;
            start.push(`$__line=${ctrl.line};$__art=${JSON.stringify(art)};`);
            start.push(`$__ctrl=${JSON.stringify(`for(${ctrl.cond}){`)};`);
        }
        start.push(`\r\nfor(${ctrl.cond}){\r\n`);
        end.push('\r\n}');
    }
};
let preProcess = (src, e) => {
    //console.log('enter',JSON.stringify(src));
    let cmds = Object.create(null),
        tags = Object.create(null);
    src = src.replace(directReg, m => {
        return `<${quickDirectTagName} ${quickDirectCodeAttr}="${m.replace(/"/g, '&quot;')}"/>`;
    }).replace(spreadAttrsReg, m => {
        return `${quickSpreadAttr}="${m.replace(/"/g, '&quot;')}"`;
    });
    src = artExpr.addLine(src);
    src = tmplCmd.store(src, cmds);
    src = tmplCmd.store(src, cmds, artCommandReg);
    let count = 0;
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
                    return `<${quickGroupTagName} ${quickAutoAttr} ${quickOpenAttr}="<%{%>" ${quickEachAttr}="{{\x1e${line}${art.substring(5)}}}">`;
                } else if (ctrls[0] == 'forin') {
                    return `<${quickGroupTagName} ${quickAutoAttr} ${quickOpenAttr}="<%{%>" ${quickForInAttr}="{{\x1e${line}${art.substring(6)}}}">`;
                } else if (ctrls[0] == 'for') {
                    return `<${quickGroupTagName} ${quickAutoAttr} ${quickOpenAttr}="<%{%>" ${quickForAttr}="{{\x1e${line}${art.substring(4)}}}">`;
                } else if (ctrls[0] == 'if') {
                    return `<${quickGroupTagName} ${quickAutoAttr} ${quickOpenAttr}="<%{%>" ${quickIfAttr}="{{\x1e${line}${art.substring(3)}}}">`;
                } else if (ctrls[0] == 'else') {
                    if (ctrls[1] == 'if') {
                        return `</${quickGroupTagName} ${quickCloseAttr}="<%}%>"><${quickGroupTagName} ${quickAutoAttr} ${quickOpenAttr}="<%{%>" ${quickElseIfAttr}="{{\x1e${line}${art.substring(7)}}}">`;
                    }
                    return `</${quickGroupTagName} ${quickCloseAttr}="<%}%>"><${quickGroupTagName} ${quickAutoAttr} ${quickOpenAttr}="<%{%>" ${quickElseAttr}>`;
                } else if (art.startsWith('/each') ||
                    art.startsWith('/forin') ||
                    art.startsWith('/for') ||
                    art.startsWith('/if')) {
                    return `</${quickGroupTagName} ${quickCloseAttr}="<%}%>">`;
                }
            } else {
                return m;
            }
        }
        return m;
    });

    src = tmplCmd.store(src, cmds, artCommandReg);
    src = storeHTML(src, tags);
    while (tagHReg.test(src)) {
        tagHReg.lastIndex = 0;
        src = src.replace(tagHReg, m => {
            m = tags[m];
            let src = m.src;
            //console.log('src',src,m.tag);
            if (m.tag) {
                src = src.replace(quickLoopReg, (_, k, $, c) => {
                    c = tmplCmd.recover(c, cmds);
                    let li = artExpr.extractArtInfo(c);
                    if (li) {
                        let expr = artExpr.extractAsExpr(li.art);
                        //console.log(expr,li.art);
                        if (!expr.value) {
                            expr.value = utils.uId('$q_v_', '', 1);
                        }
                        if (expr.bad || expr.splitter != 'as') {
                            slog.ever(chalk.red(`[MXC-Error(tmpl-quick)] unsupport or bad ${k} {{${li.art}}} at line:${li.line}`), 'file', chalk.grey(e.shortHTMLFile));
                            throw new Error(`[MXC-Error(tmpl-quick)] unsupport or bad ${k} {{${li.art}}} at ${e.shortHTMLFile}`);
                        }
                        if (!expr.index) {
                            expr.index = utils.uId('$q_key_', '', 1);
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
                        let prefix = '';
                        if (!m.special) {
                            count++;
                            prefix = quickOpenAttr + '="<%{%>" ';
                        }
                        //console.log(expr.value);
                        return `${prefix}${quickDeclareAttr}="<%let ${expr.index},${expr.value}=${expr.iterator}[${expr.index}]${flv}%>" ${k}="<%'${li.line}\x11${li.art.replace(escapeSlashRegExp, '\\$&')}\x11'%><%(${expr.value},${expr.index}${firstAndLastVars},${expr.asc ? 1 : -1}) in ${expr.iterator}%>"`;
                    }
                    return _;
                }).replace(quickConditionReg, (_, k, $, c) => {
                    c = tmplCmd.recover(c, cmds);
                    let li = artExpr.extractArtInfo(c);
                    if (li) {
                        let expr = artExpr.extractIfExpr(li.art);
                        let key = k == quickForAttr ? 'for' : 'if';
                        return `${k}="<%'${li.line}\x11${li.art.replace(escapeSlashRegExp, '\\$&')}\x11'%><%${key}(${expr});%>"`;
                    }
                    return _;
                });
            }
            return src;
        });
    }
    if (count) {
        src = src.replace(lastCloseReg, (m, more) => {
            return ` ${quickCloseAttr}="<%${new Array(count + 1).join('}')}%>">${more}`;
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
    //console.log('here',JSON.stringify(src));
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
        specialStaticVars = {},
        specialFlags = {},
        specialFlagIndex = 0,
        groupKeyAsParams = Object.create(null),
        staticNodes = Object.create(null),
        staticObjects = Object.create(null),
        staticCounter = 0,
        staticUniqueKey = md5(e.shortHTMLFile, tmplStaticVarsKey, '', true);
    let genElement = (node, level, inStaticNode) => {
        if (node.type == 3) {
            let cnt = tmplCmd.recover(node.content, cmds);
            let text = serAttrs('$text', cnt, false);
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
                if (vnodeInited[level]) {
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
                hasCmdOut = node.attrHasDynamicViewId,
                dynamicAttrs = '',
                hasCtrl,
                hasRestElement = false,
                attrKeys = Object.create(null),
                specialKey = '';
            if (node.attrs.length) {
                hasAttrs = true;
                for (let a of node.attrs) {
                    if (node.isMxView &&
                        a.name == tmplMxViewParamKey &&
                        groupKeyAsParams.groups) {
                        a.value = a.value.replace(groupsReg, '#');
                    }
                    if (configs.tmplRadioOrCheckboxRename &&
                        a.name == 'name' &&
                        a.value &&
                        (node.inputType == 'radio' ||
                            node.inputType == 'checkbox')) {
                        let newValue = '';
                        tmplCommandAnchorReg.lastIndex = 0;
                        if (tmplCommandAnchorReg.test(a.value)) {
                            tmplCommandAnchorReg.lastIndex = 0;
                            newValue = `${configs.projectName}_${a.value}`;
                        } else {
                            newValue = `${configs.projectName}_${md5(e.from + ':' + a.value, tmplRadioOrCheckboxKey, '', true)}`;
                        }
                        a.value = newValue;
                    }
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
                    //console.log('leave', a.value);
                    let attr = serAttrs(key, a.value, !bAttr);
                    hasCtrl = attr.hasCtrl;
                    if (attr.hasCmdOut || attr.hasVarOut || a.cond) {
                        hasCmdOut = true;
                    }
                    if (a.name == quickSpreadAttr) {
                        attr.direct = false;
                    }
                    let cond = '';
                    let outputBoolean = false;
                    if (a.cond) {
                        let { line,
                            art,
                            hasExt,
                            condContent,
                            origin,
                            valuable,
                            isRef,
                            refVar } = a.cond;
                        outputBoolean = !valuable && !hasExt;
                        //<input disabled="{{=user.checked}}?"/>
                        if (a.value === true || outputBoolean) {
                            attr.returned = '';
                            cond += '(';
                        } else if (attr.direct) {
                            //<input value="{{=user}}?{{=user.value}}"/>
                            //<input value="{{=user.age}}?"/>
                            let v = hasExt ? '' : tmplVarTempKey + '=';
                            cond += `(${v}(`;
                            attr.returned = `(${attr.returned})`;
                        } else {
                            //console.log('xxxx');
                            cond += `((`;
                        }
                        //console.log(attr, cond, a);
                        if (configs.debug) {
                            cond += `$__line=${line},$__art='{{${art}}}',$__ctrl='<%${origin}%>',`;
                        }
                        cond += isRef ? refVar : condContent;
                        if (a.value === true || outputBoolean) {
                            cond += ')';
                        } else {
                            if (valuable) {
                                cond += '))!=null&&';
                            } else {
                                cond += '))&&';
                            }
                            if (!hasExt) {
                                attr.returned = tmplVarTempKey;
                            }
                        }
                    }
                    //console.log(a.cond);
                    //console.log(cond, attr.returned);
                    if (configs.debug &&
                        attr.direct &&
                        (bAttr ||
                            (a.cond &&
                                !a.cond.hasExt &&
                                !a.cond.valuable)) &&
                        (a.value !== true ||
                            outputBoolean ||
                            a.cond)) {
                        if (a.value === true || outputBoolean) {
                            cond = `(${tmplVarTempKey}=${cond},${tmplVarTempKey}!==true&&${tmplVarTempKey}!==false&&console.error('make sure attr:"${a.name}" returned only true or false value\\r\\nat line:'+$__line+'\\r\\nat file:${e.shortHTMLFile}\\r\\ncurrent returned value is:',JSON.stringify(${tmplVarTempKey})),${tmplVarTempKey})`;
                        } else if (attr.direct) {
                            let assign = attr.returned == tmplVarTempKey ? '' : `${tmplVarTempKey}=${attr.returned},`;
                            attr.returned = `(${assign}${tmplVarTempKey}!==true&&${tmplVarTempKey}!==false&&console.error('make sure attr:"${a.name}" returned only true or false value\\r\\nat line:'+$__line+'\\r\\nat file:${e.shortHTMLFile}\\r\\ncurrent returned value is:',JSON.stringify(${tmplVarTempKey})),${tmplVarTempKey})`;
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
                        if (a.name == quickSpreadAttr) {
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
                let allProps = attrMap.getProps(node.tag, node.inputType);
                let mustUseProps = [];
                if (hasInlineCtrl) {
                    if (hasRestElement) {
                        for (let c of ctrlAttrs) {
                            if (c.type != 'mixed' && c.type != 'direct') {
                                dynamicAttrs += c.ctrl;
                            }
                        }
                        attrsStr = '{';
                        for (let p in attrs) {
                            attrsStr += `'${p}': ${attrs[p]},`;
                            if (allProps[p]) {
                                mustUseProps.push(`'${p}':'${allProps[p]}'`);
                            }
                        }
                        for (let c of ctrlAttrs) {
                            if (c.type == 'direct') {
                                attrsStr += `'${c.oKey}': ${c.ctrl},`;
                                if (allProps[c.oKey]) {
                                    mustUseProps.push(`'${c.oKey}':'${allProps[c.oKey]}'`);
                                }
                            } else if (c.type == 'mixed') {
                                attrsStr += `...${c.ctrl}, `;
                            } else if (c.oKey) {
                                attrsStr += `'${c.oKey}': ${c.key},`;
                                if (allProps[c.oKey]) {
                                    mustUseProps.push(`'${c.oKey}':'${allProps[c.oKey]}'`);
                                }
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
                            attrsStr += `'${p}': ${attrs[p]},`;
                            if (allProps[p]) {
                                mustUseProps.push(`'${p}':'${allProps[p]}'`);
                            }
                        }
                        for (let c of ctrlAttrs) {
                            if (c.oKey) {
                                attrsStr += `'${c.oKey}': ${c.key},`;
                                if (allProps[c.oKey]) {
                                    mustUseProps.push(`'${c.oKey}':'${allProps[c.oKey]}'`);
                                }
                            }
                        }
                        attrsStr += '}';
                    }
                } else {
                    attrsStr = '{';
                    for (let p in attrs) {
                        attrsStr += `'${p}': ${attrs[p]},`;
                        if (allProps[p]) {
                            mustUseProps.push(`'${p}':'${allProps[p]}'`);
                        }
                    }
                    attrsStr += '}';
                    if (!hasCmdOut &&
                        !hasCtrl &&
                        !node.canHoisting &&
                        node.tag != quickGroupTagName &&
                        node.tag != quickDirectTagName &&
                        !node.groupKeyNode &&
                        !node.groupUseNode) {
                        let i = staticObjects[attrsStr];
                        if (i) {
                            attrsStr = i.key;
                            i.used++;
                            if (!inStaticNode) {
                                i.inStatic = false;
                            }
                        } else {
                            let key = `$quick_${staticUniqueKey}_${staticCounter++}_static_attr`;
                            staticObjects[attrsStr] = {
                                key,
                                used: 1,
                                inStatic: inStaticNode
                            };
                            attrsStr = key;
                        }
                    }
                }

                if (mustUseProps.length) {
                    let specials = '{',
                        flag = 0;
                    for (let p of mustUseProps) {
                        specials += `${p},`;
                        if (!specialFlags[p]) {
                            specialFlags[p] = 2 << specialFlagIndex;
                            specialFlagIndex++;
                        }
                        flag |= specialFlags[p];
                    }
                    specials += '}';
                    specialKey = `$special_${flag}`;
                    if (!specialStaticVars[specialKey]) {
                        specialStaticVars[specialKey] = specials;
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
            if (node.groupKeyNode) {
                if (node.groupContextNode) {
                    snippets.push(`\ngroups.${node.groupKey}=${node.groupContext}=>{\n`);
                    groupKeyAsParams.groups = 1;
                    groupKeyAsParams[node.groupContext] = 1;
                }
                if (node.canHoisting) {
                    key = staticNodes[node.staticValue];
                    if (!key) {
                        key = `$quick_group_${staticUniqueKey}_${node.groupKey}_static_node`;
                        staticVars.push({
                            key
                        });
                        staticNodes[node.staticValue] = key;
                    }
                } else {
                    key = `$$_group_` + node.groupKey;
                    vnodeDeclares[key] = 1;
                }
            }
            if (node.canHoisting) {
                if (node.groupKeyNode) {
                    snippets.push(`\r\nif(!${key}){\r\n`);
                } else {
                    key = staticNodes[node.staticValue];
                    if (!key) {
                        key = `$quick_${staticUniqueKey}_${staticCounter++}_static_node`;
                        staticVars.push({
                            key
                        });
                        staticNodes[node.staticValue] = key;
                    }
                    snippets.push(`\r\nif(${key}){\r\n`);
                    if (vnodeInited[level]) {
                        snippets.push(`$vnode_${level}.push(${key});`);
                    } else {
                        snippets.push(`$vnode_${level}=[${key}];`);
                    }
                    snippets.push(`\r\n}else{\r\n`);
                }
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
            if (node.tag == quickGroupTagName) {
                if (node.children.length) {
                    if (vnodeInited[level]) {
                        combinePushed.push({
                            key: `$vnode_${level}`,
                            src: `$vnode_${level}.push(...$vnode_${level + 1});`
                        });
                        if (vnodeInited[level + 1]) {
                            let v = vnodeInited[level + 1];
                            v = v === 1 ? `$vnode_${level + 1}` : v;
                            snippets.push(`$vnode_${level}.push(...${v});`);
                        }
                    } else if (vnodeInited[level + 1]) {
                        vnodeInited[level] = 1;
                        snippets.push(`$vnode_${level}=$vnode_${level + 1};`);
                    }
                }
            } else if (node.tag == quickDirectTagName) {
                if (configs.debug) {
                    snippets.push(`$__line=${node.directLine};$__art='{{${node.directArt}}}';$__ctrl='${node.directCtrl.replace(escapeSlashRegExp, '\\$&')}';`);
                }
                let refVar = `$ref_${staticCounter++}_node`;
                snippets.push(`\nlet ${refVar}=${node.directCtrl};\n`);
                if (vnodeInited[level]) {
                    snippets.push(`\r\nif(${refVar}){\r\n$_is_array(${refVar})?$vnode_${level}.push(...${refVar}):$vnode_${level}.push(${refVar});}`);
                } else {
                    vnodeInited[level] = 1;
                    vnodeDeclares.$_empty_arr = '[]';
                    snippets.push(`$vnode_${level}=${refVar}?$_is_array(${refVar})?${refVar}:[${refVar}]:$_empty_arr;`);
                }
            } else {
                let unary = node.unary ? '1' : '';
                let specialProps = specialKey || (unary ? '0' : '');
                let children = '';
                if (node.children.length && vnodeInited[level + 1]) {
                    let t = vnodeInited[level + 1];
                    children = t === 1 ? `$vnode_${level + 1}` : t;
                } else {
                    children = (specialProps ? '0' : '');
                }
                let props = hasAttrs ? attrsStr : children ? '0' : '';
                if (dynamicAttrs && !dynamicAttrs.endsWith(';')) {
                    dynamicAttrs += ';';
                }
                snippets.push(dynamicAttrs);
                let content = '';
                if (unary) {
                    content += `,${props},${children},${specialProps},${unary}`;
                } else if (specialProps) {
                    content += `,${props},${children},${specialProps}`;
                } else if (children) {
                    content += `,${props},${children}`;
                } else if (props) {
                    content += `,${props}`;
                }
                if (node.groupKeyNode) {
                    if (!node.children || !node.children.length) {
                        throw new Error(`[MXC-Error(tmpl-quick)] mx-group must have children elements at ${e.shortHTMLFile}`);
                    }
                    let prefix = '';
                    if (node.canHoisting) {
                        prefix = `$quick_group_${staticUniqueKey}_${node.groupKey}_static_node`;
                    } else {
                        prefix = `$$_group_${node.groupKey}`;
                    }
                    if (node.groupContextNode) {
                        //console.log(node);
                        if (node.canHoisting) {
                            let src = `\r\n${prefix}=$vnode_${level + 1};`;
                            snippets.push(src);
                            snippets.push(`\n}\nreturn ${prefix};\n`);
                        } else {
                            snippets.push(`\nreturn $vnode_${level + 1};\n};\n`);
                        }
                    } else {
                        let src = `\r\n${prefix}=$vnode_${level + 1};`;
                        snippets.push(src);
                    }
                } else {
                    let prefix = node.canHoisting ? `${key}=` : '',
                        src = '';
                    if (node.groupUseNode) {
                        let declared = vnodeDeclares[`$$_group_${node.groupUse}`];
                        if (!declared) {
                            let f = `$quick_group_${staticUniqueKey}_${node.groupUse}_static_node`;
                            for (let v of staticVars) {
                                if (v.key == f) {
                                    declared = true;
                                    break;
                                }
                            }
                        }
                        if (!declared) {
                            throw new Error(`[MXC-Error(tmpl-quick)] mx-group used undeclared "${node.groupUse}" at ${e.shortHTMLFile}`);
                        }
                    }
                    if (vnodeInited[level]) {
                        //console.log(node);
                        if (node.groupUseNode) {
                            let key = `$$_group_${node.groupUse}`;
                            let value = vnodeDeclares[key] ? key : `$quick_group_${staticUniqueKey}_${node.groupUse}_static_node`;
                            src = `$vnode_${level}.push(...${value});`
                        } else {
                            src = `$vnode_${level}.push(${prefix}$_create('${node.tag}'${content}));`;
                            combinePushed.push({
                                key: `$vnode_${level}`,
                                src
                            });
                        }
                        snippets.push(src);
                    } else {
                        if (node.groupUseNode) {
                            let key = `$$_group_${node.groupUse}`;
                            let value = vnodeDeclares[key] ? key : `$quick_group_${staticUniqueKey}_${node.groupUse}_static_node`;
                            //src = `$vnode_${level}=${value};\r\n`
                            vnodeInited[level] = value;
                        } else {
                            src = `\r\n$vnode_${level}=[${prefix}$_create('${node.tag}'${content})];`;
                            combinePushed.push({
                                key: `$vnode_${level}`,
                                src
                            });
                            vnodeInited[level] = 1;
                        }
                        snippets.push(src);
                    }
                }
                if (node.canHoisting) {
                    snippets.push('\r\n}\n');
                }
            }
            snippets.push(end.join(''));
        }
    };
    vnodeInited[0] = 1;
    for (let t of tokens) {
        genElement(t, 0);
    }
    let source = `let ${tmplVarTempKey},$vnode_0=[]`;
    let hasGroupFunction = false;
    if (e.globalVars.length) {
        let vars = ',\r\n{';
        for (let key of e.globalVars) {
            if (!groupKeyAsParams[key]) {
                vars += `\r\n\t${key},`;
            } else {
                hasGroupFunction = true;
            }
        }
        source += vars + '}=$$';
    }
    if (hasGroupFunction) {
        source += `,\r\ngroups={}`;
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
        source = `let $__art, $__line, $__ctrl; try { ${source} \r\n} catch (ex) { let msg = 'render view error:' + (ex.message || ex); msg += '\\r\\n\\tsrc art: ' + $__art + '\\r\\n\\tat line: ' + $__line; msg += '\\r\\n\\ttranslate to: ' + $__ctrl + '\\r\\n\\tat file:${e.shortHTMLFile}'; throw msg; } `;
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
    for (let s in specialStaticVars) {
        staticVars.push({
            key: s,
            value: specialStaticVars[s]
        });
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