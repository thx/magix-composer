/*
    样式处理入口
    读取js代码中的样式占位规则，把占位规则处理成真实的内容
 */
let cssnano = require('cssnano');
let path = require('path');
let configs = require('./util-config');
let atpath = require('./util-atpath');
let cssFileRead = require('./css-read');
let deps = require('./util-deps');
let cssChecker = require('./checker-css');
let cssGlobal = require('./css-global');
let cssComment = require('./css-comment');
let utils = require('./util');
let cloneAssign = utils.cloneAssign;
let cssTransform = require('./css-transform');
let {
    styleInJSFileReg,
    cssVarRefReg,
    cssRefReg
} = require('./util-const');
//处理css文件
//另外一个思路是：解析出js中的字符串，然后在字符串中做替换就会更保险，目前先不这样做。
//https://github.com/Automattic/xgettext-js
//处理js文件中如 'global@x.less' '@x.less:selector' 'ref@../x.scss' 等各种情况
//"abc(@style.css:xx)yyzz"
//[ref="@../default.css:inmain"] .open{
//    color:red
//}
let cssVarReg = /var\s*\(\s*([^)\s]+)\s*(?=[,)])/g;
let sep = path.sep;


module.exports = e => {
    let globalNamesMap = Object.create(null);
    let globalVarsMap = Object.create(null);
    let cssContentCache = Object.create(null);
    configs.scopedCss.forEach(sc => {
        deps.addFileDepend(sc, e.from, e.to);
        cssChecker.hostAddStyle(e.from, sc);
    });
    return cssGlobal.process({
        context: e
    }).then(gInfo => {
        return new Promise((resolve, reject) => {
            cloneAssign(globalNamesMap, gInfo.namesMap);
            cloneAssign(globalVarsMap, gInfo.varsMap);
            e.cssNamesMap = globalNamesMap;
            e.cssVarsMap = globalVarsMap;
            styleInJSFileReg.lastIndex = 0;
            if (styleInJSFileReg.test(e.content)) { //有需要处理的@规则
                styleInJSFileReg.lastIndex = 0;
                let count = 0;
                let tempMatchToFile = Object.create(null);
                let folder = path.dirname(e.from);
                let storeHostUsed = (scoped, file, selectors, vars, varsIsGlobal) => {
                    if (scoped) {
                        if (selectors) {
                            let dest = gInfo.declaredFiles.selectors[selectors];
                            if (dest) {
                                cssChecker.storeHostUsed(e.from, dest, {
                                    selectors: {
                                        [selectors]: 1
                                    }
                                });
                            } else {
                                cssChecker.storeUnexist(e.from, 'selectors ' + selectors + ' from scoped.style');
                            }
                        }
                        if (vars) {
                            if (varsIsGlobal) {
                                cssChecker.storeStyleGlobalVars(e.from, vars);
                            } else {
                                let dest = gInfo.declaredFiles.vars[s];
                                if (dest) {
                                    cssChecker.storeHostUsed(e.from, dest, {
                                        vars: {
                                            [s]: 1
                                        }
                                    });
                                } else {
                                    cssChecker.storeUnexist(e.from, 'vars ' + s + ' from scoped.style');
                                }
                            }
                        }
                    } else {
                        let temp = {};
                        if (selectors) {
                            temp.selectors = {
                                [selectors]: 1
                            };
                        }
                        if (vars) {
                            temp.vars = {
                                [vars]: 1
                            };
                        }
                        cssChecker.storeHostUsed(e.from, file, temp);
                    }
                };
                let processVars = (c, f, lf) => {
                    return c.replace(cssVarReg, (m, key) => {
                        let r = globalVarsMap[key];
                        if (!r) {
                            if (cssVarRefReg.test(key)) {
                                while (cssVarRefReg.test(m)) {
                                    m = m.replace(cssVarRefReg, (_1, _2, fn, ext, key) => {
                                        return cssTransform.varRefProcessor(lf, fn, ext, key, {
                                            globalCssVarsMap: gInfo.varsMap
                                        });
                                    });
                                }
                                return m;
                            } else {
                                let { isGlobal, key: k2 } = cssTransform.processVar(key);
                                //console.log(lf,key,k2,m);
                                if (isGlobal) {
                                    r = k2;
                                    cssChecker.storeStyleGlobalVars(lf, key);
                                } else {
                                    //cssChecker.storeStyleGlobalVars(lf, key);
                                    return m;
                                }
                            }
                        }
                        return `var(${r}`;
                    });
                };
                let resume = () => {
                    e.content = e.content.replace(styleInJSFileReg, (m, left, q, prefix, name, ext, key, right, tail) => {
                        if (!prefix &&
                            !key &&
                            (left != '(' || right != ')')) {
                            m = m.replace('\x12@', '@');
                            return m;
                        }
                        let info = tempMatchToFile[m];
                        let { file,
                            scopedStyle,
                            shortCssFile } = info;
                        let fileName = path.basename(file);
                        let r = cssContentCache[file];
                        //从缓存中获取当前文件的信息
                        //如果不存在就返回一个不存在的提示
                        if (!r.exists) {
                            m = name + ext;
                            cssChecker.storeUnexist(e.from, m);
                            if (key) {
                                return (q || '') + `unfound file:${name}${ext}` + (q || '') + (tail || '');
                            }
                            return [(left || '') + '\'$throw_' + name + ext + '\'', q + 'unfound style file:' + name + ext + q + (right || '')];
                        }
                        let fileContent = r.css;
                        let cssNamesKey = cssTransform.genCssNamesKey(file);
                        let cssNamesMap,
                            cssVarsMap,
                            newContent,
                            addToGlobalCSS;
                        if (scopedStyle) {
                            cssNamesMap = globalNamesMap;
                            cssVarsMap = globalVarsMap;
                        } else {
                            addToGlobalCSS = key ? false : true; //有后缀时也不添加到全局
                            if (!r.namesMap) {
                                cssNamesMap = Object.create(null);
                                cssVarsMap = Object.create(null);
                                fileContent = fileContent.replace(cssRefReg, (m, q, f, ext, selector) => {
                                    let s = cssTransform.refProcessor(file, f, ext, selector, {
                                        globalCssNamesMap: globalNamesMap,
                                        globalCssDeclaredFiles: gInfo.declaredFiles
                                    });
                                    return s;
                                });
                                try {
                                    newContent = cssTransform.cssContentProcessor(fileContent, {
                                        shortFile: shortCssFile,
                                        file,
                                        namesKey: cssNamesKey,
                                        namesMap: cssNamesMap,
                                        varsMap: cssVarsMap
                                    });
                                } catch (ex) {
                                    reject(ex);
                                }
                                cssChecker.storeStyleDeclared(file, {
                                    vars: newContent.vars,
                                    selectors: newContent.selectors,
                                    tagsOrAttrs: newContent.tagsOrAttrs
                                });
                                fileContent = newContent.content;
                                r.namesMap = cssNamesMap;
                                r.varsMap = cssVarsMap;
                                r.fileContent = fileContent;
                                if (addToGlobalCSS) {
                                    cloneAssign(globalNamesMap, cssNamesMap);
                                    cloneAssign(globalVarsMap, cssVarsMap);
                                }
                            } else {
                                cssNamesMap = r.namesMap;
                                cssVarsMap = r.varsMap;
                                fileContent = r.fileContent;
                                if (addToGlobalCSS) {
                                    cloneAssign(globalNamesMap, cssNamesMap);
                                    cloneAssign(globalVarsMap, cssVarsMap);
                                }
                            }
                        }
                        let replacement;
                        if (prefix == 'ref') { //如果是引用css则什么都不用做
                            replacement = '';
                            tail = '';
                        } else if (key) { //仅读取文件中的某个名称
                            let c;
                            if (key.startsWith('--')) {
                                let { isGlobal, key: k2 } = cssTransform.processVar(key);
                                if (isGlobal) {
                                    c = k2;
                                } else {
                                    c = cssVarsMap[key];
                                    if (!c) {
                                        if (configs.selectorSilentErrorCss) {
                                            c = key;
                                        } else {
                                            c = 'unfound-[' + key + ']-from-' + fileName;
                                        }
                                    }
                                }
                                storeHostUsed(scopedStyle, file, null, key, isGlobal);
                            } else {
                                c = cssNamesMap[key];
                                if (!c) {
                                    if (configs.selectorSilentErrorCss) {
                                        c = key;
                                    } else {
                                        c = 'unfound-[' + key + ']-from-' + fileName;
                                    }
                                }
                                storeHostUsed(scopedStyle, file, key);
                            }
                            replacement = q + c + q;
                        } else { //输出整个css文件内容
                            let uniqueKey = '';
                            if (prefix != 'compiled') {
                                uniqueKey = JSON.stringify(cssNamesKey) + ',';
                            }
                            if (configs.debug) {
                                if (r.map) {
                                    fileContent += r.map;
                                    fileContent = processVars(fileContent, shortCssFile, file);
                                    let c = JSON.stringify(fileContent);
                                    c = configs.applyStyleProcessor(c, shortCssFile, cssNamesKey, e);
                                    replacement = uniqueKey + c;
                                } else if (r.styles) {
                                    replacement = '[';
                                    for (let s of r.styles) {
                                        s.css = processVars(s.css, s.short, s.file);
                                        let c = JSON.stringify(s.css + (s.map || ''));
                                        c = configs.applyStyleProcessor(c, s.short, s.key, e);
                                        replacement += JSON.stringify(s.key) + ',' + c + ',';
                                    }
                                    replacement = replacement.slice(0, -1);
                                    replacement += ']';
                                } else {
                                    fileContent = processVars(fileContent, shortCssFile, file);
                                    let c = JSON.stringify(fileContent);
                                    c = configs.applyStyleProcessor(c, shortCssFile, cssNamesKey, e);
                                    replacement = uniqueKey + c;
                                }
                            } else {
                                fileContent = processVars(fileContent, shortCssFile, file);
                                let c = JSON.stringify(fileContent);
                                c = configs.applyStyleProcessor(c, shortCssFile, cssNamesKey, e);
                                replacement = uniqueKey + c;
                            }
                        }
                        tail = tail ? tail : '';
                        return (left || '') + replacement + (right || '') + tail;
                    });
                    resolve(e);
                };
                let check = () => {
                    count--;
                    if (!count && !check.$resume) { //依赖的文件全部读取完毕
                        check.$resume = true;
                        resume();
                    }
                };
                let setFileCSS = (file, shortCssFile, css) => {
                    let p = configs.cssContentProcessor(css, shortCssFile, e);
                    if (!p.then) {
                        p = Promise.resolve(p);
                    }
                    p.then(css => {
                        cssContentCache[file].css = css;
                        check();
                    }, error => {
                        if (e.contentInfo) {
                            file += '@' + e.contentInfo.fileName;
                        }
                        reject(error);
                        check();
                    });
                };
                let processFile = (match, name, ext, file) => {
                    count++; //记录当前文件个数，因为文件读取是异步，我们等到当前模块依赖的css都读取完毕后才可以继续处理

                    let scopedStyle = false;
                    let refInnerStyle = e.contentInfo && name == 'style';
                    let shortCssFile;
                    if (name == 'scoped' && ext == '.style') {
                        file = name + ext;
                        scopedStyle = true;
                        shortCssFile = file;
                    } else {
                        name = atpath.resolveName(name, e.moduleId); //先处理名称
                        if (refInnerStyle) {
                            file = e.from;
                        } else {
                            e.fileDeps[file] = 1;
                        }
                        shortCssFile = file.replace(configs.moduleIdRemovedPath, '').substring(1);
                    }
                    tempMatchToFile[match] = {
                        scopedStyle,
                        file,
                        shortCssFile
                    };
                    if (!cssContentCache[file]) { //文件尚未读取
                        cssContentCache[file] = 1;
                        let promise;
                        if (scopedStyle) {
                            promise = Promise.resolve({
                                exists: true,
                                content: gInfo.style,
                                styles: gInfo.styles
                            });
                        } else {
                            promise = cssFileRead(file, e, match, ext, refInnerStyle);
                        }
                        promise.then(info => {
                            //写入缓存，因为同一个view.js中可能对同一个css文件多次引用
                            cssContentCache[file] = {
                                exists: info.exists,
                                css: ''
                            };
                            if (info.exists && info.content) {
                                cssContentCache[file].map = info.map;
                                cssContentCache[file].styles = info.styles;
                                if (!configs.debug) {
                                    cssnano.process(info.content,
                                        Object.assign({}, configs.cssnano)
                                    ).then(r => {
                                        setFileCSS(file, shortCssFile, r.css);
                                    }, error => {
                                        if (e.contentInfo) {
                                            file += '@' + e.contentInfo.fileName;
                                        }
                                        reject(error);
                                        check();
                                    });
                                } else {
                                    let cssStr = info.content;
                                    cssStr = cssComment.clean(cssStr);
                                    setFileCSS(file, shortCssFile, cssStr);
                                }
                            } else {
                                check();
                            }
                        }).catch(reject);
                    } else {
                        check();
                    }
                };
                let tasks = [];
                let doTask = () => {
                    if (tasks.length) {
                        let i = 0;
                        while (i < tasks.length) {
                            processFile.apply(null, tasks[i++]);
                        }
                    } else {
                        resume();
                    }
                };
                e.content.replace(styleInJSFileReg, (m, left, q, prefix, name, ext, key, right) => {
                    if ((key || prefix) ||
                        (left == '(' && right == ')')) {
                        //console.log(name);
                        name = atpath.resolveName(name, e.moduleId);
                        let file = path.resolve(folder + sep + name + ext);
                        if (configs.scopedCssMap[file]) {
                            name = 'scoped';
                            ext = '.style';
                        }
                        if (name != 'scoped' ||
                            ext != '.style') {
                            cssChecker.hostAddStyle(e.from, file);
                            deps.addFileDepend(file, e.from, e.to);
                        }
                        tasks.push([m, name, ext, file]);
                    }
                });
                doTask();
            } else {
                resolve(e);
            }
        });
    });
};