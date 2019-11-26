let path = require('path');
let utils = require('./util');
let atpath = require('./util-atpath');
let md5 = require('./util-md5');
let configs = require('./util-config');
let cssChecker = require('./checker-css');
let cssParser = require('./css-parser');
let cssStringName = require('./css-string-name');
let {
    cssIdGlobalPrefix,
} = require('./util-const');

let sep = path.sep;
let slashReg = /[\/\.~#@]/g;
let ignoreTags = {
    html: 1,
    body: 1,
    '[mx-view]': 1
};
let ruleEndReg = /[;\r\n]/;
let trimQ = /^['"]|['"]$/g;
//以@开始的名称，如@font-face
//charset不处理，压缩器会自动处理
let fontfaceReg = /@font-face\s*\{([^\{\}]*)\}/g;
//keyframes，如@-webkit-keyframes xx
let keyframesReg = /(^|[\s\}])(@(?:-webkit-|-moz-|-o-|-ms-)?keyframes)\s+(['"])?([\w\-]+)\3/g;
let cssContentReg = /\{([^\{\}]*)\}/g

let cssAtRuleProcessor = (fileContent, cssNamesKey, file) => {
    let kfContents = Object.create(null);
    let ffContents = Object.create(null);
    //先处理keyframes
    fileContent = fileContent.replace(keyframesReg, (m, head, keyframe, q, kname) => {
        //把名称保存下来，因为还要修改使用的地方
        if (!kfContents[kname]) {
            kfContents[kname] = genCssSelector(kname, cssNamesKey, null, 'md5CssSelectorResult@rule_kf');
            cssChecker.storeStyleDeclared(file, {
                atRules: {
                    ['@keyframes ' + kname]: 1
                }
            });
        }
        q = q || '';
        return head + keyframe + ' ' + q + kfContents[kname] + q;
    });
    //处理其它@规则，这里只处理了font-face
    fileContent = fileContent.replace(fontfaceReg, (match, content) => {
        let rules = content.split(ruleEndReg);
        let newRules = [];
        for (let rule of rules) {
            let parts = rule.split(':');
            if (parts.length && parts[0].trim() === 'font-family') {
                let fname = cssStringName.parseFont(parts[1])[0];
                if (!ffContents[fname]) {
                    ffContents[fname] = cssStringName.stringifyFont([genCssSelector(fname, cssNamesKey, null, 'md5CssSelectorResult@rule_ff')]);
                    cssChecker.storeStyleDeclared(file, {
                        atRules: {
                            ['@font-face ' + fname]: 1
                        }
                    });
                }
                newRules.push('font-family:' + ffContents[fname]);
            } else {
                newRules.push(rule);
            }
        }
        return `@font-face{${newRules.join(';')}}`;
    });
    fileContent = fileContent.replace(cssContentReg, (_, content) => {
        let rules = content.split(ruleEndReg);
        let newContent = [];
        for (let rule of rules) {
            let parts = rule.split(':');
            if (parts.length == 2) {
                let [key, value] = parts;
                key = key.trim();
                value = value.trim();
                if (key == 'font-family') {
                    let names = cssStringName.parseFont(value);
                    if (names.length == 1) {
                        let fname = names[0];
                        if (ffContents[fname]) {
                            let tn = ffContents[fname];
                            cssChecker.storeStyleUsed(file, file, {
                                atRules: {
                                    [`@font-face ${fname}`]: tn
                                }
                            });
                            value = tn;
                        }
                    }
                    newContent.push(key + ':' + value);
                } else if (key == 'font') {
                    let r = cssStringName.unpackFont(value);
                    if (r.succ) {
                        let names = cssStringName.parseFont(r.right);
                        if (names.length == 1) {
                            let fname = names[0];
                            if (ffContents[fname]) {
                                let tn = ffContents[fname];
                                cssChecker.storeStyleUsed(file, file, {
                                    atRules: {
                                        [`@font-face ${fname}`]: tn
                                    }
                                });
                                value = r.left + ' ' + tn;
                            }
                        }
                    }
                    newContent.push(key + ':' + value);
                } else if (key.endsWith('animation-name')) {
                    if (kfContents[value]) {
                        let tn = kfContents[value];
                        cssChecker.storeStyleUsed(file, file, {
                            atRules: {
                                [`@keyframes ${value}`]: tn
                            }
                        });
                        value = tn;
                    }
                    newContent.push(key + ':' + value);
                } else if (key.endsWith('animation')) {
                    let subs = value.split(' ');
                    let newSubs = [];
                    for (let s of subs) {
                        s = s.trim();
                        if (kfContents[s]) {
                            let tn = kfContents[s];
                            cssChecker.storeStyleUsed(file, file, {
                                atRules: {
                                    [`@keyframes ${s}`]: tn
                                }
                            });
                            s = tn;
                        }
                        newSubs.push(s);
                    }
                    newContent.push(key + ':' + newSubs.join(' '));
                } else if (key.startsWith('grid')) {
                    let names = cssStringName.getGridNames(key, value);
                    for (let i = names.length; i--;) {
                        let n = names[i];
                        if (n.content != '.') {
                            value = value.substring(0, n.start) + genCssSelector(n.content, cssNamesKey, null, 'md5CssSelectorResult@grid') + value.substring(n.end);
                        }
                    }
                    newContent.push(key + ':' + value);
                } else {
                    newContent.push(rule);
                }
            } else if (rule.trim()) {
                newContent.push(rule);
            }
        }
        return '{' + newContent.join(';') + '}';
    });
    //console.log(fileContent);
    return fileContent;
};
let genCssNamesKey = (file, ignorePrefix) => {
    //获取模块的id
    let cssId;
    if (configs.debug) {
        cssId = utils.extractModuleId(file, true);
        cssId = '_' + cssId.replace(slashReg, '_') + '_';
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
        mappedName = md5(selector + '\x00' + cssNameKey, key || 'md5CssSelectorResult', configs.projectName + '-', false, reservedNames);
        if (configs.selectorDSEndReg.test(selector)) {
            mappedName += '-';
        }
    }
    return mappedName;
};


let refNameProcessor = (relateFile, file, ext, name, e) => {
    if (file == 'scoped' && ext == '.style') {
        if (e) {
            let sname = e.globalCssNamesMap[name];
            if (!sname) {
                sname = `[ref="not found ${name} from @{${file}${ext}}"]`;
                cssChecker.storeStyleUsed(relateFile, '/' + file + ext, {
                    selectors: {
                        [name]: sname
                    }
                });
            } else {
                let f = e.globalCssDeclaredFiles.selectors[name] || '~~selector error~~';
                cssChecker.storeStyleUsed(relateFile, f, {
                    selectors: {
                        [name]: sname
                    }
                });
            }
            return sname;
        } else {
            throw new Error('[MXC Error(css-transform)] unsupport use scoped.style in ' + relateFile);
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
        if (e && configs.scopedCssMap[file]) {
            let sname = e.globalCssNamesMap[name];
            if (!sname) {
                sname = `[ref="not found ${name} from @{${file}}"]`;
            }
            cssChecker.storeStyleUsed(relateFile, file, {
                selectors: {
                    [name]: sname
                }
            });
            return sname;
        }
        let p = name.replace(configs.selectorKeepNameReg, '$1');
        let t = name.replace(p, '');
        let id = genCssSelector(p, genCssNamesKey(file)) + t;
        cssChecker.storeStyleUsed(relateFile, file, {
            selectors: {
                [name]: id
            }
        });
        return id;
    }
};

let refProcessor = (relateFile, file, ext, name, e) => {
    return `:global(.${refNameProcessor(relateFile, file, ext, name, e)})`;
};

let processVar = key => {
    let isGlobal = false;
    if (key.startsWith(`--${cssIdGlobalPrefix}`)) {
        if (!configs.debug) {
            key = '--' + md5(key, 'md5CssVarsResult', configs.projectName + '-');
        }
        isGlobal = true;
    }
    return {
        isGlobal,
        key
    };
};
let varRefProcessor = (relateFile, file, ext, name, e) => {
    if (file == 'scoped' && ext == '.style') {
        if (e) {
            let sname = e.globalCssVarsMap[name];
            if (!sname) {
                sname = `"not found ${name} from @{${file}${ext}}"`;
                cssChecker.storeStyleUsed(relateFile, '/' + file + ext, {
                    vars: {
                        [name]: sname
                    }
                });
            } else {
                let f = e.globalCssDeclaredFiles.selectors[name] || '~~var error~~';
                cssChecker.storeStyleUsed(relateFile, f, {
                    vars: {
                        [name]: sname
                    }
                });
            }
            return sname;
        } else {
            throw new Error('[MXC Error(css-transform)] unsupport use scoped.style in ' + relateFile);
        }
    } else {
        file = path.resolve(path.dirname(relateFile) + sep + file + ext);
        let { isGlobal, key } = processVar(name);
        if (isGlobal) {
            cssChecker.storeStyleUsed(relateFile, file, {
                vars: {
                    [name]: sname
                }
            });
            return key;
        }
        if (e && configs.scopedCssMap[file]) {
            let sname = e.globalCssVarsMap[name];
            if (!sname) {
                sname = `"not found ${name} from @{${file}}"`;
            }
            cssChecker.storeStyleUsed(relateFile, file, {
                vars: {
                    [name]: sname
                }
            });
            return sname;
        }
        let id = genCssSelector(name, genCssNamesKey(file));
        id = '--' + id;
        cssChecker.storeStyleUsed(relateFile, file, {
            vars: {
                [name]: id
            }
        });
        return id;
    }
};
let cssContentProcessor = (css, ctx) => {
    /*
        ctx:{
            shortfile,
            file,
            namesKey,
            namesMap,
            varsMap,
            duplicateNames
        }
    */
    let pInfo = cssParser(css, ctx.shortFile, ctx.refAtRules);
    if (pInfo.nests.length) { //标记过于复杂的样式规则
        cssChecker.storeStyleComplex(ctx.file, pInfo.nests);
    }
    let tokens = pInfo.tokens;
    let modifiers = [];
    let tagsOrAttrs = Object.create(null),
        selectors = Object.create(null),
        vars = Object.create(null);
    for (let token of tokens) {
        let id = token.name;
        if (token.type == 'tag') {
            if (!ignoreTags[id]) { //标签或属性选择器
                tagsOrAttrs[id] = 1;
            }
        } else if (token.type == 'attr') {
            //[mx-view^="@./path/to/view"]
            let value = token.value;
            if (token.name == 'mx-view' &&
                value &&
                (value.startsWith('@') ||
                    value.startsWith('.'))) {
                if (value.startsWith('.')) {
                    value = '@' + value;
                }
                let cssId = utils.extractModuleId(ctx.file);
                let mId = atpath.resolvePath(value, cssId);
                let newAttr = `[mx-view${token.ctrl || ''}=${token.quote}${mId}${token.quote}${token.ignoreCase ? ' i' : ''}]`;
                modifiers.push({
                    start: token.start,
                    end: token.end,
                    content: newAttr
                });
            }
            if (token.first) {
                id = '[' + id + ']';
            }
            if (!ignoreTags[id]) { //标签或属性选择器
                tagsOrAttrs[id] = 1;
            }
        } else if (token.type == 'class') {
            let result = id;
            let p, i;
            p = id.replace(configs.selectorKeepNameReg, '$1');
            let t = id.replace(p, '');
            i = genCssSelector(p, ctx.namesKey, ctx.globalReservedMap);
            if (t) {
                result = i + t;
                ctx.namesMap[p] = i;
                selectors[p] = i;
            } else {
                result = i;
            }
            ctx.namesMap[id] = result;
            modifiers.push({
                start: token.start,
                end: token.end,
                content: result
            });
            selectors[id] = result;
        } else if (token.type == 'global') {
            modifiers.push({
                start: token.start,
                end: token.end,
                content: token.content
            });
        }
    }

    let vs = pInfo.vars;
    for (let v of vs) {
        let { isGlobal, key } = processVar(v.name);
        if (isGlobal) {
            i = key;
        } else {
            i = '--' + genCssSelector(v.name, ctx.namesKey, null, 'md5CssVarsResult');
        }
        ctx.varsMap[v.name] = i;
        vars[v.name] = i;
        modifiers.push({
            start: v.start,
            end: v.end,
            content: i
        });
    }
    modifiers.sort((a, b) => a.start - b.start);
    for (let i = modifiers.length; i--;) {
        let m = modifiers[i];
        css = css.substring(0, m.start) + m.content + css.substring(m.end);
    }
    css = cssAtRuleProcessor(css, ctx.namesKey, ctx.file);
    return {
        content: css,
        tagsOrAttrs,
        selectors,
        vars
    };
};
module.exports = {
    refProcessor,
    cssContentProcessor,
    genCssNamesKey,
    genCssSelector,
    varRefProcessor,
    processVar
}