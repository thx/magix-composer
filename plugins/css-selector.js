/*
    处理样式选择器
    1.　记录不推荐的选择器
    2.　添加前缀，保证项目唯一
    3.　压缩选择器(开启压缩的情况下)
 */
let path = require('path');
let utils = require('./util');
let md5 = require('./util-md5');
let configs = require('./util-config');
let checker = require('./checker');
let cssParser = require('./css-parser');
let sep = path.sep;
let slashReg = /[\/\.]/g;
//let cssCommentReg = /\/\*[\s\S]+?\*\//g;
//[ref="@../default.css:inmain"] .open{
//    color:red
//}
let cssRefReg = /\[\s*ref\s*=(['"])@([\w\.\-\/\\]+?)(\.css|\.less|\.scss|\.mx|\.mmx|\.style):([\w\-]+)\1\]/g;
let genCssNamesKey = (file, ignorePrefix) => {
    /*if (configs.scopedCssMap[file]) {
        file = 'scoped.style';
    }*/
    //获取模块的id
    let cssId;
    if (configs.debug) {
        //mc-【abc∕def∕test‧less】open-dialog «»
        cssId = utils.extractModuleId(file);
        cssId = '_' + cssId.replace(slashReg, '_') + '_';
        //cssId = file.replace(configs.moduleIdRemovedPath, '').slice(1);
        //cssId = '«' + cssId.replace(/[\/\\]/g, '∕').replace(/\./g, '‧') + '»';
    } else {
        cssId = md5(file, 'md5CssFileResult');
    }
    //css前缀是配置项中的前缀加上模块的md5信息
    if (!ignorePrefix) {
        cssId = configs.projectName + cssId;
    }
    return cssId;
};
let genCssSelector = (selector, cssNameKey, reservedNames, key) => {
    let mappedName = selector;
    if (configs.debug) { //压缩，我们采用md5处理，同样的name要生成相同的key
        if (cssNameKey) {
            mappedName = cssNameKey + '-' + mappedName;
        }
    } else {
        mappedName = configs.projectName + md5(selector + '\x00' + cssNameKey, key || 'md5CssSelectorResult', null, false, reservedNames);
        if (configs.selectorDSEndReg.test(selector)) {
            mappedName += '-';
        }
    }
    return mappedName;
};

let refProcessor = (relateFile, file, ext, name, e) => {
    if (file == 'global' && ext == '.style') {
        return name;
    } else if (file == 'scoped' && ext == '.style') {
        if (e) {
            let sname = e.globalCssNamesMap[name];
            if (!sname) {
                throw new Error('[MXC Error(css-selector)] can not found ' + name + ' at scoped.style');
            }
            let dFiles = e.globalCssNamesInFiles[name + '!r'];
            dFiles.forEach(f => {
                checker.CSS.markUsed(f, name, relateFile);
            });
            return '.@' + sname;
        } else {
            throw new Error('[MXC Error(css-selector)] unsupport use scoped.style in ' + relateFile);
        }
    } else {
        /*
            a.css
                [ref='@./b.css:good'] .name{

                }
            file='path/to/b.css';
            relateFile='path/to/a.css';

            b good a
        */
        file = path.resolve(path.dirname(relateFile) + sep + file + ext);
        if (e && configs.globalCssMap[file]) {
            return name;
        }
        if (e && configs.scopedCssMap[file]) {
            let sname = e.globalCssNamesMap[name];
            if (!sname) {
                throw new Error('[MXC Error(css-selector)] can not found ' + name + ' at ' + file);
            }
            let dFiles = e.globalCssNamesInFiles[name + '!r'];
            dFiles.forEach(f => {
                checker.CSS.markUsed(f, name, relateFile);
            });
            return '.@' + sname;
        }
        checker.CSS.markUsed(file, name, relateFile);
        let p = name.replace(configs.selectorKeepNameReg, '$1');
        let t = name.replace(p, '');
        let id = genCssSelector(p, genCssNamesKey(file), e && e.globalReservedMap) + t;
        return '.@' + id;
    }
};
/**
 * 添加到全局样式
 * @param  {string} name 原始样式名
 * @param  {string} transformSelector 变化后的，即可能是压缩后的样式
 * @param  {number} guid 目前仅标记是否全局的标识
 * @param  {boolean} lazyGlobal 是否在文件中标记全局的
 * @param  {string} file 所在文件
 * @param  {object} namesToFiles 名称到文件映射对象
 */
let addGlobal = (name, transformSelector, guid, lazyGlobal, file, namesToFiles) => {
    if (!namesToFiles[name]) { //不存在
        namesToFiles[name] = Object.create(null);
        namesToFiles[name + '!s'] = Object.create(null);
    } else if (!lazyGlobal && namesToFiles[name + '!g'] != guid) { //是否全局
        namesToFiles[name + '!s'] = Object.create(null);
    }

    namesToFiles[name + '!g'] = guid;
    namesToFiles[name][file] = 1;
    if (!lazyGlobal) {
        namesToFiles[name + '!s'][transformSelector] = file;
    }
    if (lazyGlobal) { //在文件中才标识的
        let list = namesToFiles[name + '!r'];
        if (list && list.length >= 0) {
            if (!list[file]) {
                list[file] = 1;
                list.push(file);
            }
        } else {
            namesToFiles[name + '!r'] = [file];
        }
        //checker.CSS.markLazyDeclared(name);
    } else {
        namesToFiles[name + '!r'] = [file];
    }
};

let ignoreTags = {
    html: 1,
    body: 1
};
let cssNameNewProcessor = (css, ctx) => {
    let pInfo = cssParser(css, ctx.shortFile, ctx.refAtRules);
    if (pInfo.nests.length) { //标记过于复杂的样式规则
        checker.CSS.markGlobal(ctx.file, '"' + pInfo.nests.join('","') + '"');
    }
    let tokens = pInfo.tokens;
    let modifiers = [];
    for (let token of tokens) {
        let id = token.name;
        if (token.type == 'tag' || token.type == 'sattr') {
            if (token.type == 'sattr') {
                id = '[' + id + ']';
            }
            if (!ignoreTags[id]) { //标签或属性选择器
                ctx.fileTags[id] = id;
                if (!ctx.tagsToFiles[id]) {
                    ctx.tagsToFiles[id] = Object.create(null);
                }
                ctx.tagsToFiles[id][ctx.file] = id;
            }
        } else if (token.type == 'class') {
            let result = id;
            if (!token.isGlobal) {
                let p = id.replace(configs.selectorKeepNameReg, '$1');
                let t = id.replace(p, '');
                let i = genCssSelector(p, ctx.namesKey, ctx.globalReservedMap);
                if (t) {
                    result = i + t;
                } else {
                    result = i;
                }
                ctx.cNamesMap[id] = result;
                if (ctx.addToGlobalCSS) {
                    //记录重名的
                    if (configs.log &&
                        ctx.namesMap[id] &&
                        ctx.namesToFiles[id] &&
                        !ctx.namesToFiles[id][ctx.file]) {
                        checker.CSS.markExists('.' + id, ctx.file, Object.keys(ctx.namesToFiles[id]) + '');
                    }
                    ctx.namesMap[id] = result;
                    ctx.namesMap[p] = i;
                    addGlobal(id, result, 0, 0, ctx.file, ctx.namesToFiles);
                    addGlobal(p, i, 0, 0, ctx.file, ctx.namesToFiles);
                }
                ctx.cNamesToFiles[id + '!r'] = [ctx.file];
            }
            modifiers.push({
                start: token.start,
                end: token.end,
                content: result
            });
        } else if (token.type == 'global') {
            modifiers.push({
                start: token.start,
                end: token.end,
                content: token.content
            });
        }
    }
    for (let i = modifiers.length; i--;) {
        let m = modifiers[i];
        css = css.substring(0, m.start) + m.content + css.substring(m.end);
    }
    return css;
};
let cssNameGlobalProcessor = (css, ctx) => {
    let pInfo = cssParser(css, ctx.shortFile, ctx.refAtRules);
    if (pInfo.nests.length && !ctx.lazyGlobal) {
        checker.CSS.markGlobal(ctx.file, '"' + pInfo.nests.join('","') + '"');
    }
    let tokens = pInfo.tokens;
    for (let i = tokens.length; i--;) {
        let token = tokens[i];
        let id = token.name;
        if (token.type == 'tag' || token.type == 'sattr') {
            if (token.type == 'sattr') {
                id = '[' + id + ']';
            }
            if (!ignoreTags[id]) {
                ctx.fileTags[id] = id;
                if (!ctx.tagsToFiles[id]) {
                    ctx.tagsToFiles[id] = Object.create(null);
                }
                ctx.tagsToFiles[id][ctx.file] = id;
            }
        } else if (token.type == 'class') {
            ctx.cNamesMap[id] = id;
            //记录重名的
            if (configs.log &&
                ctx.namesMap[id] &&
                ctx.namesToFiles[id] &&
                !ctx.namesToFiles[id][ctx.file]) {
                checker.CSS.markExists('.' + id, ctx.file, Object.keys(ctx.namesToFiles[id]) + '');
            }
            ctx.namesMap[id] = id;
            addGlobal(id, id, ctx.globalGuid, ctx.lazyGlobal, ctx.file, ctx.namesToFiles);
            if (ctx.cNamesToFiles) {
                ctx.cNamesToFiles[id + '!r'] = ctx.namesToFiles[id + '!r'];
            }
        }
    }
};
module.exports = {
    cssRefReg,
    refProcessor,
    genCssNamesKey,
    genCssSelector,
    cssNameNewProcessor,
    cssNameGlobalProcessor
};