/*
    增加mx-tag自定义标签的处理，方便开发者提取公用的html片断
 */
/*
    <mx-vframe src="app/views/default" pa="{{@a}}" pb="{{@b}}" />
    <mx-vframe src="app/views/default" pa="{{@a}}" pb="{{@b}}">
        loading...
    </mx-vframe>
 */
let fs = require('fs');
let path = require('path');
let url = require('url');
let qs = require('querystring');
let configs = require('./util-config');
let tmplCmd = require('./tmpl-cmd');
let util = require('util');
let chalk = require('chalk');
let utils = require('./util');
let tmplParser = require('./tmpl-parser');
let customConfig = require('./tmpl-customtag-cfg');
let atpath = require('./util-atpath');
let {
    quickDirectTagName,
    quickGroupTagName,
    htmlAttrParamPrefix,
    htmlAttrParamFlag,
    galleryProcessed,
    galleryDynamic,
    artCommandReg,
    galleryAttrAppendFlag,
    tmplCondPrefix,
    tmplGroupTag,
    tmplGroupKeyAttr,
    tmplGroupUseAttr,
    styleInHTMLReg,
    atViewPrefix
} = require('./util-const');
let deps = require('./util-deps');
let sep = path.sep;
let { selfCloseTags } = require('./html-tags');
let htmlAttrs = require('./html-attrs');
let uncheckTags = {
    'mx-vframe': 1,
    'mx-link': 1,
    'mx-group': 1,
    'mx-html': 1
};
let skipTags = {
    [quickGroupTagName]: 1,
    [quickDirectTagName]: 1
};
let tagReg = /\btag\s*=\s*"([^"]+)"/;
let attrNameValueReg = /(^|\s|\x07)([^=\/\s\x07]+)(?:\s*=\s*(["'])([\s\S]*?)\3)?/g;
let inputTypeReg = /\btype\s*=\s*(['"])([\s\S]+?)\1/;
let attrAtStartContentHolderReg = /\x03/g;
let mxViewAttrHolderReg = /\x02/g;
let atReg = /@/g;
let mxViewAttrReg = /\bmx-view\s*=\s*(['"])([^'"]*?)\1/;
let valuableAttrReg = /\x07\d+\x07\s*\?\?\s*/;
let booleanAttrReg = /\x07\d+\x07\s*\?\s*/;
let wholeCmdReg = /^(?:\x07\d+\x07)+$/;
let hasCmdReg = /\x07\d+\x07/;
let httpProtocolReg = /^(?:https?:)?\/\//i;
let classReg = /\bclass\s*=\s*"([^"]+)"/g;
let entities = {
    '>': '&gt;',
    '<': '&lt;'
};
let decodeEntities = {
    '&gt;': '>',
    '&lt;': '<'
};
let encodeRegexp = /[<>]/g;
let decodeRegexp = /&(lt|gt);/g;

let encodeEntities = m => m.replace(encodeRegexp, _ => entities[_]);
let toParamKey = key => {
    key = htmlAttrParamPrefix + key.substring(1);
    return key;
};
let relativeReg = /\.{1,2}\//g;
let addAtIfNeed = tmpl => {
    return tmpl.replace(relativeReg, (m, offset, c) => {
        c = tmpl[offset - 1];
        if (c == '@' || c == '/' || c == '\x03') {
            return m;
        }
        return atViewPrefix + m;
    });
};
let transformPathToModuleId = (base, fn) => {
    //console.log('bf', base, fn);
    if (fn.startsWith('.') &&
        fn.includes('/')) {
        let f = path.join(base, fn);
        return utils.extractModuleId(f);
    }
    return fn;
};
let innerView = (result, info, gRoot, extInfo, actions, e) => {
    //console.log(info);
    if (info) {
        let part = gRoot + info.path;
        let prefix = path.isAbsolute(part) ? '' : configs.commonFolder + sep;
        result.mxView = path.relative(path.dirname(e.from), prefix + part);
    }
    //console.log('xx', result.mxView);
    if (util.isObject(info) &&
        util.isFunction(info.processor)) {
        let html = info.processor(result, actions, extInfo) || '';
        let refProcessor = (m, fn, tail, selector) => {
            if (info.base) {
                //console.log(info.base, fn);
                let fId = transformPathToModuleId(info.base, fn);
                return `@:${fId}${tail}:${selector}`;
            }
            return m;
        };
        let classProcessor = m => m.replace(styleInHTMLReg, refProcessor);
        html = html.replace(classReg, classProcessor);
        return html;
    }
    let tag = 'div';
    let hasTag = false;
    let attrs = result.attrs.replace(tagReg, (m, t) => {
        tag = t;
        hasTag = true;
        return '';
    });
    if (!hasTag && info && info.tag) {
        tag = info.tag;
    }
    if (tag == 'input') {
        let m = attrs.match(inputTypeReg);
        if (m) {
            type = m[2];
        } else if (info && info.type) {
            type = info.type;
        }
    }
    let hasPath = false;
    let processedAttrs = {};
    attrs = attrs.replace(attrNameValueReg, (m, prefix, key, q, value) => {
        prefix = prefix || '';
        if (!info) {
            if (key == 'src') {
                hasPath = true;
                return prefix + 'mx-view=' + q + value + q;
            }
        }
        let viewKey = false;
        let originalKey = key;
        if (key.startsWith(htmlAttrParamFlag)) {
            key = toParamKey(key);
            viewKey = true;
        }
        //处理其它属性
        if (info) {
            let pKey = galleryAttrAppendFlag + originalKey;
            if (info[originalKey]) {//如果配置中允许覆盖，则标记已经处理过
                processedAttrs[originalKey] = 1;
            } else if (info[pKey]) {//如果配置中追加
                processedAttrs[pKey] = 1;//标记处理过
                if (q === undefined &&
                    value === undefined) {//对于unary的我们要特殊处理下
                    q = '"';
                    value = '';
                }
                value += info[pKey];
            }
        }
        if (q === undefined && viewKey) {
            q = '"';
            value = 'true';
        }
        return prefix + key + (q === undefined && !viewKey ? '' : '=' + q + value + q);
    });
    if (info) {
        for (let p in info) {
            //from configs
            if (p != 'tag' &&
                p != 'path' &&
                !processedAttrs[p]) {
                let v = info[p];
                if (p.startsWith(galleryAttrAppendFlag)) {
                    p = p.slice(1);
                } else if (p.startsWith(htmlAttrParamFlag)) {
                    p = toParamKey(p);
                }
                attrs += ` ${p}="${v}"`;
            }
        }
    }
    if (!hasPath && info) {
        attrs += ' mx-view="' + result.mxView + '"';
    }

    let html = `<${tag} ${attrs}`;
    let unary = selfCloseTags.hasOwnProperty(tag);
    if (unary) {
        html += `/>`;
    } else {
        html += `>${result.content}`;
        html += `</${tag}${result.endAttrs}>`;
    }
    //console.log(html);
    return html;
};
let innerLink = result => {
    let tag = 'a';
    let href = '', paramKey = 0;
    let attrs = result.attrs,
        needAddRel = true;
    attrs = attrs.replace(attrNameValueReg, (m, prefix, key, q, value) => {
        if (key == 'to') {
            href = value;
            return '';
        }
        if (key == 'tag') {
            tag = value;
            return '';
        }
        if (key == 'rel') {
            needAddRel = false;
        }
        return m;
    });
    attrs = attrs.replace(attrNameValueReg, (m, prefix, key, q, value) => {
        prefix = prefix || '';
        if (key.startsWith(htmlAttrParamFlag)) {
            key = toParamKey(key);
            paramKey = 1;
        }
        if (q === undefined && paramKey) {
            q = '"';
            value = '';
        }
        return prefix + key + '=' + q + value + q;
    });
    //console.log(attrs, needAddRel);
    if (needAddRel) {
        attrs += ' rel="noopener noreferrer"';
    }
    let html = `<${tag} href="${href}" ${attrs}`;
    let unary = selfCloseTags.hasOwnProperty(tag);
    if (unary) {
        html += `/>`;
    } else {
        html += `>${result.content}`;
        html += `</${tag}${result.endAttrs}>`;
    }
    return html;
};
let innerGroup = (result) => {
    let tag = tmplGroupTag;
    let newAttrs = ``;
    result.attrs.replace(attrNameValueReg, (m, prefix, key, q, value) => {
        if (key == 'use') {
            //使用场景下，清空内容
            result.content = '';
            newAttrs += ` ${tmplGroupUseAttr}="${value}"`;
        } else if (key == 'name') {
            newAttrs += ` ${tmplGroupKeyAttr}="${value}"`;
        } else {
            newAttrs += ` ${key}${q ? `="${value}"` : ''}`;
        }
    });
    return `<${tag} ${newAttrs}>${result.content}</${tag}${result.endAttrs}>`;
};
module.exports = {
    process(tmpl, extInfo, e) {
        let cmdCache = Object.create(null);
        let galleriesMap = configs.galleries;
        let tmplConditionAttrs = Object.create(null);
        let tmplConditionAttrsIndex = 0;
        let tempSkipTags = Object.create(null);
        e.tmplConditionAttrs = tmplConditionAttrs;
        e.tmplComponents = [];
        let actions = {
            getTokens(content) {
                return tmplParser(content, e.shortHTMLFile);
            },
            isWholeCmd(cmd) {
                return wholeCmdReg.test(cmd);
            },
            hasCmd(cmd) {
                return hasCmdReg.test(cmd);
            },
            recoverCmd(cmd) {
                return tmplCmd.toArtCmd(cmd, cmdCache);
            },
            readCmd(cmd) {
                return tmplCmd.extractCmdContent(cmd, cmdCache);
            },
            recoverHTML(cmd) {
                return cmd.replace(decodeRegexp, _ => decodeEntities[_]);
            },
            buildCmd(line, operate, art, content) {
                return tmplCmd.buildCmd(line, operate, art, content);
            },
            buildAttrs(attrs, cond) {
                let attrStr = '';
                for (let p in attrs) {
                    let v = attrs[p];
                    let resolve = cond ? cond(p, v) : v;
                    if (resolve != null &&
                        resolve !== false) {
                        if (resolve === true) {
                            resolve = '';
                        } else {
                            resolve = '="' + resolve + '"';
                        }
                        attrStr += ' ' + p + resolve;
                    }
                }
                return attrStr;
            }
        };
        let updateOffset = (node, content) => {
            let pos = node.start,
                offset = content.length - (node.end - node.start);
            let l = nodes => {
                if (nodes) {
                    for (let n of nodes) {
                        l(n.children);
                        if (n !== node) {
                            if (n.start > pos) {
                                n.start += offset;
                            }
                            if (n.end > pos) {
                                n.end += offset;
                            }
                            if (n.hasAttrs) {
                                if (n.attrsStart > pos) {
                                    n.attrsStart += offset;
                                }
                                if (n.attrsEnd > pos) {
                                    n.attrsEnd += offset;
                                }
                            }
                            if (n.hasContent) {
                                if (n.contentStart > pos) {
                                    n.contentStart += offset;
                                }
                                if (n.contentEnd > pos) {
                                    n.contentEnd += offset;
                                }
                            }
                        }
                    }
                }
            };
            l(tokens);
        };
        let getTagInfo = (n, map) => {
            let content = '',
                attrs = '';
            //console.log(tmpl,n);
            if (n.hasAttrs) {
                attrs = tmpl.substring(n.attrsStart, n.attrsEnd);
            }
            if (n.hasContent) {
                content = tmpl.substring(n.contentStart, n.contentEnd);
            }
            let tag = n.tag;
            let oTag = tag;
            if (n.pfx) {
                tag = tag.substring(n.pfx.length + 1);
            }
            let tags = tag.split('.');
            let mainTag = tags.shift();
            //console.log(tags);
            let subTags = tags.length ? tags : ['index'];
            let result = {
                id: n.id,
                pId: n.pId,
                prefix: n.pfx,
                group: n.group,
                unary: n.unary,
                //first: n.first,
                //last: n.last,
                //firstElement: n.firstElement,
                //lastElement: n.lastElement,
                shared: n.shared,//共享数据
                tag: oTag,
                mainTag,
                subTags,
                attrs,
                endAttrs: n.endAttrs || '',
                attrsKV: n.attrsKV,
                content,
                nodesMap: map
            };
            /*
            shared设计
            在处理自定义标签时，如
            <mx-table>
                <mx-table.col/>
                <mx-table.rows/>
            </mx-table>
            先处理mx-table.col，在处理mx-table.col时，可以通过节点间关系找到父节点mx-table，此时可以在mx-table节点上挂一些共享数据，供其它节点使用

            后处理mx-table节点
             */
            return result;
        };

        let processCustomTagOrAttr = (n, map, isCustomAttr) => {
            let result = getTagInfo(n, map);
            if (configs.components[n.pfx + 'Root']) {
                if (!tempSkipTags[result.tag]) {
                    tempSkipTags[result.tag] = 1;
                    let jsFile = configs.components[n.pfx + 'Root'] + result.tag;
                    if (!httpProtocolReg.test(jsFile)) {
                        //console.log(jsFile);
                        jsFile = utils.extractModuleId(jsFile);
                    }
                    e.tmplComponents.push(jsFile);
                }
            } else if (!skipTags[result.tag]) {
                let content = result.content;
                let fn = galleriesMap[result.tag] || configs.customTagOrAttrProcessor;
                //console.log('xxx');
                let customContent = fn(result, actions, extInfo, e);
                if (!customContent && !isCustomAttr) {
                    skipTags[result.tag] = 1;
                    customContent = content;
                }
                if (content != customContent) {
                    content = customContent || '';
                    tmpl = tmpl.substring(0, n.start) + content + tmpl.substring(n.end);
                    updateOffset(n, content);
                }
            }
        };
        let processGalleryTag = (n, map) => {
            let result = getTagInfo(n, map);
            let content = result.content;
            let hasGallery = galleriesMap.hasOwnProperty(n.pfx + 'Root');
            let gRoot = galleriesMap[n.pfx + 'Root'] || '';
            let gMap = galleriesMap[n.pfx + 'Map'] || (galleriesMap[n.pfx + 'Map'] = {});
            if (!uncheckTags.hasOwnProperty(result.tag)) {
                let vpath = (n.group ? '' : n.pfx + '-') + result.mainTag;
                if (result.subTags.length) {
                    vpath += '/' + result.subTags.join('/');
                }
                if (hasGallery) {
                    let i = gMap[result.tag];
                    if ((!i || !i[galleryProcessed])
                        && !util.isFunction(i)) {
                        let subs = result.subTags.slice(0, -1);
                        if (subs.length) {
                            subs = subs.join(sep);
                        } else {
                            subs = '';
                        }
                        let main = (n.group ? '' : n.pfx + '-') + result.mainTag;
                        let cpath = path.join(configs.commonFolder, gRoot, main, subs);
                        //console.log(cpath);
                        if (fs.existsSync(cpath)) {
                            let {
                                cfg,
                                file: configFile
                            } = customConfig(cpath, main);
                            //console.log(cfg, configFile);
                            if (cfg.hasOwnProperty(result.tag)) {
                                let ci = cfg[result.tag];
                                if (util.isFunction(ci)) {
                                    ci = {
                                        processor: ci,
                                        file: configFile,
                                        base: path.dirname(configFile)
                                    };
                                }
                                ci[galleryDynamic] = configFile;
                                configs.galleriesDynamicRequires[configFile] = ci;
                                gMap[result.tag] = ci;
                            } else if (!i) {
                                gMap[result.tag] = {
                                    path: vpath
                                };
                            }
                        } else {
                            //当文件不存在时，不检查，直接使用用户配置的路径
                            gMap[result.tag] = Object.assign({}, i, {
                                path: vpath
                            });
                        }
                    }
                } else {
                    uncheckTags[result.tag] = {
                        resolve: `${n.pfx}Root or ${n.pfx}Map`,
                        msg: 'missing config galleries'
                    };
                }
                if (gMap.hasOwnProperty(result.tag)) {
                    let i = gMap[result.tag];
                    if (!i[galleryProcessed]) {
                        if (util.isFunction(i)) {
                            i = {
                                processor: i
                            };
                            gMap[result.tag] = i;
                        }
                        if (!i.path) {
                            i.path = vpath;
                        }
                        i[galleryProcessed] = 1;
                    }
                    if (i[galleryDynamic]) {
                        deps.addConfigDepend(i[galleryDynamic], e.from, e.to);
                    }
                }
            }
            let tip = uncheckTags[result.tag];
            if (tip && tip !== 1) {
                console.log(chalk.red('[MXC Error(tmpl-custom)] can not process tag: ' + result.tag), 'at', chalk.magenta(e.shortHTMLFile), tip.msg, chalk.magenta(tip.resolve));
            }
            let update = false;
            if (n.pfx == 'mx') {
                if (result.mainTag == 'vframe') {
                    content = innerView(result);
                    update = true;
                } else if (result.mainTag == 'link') {
                    content = innerLink(result, extInfo);
                    update = true;
                } else if (result.mainTag == 'group') {
                    content = innerGroup(result, extInfo);
                    update = true;
                }
            }
            if (!update && gMap.hasOwnProperty(result.tag)) {
                content = innerView(result, gMap[result.tag], gRoot, extInfo, actions, e);
                update = true;
            }
            if (update) {
                tmpl = tmpl.substring(0, n.start) + content + tmpl.substring(n.end);
                //console.log(tmpl);
                //throw new Error('abc');
                updateOffset(n, content);
            }
        };
        let processCondAttrs = n => {
            let result = getTagInfo(n);
            let update = false;
            let content = '';
            let tag = result.tag;
            let attrs = result.attrs;
            attrs = attrs.replace(attrNameValueReg, (m, prefix, key, q, content) => {
                prefix = prefix || '';
                let valuable = valuableAttrReg.test(content);
                let boolean = booleanAttrReg.test(content);
                if (valuable || boolean) {
                    let cs = content.split(valuable ? '??' : '?');
                    let [cond, ext] = cs;
                    update = true;
                    cond = cond.trim();
                    ext = ext.trim();
                    let extract = tmplCmd.extractCmdContent(cond.trim(), cmdCache);
                    let condKey = '';
                    if (!extract.succeed) {
                        console.log(chalk.red('[MXC Tip(tmpl-custom)] check condition ' + tmplCmd.recover(cond, cmdCache)), 'at', chalk.magenta(e.shortHTMLFile));
                    } else {
                        condKey = `\x1c${tmplConditionAttrsIndex++}\x1c`;
                        tmplConditionAttrs[condKey] = {
                            hasExt: ext,
                            valuable,
                            boolean,
                            attrName: key
                        };
                    }
                    return ` ${tmplCondPrefix}${condKey}="${cond}" ${prefix}${condKey}${key}=${q}${ext}${q}`;
                }
                return m;
            });
            if (update) {
                let html = `<${tag} ${attrs}`;
                let unary = result.unary;
                if (unary) {
                    html += `/`;
                }
                html += `>${result.content}`;
                if (!unary) {
                    html += `</${tag}${result.endAttrs}>`;
                }
                content = html;
                tmpl = tmpl.substring(0, n.start) + content + tmpl.substring(n.end);
                updateOffset(n, content);
            }
        };
        let processEncodeAttr = n => {
            let result = getTagInfo(n);
            let content = '';
            let tag = result.tag;
            let attrs = result.attrs;
            attrs = attrs.replace(attrNameValueReg, encodeEntities);
            let html = `<${tag} ${attrs}`;
            let unary = result.unary;
            if (unary) {
                html += `/`;
            }
            html += `>${result.content}`;
            if (!unary) {
                html += `</${tag}${result.endAttrs}>`;
            }
            content = html;
            tmpl = tmpl.substring(0, n.start) + content + tmpl.substring(n.end);
            updateOffset(n, content);
        };
        let processParamsAttrs = n => {
            let result = getTagInfo(n);
            let update = false;
            let content = '';
            let tag = result.tag;
            let attrs = result.attrs;
            attrs = attrs.replace(attrNameValueReg, (m, prefix, key, q, content) => {
                prefix = prefix || '';
                if (key.startsWith(htmlAttrParamFlag)) {
                    update = true;
                    m = prefix + toParamKey(key) + (q ? ('=' + q + content + q) : '');
                }
                return m;
            });
            if (update) {
                let html = `<${tag} ${attrs}`;
                let unary = result.unary;
                if (unary) {
                    html += `/`;
                }
                html += `>${result.content}`;
                if (!unary) {
                    html += `</${tag}${result.endAttrs}>`;
                }
                content = html;
                tmpl = tmpl.substring(0, n.start) + content + tmpl.substring(n.end);
                updateOffset(n, content);
            }
        };
        let processAtAttrContents = n => {
            let result = getTagInfo(n);
            let content = '';
            let tag = result.tag;
            let attrs = result.attrs;
            //console.log('before', attrs);
            attrs = attrs.replace(attrNameValueReg, m => {
                m = m.replace(styleInHTMLReg, (_, fn, tail, selector) => {
                    let b = path.dirname(e.srcHTMLFile);
                    let fId = transformPathToModuleId(b, fn);
                    return atViewPrefix.replace(atReg, '\x03') + `${fId}${tail}:${selector}`;
                });
                return atpath.resolveContent(m, e.moduleId)
                    .replace(atReg, '\x03');
            });
            //console.log(attrs);
            let html = `<${tag} ${attrs}`;
            let unary = result.unary;
            if (unary) {
                html += `/`;
            }
            html += `>${result.content}`;
            if (!unary) {
                html += `</${tag}${result.endAttrs}>`;
            }
            content = html;
            tmpl = tmpl.substring(0, n.start) + content + tmpl.substring(n.end);
            updateOffset(n, content);
        };
        let processMxView = n => {
            let result = getTagInfo(n);
            let content = '';
            let tag = result.tag;
            let attrs = result.attrs;
            //console.log(attrs);
            attrs = attrs.replace(mxViewAttrReg, (m, q, c) => {
                //console.log(m, q, c);
                let { pathname, query } = url.parse(c);
                //console.log('pn', pathname, c);
                pathname = pathname || '';
                pathname = addAtIfNeed(pathname);
                pathname = atpath.resolveContent(pathname, e.moduleId);
                //console.log('xxx', pathname);
                let params = [];
                query = qs.parse(query, '&', '=', {
                    decodeURIComponent(v) {
                        return v;
                    }
                });
                for (let p in query) {
                    let v = query[p];
                    v = addAtIfNeed(v);
                    params.push(`${p}=${v}`);
                }
                pathname = configs.mxViewProcessor({
                    path: pathname,
                    pkgName: e.pkgName
                }, e) || pathname;
                let view = pathname;
                //params.push(`a={{@$_temp}}`);
                if (params.length) {
                    view += `?${params.join('&')}`;
                }
                //console.log(view);
                return `\x02="${view}"`;
            });
            let html = `<${tag} ${attrs}`;
            let unary = result.unary;
            if (unary) {
                html += `/`;
            }
            html += `>${result.content}`;
            if (!unary) {
                html += `</${tag}${result.endAttrs}>`;
            }
            content = html;
            tmpl = tmpl.substring(0, n.start) + content + tmpl.substring(n.end);
            updateOffset(n, content);
        };
        let walk = (nodes, map) => {
            if (nodes) {
                if (!map) map = nodes.__map;
                for (let n of nodes) {
                    if (!n.isText) {
                        walk(n.children, map);
                        if (n.needEncode) {
                            processEncodeAttr(n, map);
                        } else if (n.hasCustAttr) {
                            processCustomTagOrAttr(n, map, true);
                        } else if (n.customTag) {
                            if (configs.galleryPrefixes[n.pfx] === 1) {
                                processGalleryTag(n, map);
                            } else {
                                processCustomTagOrAttr(n, map);
                            }
                        } else if (n.hasParamsAttr) {
                            processParamsAttrs(n);
                        } else if (n.condAttr) {
                            processCondAttrs(n);
                        } else if (n.atAttrContent) {
                            processAtAttrContents(n);
                        } else if (n.hasMxView) {
                            processMxView(n);
                        }
                    }
                }
            }
        };
        let hasSpceialAttrs = false;
        tmpl = tmplCmd.store(tmpl, cmdCache);
        tmpl = tmplCmd.store(tmpl, cmdCache, artCommandReg);
        let checkCallback = token => {
            if (!hasSpceialAttrs &&
                !skipTags[token.tag] &&
                !tempSkipTags[token.tag]) {
                if (token.customTag ||
                    token.condAttr ||
                    token.needEncode ||
                    token.hasCustAttr ||
                    token.hasParamsAttr ||
                    token.atAttrContent ||
                    token.hasMxView) {
                    hasSpceialAttrs = true;
                }
            }
        };
        let tokens = tmplParser(tmpl, e.shortHTMLFile, checkCallback);
        let checkTimes = 2 << 3;
        while (hasSpceialAttrs && --checkTimes) {
            walk(tokens);
            tmpl = tmplCmd.store(tmpl, cmdCache);
            tmpl = tmplCmd.store(tmpl, cmdCache, artCommandReg);
            hasSpceialAttrs = false;
            tokens = tmplParser(tmpl, e.shortHTMLFile, checkCallback);
        }
        tmpl = tmplCmd.recover(tmpl, cmdCache);
        tmpl = tmpl.replace(attrAtStartContentHolderReg, '@');
        tmpl = tmpl.replace(mxViewAttrHolderReg, 'mx-view');
        return tmpl;
    }
};