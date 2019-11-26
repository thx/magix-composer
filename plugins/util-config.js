module.exports = {
    loaderType: 'module', //加载器类型
    loaderFactory: 'define',
    moduleSuffix: '.js',
    commonFolder: 'tmpl', //模板文件夹，该文件夹下的js无法直接运行
    compiledFolder: 'src', //经该工具编译到的源码文件夹，该文件夹下的js可以直接运行
    excludes: [],
    cssnano: { //css压缩选项
        from: undefined,
        autoprefixer: false,
        minifyFontValues: false
    },
    less: {}, //less编译选项
    autoprefixer: {},
    concurrentTask: 1,//并发任务数量
    projectName: null, //css选择器前缀，通常可以是项目的简写，多个项目同时运行在magix中时有用
    log: true, //日志及进度条
    debug: false, //
    revisableStringPrefix: '',//set default value at util-init.js
    revisableStringMap: {},
    checker: {
        css: true, //样式
        tmplDisallowedTag: true, //不允许的标签
        tmplAttrDangerous: true, //危险的属性
        tmplAttrAnchor: true, //检测anchor类标签
        tmplAttrIframe: true, //检测iframe相关
        tmplDuplicateAttr: true //重复的属性
    },
    tmplFileExtNames: ['html', 'haml', 'pug', 'jade', 'tpl'], //模板后缀
    tmplCustomAttrs: [],//自定义属性
    tmplRadioOrCheckboxRename: true,
    tmplAddViewsToDependencies: true,
    tmplGlobalVars: {
        window: 1,
        JSON: 1,
        document: 1,
        console: 1,
        Math: 1,
        Number: 1,
        isNaN: 1,
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
        screen: 1
    }, //模板中全局变量
    //双向绑定时，是否生成mxe表达式
    magixUpdaterBindExpression: false,
    selectorSilentErrorCss: false,//css选择器处理失败时，使用原有的选择器还是提示用户出错
    sourceMapCss: false,
    importCssSyntax: false,
    //auto set true or false at util-init
    moduleAddVirtualRootToId: null,
    magixModuleIds: ['magix', 'magix5'],
    scopedCss: [], //全局但做为scoped使用的样式
    fileReplacerPrefixes: [],
    jsFileExtNames: ['js', 'mjs', 'mx', 'mmx', 'ts', 'mts', 'jsx', 'es', 'tsx', 'mtsx'], //选择编译时的后缀名
    galleries: {
        mxRoot: 'app/galleries/',
        wgtRoot: 'app/widgets/'
    },
    components: {
        xyRoot: 'app/components/'
    },
    customTagOrAttrProcessor() {
        return '';
    },
    mxViewProcessor() {

    },
    writeFileStart(e) {
        return e;
    },
    compileJSStart(content) { //开始编译某个js文件之前的处理器，可以加入一些处理，比如typescript的预处理
        return content;
    },
    compileJSEnd(e) { //结束编译
        return e;
    },
    compileCSSStart(css) {
        return css;
    },
    compileCSSEnd(css) {
        return css;
    },
    tmplTagProcessor(tag) { //为了tmpl-naked准备的，遇到模板标签如何处理
        return tag;
    },
    compileTmplStart(tmpl) {
        return tmpl;
    },
    compileTmplEnd(tmpl) {
        return tmpl;
    },
    cssContentProcessor(css) { //处理内容
        return css;
    },
    fileReplacerProcessor(ctrl, file) {

    },
    applyStyleProcessor(r) {
        return r;
    },
    resolveModuleId(id) { //处理模块id时的处理器
        return id;
    },
    resolveRequire() { //处理rqeuire时的处理器
    }
};