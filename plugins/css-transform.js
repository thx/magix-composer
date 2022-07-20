let path = require('path');
let fs = require('fs');
let utils = require('./util');
let fd = require('./util-fd');
let atpath = require('./util-atpath');
let md5 = require('./util-md5');
let configs = require('./util-config');
let cssChecker = require('./checker-css');
let cssParser = require('./css-parser');
let cssStringName = require('./css-string-name');
let cssRead = require('./css-read');
let {
    atViewPrefix,
    mxPrefix,
    cssScopedVarPrefix
} = require('./util-const');
let extractCounterNameReg = /[a-zA-z0-9\-\_]+/g;
let extractCounterFnReg = /\b(counters?)\s*\(([^,\)]+)/g;
let counterNameCanTransform = n => {
    return !utils.isNumber(n) &&
        n != 'none' &&
        n != 'inherit' &&
        n != 'initial' &&
        n != 'unset';
};

let sep = path.sep;
let slashReg = /[\/\.~#@]/g;
let ignoreTags = {
    html: 1,
    body: 1,
    '[mx-view]': 1,
    [`[${mxPrefix}-view]`]: 1
};
let ruleEndReg = /(?=[;\r\n])/;
let atTempReg = /@\x12:/g;
let atPrefix = /@:/g;
let recoverAtReg = str => str.replace(atTempReg, '@:');
let storeAtReg = str => str.replace(atPrefix, '@\x12:');
//let trimQ = /^['"]|['"]$/g;
//以@开始的名称，如@font-face
//charset不处理，压缩器会自动处理
let fontfaceReg = /@font-face\s*\{([^\{\}]*)\}/g;
let atScrolllineReg = /@scroll-timeline\s+([^\{\}]*)\s*\{([^\{\}]*)\}/g;
//keyframes，如@-webkit-keyframes xx
//let keyframesReg = /(^|[\s\}])(@(?:-webkit-|-moz-|-o-|-ms-)?keyframes)\s+(['"])?([\w\-]+)\3/g;
let cssContentReg = /\{([^\{\}]*)\}/g;

let fixCssKeyName = (key, rules) => {
    if (key.startsWith(';')) {
        rules.push(';');
        key = key.substring(1);
    }
    if (key.startsWith('\r')) {
        rules.push('\r');
        key = key.substring(1);
    }
    if (key.startsWith('\n')) {
        rules.push('\n');
        key = key.substring(1);
    }
    return key;
};
/*
    对于@font-face @keyframes 和 animation-name
    在哪个文件中定义就在哪个文件中使用，比如在 x.css中

    @font-face{

    }
    定义的font-face，只能在 x.css 中通过
    .css-selector{font-family:'ref font-face'}使用
    在其它文件中通过.css-selector使用定义的这个 @font-face
    不允许其它文件中直接使用这个 font-family

    
 */
let cssAtRuleProcessor = (fileContent, cssNamesKey, file, namesMap) => {
    //let kfContents = Object.create(null);
    let ffContents = Object.create(null);
    //let kfPreffixes = Object.create(null);
    //先处理keyframes
    // fileContent = fileContent.replace(keyframesReg, (m, head, keyframe, q, kname) => {
    //     //把名称保存下来，因为还要修改使用的地方
    //     if (!kfContents[kname]) {
    //         kfContents[kname] = genCssSelector(kname, cssNamesKey, null, 'md5CssSelectorResult@rule_kf');
    //         // cssChecker.storeStyleDeclared(file, {
    //         //     atRules: {
    //         //         ['@keyframes ' + kname]: 1
    //         //     }
    //         // });
    //     }
    //     let p = kname.replace(configs.selectorKeepNameReg, '$1');
    //     let t = kname.replace(p, '');
    //     if (t) {
    //         if (!kfPreffixes[p]) {
    //             kfPreffixes[p] = genCssSelector(p, cssNamesKey, null, 'md5CssSelectorResult@rule_kf');
    //         }
    //         namesMap['@keyframes ' + p] = kfPreffixes[p];
    //     }
    //     let atKey = `@keyframes ${kname}`;
    //     namesMap[atKey] = kfContents[kname];
    //     //console.log(namesMap);
    //     q = q || '';
    //     return head + keyframe + ' ' + q + kfContents[kname] + q;
    // });
    //处理其它@规则，这里只处理了font-face
    fileContent = fileContent.replace(fontfaceReg, (match, content) => {
        let rules = content.split(ruleEndReg);
        let newRules = [];
        for (let rule of rules) {
            let parts = rule.split(':');
            if (parts.length == 2) {
                let [key, value] = parts;
                key = fixCssKeyName(key, newRules);
                if (key.trim() === 'font-family') {
                    let fname = cssStringName.parseFont(value)[0];
                    if (!ffContents[fname]) {
                        ffContents[fname] = cssStringName.stringifyFont([genCssSelector(fname, cssNamesKey, null, 'md5CssSelectorResult@rule_ff')]);
                        // cssChecker.storeStyleDeclared(file, {
                        //     atRules: {
                        //         ['@font-face ' + fname]: 1
                        //     }
                        // });
                    }

                    let atKey = `@font-face ${fname}`;
                    namesMap[atKey] = ffContents[fname];
                    newRules.push('font-family:' + ffContents[fname]);
                } else {
                    newRules.push(`${key}:${value}`);
                }
            } else {
                newRules.push(rule);
            }
        }
        return `@font-face{${newRules.join('')}}`;
    }).replace(atScrolllineReg, (match, key, content) => {
        if (!configs.checker.tmplClassCheck(key)) {

        }
        return `@scroll-time ${key}{${content}}`;
    });
    fileContent = fileContent.replace(cssContentReg, (_, content) => {
        let rules = content.split(ruleEndReg);
        let newContent = [];
        for (let rule of rules) {
            let parts = rule.split(':');
            if (parts.length == 2) {
                let [key, value] = parts;
                key = fixCssKeyName(key, newContent);
                key = key.trim();
                value = value.trim();
                value = value.replace(extractCounterFnReg, (_, $1, $2) => {
                    return $1 + '(' + genCssSelector($2, cssNamesKey, null, 'md5CssSelectorResult@common.string');
                });
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
                    let s = `@keyframes ${value}`;
                    let tn = namesMap[s];
                    if (tn) {
                        cssChecker.storeStyleUsed(file, file, {
                            atRules: {
                                [s]: tn
                            }
                        });
                        value = tn;
                    }
                    newContent.push(key + ':' + value);
                } else if (key.endsWith('animation-timeline')) {
                    let s = `@scroll-timeline ${value}`;
                    let tn = namesMap[s];
                    if (tn) {
                        cssChecker.storeStyleUsed(file, file, {
                            atRules: {
                                [s]: tn
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
                        let sk = `@keyframes ${s}`;
                        let tn = namesMap[sk];
                        if (tn) {
                            cssChecker.storeStyleUsed(file, file, {
                                atRules: {
                                    [sk]: tn
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
                            value = value.substring(0, n.start) + genCssSelector(n.content, cssNamesKey, null, 'md5CssSelectorResult@common.string') + value.substring(n.end);
                        }
                    }
                    newContent.push(`${key}:${value}`);
                } else if (key.startsWith('counter-')) {
                    value = value.replace(extractCounterNameReg, (m) => {
                        if (counterNameCanTransform(m)) {
                            return genCssSelector(m, cssNamesKey, null, 'md5CssSelectorResult@common.string');
                        }
                        return m;
                    });
                    newContent.push(`${key}:${value}`);
                } else {
                    newContent.push(`${key}:${value}`);
                }
            } else {
                newContent.push(rule);
            }
        }
        return '{' + newContent.join('') + '}';
    });
    //console.log(fileContent);
    return fileContent;
};
let genCssNamesKey = (file, ignorePrefix) => {
    //获取模块的id
    let cssId;
    if (configs.debug) {
        cssId = utils.extractModuleId(file, true) + path.extname(file);
        cssId = '_' + cssId.replace(slashReg, '_') + '_';
    } else {
        cssId = md5(file, 'md5CssFileResult');
    }
    //css前缀是配置项中的前缀加上模块的md5信息
    if (!ignorePrefix) {
        if (configs.hashedProjectName) {
            cssId = configs.hashedProjectName + '-' + cssId;
        }
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
        let prefix = configs.hashedProjectName ? configs.hashedProjectName + '-' : '';
        mappedName = md5(selector + '\x00' + cssNameKey, key || 'md5CssSelectorResult', prefix, false, reservedNames);
        if (configs.selectorDSEndReg.test(selector)) {
            mappedName += '-';
        }
    }
    return mappedName;
};

let hasRuleFromFile = async (file, rule, isVar, type, key) => {
    if (fs.existsSync(file)) {
        let i = await cssRead(file, {}, '');
        let rules = cssParser(i.content);
        if (isVar) {
            for (let v of rules.vars) {
                if (v.name == rule) {
                    return true;
                }
            }
            return false;
        } else {
            for (let r of rules.tokens) {
                if (r.type == type && (
                    !key || key == r.key
                ) && (r.name == rule ||
                    (configs.selectorDSEndReg.test(rule) &&
                        r.name.startsWith(rule)))) {
                    return true;
                }
            }
            return false;
        }
    }
    return false;
};

let refNameProcessor = async (relateFile, file, ext, name, e, origin) => {
    let silent = configs.selectorSilentErrorCss;
    if (file == 'scoped' && ext == '.style') {
        if (e) {
            let sname = e.globalCssNamesMap[name];
            if (!sname) {
                sname = silent ? storeAtReg(origin) : `["not found ${name} from @{${file}${ext}}"]`;
                cssChecker.storeStyleUsed(relateFile, '/' + file + ext, {
                    selectors: {
                        [name]: silent ? 0 : sname
                    }
                });
            } else {
                let f = e.globalCssDeclaredFiles.selectors[name] || '~~selector error~~';
                cssChecker.storeStyleUsed(relateFile, f, {
                    selectors: {
                        [name]: silent ? 0 : sname
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
                ['ref@:./b.css:good'] .name{

                }
            file='path/to/b.css';
            relateFile='path/to/a.css';

            b good a
        */
        file = path.resolve(path.dirname(relateFile) + sep + file + ext);
        //console.log(path.dirname(relateFile), file);
        if (e && configs.scopedCssMap[file]) {
            let sname = e.globalCssNamesMap[name];
            if (!sname) {
                sname = silent ? storeAtReg(origin) : `["not found ${name} from @{${file}}"]`;
            }
            cssChecker.storeStyleUsed(relateFile, file, {
                selectors: {
                    [name]: silent ? 0 : sname
                }
            });
            return sname;
        }
        let has = await hasRuleFromFile(file, name, false, 'class');
        if (!has) {
            if (!silent) {
                cssChecker.storeStyleUsed(relateFile, file, {
                    vars: {
                        [name]: silent ? 0 : name
                    }
                });
            }
            return storeAtReg(origin);
        }
        let p = name.replace(configs.selectorKeepNameReg, '$1');
        let t = name.replace(p, '');
        let id = genCssSelector(p, genCssNamesKey(file)) + t;
        cssChecker.storeStyleUsed(relateFile, file, {
            selectors: {
                [name]: silent ? 0 : id
            }
        });
        return id;
    }
};

let refProcessor = async (relateFile, file, ext, name, e, origin) => {
    return `:global(.${await refNameProcessor(relateFile, file, ext, name, e, origin)})`;
};

let processVar = key => {
    let isGlobal = false;
    for (let prefix of configs.cssGlobalVarPrefixes) {
        if (key.startsWith(prefix)) {
            isGlobal = true;
            break;
        }
    }
    if (!isGlobal &&
        key.startsWith(cssScopedVarPrefix)) {
        if (!configs.debug) {
            let prefix = '';
            if (configs.hashedProjectName) {
                prefix = configs.hashedProjectName + '-';
            }
            key = '--' + md5(key, 'md5CssVarsResult', prefix);
        }
        isGlobal = true;
    }
    return {
        isGlobal,
        key
    };
};
let varRefProcessor = async (relateFile, file, ext, name, e) => {
    let silent = configs.selectorSilentErrorCss;
    if (file == 'scoped' &&
        ext == '.style') {
        if (e) {
            let sname = e.globalCssVarsMap[name];
            if (!sname) {
                sname = silent ? storeAtReg(e.origin) : `"not found ${name} from @{${file}${ext}}"`;
                cssChecker.storeStyleUsed(relateFile, '/' + file + ext, {
                    vars: {
                        [name]: silent ? 0 : sname
                    }
                });
            } else {
                let f = e.globalCssDeclaredFiles.selectors[name] || '~~var error~~';
                cssChecker.storeStyleUsed(relateFile, f, {
                    vars: {
                        [name]: silent ? 0 : sname
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
                sname = silent ? storeAtReg(e.origin) : `"not found ${name} from @{${file}}"`;
            }
            cssChecker.storeStyleUsed(relateFile, file, {
                vars: {
                    [name]: silent ? 0 : sname
                }
            });
            return sname;
        }
        //这里可进行文件及规则的实现，对应文件有规则时，返回，否则原样返回
        let has = await hasRuleFromFile(file, name, true);
        if (!has) {
            if (!silent) {
                cssChecker.storeStyleUsed(relateFile, file, {
                    vars: {
                        [name]: silent ? 0 : name
                    }
                });
            }
            return storeAtReg(e.origin);
        }
        let id = genCssSelector(name, genCssNamesKey(file));
        id = '--' + id;
        cssChecker.storeStyleUsed(relateFile, file, {
            vars: {
                [name]: silent ? 0 : id
            }
        });
        return id;
    }
};
let atRuleRefProcessor = async (relateFile, file, ext, name, e) => {
    let used = '@' + e.atPrefix + ' ' + name;
    let silent = configs.selectorSilentErrorCss;
    if (file == 'scoped' && ext == '.style') {
        if (e) {
            let sname = e.globalCssAtRules[used];
            if (!sname) {
                sname = silent ? storeAtReg(e.origin) : `"not found @${name} from @{${file}${ext}}"`;
                cssChecker.storeStyleUsed(relateFile, '/' + file + ext, {
                    atRules: {
                        [used]: silent ? 0 : sname
                    }
                });
            } else {
                let f = e.globalCssDeclaredFiles.atRules[used];
                if (f) {
                    cssChecker.storeStyleUsed(relateFile, f, {
                        atRules: {
                            [used]: silent ? 0 : sname
                        }
                    });
                }
            }
            return sname;
        } else {
            throw new Error('[MXC Error(css-transform)] unsupport use scoped.style in ' + relateFile);
        }
    } else {
        file = path.resolve(path.dirname(relateFile) + sep + file + ext);
        if (e && configs.scopedCssMap[file]) {
            let sname = e.globalCssAtRules[used];
            if (!sname) {
                sname = silent ? storeAtReg(e.origin) : `"not found @${name} from @{${file}}"`;
            }
            cssChecker.storeStyleUsed(relateFile, file, {
                atRules: {
                    [used]: silent ? 0 : sname
                }
            });
            return sname;
        }
        //这里可进行文件及规则的实现，对应文件有规则时，返回，否则原样返回
        let has = await hasRuleFromFile(file, name, false, 'at-rule', e.atPrefix);
        if (!has) {
            if (!silent) {
                cssChecker.storeStyleUsed(relateFile, file, {
                    vars: {
                        [name]: silent ? 0 : name
                    }
                });
            }
            return storeAtReg(e.origin);
        }
        let cssNamesKey = genCssNamesKey(file);
        if (e.atPrefix == 'keyframes') {
            sname = genCssSelector(name, cssNamesKey, null, 'md5CssSelectorResult@rule_kf');
        } else if (e.atPrefix == 'font-face') {
            let fname = cssStringName.parseFont(name)[0];
            sname = cssStringName.stringifyFont([genCssSelector(fname, cssNamesKey, null, 'md5CssSelectorResult@rule_ff')]);
        } else {
            sname = silent ? used : `"not found @${name} from @{${file}}"`;
        }
        cssChecker.storeStyleUsed(relateFile, file, {
            atRules: {
                [used]: silent ? 0 : sname
            }
        });
        return sname;
    }
};
let commonStringRefProcessor = (relateFile, file, ext, rule) => {
    //console.log(relateFile,file,ext,rule);
    if (file != 'scoped' ||
        ext != '.style') {
        file = path.resolve(path.dirname(relateFile) + sep + file + ext);
    }
    if (configs.scopedCssMap[file]) {
        file = 'scoped.style';
    }
    let cssNameKey = genCssNamesKey(file);
    let sname = genCssSelector(rule, cssNameKey, null, 'md5CssSelectorResult@common.string');
    return sname;
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
    let header = ctx.header || {};
    let used = header.used || {};
    //console.log(pInfo);
    if (pInfo.nests.length) { //标记过于复杂的样式规则
        cssChecker.storeStyleComplex(ctx.file, pInfo.nests);
    }
    let tokens = pInfo.tokens;
    let modifiers = [];
    let tagsOrAttrs = Object.create(null),
        selectors = Object.create(null),
        vars = Object.create(null),
        atRules = Object.create(null);
    for (let token of tokens) {
        let id = token.name;
        if (token.type == 'tag') {
            if (!ignoreTags[id] &&
                !used[id]) { //标签或属性选择器
                tagsOrAttrs[id] = 1;
            }
        } else if (token.type == 'attr') {
            //[mx-view^="@./path/to/view"]
            let value = token.value;
            if (token.name == 'mx-view' ||
                token.name == 'mx5-view') {
                if (value &&
                    (value.startsWith('@') ||
                        value.startsWith('.'))) {
                    if (value.startsWith('.')) {
                        value = atViewPrefix + value;
                    }
                    let cssId = utils.extractModuleId(ctx.file);
                    let mId = atpath.resolvePath(value, cssId);
                    let newAttr = `[${mxPrefix}-view${token.ctrl || ''}=${token.quote}${mId}${token.quote}${token.ignoreCase ? ' i' : ''}]`;
                    modifiers.push({
                        start: token.start,
                        end: token.end,
                        content: newAttr
                    });
                } else {
                    modifiers.push({
                        start: token.start,
                        end: token.end,
                        content: `[${mxPrefix}-view${token.ctrl || ''}=${token.quote}${value}${token.quote}${token.ignoreCase ? ' i' : ''}]`
                    });
                }
            }
            //if (token.first) {
            id = '[' + id + ']';
            //}
            if (!ignoreTags[id] &&
                !used[id]) { //标签或属性选择器
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
            if (!used['.' + id]) {
                selectors[id] = result;
            }
        } else if (token.type == 'global') {
            modifiers.push({
                start: token.start,
                end: token.end,
                content: token.content
            });
        } else if (token.type == 'at-rule') {
            if (token.key == 'keyframes' ||
                token.key == 'scroll-timeline') {
                let result = id;
                let p, i;
                p = id.replace(configs.selectorKeepNameReg, '$1');
                let t = id.replace(p, '');
                i = genCssSelector(p, ctx.namesKey, null, 'md5CssSelectorResult@rule_kf');
                if (t) {
                    result = i + t;
                    atRules[`@${token.key} ${p}`] = i;
                } else {
                    result = i;
                }
                modifiers.push({
                    start: token.start,
                    end: token.end,
                    content: result
                });
                atRules[`@${token.key} ${id}`] = result;
            }
        }
    }

    let vs = pInfo.vars;
    //console.log(vs);
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
    css = cssAtRuleProcessor(css, ctx.namesKey, ctx.file, atRules);

    return {
        content: css,
        tagsOrAttrs,
        selectors,
        atRules,
        vars
    };
};
module.exports = {
    recoverAtReg,
    refProcessor,
    refNameProcessor,
    atRuleRefProcessor,
    cssContentProcessor,
    genCssNamesKey,
    genCssSelector,
    varRefProcessor,
    processVar,
    commonStringRefProcessor
}