/**
 * 处理属性中的uri
 * <mx-vframe src="./user?q=我" from="首页"　user-id="123"  />
 * 对于参数from会进行encodeURIComponent
 * 因为属性中不区分大小写，因此约定的user-id会转成userId
 * src中的参数不作任何处理，只把属性中的参数追加到src中
 */
let checker = require('./checker');
let tmplCmd = require('./tmpl-cmd');
let tmplUnescape = require('html-entities-decoder');
let classRef = require('./tmpl-attr-classref');
let atpath = require('./util-atpath');
let configs = require('./util-config');
let tmplChecker = checker.Tmpl;
let cmdReg = /\u0007\d+\u0007/g;
let dOutCmdReg = /<%=([\s\S]+?)%>/g;
let encodeMore = {
    '!': '%21',
    '\'': '%27',
    '(': '%28',
    ')': '%29',
    '*': '%2A'
};

let encodeMoreReg = /[!')(*]/g;
let encodeReplacor = m => encodeMore[m];
let paramsReg = /\s(\x1c\d+\x1c)?param-([\w\-]+)=(["'])([\s\S]*?)\3/g;
let paramPrefix = 'param-';

module.exports = (match, e, refTmplCommands, baseAttrReg, nativePrefix) => {
    let attrs = [];
    let ac = 0;
    let classLocker = Object.create(null);
    match = match.replace(paramsReg, (m, cond, name, q, content) => {
        name = tmplChecker.checkMxViewParams(name, e, paramPrefix);
        let cmdTemp = []; //处理属性中带命令的情况
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
        if (cond) {
            let ci = e.tmplConditionAttrs[cond];
            let art = '';
            if (ci.isArt) {
                art = `<%'${ci.line}\x11${ci.art}\x11'%>`;
            }
            if (ci.hasContent) {
                attrs.push(`${art}<%if((${ci.content})${ci.valuable ? '!=null' : ''}){%>${ac == 0 ? '' : '&'}${name}=${content}<%}%>`);
            } else {
                attrs.push(`${art}<%if((${configs.tmplVarTempKey}=${ci.content})${ci.valuable ? '!=null' : ''}){%>${ac == 0 ? '' : '&'}${name}=<%${ci.operate}${configs.tmplVarTempKey}%><%}%>`);
            }
            ac++;
        } else {
            if (ac != 0) {
                attrs.push('&');
            }
            attrs.push(name + '=' + content); //处理成最终的a=b形式
            ac++;
        }
        return ''; //'view-' + oName;
    });
    if (attrs.length) {
        match = match.replace(baseAttrReg, (m, q, content) => {
            attrs = attrs.join('');
            if (content.indexOf('?') > -1) {
                content = content + '&' + attrs;
            } else {
                content = content + '?' + attrs;
            }
            content = tmplCmd.store(content, refTmplCommands);
            return nativePrefix + '=' + q + content + q;
        });
    }
    let testCmd = (m, q, content) => {
        q = content.indexOf('?');
        if (q >= 0) {
            content.substring(q + 1).replace(cmdReg, cm => {
                let cmd = refTmplCommands[cm];
                if (cmd) {
                    cmd = cmd.replace(dOutCmdReg, (m, c) => {
                        return '<%=$eu(' + c + ')%>';
                    });
                    refTmplCommands[cm] = cmd;
                }
            });
        }
    };
    match.replace(baseAttrReg, testCmd);
    return match;
};