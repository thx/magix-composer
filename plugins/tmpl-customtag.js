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
let slog = require('./util-log');
let util = require('util');
let chalk = require('chalk');
let tmplParser = require('./tmpl-parser');
let attrMap = require('./tmpl-attr-map');
let customConfig = require('./tmpl-customtag-cfg');
let atpath = require('./util-atpath');
let consts = require('./util-const');
let deps = require('./util-deps');
let sep = path.sep;
let { selfCloseTags } = require('./html-tags');
let uncheckTags = {
    'mx-vframe': 1,
    'mx-link': 1
};
let skipTags = {
    'q:group': 1,
    'q:direct': 1
};
let tagReg = /\btag\s*=\s*"([^"]+)"/;
let attrNameValueReg = /(^|\s|\x07)([^=\/\s\x07]+)(?:\s*=\s*(["'])([\s\S]*?)\3)?/g;
let inputTypeReg = /\btype\s*=\s*(['"])([\s\S]+?)\1/;
let attrAtStartContentHolderReg = /\x03/g;
let mxViewAttrHolderReg = /\x02/g;
let atReg = /@/g;
let mxViewAttrReg = /\bmx-view\s*=\s*(['"])([^'"]*?)\1/;
let valuableAttrReg = /\u0007\d+\u0007\s*\?\?/;
let booleanAttrReg = /\u0007\d+\u0007\s*\?/;
let wholeCmdReg = /^(?:\u0007\d+\u0007)+$/;
let hasCmdReg = /\u0007\d+\u0007/;

let isReservedAttr = key => {
    return key.startsWith('mx-') ||
        key.startsWith('data-') ||
        key.startsWith('native-') ||
        key.startsWith('aria-') ||
        key.startsWith('#');
};

let toNativeKey = key => {
    if (key.startsWith('native-')) {
        key = key.substring(7);
    } else if (key.startsWith('#')) {
        key = key.substring(1);
    }
    return key;
};

let toParamKey = key => {
    if (key.startsWith('*')) {
        key = `param-${key.substring(1)}`;
    } else if (!key.startsWith('param-')) {
        key = `param-${key}`;
    }
    return key;
};
let relativeReg = /\.{1,2}\//g;
let addAtIfNeed = tmpl => {
    return tmpl.replace(relativeReg, (m, offset, c) => {
        c = tmpl[offset - 1];
        if (c == '@' || c == '/') {
            return m;
        }
        return '@' + m;
    });
};
let innerView = (result, info, gRoot, extInfo) => {
    if (info) {
        result.mxView = gRoot + info.path;
    }
    if (util.isObject(info) && util.isFunction(info.processor)) {
        return info.processor(result, extInfo) || '';
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
    let type = '';
    if (tag == 'input') {
        let m = attrs.match(inputTypeReg);
        if (m) {
            type = m[2];
        } else if (info && info.type) {
            type = info.type;
        }
    }
    let allAttrs = attrMap.getAll(tag, type);
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
        if (!allAttrs.hasOwnProperty(key) && !isReservedAttr(key)) {
            key = toParamKey(key);
            viewKey = true;
        } else {
            key = toNativeKey(key);
        }
        //处理其它属性
        if (info) {
            let pKey = '_' + originalKey;
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
                if (p.startsWith('_')) {
                    p = p.slice(1);
                } else if (!allAttrs.hasOwnProperty(p) && !isReservedAttr(p)) {
                    p = toParamKey(p);
                } else {
                    p = toNativeKey(p);
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
    return html;
};
let innerLink = (result) => {
    let tag = 'a';
    let href = '', paramKey = 0;
    let attrs = result.attrs;
    attrs = attrs.replace(attrNameValueReg, (m, prefix, key, q, value) => {
        if (key == 'to') {
            href = value;
            return '';
        }
        if (key == 'tag') {
            tag = value;
            return '';
        }
        return m;
    });
    let allAttrs = attrMap.getAll(tag);
    attrs = attrs.replace(attrNameValueReg, (m, prefix, key, q, value) => {
        prefix = prefix || '';
        if (!allAttrs.hasOwnProperty(key) && !isReservedAttr(key)) {
            key = toParamKey(key);
            paramKey = 1;
        } else {
            key = toNativeKey(key);
        }
        if (q === undefined && paramKey) {
            q = '"';
            value = '';
        }
        return prefix + key + '=' + q + value + q;
    });
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
module.exports = {
    process(tmpl, extInfo, e) {
        let cmdCache = Object.create(null);
        let galleriesMap = configs.galleries;
        let tmplConditionAttrs = Object.create(null);
        let tmplConditionAttrsIndex = 0;
        e.tmplConditionAttrs = tmplConditionAttrs;
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
                unary: !n.hasContent,
                first: n.first,
                last: n.last,
                firstElement: n.firstElement,
                lastElement: n.lastElement,
                shared: n.shared,//共享数据
                tag: oTag,
                mainTag,
                subTags,
                attrs,
                endAttrs: n.endAttrs || '',
                attrsKV: n.attrsKV,
                content,
                nodesMap: map,
                varTempKey: configs.tmplVarTempKey,
                getContentTokens() {
                    return tmplParser(content, e.shortHTMLFile);
                },
                wholeCmd(cmd) {
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
                buildCmd(line, operate, art, content) {
                    return tmplCmd.buildCmd(line, operate, art, content);
                }
            };
            return result;
        };

        let processCustomTag = (n, map) => {
            let result = getTagInfo(n, map);
            let content = result.content;
            let fn = galleriesMap[result.tag] || configs.customTagProcessor;
            let customContent = fn(result, extInfo, e);
            if (!customContent) {
                let tagName = result.tag;
                customContent = `<${tagName} ${result.attrs}>${content}</${tagName}${result.endAttrs}>`;
                skipTags[tagName] = 1;
            }
            if (content != customContent) {
                content = customContent;
                tmpl = tmpl.substring(0, n.start) + content + tmpl.substring(n.end);
                updateOffset(n, content);
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
                    if ((!i || !i[consts.galleryProcessed]) && !util.isFunction(i)) {
                        let subs = result.subTags.slice(0, -1);
                        if (subs.length) {
                            subs = subs.join(sep);
                        } else {
                            subs = '';
                        }
                        let main = (n.group ? '' : n.pfx + '-') + result.mainTag;
                        let cpath = path.join(configs.moduleIdRemovedPath, gRoot, main, subs);
                        if (fs.existsSync(cpath)) {
                            let {
                                cfg,
                                file: configFile
                            } = customConfig(cpath, main);
                            if (cfg.hasOwnProperty(result.tag)) {
                                let ci = cfg[result.tag];
                                if (util.isFunction(ci)) {
                                    ci = {
                                        processor: ci
                                    };
                                }
                                ci[consts.galleryDynamic] = configFile;
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
                    if (!i[consts.galleryProcessed]) {
                        if (util.isFunction(i)) {
                            i = {
                                processor: i
                            };
                            gMap[result.tag] = i;
                        }
                        if (!i.path) {
                            i.path = vpath;
                        }
                        i[consts.galleryProcessed] = 1;
                    }
                    if (i[consts.galleryDynamic]) {
                        deps.addConfigDepend(i[consts.galleryDynamic], e.from, e.to);
                    }
                }
            }
            let tip = uncheckTags[result.tag];
            if (tip && tip !== 1) {
                slog.ever(chalk.red('[MXC Error(tmpl-custom)] can not process tag: ' + result.tag), 'at', chalk.magenta(e.shortHTMLFile), tip.msg, chalk.magenta(tip.resolve));
            }
            let update = false;
            if (n.pfx == 'mx') {
                if (result.mainTag == 'vframe') {
                    content = innerView(result);
                    update = true;
                } else if (result.mainTag == 'link') {
                    content = innerLink(result, extInfo);
                    update = true;
                }
            }
            if (!update && gMap.hasOwnProperty(result.tag)) {
                content = innerView(result, gMap[result.tag], gRoot, extInfo);
                update = true;
            }
            if (update) {
                tmpl = tmpl.substring(0, n.start) + content + tmpl.substring(n.end);
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
                    let extract = tmplCmd.extractCmdContent(cond, cmdCache);
                    extract.hasContent = ext;
                    extract.valuable = valuable;
                    extract.boolean = boolean;
                    if (!extract.succeed) {
                        slog.ever(chalk.red('[MXC Tip(tmpl-custom)] check condition ' + tmplCmd.recover(cond, cmdCache)), 'at', chalk.magenta(e.shortHTMLFile));
                    } else {
                        let condKey = `\x1c${tmplConditionAttrsIndex++}\x1c`;
                        tmplConditionAttrs[condKey] = extract;
                        key = condKey + key;
                    }
                    return ` var_declare="${cond}" ${prefix}${key}=${q}${ext}${q}`;
                }
                return m;
            });
            if (update) {
                let html = `<${tag} ${attrs}`;
                let unary = selfCloseTags.hasOwnProperty(tag);
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
        let processParamsAttrsOrNative = n => {
            let result = getTagInfo(n);
            let update = false;
            let content = '';
            let tag = result.tag;
            let attrs = result.attrs;
            attrs = attrs.replace(attrNameValueReg, (m, prefix, key, q, content) => {
                prefix = prefix || '';
                if (key.startsWith('*')) {
                    update = true;
                    m = prefix + 'param-' + key.substring(1) + (q ? ('=' + q + content + q) : '');
                } else if (key.startsWith('#')) {
                    update = true;
                    m = prefix + key.substring(1) + (q ? ('=' + q + content + q) : '');
                }
                return m;
            });
            if (update) {
                let html = `<${tag} ${attrs}`;
                let unary = selfCloseTags.hasOwnProperty(tag);
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
            attrs = attrs.replace(attrNameValueReg, m => {
                return atpath.resolveContent(m, e.moduleId, '\x03')
                    .replace(atReg, '\x03');
            });
            let html = `<${tag} ${attrs}`;
            let unary = selfCloseTags.hasOwnProperty(tag);
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
            if (configs.useAtPathConverter) { //如果启用@路径转换规则
                attrs = attrs.replace(mxViewAttrReg, (m, q, c) => {
                    let { pathname, query } = url.parse(c);
                    pathname = pathname || '';
                    pathname = addAtIfNeed(pathname);
                    pathname = atpath.resolveContent(pathname, e.moduleId);
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
                    if (params.length) {
                        view += `?${params.join('&')}`;
                    }
                    return `\x02="${view}"`;
                });
            }
            let html = `<${tag} ${attrs}`;
            let unary = selfCloseTags.hasOwnProperty(tag);
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
                        if (n.customTag) {
                            if (configs.galleryPrefixes[n.pfx] === 1) {
                                processGalleryTag(n, map);
                            } else if (!skipTags[n.tag]) {
                                processCustomTag(n, map);
                            }
                        } else if (n.paramsOrNative) {
                            processParamsAttrsOrNative(n);
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
        tmpl = tmplCmd.store(tmpl, cmdCache, consts.artCommandReg);
        let checkCallback = token => {
            if (!hasSpceialAttrs &&
                !skipTags[token.tag]) {
                if (token.customTag ||
                    token.condAttr ||
                    token.paramsOrNative ||
                    token.atAttrContent ||
                    token.hasMxView) {
                    hasSpceialAttrs = true;
                }
            }
        };
        let tokens = tmplParser(tmpl, e.shortHTMLFile, checkCallback);
        let checkTimes = 2 << 2;
        while (hasSpceialAttrs && --checkTimes) {
            walk(tokens);
            tmpl = tmplCmd.store(tmpl, cmdCache);
            tmpl = tmplCmd.store(tmpl, cmdCache, consts.artCommandReg);
            hasSpceialAttrs = false;
            tokens = tmplParser(tmpl, e.shortHTMLFile, checkCallback);
        }
        tmpl = tmplCmd.recover(tmpl, cmdCache);
        tmpl = tmpl.replace(attrAtStartContentHolderReg, '@');
        tmpl = tmpl.replace(mxViewAttrHolderReg, 'mx-view');
        //console.log(tmpl);
        return tmpl;
    }
};