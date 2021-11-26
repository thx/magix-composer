let trimSemicolons = /;+/g;
let trimEndSemicolon = /;$/;
let trimSpaceAroundColon = /\s*:\s*/g;
let hasCmdReg = /\x07\d+\x07/;
let spaceReg = /[ \n\f\r]+/;
let cspace = /\s+/g;
let mxPrefix = 'mx5';
let reserveKeys = {
    'view': 1,//mx-view属性，用于渲染其它区块
    'vframe': 1,//mx-vframe属性，保留
    'owner': 1,//mx-owner 用于指示mx-view属于谁
    'html': 1,//mx-html保留
    'static': 1,//mx-static 保留
    'is': 1,//mx-is 保留
    'as': 1,//mx-as 保留
    'type': 1,//mx-type 保留
    'name': 1,//mx-name 保留
    'to': 1,//mx-to 保留
    'from': 1,//mx-from 保留
    'ctrl': 1,//mx-ctrl 用于从界面同步数据到js中
    'key': 1,//mx-key 用于each中对节点指定唯一key
    'updateby': 1,//mx-updateby 指示哪些数据变化更新mx-view
    'group': 1,//mx-group 保留
    'maker': 1,//mx-maker 保留
    'slot': 1,//mx-slot 指示当前view来源于其它view中
    'by': 1,//mx-by 保留
    'bindto': 1,//mx-bindto 从界面同步数据到js时，指示同步到哪个view上
    'bindexpr': 1,//mx-bindexpr 同步数据表达式
    'expr': 1,//mx-expr 保留
    'host': 1,//mx-host 指示绑定到哪个view上
    'syncexpr': 1,//mx-syncexpr 同步数据表达式
    'syncto': 1,//mx-syncto 从界面同步数据到js时，指示同步到哪个view上
    'processor': 1//mx-processor 保留
};
let innerKeys = Object.keys(reserveKeys).join('\\b|');
let tmplMxEventReg = new RegExp(`\\b(?:\\x1c\\d+\\x1c)?(?:mx5?-)(?!${innerKeys}\\b)([a-zA-Z0-9$]+)\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'g');
module.exports = {
    magixSpliter: '\x1e',
    mxPrefix,
    artCommandReg: /\{\{(?!\{)[\s\S]*?\}\}(?!\})/g,//art模板
    microTmplCommand: /<%[\s\S]*?%>/g,
    revisableReg: /@:\{[a-zA-Z\.0-9\-\~#_&]+\}/,
    revisableGReg: /@:\{[a-zA-Z\.0-9\-\~#_&]+\}/g,
    revisableTail: '~rs',
    selfCssRefReg: /@:(@keyframes|@font-face)?\(\.?([\w\-_:]+)\)/g,
    galleryFileNames: ['_config', 'config', 'cfg', '_cfg'],
    galleryFileSuffixes: ['mjs', 'js'],
    galleryAttrAppendFlag: '_',
    atViewPrefix: '@:',
    galleryProcessed: Symbol('gallery.processed'),
    galleryDynamic: Symbol('gallery.dynamic.config'),
    cssRegexpKey: Symbol('css.regexp.key'),
    tmplStoreIndexKey: Symbol('tmpl.store.index.key'),
    cssminifier: {},
    htmlminifier: { //html压缩器选项 https://www.npmjs.com/package/html-minifier
        html5: true,
        removeComments: true, //注释
        collapseWhitespace: true, //空白
        quoteCharacter: '"', //属性引号
        minifyCSS(x) {
            return x.replace(trimSemicolons, ';')
                .replace(trimEndSemicolon, '')
                .replace(trimSpaceAroundColon, ':');
        },//压缩css,如标签属性中的style
        sortClassName(names) {
            if (!hasCmdReg.test(names)) {
                let xNames = names.split(spaceReg);
                names = xNames.sort().join(' ');
            } else {
                names = names.replace(cspace, ' ');
            }
            //console.log(names);
            return names;
        },
        removeEmptyAttributes: false, //移除空的属性
        collapseInlineTagWhitespace: true, //移除标签间的空白
        caseSensitive: true, //保持大小写
        keepClosingSlash: true,//保持关闭斜杠
        includeAutoGeneratedTags: false,//自动插入tag
        removeRedundantAttributes: true //移除默认的属性，如input当type="text"时 type可被移除
    },
    tmplGlobalVars: {
        window: 1,
        JSON: 1,
        document: 1,
        console: 1,
        location: 1,
        Math: 1,
        Number: 1,
        isNaN: 1,
        typeof: 1,
        isFinite: 1,
        parseInt: 1,
        parseFloat: 1,
        Infinity: 1,
        NaN: 1,
        encodeURIComponent: 1,
        decodeURIComponent: 1,
        escape: 1,
        unescape: 1,
        encodeURI: 1,
        decodeURI: 1,
        eval: 1,
        undefined: 1,
        history: 1,
        localStorage: 1,
        sessionStorage: 1,
        navigator: 1,
        Array: 1,
        Date: 1,
        String: 1,
        Function: 1,
        Boolean: 1,
        Object: 1,
        Intl: 1,
        screen: 1,
        atob: 1,
        btoa: 1,
        performance: 1
    }, //模板中全局变量
    htmlAttrParamFlag: '*',
    htmlAttrParamPrefix: '_p_:',
    quickPlaceholderTagName: 'qk:ph',
    quickDirectTagName: 'qk:direct',
    quickCommandTagName: 'qk:cmd',
    quickDirectCodeAttr: 'qk:code',
    quickSpreadAttr: 'qk:spread',
    quickAutoAttr: 'qk:auto',
    quickOpenAttr: 'qk:open',
    quickCloseAttr: 'qk:close',
    quickForAttr: 'qk:for',
    quickForInAttr: 'qk:forin',
    quickEachAttr: 'qk:each',
    quickIfAttr: 'qk:if',
    quickElseIfAttr: 'qk:elif',
    quickElseAttr: 'qk:else',
    quickSourceArt: 'qk:srcart',
    quickDeclareAttr: 'qk:declare',
    quickGroupFnPrefix: '$slots.',
    quickGroupObjectPrefix: '$slots.',
    quickGroupObjectPrefix1: '$slots[',
    quickLoopReg: /\b(qk:each|qk:forin)\s*=\s*(['"])([^'"]+)\2/g,
    quickConditionReg: /\b(qk:if|qk:elif|qk:for)\s*=\s*(['"])([^'"]+)\2/g,
    //tmplTempStaticKey: '_t_:static',
    tmplTempRealStaticKey: '_t_:r-static',
    tmplTempInlineStaticKey: '_t_:r-inline-static',
    tmplGroupTag: 'qk:slot',
    tmplOriginGroupTag: 'mx-slot',
    tmplGlobalDataRoot: '$dataFromView',
    tmplGroupKeyAttr: '_t_:gkey',
    tmplGroupUseAttr: '_t_:guse',
    tmplCondPrefix: '_t_:cond_',
    tmplGroupRootAttr: '_t_:root',
    tmplGroupId: '_t_:gid',
    tmplGroupParentId: '_t_:gpid',
    tmplMxViewParamKey: '$',
    tmplStaticKey: '_',
    tmplVarTempKey: '$temp_var',
    cssScopedVarPrefix: '--scoped-',
    tmplMxEventReg,
    styleImportReg: /^(ref|compiled)?@?([\w\.\-\/\\]+?(?:\.css|\.less|\.mx|\.mmx|\.style))$/,
    styleDependReg: /(?:\.css|\.less|\.mx|\.mmx|\.style)$/i,
    styleInJSFileReg: /(\(\s*)?(['"]?)\(?(ref|compiled)?\x12@:([\w\.\-\/\\]+?)(\.css|\.less|\.mx|\.mmx|\.style)(?::\.?([\w\-@$\(\)\{\},]+))?\)?\2(\s*\))?(;?)/g,
    styleInHTMLReg: /@:([~\w\.\-\/\\]+?)(\.css|\.less|\.mx|\.mmx|\.style):\.?([\w\-]+)/g,
    cssRefReg: /\[(['"])\s*(?:ref)?\s*@:([\w\.\-\/\\]+?)(\.css|\.less|\.scss|\.mx|\.mmx|\.style):([\w\-]+)\1\]/g,
    cssVarRefReg: /(['"])\s*(?:ref)?\s*@:([\w\.\-\/\\]+?)(\.css|\.less|\.scss|\.mx|\.mmx|\.style):(--[\w$\-_]+)\1/,
    isMxEvent(name) {
        if (name.startsWith('mx-')) {
            let rest = name.split('-');
            rest.shift();
            rest = rest.join('-');
            return !reserveKeys.hasOwnProperty(rest);
        }
        return false;
    }
};