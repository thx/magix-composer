/*
    at规则的路径转换
 */
let path = require('path');
let sep = path.sep;
let sepRegTmpl = sep.replace(/\\/g, '\\\\');
let sepReg = new RegExp(sepRegTmpl, 'g');
let atReg = /(@{1,})(\.[^\x07@]+)/g;
let escapeAtReg = /@{2}/g;
//以@开头的路径转换
let relativePathReg = /(['"])@([^\/\\]+)([^\s;\(\)\{\}]+?)(?=\\?\1)/g;
//处理@开头的路径，如果是如'@coms/dragdrop/index'则转换成相对当前模块的相对路径，如果是如 mx-view="@./list" 则转换成 mx-view="app/views/reports/list"完整的模块路径
let resolveAtPath = (content, from) => {
    //console.log('resolveAtPath',content);
    let folder = from.substring(0, from.lastIndexOf('/') + 1);
    let tp;
    return content.replace(relativePathReg, (m, q, l, p) => {
        if (l.charAt(0) == '.') { //以.开头我们认为是相对路径，则转完整模块路径
            tp = q + path.normalize(folder + l + p);
        } else {
            let t = path.relative(folder, l + p);
            if (t.charAt(0) != '.' && t.charAt(0) != '/') {
                t = './' + t;
            }
            tp = q + t;
        }
        tp = tp.replace(sepReg, '/');
        return tp;
    });
};
//处理@名称，如'@../default.css'
let resolveAtName = (name, moduleId) => {
    if (name.indexOf('/') >= 0 && name.charAt(0) != '.') {
        name = resolveAtPath('"@' + name + '"', moduleId).slice(1, -1);
    }
    return name;
};

module.exports = {
    resolvePath: resolveAtPath,
    resolveName: resolveAtName,
    resolveContent(tmpl, moduleId, holder) {
        holder = holder || '@';
        return tmpl.replace(atReg, (match, ats, parts) => {
            let c = ats.length % 2;
            ats = ats.substring(0, ats.length - c);
            ats = ats.replace(escapeAtReg, holder);
            if (parts.indexOf('/') > -1) {
                if (c) {
                    parts = resolveAtPath(`"@${parts}"`, moduleId).slice(1, -1);
                    return ats + parts;
                } else {
                    return ats + parts;
                }
            }
            return ats + parts;
        });
    }
};