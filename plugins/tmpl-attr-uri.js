/**
 * 处理属性中的uri
 * <mx-vframe src="./user?q=我" from="首页"　user-id="123"  />
 * 对于参数from会进行encodeURIComponent
 * 因为属性中不区分大小写，因此约定的user-id会转成userId
 * src中的参数不作任何处理，只把属性中的参数追加到src中
 */
let tmplCmd = require('./tmpl-cmd');
let tmplUnescape = require('html-entities-decoder');
let classRef = require('./tmpl-attr-classref');
let atpath = require('./util-atpath');
let {
    htmlAttrParamPrefix,
    htmlAttrParamFlag,
    tmplCondPrefix,
    tmplVarTempKey } = require('./util-const');
let regexp = require('./util-rcache');
let tmplChecker = require('./checker-tmpl');
let cmdReg = /\x07\d+\x07/g;
let dOutCmdReg = /<%=([\s\S]+?)%>/g;
let fillReg = /\$\{[^{}]+\}/g;
let encodeMore = {
    '!': '%21',
    '\'': '%27',
    '(': '%28',
    ')': '%29',
    '*': '%2A'
};

let encodeMoreReg = /[!')(*]/g;
//let gorupRef = '@group:';
let encodeReplacor = m => encodeMore[m];
let paramsReg = regexp.get(`\\s(\\x1c\\d+\\x1c)?${regexp.escape(htmlAttrParamPrefix)}([\\w\\-]+)=(["'])([\\s\\S]*?)\\3`, 'g');
let condReg = regexp.get(`\\s${regexp.escape(tmplCondPrefix)}(\\x1c\\d+\\x1c)=(["'])([\\s\\S]*?)\\2`, 'g');
module.exports = (match, e, refTmplCommands, baseAttrReg, nativePrefix) => {
    let attrs = [];
    let attrsMap = Object.create(null);
    let ac = 0;
    let classLocker = Object.create(null);
    let condObjects = Object.create(null);
    let updateCmdUseEncode = src => {
        src.replace(cmdReg, cm => {
            let cmd = refTmplCommands[cm];
            if (cmd) {
                cmd = cmd.replace(dOutCmdReg, (m, c) => {
                    if (c.startsWith('$eu(') &&
                        c.endsWith(')')) {
                        return m;
                    }
                    return '<%=$eu(' + c + ')%>';
                });
                refTmplCommands[cm] = cmd;
            }
        });
    };
    match = match.replace(condReg, (m, cond, q, content) => {
        condObjects[cond] = content;
        return m;
    }).replace(paramsReg, (m, cond, name, q, content) => {
        name = tmplChecker.checkMxViewParams(name, e, htmlAttrParamFlag);
        let cmdTemp = []; //处理属性中带命令的情况
        let ci = e.tmplConditionAttrs[cond];
        let cs = content.split(cmdReg); //按命令拆分，则剩余的都是普通字符串
        content.replace(cmdReg, cm => {
            cmdTemp.push(cm); //把命令暂存下来
        });
        for (let i = 0; i < cs.length; i++) {
            cs[i] = tmplUnescape(cs[i]); //对转义字符回转一次，浏览器的行为，这里view-最终并不是标签属性，所以这里模拟浏览器的特性。
            cs[i] = classRef(cs[i], e, classLocker);
            //cs[i] = addAtIfNeed(cs[i]);
            cs[i] = atpath.resolveContent(cs[i], e.moduleId);
            cs[i] = encodeURIComponent(cs[i]).replace(encodeMoreReg, encodeReplacor); //对这个普通字符串做转义处理
            if (i < cmdTemp.length) { //把命令还原回去
                cs[i] = cs[i] + cmdTemp[i];
            }
        }
        content = cs.join('');
        if (ci) {
            let oCond = condObjects[cond];
            let extract = tmplCmd.extractCmdContent(oCond, refTmplCommands);
            let isRef = extract.operate == '@';
            let ref = tmplCmd.extractRefContent(extract.content);
            let art = '';
            if (extract.isArt) {
                art = `<%'${extract.line}\x11${extract.art}\x11'%>`;
            }
            if (ci.hasExt) {
                attrs.push(`${art}<%if((${isRef ? ref.vars : extract.content})${ci.valuable ? '!=null' : ''}){%>${ac == 0 ? '' : '&'}${name}=${content}<%}%>`);
                attrsMap['${' + name + '}'] = `${art}<%if((${isRef ? ref.vars : extract.content})${ci.valuable ? '!=null' : ''}){%>${content}<%}%>`;
            } else {
                if (isRef) {
                    attrs.push(`${art}<%if((${tmplVarTempKey}=${ref.vars})${ci.valuable ? '!=null' : ''}){%>${ac == 0 ? '' : '&'}${name}=<%${extract.operate}${tmplVarTempKey},${ref.key}%><%}%>`);
                    attrsMap['${' + name + '}'] = `${art}<%if((${tmplVarTempKey}=${ref.vars})${ci.valuable ? '!=null' : ''}){%><%${extract.operate}${tmplVarTempKey},${ref.key}%><%}%>`;
                } else {
                    attrs.push(`${art}<%if((${tmplVarTempKey}=${extract.content})${ci.valuable ? '!=null' : ''}){%>${ac == 0 ? '' : '&'}${name}=<%${extract.operate}${tmplVarTempKey}%><%}%>`);
                    attrsMap['${' + name + '}'] = `${art}<%if((${tmplVarTempKey}=${extract.content})${ci.valuable ? '!=null' : ''}){%><%${extract.operate}${tmplVarTempKey}%><%}%>`;
                }
            }
            ac++;
        } else {
            if (ac != 0) {
                attrs.push('&');
            }
            attrs.push(name + '=' + content); //处理成最终的a=b形式
            attrsMap['${' + name + '}'] = content;
            ac++;
        }
        return ''; //'view-' + oName;
    });
    if (attrs.length) {
        match = match.replace(baseAttrReg, (m, q, content) => {
            let hasFill = false;
            content = content.replace(fillReg, m => {
                let holder = attrsMap[m];
                if (holder) {
                    hasFill = true;
                    updateCmdUseEncode(holder);
                    return holder;
                }
                return m;
            });
            //console.log(content);
            if (!hasFill) {
                attrs = attrs.join('');
                if (content.indexOf('?') > -1) {
                    content = content + '&' + attrs;
                } else {
                    content = content + '?' + attrs;
                }
            }
            content = tmplCmd.store(content, refTmplCommands);
            return nativePrefix + '=' + q + content + q;
        });
        //console.log(match);
    }
    let testCmd = (m, q, content) => {
        q = content.indexOf('?');
        if (q >= 0) {
            updateCmdUseEncode(content.substring(q + 1));
        }
    };
    match.replace(baseAttrReg, testCmd);
    return match;
};