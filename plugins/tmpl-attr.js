/*
    属性处理总入口
 */
let attrMxEvent = require('./tmpl-attr-mxevent');
let attrMxView = require('./tmpl-attr-mxview');
let attrLink = require('./tmpl-attr-link');
let checker = require('./checker');
let tmplClass = require('./tmpl-attr-class');
let tmplCmd = require('./tmpl-cmd');
let tagReg = /<([\w\-:]+)(?:"[^"]*"|'[^']*'|[^'">])*>/g;
let removeTempReg = /[\u0002\u0001\u0003\u0006\u0010]\.?/g;
let artCtrlsReg = /<%'\x17\d+\x11([^\x11]+)\x11\x17'%>(<%[\s\S]+?%>)/g;
module.exports = {
    process(fileContent, e, refTmplCommands, cssNamesMap) {
        let toSrc = expr => {
            expr = tmplCmd.recover(expr, refTmplCommands);
            return expr.replace(removeTempReg, '').replace(artCtrlsReg, '{{$1}}');
        };
        let tempCache = Object.create(null);
        let tagsCache = Object.create(null);
        return fileContent.replace(tagReg, (match, tagName) => { //标签进入
            match = attrMxEvent(e, match, refTmplCommands, toSrc);
            match = attrMxView(e, match, refTmplCommands);
            match = attrLink(e, tagName, match, refTmplCommands);
            match = tmplClass(tagName, match, cssNamesMap, refTmplCommands, e, tagsCache, tempCache);
            match = checker.Tmpl.checkTag(e, match, toSrc);
            return match;
        });
    }
};