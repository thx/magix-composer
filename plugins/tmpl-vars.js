/*
    对模板增加根变量的分析，模板引擎中不需要用with语句
    压缩模板引擎代码
 */
let acorn = require('./js-acorn');
let chalk = require('chalk');
let tmplCmd = require('./tmpl-cmd');
let configs = require('./util-config');
let utils = require('./util');
let md5 = require('./util-md5');
let jsGeneric = require('./js-generic');
let {
    htmlAttrParamPrefix,
    revisableReg,
    tmplMxViewParamKey,
    tmplCondPrefix,
    tmplVarTempKey,
    tmplGroupKeyAttr,
    tmplGroupTag,
    tmplGroupRootAttr,
    tmplGlobalVars,
    quickGroupFnPrefix
} = require('./util-const');
let regexp = require('./util-rcache');
let tmplStaticVarsKey = 'tmpl_static_vars_key';
let tmplCmdReg = /<%([#=:&*~]|\.{3})?([\s\S]*?)%>|$/g;
let tagReg = /<([^>\s\/\x07]+)([^>]*)>/g;
let bindReg = /([^>\s\/=]+)\s*=\s*(["'])(<%'\x17\d+\x11[^\x11]+\x11\x17'%>)?<%:([\s\S]+?)%>\s*\2/g;
let bindReg2 = /\s*(<%'\x17\d+\x11[^\x11]+\x11\x17'%>)?<%:([\s\S]+?)%>\s*/g;
let textaraReg = /<textarea([^>]*)>([\s\S]*?)<\/textarea>/g;
let groupReg = new RegExp(`<${tmplGroupTag}([^>]*)>([\\s\\S]*?)<\\/${tmplGroupTag}>`, 'g');
let groupKeyReg = new RegExp(`\\s${tmplGroupKeyAttr}="[^"]+"`);
let groupContextReg = /\s+fn(?=\="([^"]+)"|\s|$)/;
let mxViewAttrReg = /(?:\b|\s|^)mx-view\s*=\s*(['"])([\s\S]+?)\1/g;
let checkboxReg = /(?:\b|\s|^)type\s*=\s*(['"])checkbox\1/;
let indeterminateReg = /(?:\b|\s|^)indeterminate(?:\b|\s|=|$)/;
let atRefOrAnalysePathExprReg = /<%([#~])([\s\S]+?)%>/g;
let vphUse = String.fromCharCode(0x7528); //用
let vphDcd = String.fromCharCode(0x58f0); //声
let vphCst = String.fromCharCode(0x56fa); //固
let vphGlb = String.fromCharCode(0x5168); //全
let vphAsg = String.fromCharCode(0x8d4b);
let creg = /[\u7528\u58f0\u56fa\u5168\u8d4b]/g;
let hreg = /([\x01\x02\x10])\d+/g;
let stringReg = /^['"]/;
let numIndexReg = /^\[(\d+)\]$/;
let tailEmptyReg = /\+''$/;
let bindEventParamsReg = /^\s*"([^"]+)",/;
let artCtrlsReg = /<%'\x17\d+\x11([^\x11]+)\x11\x17'%>(<%[\s\S]+?%>)/g;
let stringHolderReg = /(['"])?(\x04\d+\x04)\1/g;
let refKeyReg = /,'\x1e[#a-zA-Z0-9]+'$/;
let cmap = {
    [vphUse]: '\x01',
    [vphDcd]: '\x02',
    [vphGlb]: '\x03',
    [vphCst]: '\x06',
    [vphAsg]: '\x10'
};
let stripChar = str => str.replace(creg, m => cmap[m]);
let stripNum = str => str.replace(hreg, '$1');
let fnVariableReg = /\x18",([\s\S]+?),\s*"\s*(:)?/g;
let numberReg1 = /^[+-]?\.\d+(?:E[+-]?\d+)?$/i;
let numberReg2 = /^[+-]?(?:0x|0b|0o)[0-9a-f]+$/i;
let numberReg3 = /^[+-]?\d+\.?\d*(?:E[+-]?\d+)?$/i;
let numberReg4 = /^[+-]?\d+n$/;
let numberReg5 = /^[+-]?BigInt\(\s*(['"`])?\s*(?:0x|0b|0o)?[0-9a-f]+n?\s*\1\s*\)$/i;

let efCache = Object.create(null);
let extractFunctions = (expr, refVariable) => { //获取绑定的其它附加信息，如 <%:user.name<change,input>({refresh:true,required:true})%>  =>  evts:change,input  expr user.name  fns  {refresh:true,required:true}
    let c = efCache[expr];
    if (c) {
        return c;
    }
    let oExpr = expr;
    let fns = '';

    let m = expr.match(bindEventParamsReg);
    if (m) {
        expr = expr.replace(bindEventParamsReg, '');
    }
    let firstComma = expr.indexOf(',');
    if (firstComma > -1) {
        fns = expr.substring(firstComma + 1).trim().slice(1, -1);
        expr = expr.substring(0, firstComma);
        //console.log(JSON.stringify(fns));
        fns = fns.replace(fnVariableReg, (m, v, colon) => {
            if (colon) {
                return `'<%=${v}%>'` + colon;
            }
            //console.log(m, v);
            let key = `'\x1e#'`;
            if (v != '\x03') {
                key = refVariable(v, oExpr);
            }
            return `'<%#${v},${key}%>'`;
        });
        //console.log(JSON.stringify(fns));
    }
    return (efCache[oExpr] = {
        expr,
        fns
    });
};

let viewAttrReg = regexp.get(`\\s${regexp.escape(htmlAttrParamPrefix)}([\\w\\-]+)=(["'])([\\s\\S]*?)\\2`, 'g');
let groupsReg = regexp.get(`[\\x03\\x06]\\.${regexp.escape(quickGroupFnPrefix)}`, 'g');
//console.log(groupsReg);
//前导符后跟合法的id
let IdReg = /(?:[\x03\x06]\.|\x01\d+)[\x24\x30-\x39\x41-\x5a\x5f\x61-\x7a]+/g;
let ExtractIds = v => {
    let keys = [];
    if (v == '\x03') {
        keys.push(v);
    } else {
        v.replace(IdReg, m => {
            keys.push(m);
        });
    }
    return keys;
};
let SpreadPattern = (fn, node) => {
    //debugger;
    if (node.type == 'ArrayPattern' ||
        node.type == 'ArrayExpression') {
        let a = [];
        for (let p of node.elements) {
            if (p) {
                if (p.type == 'ObjectPattern' ||
                    p.type == 'ObjectExpression' ||
                    p.type == 'ArrayPattern' ||
                    p.type == 'ArrayExpression') {
                    a.push(SpreadPattern(fn, p));
                } else {
                    a.push(fn.slice(p.start, p.end));
                }
            } else {
                a.push('');
            }
        }
        return `[${a.join(',')}]`;
    } else {
        let a = [];
        for (let p of node.properties) {
            if (p.shorthand) {
                if (p.value.type == 'Identifier') {
                    a.push(`${p.key.name}:${p.value.name}`);
                } else {
                    a.push(`${p.key.name}:${fn.slice(p.value.start, p.value.end)}`);
                }
            } else {
                let c = '';
                if (p.type == 'Property') {
                    if (p.key.type == 'Identifier') {
                        if (p.computed) {
                            c = `[${p.key.name}]:`;
                        } else {
                            c = `${p.key.name}:`;
                        }
                    } else if (p.key.type == 'Literal') {
                        c = `${p.key.raw}:`;
                    } else if (p.key.type == 'TemplateLiteral') {
                        c = `[${fn.slice(p.key.start, p.key.end)}]:`;
                    }
                    if (p.value.type == 'Identifier') {
                        c += p.value.name;
                    } else if (p.value.type == 'ObjectPattern' ||
                        p.value.type == 'ObjectExpression' ||
                        p.value.type == 'ArrayPattern' ||
                        p.value.type == 'ArrayExpression') {
                        c += SpreadPattern(fn, p.value);
                    } else {
                        c += fn.slice(p.value.start, p.value.end);
                    }
                } else {
                    c += fn.slice(p.start, p.end);
                }
                a.push(c);
            }
        }
        return `{${a.join(',')}}`;
    }
};
let PeelTempKeyPrefix = '$peel_key_';
let PeelTempValuePrefix = '$peel_val_';
let PeelTempRootPrefix = '$peel_root_';
let PeelPatternVariable = (fn, node) => {
    let a = [];
    let left, right, prefix = 'let ', spliter = ';';
    if (node.type == 'VariableDeclarator') {
        left = node.id;
        right = node.init;
        prefix = '';
        spliter = ',';
    } else {
        left = node.left;
        right = node.right;
    }
    let main = fn.slice(right.start, right.end);
    if (right.type != 'Identifier') {
        let mainKey = utils.uId(PeelTempRootPrefix, fn, true);
        a.push(`${prefix}${mainKey}=${main}`, spliter);
        main = mainKey;
    }
    let peel = (n, host) => {
        if (n.type == 'ObjectPattern') {
            for (let p of n.properties) {
                if (p.type == 'Property') {
                    if (p.value.type == 'ObjectPattern' ||
                        p.value.type == 'ArrayPattern') {
                        let key = p.key.name;
                        let next = key;
                        if (p.computed) {
                            key = `[${key}]`;
                            next = utils.uId(PeelTempValuePrefix, fn, true);
                        } else {
                            key = `.${key}`;
                        }
                        a.push(`${next}=${host}${key}`, spliter);
                        peel(p.value, next);
                    } else if (p.value.type == 'Identifier') {
                        let key;
                        if (p.computed) {
                            key = `[${p.key.name}]`;
                        } else if (p.key.type == 'Identifier') {
                            key = `.${p.key.name}`;
                        } else {
                            key = `[${p.key.raw}]`;
                        }
                        a.push(`${p.value.name}=${host}${key}`, spliter);
                    } else if (p.value.type == 'AssignmentPattern') {
                        let key;
                        if (p.computed) {
                            key = `[${p.key.name}]`;
                        } else if (p.key.type == 'Identifier') {
                            key = `.${p.key.name}`;
                        } else {
                            key = `[${p.key.raw}]`;
                        }
                        let v = p.value;
                        let left = v.left.name;
                        let right;
                        if (v.right.type == 'Literal') {
                            right = v.right.raw;
                        } else {
                            right = v.right.name;
                        }
                        let tv = utils.uId(PeelTempValuePrefix, fn, true);
                        a.push(`${prefix}${tv}=${host}${key}${spliter}${left}=void 0===${tv}?${right}:${tv}`, spliter);
                    }
                } else {
                    //RestElement 简单实现
                    a.push(`${p.argument.name}=${host}`, spliter);
                }
            }
        } else if (n.type == 'ArrayPattern') {
            let idx = 0;
            for (let p of n.elements) {
                if (p) {
                    if (p.type == 'ObjectPattern') {
                        let k = utils.uId(PeelTempKeyPrefix, fn, true);
                        a.push(`${k}=${host}[${idx}]`, spliter);
                        peel(p, k);
                    } else if (p.type == 'ArrayPattern') {
                        let k = utils.uId(PeelTempKeyPrefix, fn, true);
                        a.push(`${prefix}${k}=${host}[${idx}]`, spliter);
                        peel(p, k);
                    } else if (p.type == 'AssignmentPattern') {
                        let tv = utils.uId(PeelTempValuePrefix, fn, true);
                        let key = p.left.name;
                        let v = p.right.type == 'Literal' ? p.right.raw : p.right.name;
                        a.push(`${prefix}${tv}=${host}[${idx}]${spliter}${key}=void 0===${tv}?${v}:${tv}`, spliter);
                    } else if (p.type == 'RestElement') {
                        a.push(`${p.argument.name}=${host}.slice(${idx})`, spliter);
                    } else {
                        a.push(`${p.name}=${host}[${idx}]`, spliter);
                    }
                }
                idx++;
            }
        }
    };
    peel(left, main);
    if (!prefix) {
        if (a.length) {
            a.pop();
        } else {
            a.push(utils.uId('$pole_', fn, true));
        }
    }
    return a.join('');
};

let isLiteralValue = v => {
    if (v === 'true' ||
        v === 'false' ||
        v === 'null' ||
        v === 'undefined') {
        return true;
    }
    if (numberReg1.test(v) ||
        numberReg2.test(v) ||
        numberReg3.test(v) ||
        numberReg4.test(v) ||
        numberReg5.test(v)) {
        return true;
    }
    return false;
};
/*
    \x00  `反撇
    \x01  模板中局部变量  用
    \x02  变量声明的地方  声
    \x03  模板中全局变量  全
    \x04  命令中的字符串
    \x05  html中的字符串
    \x06  constVars 固定不会变的变量
    \x07  存储命令
    \x11  精准识别rqeuire
    \x12  精准识别@符
    \x17  模板中的纯字符串
    \x18  模板中的绑定参数对象
    \x19  模板中的循环
    \x10  赋值
    第一遍用汉字
    第二遍用不可见字符
 */
module.exports = {
    process: (tmpl, e) => {
        //console.log(tmpl);
        let sourceFile = e.shortHTMLFile;
        let fn = [];
        let index = 0;
        let htmlStore = Object.create(null);
        let htmlIndex = 0;
        //console.log(tmpl);
        let htmlKey = utils.uId('\x05', tmpl);
        let htmlHolderReg = new RegExp(htmlKey + '\\d+' + htmlKey, 'g');
        let charReg = new RegExp('(?:;`' + htmlKey + '|' + htmlKey + '`;)', 'g');
        let toSourceHTML = src => {
            src = src.replace(charReg, htmlKey);
            src = stripChar(src);
            src = src.replace(htmlHolderReg, m => htmlStore[m]);
            src = src.replace(tmplCmdReg, (match, operate, content) => {
                if (operate) {
                    return '<%' + operate + content.slice(1, -1) + '%>';
                }
                return match;
            });
            return src;
        };
        //tmpl=`\x1f<span>\x1f</span>`+tmpl;
        tmpl = tmpl.replace(tmplCmdReg, (m, o, c) => {
            if (o === '#' ||
                o === '=') {
                c = c.trim();
                if (c == '$viewId') {
                    return '\x1f';
                }
            }
            return m;
        });
        //console.log(tmpl);
        tmpl.replace(tmplCmdReg, (match, operate, content, offset) => {
            let start = 2;
            if (operate) {
                start += operate.length;
                content = content.trim();
                if (content) {
                    content = '[' + content + ']';
                }
            }
            let source = tmpl.substring(index, offset + start);
            let key = htmlKey + (htmlIndex++) + htmlKey;
            htmlStore[key] = source;
            index = offset + match.length - 2;
            fn.push(';`' + key + '`;', content || '');
        });
        
        //console.log(htmlStore);
        fn = fn.join(''); //移除<%%> 使用`变成标签模板分析
        //console.log(fn);
        let ast;
        //console.log(fn);
        try {
            ast = acorn.parse(fn, null, sourceFile);
        } catch (ex) {
            let { column } = ex.loc;
            let start = column,
                end = column;
            while (fn.charAt(start) != '`') {
                start--;
            }
            while (fn.charAt(end) != '`') {
                end++;
            }
            let msg = fn.substring(start + 2, end - 1);
            if (msg.startsWith('[') && msg.endsWith(']')) {
                msg = msg.substring(1, msg.length - 1);
            }
            console.log(chalk.red('[MXC Error(tmpl-vars)] Parse template js code ast error: ' + ex.message), 'at', chalk.magenta(e.shortHTMLFile), 'near', chalk.red(msg));
            throw ex;
        }
        /*
            变量和变量声明在ast里面遍历的顺序不一致，需要对位置信息保存后再修改fn
         */
        let modifiers = [];
        let stringStore = Object.create(null);
        let stringIndex = 0;
        let recoverString = tmpl => {
            //还原代码中的字符串，代码中的字符串占位符使用\x04包裹
            //模板中的绑定特殊字符串包含\x17，这里要区分这个字符串的来源
            return tmpl.replace(stringHolderReg, (m, q, c) => {
                q = q || '';
                let str = stringStore[c];
                if (q) {
                    str = str.slice(1, -1);//获取源字符串
                }
                let result;
                if (str.charAt(0) == '\x17') { //如果是\x17，这个是绑定时的特殊字符串
                    result = q + str.substring(1) + q;
                } else { //其它情况再使用\x17包裹，方便在后续如　<div class="{{='selector'}}"中进一步处理
                    result = q + '\x17' + str + '\x17' + q;
                }
                //console.log(JSON.stringify(m), result, JSON.stringify(result));
                return result;
            });
        };
        let constVars = Object.create(null);
        let patternChecker = (node, instead) => {
            let msg = '[MXC Error(tmpl-vars)] unpupport ' + node.type + ' near `' + toSourceHTML(fn.substring(node.start, node.end)) + '`';
            console.log(chalk.red(msg), 'at', chalk.grey(sourceFile), (instead ? chalk.magenta(`use ${instead} instead`) : ''));
            throw new Error(msg);
        };
        let pattersObject = Object.create(null);
        let processExpressions = Object.create(null);
        let objectExpr = node => {
            //debugger;
            let key = node.start + '~' + node.end;
            let key1 = fn.slice(node.start, node.end);
            let process = 0;
            if (node.type == 'ObjectPattern' ||
                node.type == 'ArrayPattern' ||
                node.type == 'ObjectExpression' ||
                node.type == 'ArrayExpression') {
                processExpressions[key1] = 1;
                process = 1;
            } else {
                process = processExpressions[key1];
            }
            if (!process) return;
            pattersObject[key] = node;
            if (node.type == 'ObjectPattern' ||
                node.type == 'ObjectExpression') {
                for (let p of node.properties) {
                    if (p.type == 'Property') {
                        if (p.value.type == 'ObjectPattern' ||
                            p.value.type == 'ObjectExpression' ||
                            p.value.type == 'ArrayPattern' ||
                            p.value.type == 'ArrayExpression') {
                            key = p.value.start + '~' + p.value.end;
                            if (pattersObject[key]) {
                                delete pattersObject[key];
                            }
                        }
                    }
                }
            } else {
                for (let p of node.elements) {
                    if (p) {
                        if (p.type == 'ObjectPattern' ||
                            p.type == 'ObjectExpression' ||
                            p.type == 'ArrayPattern' ||
                            p.type == 'ArrayExpression') {
                            key = p.start + '~' + p.end;
                            if (pattersObject[key]) {
                                delete pattersObject[key];
                            }
                        }
                    }
                }
            }
        };
        acorn.walk(ast, {
            ForOfStatement: patternChecker,
            FunctionDeclaration: patternChecker,
            FunctionExpression: patternChecker,
            ArrowFunctionExpression: patternChecker,
            ObjectPattern: objectExpr,
            ObjectExpression: objectExpr,
            ArrayPattern: objectExpr,
            ArrayExpression: objectExpr,
            VariableDeclaration(node) {
                if (node.kind != 'let') {
                    node.type = `"${node.kind}" ${node.type}`;
                    patternChecker(node, 'let');
                }
            },
            CallExpression(node) { //方法调用
                let vname = '';
                let callee = node.callee;
                if (callee.name) { //只处理模板中 <%=fn(a,b)%> 这种，不处理<%=x.fn()%>，后者x对象上除了挂方法外，还有可能挂普通数据。对于方法我们不把它当做变量处理，因为给定同样的参数，方法需要返回同样的结果
                    vname = callee.name;
                    if (!vname.startsWith(quickGroupFnPrefix)) {
                        constVars[vname] = 1;
                    }
                }
            },
            VariableDeclarator(node) {
                if (node.init) {
                    switch (node.init.type) {
                        case 'ArrayExpression':
                        case 'ObjectExpression':
                        case 'FunctionExpression':
                        case 'ArrowFunctionExpression':
                            console.log(chalk.red('[MXC Tip(tmpl-vars)] avoid declare ' + fn.substring(node.start, node.end)), 'at', chalk.grey(sourceFile));
                            break;
                    }
                }
            }
        });
        //debugger;
        for (let p in pattersObject) {
            let v = pattersObject[p];
            modifiers.push({
                start: v.start,
                end: v.end,
                content: SpreadPattern(fn, v)
            });
        }
        if (modifiers.length) {
            modifiers.sort((a, b) => a.start - b.start);
            for (let i = modifiers.length, m; i--;) {
                m = modifiers[i];
                fn = fn.substring(0, m.start) + m.content + fn.substring(m.end);
            }
            modifiers = [];
            //console.log(fn);
            ast = acorn.parse(fn, null, sourceFile);
        }
        acorn.walk(ast, {
            VariableDeclarator(node) {
                if (node.id.type == 'ObjectPattern' ||
                    node.id.type == 'ArrayPattern') {
                    //console.log('enter');
                    modifiers.push({
                        start: node.start,
                        end: node.end,
                        content: PeelPatternVariable(fn, node)
                    });
                }
            },
            ExpressionStatement(node) {
                let expr = node.expression;
                if (expr.type == 'AssignmentExpression') {
                    if (expr.left.type == 'ObjectPattern' ||
                        expr.left.type == 'ArrayPattern') {
                        console.log('enter');
                        modifiers.push({
                            start: node.start,
                            end: node.end,
                            content: PeelPatternVariable(fn, expr)
                        });
                    }
                }
            }
        });
        if (modifiers.length) {
            modifiers.sort((a, b) => a.start - b.start);
            for (let i = modifiers.length, m; i--;) {
                m = modifiers[i];
                fn = fn.substring(0, m.start) + m.content + fn.substring(m.end);
            }
            modifiers = [];
            //console.log(fn);
            ast = acorn.parse(fn, null, sourceFile);
        }
        let blockRanges = [];
        acorn.walk(ast, {
            BlockStatement(node) {
                blockRanges.push({
                    start: node.start,
                    end: node.end,
                    key: node.start + '~' + node.end
                });
            }
        });
        if (blockRanges.length) {
            blockRanges.sort((a, b) => b.start - a.start);
        }
        let outerKey = '0~' + fn.length;
        blockRanges.push({
            start: 0,
            end: fn.length,
            key: outerKey,
            global: true
        });
        let rangeDeclares = Object.create(null);
        rangeDeclares[outerKey] = Object.create(null);
        rangeDeclares[outerKey][tmplVarTempKey] = 2;
        let queryRangeByPos = pos => {
            for (let i = 0; i < blockRanges.length; i++) {
                let b = blockRanges[i];
                if (b.start < pos && pos < b.end) {
                    return b;
                }
            }
            return null;
        };
        let queryVarsByPos = pos => {
            let vars = Object.create(null);
            for (let i = 0; i < blockRanges.length; i++) {
                let b = blockRanges[i];
                if (b.start < pos && pos < b.end) {
                    let d = rangeDeclares[b.key];
                    if (d) {
                        Object.assign(vars, d);
                    }
                }
            }
            return vars;
        };
        let processString = (node, tl) => { //存储字符串，减少分析干扰
            if (tl ||
                stringReg.test(node.raw)) {
                let q = tl ? '' : node.raw.match(stringReg)[0];
                let key = '\x04' + (stringIndex++) + '\x04';
                if (revisableReg.test(node.raw) && !configs.debug) {
                    node.raw = node.raw.replace(revisableReg, m => {
                        return md5(m, 'revisableString', configs.revisableStringPrefix);
                    });
                }
                stringStore[key] = node.raw;
                modifiers.push({
                    key: '',
                    start: node.start,
                    end: node.end,
                    name: q + key + q
                });
            }
        };
        let globalVars = Object.create(null);
        acorn.walk(ast, {
            Property(node) {
                if (node.key.type == 'Literal') {
                    processString(node.key);
                }
            },
            Literal: processString,
            TemplateLiteral(node) {
                for (let q of node.quasis) {
                    q.raw = q.value.raw;
                    if (!q.raw.startsWith(htmlKey)) {
                        processString(q, true);
                    }
                }
            },
            Identifier(node) {
                let tname = node.name;
                let r = queryVarsByPos(node.start);
                let isGlobal = 0;
                if (!tmplGlobalVars[tname] && (
                    !r[tname])) {
                    isGlobal = 1;
                }
                if (isGlobal) { //模板中全局不存在这个变量
                    modifiers.push({ //如果是指定不会改变的变量，则加固定前缀，否则会全局前缀
                        key: (constVars[tname] ? vphCst : vphGlb) + '.',
                        start: node.start,
                        end: node.end,
                        name: tname
                    });
                    globalVars[tname] = 1;
                } else {
                    modifiers.push({
                        key: vphUse + node.end,
                        start: node.start,
                        end: node.end,
                        name: tname
                    });
                }
            },
            AssignmentExpression(node) { //赋值语句
                if (node.left.type == 'Identifier') {
                    let lname = node.left.name;
                    let r = queryVarsByPos(node.start);
                    if (!r[lname]) {
                        //模板中使用如<%list=20%>这种，虽然可以，但是不建议使用，因为在模板中可以修改js中的数据，这是非常不推荐的
                        console.log(chalk.red('[MXC Tip(tmpl-vars)] undeclare variable:' + lname), 'at', chalk.grey(sourceFile));
                        globalVars[lname] = 1;
                    } else {
                        let left = node.left;
                        modifiers.push({
                            key: vphAsg + left.end,
                            start: left.start,
                            end: left.end,
                            name: left.name
                        });
                    }
                } else if (node.left.type == 'MemberExpression') {
                    let start = node.left;
                    while (start.object) {
                        start = start.object;
                    } //模板中使用如<%list.x=20%>这种
                    let r = queryVarsByPos(node.start);
                    if (!r[start.name]) {
                        globalVars[start.name] = 1;
                        console.log(chalk.red('[MXC Tip(tmpl-vars)] avoid writeback: ' + fn.slice(node.start, node.end)), 'at', chalk.grey(sourceFile));
                    }
                }
            },
            VariableDeclarator(node) { //变量声明
                let tname = node.id.name;
                if (globalVars[tname] || globalVars[tname]) {
                    let msg = '[MXC Error(tmpl-vars)] avoid redeclare variable:' + tname;
                    console.log(chalk.red(msg), 'at', chalk.grey(sourceFile));
                    throw new Error(msg);
                }
                let r = queryRangeByPos(node.start);
                if (r) {
                    if (!rangeDeclares[r.key]) {
                        rangeDeclares[r.key] = Object.create(null);
                    }
                    rangeDeclares[r.key][tname] = node.init ? 3 : 2;
                }
                modifiers.push({
                    key: vphDcd + node.start,
                    start: node.id.start,
                    end: node.id.end,
                    name: tname
                });
            },
            ThisExpression(node) {
                modifiers.push({
                    key: '',
                    start: node.start,
                    end: node.end,
                    name: vphGlb
                });
            }
        });
        if (modifiers.length) {
            modifiers.sort((a, b) => a.start - b.start);
            for (let i = modifiers.length, m; i--;) {
                m = modifiers[i];
                fn = fn.substring(0, m.start) + m.key + m.name + fn.substring(m.end);
            }
            //console.log(fn);
            ast = acorn.parse(fn, null, sourceFile);
        }
        let globalTracker = Object.create(null);
        acorn.walk(ast, {
            VariableDeclarator(node) {
                let key = stripChar(node.id.name); //把汉字前缀换成代码前缀
                let m = key.match(/\x02(\d+)/);
                if (m) {
                    let pos = m[1] | 0; //获取这个变量在代码中的位置
                    key = key.replace(/\x02\d+/, '\x01'); //转换变量标记，统一变成使用的标记
                    if (!globalTracker[key]) {
                        globalTracker[key] = [];
                    }
                    let hasValue = false;
                    let value = null;
                    let type = '';
                    if (node.init) { //如果有赋值
                        hasValue = true;
                        let { init } = node;
                        type = init.type;
                        value = stripChar(fn.substring(init.start, init.end));
                    }
                    let r = queryRangeByPos(pos);
                    globalTracker[key].push({
                        pos,
                        start: r.start,
                        end: r.end,
                        hasValue,
                        value,
                        type
                    });
                }
            },
            AssignmentExpression(node) {
                let key = stripChar(node.left.name);
                let m = key.match(/\x10(\d+)/);
                if (m) {
                    let pos = m[1] | 0; //获取这个变量在代码中的位置
                    let r = queryRangeByPos(pos);
                    let { right } = node;
                    let value = stripChar(fn.substring(right.start, right.end));
                    key = key.replace(/\x10\d+/, '\x01'); //转换变量标记，统一变成使用的标记
                    if (!globalTracker[key]) {
                        globalTracker[key] = [];
                    }
                    let list = globalTracker[key];
                    if (list) {
                        let found = false;
                        for (let i of list) {
                            if (!i.hasValue) { //如果是首次赋值，则直接把原来的变成新值
                                i.value = value;
                                i.hasValue = found = true;
                                i.type = right.type;
                                i.start = r.start;
                                i.end = r.end;
                                break;
                            }
                        }
                        if (!found) { //该变量存在重复赋值，记录这些重复赋值的地方，后续在变量分析追踪时有用，如<%var a=name%>...<%~a%> ....<%a=age%>...<%~a%>  两次<%~a%>输出的结果对应不同的根变量
                            list.push({
                                pos,
                                value: value,
                                type: right.type,
                                start: r.start,
                                end: r.end
                            });
                        }
                    }
                }
            }
        });
        fn = toSourceHTML(fn); //把合法的js代码转换成原来的模板代码
        let cmdStore = Object.create(null);
        let getParentRefKey = (key, pos) => {
            let list = globalTracker[key];
            if (!list) return null;
            for (let i = list.length, item; i--;) {
                item = list[i];
                if (item.pos < pos &&
                    item.start < pos &&
                    pos < item.end) {
                    if (item.type == 'CallExpression') {
                        return null;
                    }
                    return item.value;
                }
            }
            return null;
        };
        let toOriginalExpr = expr => stripNum(expr).replace(artCtrlsReg, '{{$1}}');
        let best = head => {
            let match = head.match(/\x01(\d+)/); //获取使用这个变量时的位置信息
            if (!match) return null;
            let pos = match[1];
            pos = pos | 0;
            let key = head.replace(/\x01\d+/, '\x01'); //获取这个变量对应的赋值信息
            return getParentRefKey(key, pos);
        };
        let find = (expr, srcExpr, prefix) => {
            if (!srcExpr) {
                srcExpr = expr;
            }
            //console.log('expr', expr);
            let ps = jsGeneric.splitExpr(expr);//表达式拆分，如user[name][key[value]]=>["user","[name]","[key[value]"]
            /*
                1. <%:user.name%>
                2. <%var a=user.name%>...<%:a%>
                3. <%var a=user%> ...<%var b=a.name%> ....<%:b%>
             */
            let head = ps[0]; //获取第一个
            if (head == '\x03' || head == '\x06') { //如果是根变量，则直接返回  第1种情况
                return ps.slice(1);
            }
            let info = best(head); //根据第一个变量查找最优的对应的根变量，第2种情况
            if (!info) {
                if (!prefix) {
                    let tipExpr = toOriginalExpr(srcExpr.trim());
                    console.log(chalk.red('[MXC Error(tmpl-vars)] can not resolve bind expression: ' + tipExpr), 'at', chalk.grey(sourceFile), 'check variable reference or global variable declaration,read more: https://github.com/thx/magix/issues/37');
                    return ['<%throw new Error("can not resolve bind expression")'];
                }
                return [prefix()];
            }
            if (info != '\x03' || info != '\x06') { //递归查找,第3种情况
                ps = find(info, srcExpr, prefix).concat(ps.slice(1));
            }
            return ps; //.join('.');
        };
        let analyseExpr = (expr, source, prefix, keepSource) => {
            let result = find(expr, source, prefix); //获取表达式信息
            let vars = [];
            if (prefix) {
                let rebuild = [],
                    temp = [];
                let takeParts = () => {
                    if (temp.length) {
                        let part = temp.join('.');
                        if (!configs.debug &&
                            !keepSource) {
                            part = md5(part, 'compressRefExpr', '', true);
                        }
                        rebuild.push(part);
                        temp.length = 0;
                    }
                };
                for (let one of result) {
                    if (one.charAt(0) == '[' &&
                        one.charAt(one.length - 1) == ']') {
                        takeParts();
                        one = `'+(${one.slice(1, -1)})+'`;
                        rebuild.push(one);
                    } else {
                        temp.push(one);
                    }
                }
                takeParts();
                result = rebuild.join('.');
            } else {
                //["user","[name]","[key[value]"]=> user.<%=name%>.<%=key[value]%>
                for (let i = 0, one; i < result.length; i++) {
                    one = result[i].replace(numIndexReg, '$1');
                    if (one.charAt(0) == '[' &&
                        one.charAt(one.length - 1) == ']') {
                        one = '<%=' + one.slice(1, -1) + '%>';
                        vars.push(one);
                        result[i] = one;
                    }
                }
                result = result.join('.');
            }
            return {
                vars,
                result
            };
        };
        let findRoot = expr => {
            if (expr == '\x03') {
                return '#';
            }
            let ps = jsGeneric.splitExpr(expr);
            let head = ps[0];
            if (head == '\x03') {
                return ps[1];
            } else if (head == '\x06') {
                return null;
            }
            let info = best(head);
            if (!info) {
                return null;
            }
            return findRoot(info);
        };
        let extractMxViewRootKeys = attrs => {
            let keys = [];
            let takeKeys = (m, c, v) => {
                if (c == '#') {
                    v = v.replace(refKeyReg, '').trim();
                    if (v.startsWith('\x03.' + quickGroupFnPrefix)) {
                        if (!keys.includes(v)) {
                            keys.push(v.substring(2));
                        }
                    } else {
                        let ks = ExtractIds(v);
                        if (ks.length) {
                            for (let k of ks) {
                                m = findRoot(k);
                                if (m &&
                                    !keys.includes(m)) {
                                    keys.push(m);
                                }
                            }
                        }
                    }
                }
            };
            attrs.replace(artCtrlsReg, '$2')
                .replace(mxViewAttrReg, (m, q, value) => {
                    q = value.indexOf('?');
                    //console.log(value,q);
                    if (q > -1) {
                        value = value.substring(q + 1);
                        value.replace(tmplCmdReg, takeKeys);
                    }
                }).replace(viewAttrReg, (m, key, q, value) => {
                    value.replace(tmplCmdReg, takeKeys);
                });
            return keys;
        };
        fn = tmplCmd.store(fn, cmdStore); //存储代码，只分析模板
        //textarea情况：<textarea><%:taValue%></textarea>处理成=><textarea <%:taValue%>><%=taValue%></textarea>
        fn = fn.replace(textaraReg, (_, attr, content) => {
            attr = tmplCmd.recover(attr, cmdStore);
            content = tmplCmd.recover(content, cmdStore, recoverString);
            if (bindReg2.test(content)) {
                bindReg2.lastIndex = 0;
                let bind = '', artExpr = '';
                content = content.replace(bindReg2, (m, art, expr) => {
                    bind = m;
                    artExpr = art;
                    let i = extractFunctions(expr);
                    return `<%=${i.expr}%>`;
                }).replace(artExpr, '');
                attr = attr + ' ' + bind;
            }
            content = tmplCmd.store(content, cmdStore);
            attr = tmplCmd.store(attr, cmdStore);
            return '<textarea' + attr + '>' + content + '</textarea>';
        });
        //let mxeCount = 0;
        let tempVarsPrefixKey = 0;
        let literalValues = Object.create(null);
        let processRefVariable = (v, src, isAnalysePath) => {
            let prefix = () => {
                if (isLiteralValue(v)) {
                    if (!literalValues[v]) {
                        literalValues[v] = md5('\x00' + tempVarsPrefixKey++, 'compressRefExpr', '', true);
                    }
                    return literalValues[v];
                }
                return md5('\x00' + tempVarsPrefixKey++, 'compressRefExpr', '', true);
            }
            let expr = analyseExpr(v, src, prefix, isAnalysePath);
            return `'\x1e${expr.result}'`.replace(tailEmptyReg, '');
        };
        fn = fn.replace(tagReg, (_, tag, attrs) => {
            let hasMagixView = mxViewAttrReg.test(attrs); //是否有mx-view属性
            let hasIndeter = checkboxReg.test(attrs) && indeterminateReg.test(attrs);
            attrs = tmplCmd.recover(attrs, cmdStore, recoverString); //还原
            let findCount = 0;
            let mxRefExprInfo = [];
            let syncPaths = [];
            let transformEvent = (exprInfo, source, attrName, art) => { //转换事件
                let expr = exprInfo.expr;
                expr = analyseExpr(expr, source); //分析表达式
                for (let v of expr.vars) {
                    if (syncPaths.indexOf(v) == -1) {
                        syncPaths.push(v);
                    }
                }
                let e = `${art}['${expr.result}'`;
                if (exprInfo.fns) {
                    e += `,` + exprInfo.fns;
                }
                /*
                    对于view的绑定，如
                    <mx-calendar.rangepicker start="{{:date.start}}" end="{{:date.end}}"/>
                    不像input，只能读取value这唯一输入源。
                    自定义的情况下，输入源可以有多个，那么当我们绑定时，需要知道当前绑定表达式对应的属性是什么，从而来确定如何从输入源中把数据取出来
                */
                if (attrName && attrName.startsWith(htmlAttrParamPrefix)) {
                    let an = attrName.substring(htmlAttrParamPrefix.length);
                    an = utils.camelize(an);
                    e += `,'${an}'`;
                }
                e += ']';
                mxRefExprInfo.push(e);
            };
            attrs = attrs.replace(bindReg, (m, name, q, art, expr) => {
                expr = expr.trim();
                let exprInfo = extractFunctions(expr, processRefVariable);
                //console.log(exprInfo);
                art = art || '';
                transformEvent(exprInfo, m, name, art);
                findCount++;
                let replacement = '<%=';
                if (hasMagixView) {
                    if (name.startsWith(htmlAttrParamPrefix)) {
                        replacement = '<%#';
                    } else if (name.startsWith(tmplCondPrefix)) {
                        let key = name.replace(tmplCondPrefix, '');
                        let cd = e.tmplConditionAttrs[key];
                        if (cd && cd.attrName.startsWith(htmlAttrParamPrefix)) {
                            replacement = '<%#';
                        }
                    }
                }
                m = name + '=' + q + art + replacement + exprInfo.expr + '%>' + q;// + ' mxp="<%~' + exprInfo.expr + '%>"';
                hasIndeter = true;
                return m;
            }).replace(bindReg2, (m, art, expr) => {
                hasIndeter = true;
                expr = expr.trim();
                let exprInfo = extractFunctions(expr, processRefVariable);
                art = art || '';
                transformEvent(exprInfo, m, null, art);
                findCount++;
                return ' ';
            });
            attrs = attrs.replace(atRefOrAnalysePathExprReg, (m, pfx, cmd) => {
                let key = `'\x1e#'`;
                let isAnalysePath = pfx === '~';
                if (cmd != '\x03') {
                    key = processRefVariable(cmd, m, isAnalysePath);
                }
                if (isAnalysePath) {
                    hasIndeter = true;
                    return `<%=${key.replace('\x1e', '')}%>`;
                }
                return `<%#${cmd},${key}%>`;
            });
            if (findCount > 0) {
                attrs = ' mx-ctrl="[' + mxRefExprInfo.join(',') + ']" ' + attrs;
            }
            if (hasIndeter) {
                let mxo = '\x1f';
                attrs = ` mx-owner="${mxo}"` + attrs;
            }

            if (hasMagixView) {
                let keys = extractMxViewRootKeys(attrs);
                //console.log('xxxxx', keys);
                if (keys.length) {
                    attrs = ` ${tmplMxViewParamKey}="${keys}"${attrs}`;
                }
            }
            let prefix = '';
            return prefix + '<' + tag + attrs + '>';
        });
        fn = tmplCmd.store(fn, cmdStore);
        //console.log(groupReg);
        //let groupAllKeys = [];
        fn = fn.replace(groupReg, (_, attrs, content) => {
            if (groupKeyReg.test(attrs) &&
                groupContextReg.test(attrs)) {
                let ctxKey = '', keys = [];
                attrs.replace(groupContextReg, (m, c) => ctxKey = c);
                if (ctxKey) {
                    delete globalVars[ctxKey];
                }
                content = tmplCmd.recover(content, cmdStore);
                content.replace(tmplCmdReg, (m, o, c) => {
                    if (c) {
                        let ks = ExtractIds(c);
                        if (ks.length) {
                            for (let k of ks) {
                                m = findRoot(k);
                                //console.log(k, m);
                                if (m &&
                                    m != ctxKey &&
                                    m != '$viewId' &&
                                    !keys.includes(m)) {
                                    keys.push(m);
                                    // if (!groupAllKeys.includes(m)) {
                                    //     groupAllKeys.push(m);
                                    // }
                                }
                            }
                        }
                    }
                });
                if (keys.length) {
                    return `<${tmplGroupTag} ${tmplGroupRootAttr}="${keys.join(',')}"${attrs}>${content}</${tmplGroupTag}>`
                }
                return _;
            }
            return _;
        });
        //console.log(JSON.stringify(fn));
        //console.log(cmdStore);

        let shortHTMLUId = md5(e.shortHTMLFile, tmplStaticVarsKey);
        fn = tmplCmd.recover(fn, cmdStore, cmd => {
            return cmd.replace(groupsReg, `$&${shortHTMLUId}_`);
        });
        fn = recoverString(stripNum(fn));
        e.globalVars = Object.keys(globalVars);
        e.shortHTMLUId = shortHTMLUId;
        //e.globalGroupKeys = groupAllKeys;
        //console.log(fn);
        return fn;
    }
};