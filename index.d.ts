declare module "magix-combine" {
    interface ICombineResult {
        /**
         * 通过config指定的tmplFolder文件夹中的文件路径
         */
        from: string
        /**
         * 通过config指定的srcFolder文件夹中的文件路径
         */
        to: string | undefined
        /**
         * 当前编译的from文件依赖的其它文件
         */
        fileDeps: {
            [key: string]: 1
        }
        /**
         * 文件内容
         */
        content: string
        /**
         * 指示是否排除define的包装
         */
        exclude: boolean
        /**
         * 指示是否把该文件内容根据to的位置写入到硬盘上
         */
        writeFile: boolean
        /**
         * 模块id
         */
        moduleId: string
        /**
         * 依赖的其它模块，同requires
         */
        deps: string[]
        /**
         * 依赖的其它模块，同deps
         */
        requires: string[]
        /**
         * 依赖的模块声明的变量
         */
        vars: string[]
        /**
         * 当前js文件收集到的样式名称映射对象
         */
        cssNamesMap: {
            [originalSelector: string]: string
        }
        /**
         * 当前js文件收集到的样式名称所在的文件
         */
        cssNamesInFiles: {
            [selector: string]: string
        }
        /**
         * 当前js文件收集到的样式标签名称所在的文件
         */
        cssTagsInFiles: {
            [tag: string]: string
        },
        /**
         * 模块包名
         */
        pkgName: string
    }
    interface IRequireInfo {
        /**
         * require语句变量前面的前缀信息，如var或,等
         */
        prefix: string
        /**
         * require语句后面的信息，如;等
         */
        tail: string
        /**
         * 未经任何处理的原始模块id
         */
        originalDependedId: string
        /**
         * 依赖的id
         */
        dependedId: string
        /**
         * 声明的变量字符串
         */
        variable: string
        /**
         * 如果存在该字段，则把require语句换成该字段指定的内容
         */
        replacement?: string
    }
    interface ICheckerConfig {
        /**
         * 样式
         */
        css: boolean
        //tmplAttrImg: boolean
        /**
         * 不允许的标签
         */
        tmplDisallowedTag: boolean
        /**
         * 危险的属性
         */
        tmplAttrDangerous: Boolean
        /**
         * 检测anchor类标签
         */
        tmplAttrAnchor: boolean
        /**
         * 检测iframe标签属性
         */
        tmplAttrIframe: boolean
        /**
         * 重复的属性
         */
        tmplDuplicateAttr: boolean
    }
    /**
     * 组件信息对象
     */
    interface IGMap {
        /**
         * 组件的路径
         */
        path: string
        /**
         * 生成组件时，使用的原生的html标签
         */
        tag: string
    }
    interface ICompileCssStart {
        /**
         * 扩展名
         */
        ext: string
        /**
         * 文件完整路径
         */
        file: string
        /**
        * css内容
        */
        content: string
        /**
         * 短文件名
         */
        shortFile: string
    }
    /**
     * 读取css结果对象
     */
    interface ICompileCssResult {
        /**
         * 读取的样式文件是否存在
         */
        exists: boolean
        /**
         * 文件完整路径
         */
        file: string
        /**
         * css内容
         */
        content: string
        /**
         * source map
         */
        map: object
    }
    interface IConfig {
        /**
         * 编译的模板目录。默认tmpl
         */
        commonFolder?: string
        /**
         * 编译结果存储目录。默认src
         */
        compiledFolder?: string
        /**
         * 匹配模板中模板引擎语句的正则，对模板处理时，先去掉无关的内容处理起来会更准确
         */
        tmplCommand?: RegExp
        /**
         * cssnano压缩选项
         */
        cssnano: object
        /**
         * less编译选项
         */
        less: object
        /**
         * sass编译选项
         */
        sass: object
        /**
         * 生成样式选择器时的前缀，通常是项目名。
         */
        projectName?: string
        /**
         * 是否输出css sourcemap，默认false
         */
        //sourceMapCss?: boolean

        /**
         * 是否支持类似 import 'style.css'　导入样式的语法，默认false
         */
        importCssSyntax?: boolean

        /**
         * magix模块名称，默认magix
         */
        magixModuleIds?: [string]

        /**
         * 任务同时执行的并发数量，默认为1
         */
        concurrentTask: number
        /**
         * autprefixer配置
         */
        autoprefixer?: object
        /**
         * 加载器类型，该选项决定如何添加包装，如添加define函数。默认为cmd加载器
         */
        loaderType?: "amd" | "amd_es" | "cmd" | "cmd_es" | "iife" | "iife_es" | "none" | "webpack" | "kissy" | "kissy_es" | "umd" | "umd_es" | "acmd" | "acmd_es"
        /**
         * 加载器工厂名称
         */
        loaderFactory?: string
        /**
         * 是否输出日志信息。默认为true
         */
        log?: boolean

        /**
         * 编译成调试版本，默认false
         */
        debug?: boolean
        /**
         * 检测对象
         */
        checker?: ICheckerConfig
        /**
         * 项目中使用的全局样式，不建议使用该选项
         */
        globalCss?: string[]
        /**
         * 项目中全局但做为scoped使用的样式
         */
        scopedCss?: string[]
        /**
         * 对样式做检测时，忽略某些全局样式的检测，该选项配合globalCss使用。
         */
        uncheckGlobalCss?: string[]
        /**
         * 是否使用@转换路径的功能，如@./index转换成app/views/orders/index。默认为true
         */
        useAtPathConverter?: boolean
        /**
         * 待编译的文件后缀，默认为['js', 'mx', 'ts', 'jsx', 'es', 'tsx']
         */
        jsFileExtNames?: string[]

        /**
         * mx-view　处理器
         */
        mxViewProcessor?: ({ path: string, pkgName: string }) => string
        /**
         * 待编译的模板文件后缀，默认为['html', 'haml', 'pug', 'jade', 'tpl']
         */
        tmplFileExtNames?: string[]
        /**
         * 是否使用类mustach模板，默认true
         */
        tmplArtEngine?: boolean
        /**
         * 模板中的全局变量，这些变量不会做scope处理
         */
        tmplGlobalVars?: object
        /**
         * 是否启用双向绑定时生成唯一一个mxe属性，默认true
         */
        magixUpdaterBindExpression?: boolean
        /**
         * 排除文件
         */
        excludes?: string[]
        /**
         * 编译文件被写入硬盘时调用
         */
        writeFileStart?: (e: ICombineResult) => void
        /**
         * 开始编译某个js文件之前的处理器，可以加入一些处理，比如typescript的预处理
         */
        compileJSStart?: (content: string, e: ICombineResult) => string | Promise<ICombineResult> | Promise<string>
        /**
         * 结束编译时的处理器
         */
        compileJSEnd?: (content: string, e: ICombineResult) => string | Promise<ICombineResult> | Promise<string>
        /**
         * 开始编译css前处理器
         */
        compileCSSStart?: (css: string, e: ICompileCssStart) => Promise<string> | string
        /**
         * 结束编译css时的处理器
         */
        compileCSSEnd?: (css: string, e: ICompileCssResult) => Promise<string> | string
        /**
         * 对自定义标签做加工处理
         */
        customTagProcessor?: (tmpl: string, e?: ICombineResult) => string
        /**
         * 检测js代码中循环嵌套的层数，当超过该值时，输出提示，默认4层。合理的数据结构可以减少循环的嵌套，有效的提升性能
         */
        jsLoopDepth?: number

        /**
         * 组件配置对象
         */
        galleries?: object
        /**
         * 对模板中的标签做处理
         */
        tmplTagProcessor?: (tag: string) => string
        /**
         * 开始转换模板
         */
        compileTmplStart?: (tmpl: string) => string
        /**
         * 结束转换模板
         */
        compileTmplEnd?: (tmpl: string) => string

        applyStyleProcessor?: () => string
        /**
         * 加工处理模块id
         */
        resolveModuleId?: (moduleId: string) => string
        /**
         * 加工处理require语句
         */
        resolveRequire?: (requireInfo: IRequireInfo, e?: ICombineResult) => void
    }

    /**
     * 配置打包编译参数
     * @param cfg 配置对象
     */
    function config(cfg: IConfig): IConfig
    /**
     * 遍历文件夹及子、孙文件夹下的文件
     * @param folder 文件夹
     * @param callback　回调
     */
    function walk(folder: string, callback: (file: string) => void): void

    /**
     * 读取文件内容
     * @param file 文件路径
     * @param original 是否二进制数据
     */
    function readFile<T>(file: string, original: boolean): T
    /**
     * 复制文件，当复制到的路径中文件夹不存在时，会自动创建文件夹
     * @param from 源文件位置
     * @param to 复制到目标位置
     */
    function copyFile(from: string, to: string): void

    /**
     * 写入文件内容，当目标位置中的文件夹不存在时，会自动创建文件夹
     * @param to 目标位置
     * @param content　文件内容
     */
    function writeFile(to: string, content: string): void

    /**
     * 移除magix-combine中对该文件相关的依赖及其它信息
     * @param from 模板文件夹tmpl中的文件
     */
    function removeFile(from: string): void
    /**
     * 根据配置信息编译整个项目中的文件
     */
    function combine(): Promise<void>

    /**
     * 编译单个模板文件并写入src目录
     * @param from 模板文件夹tmpl中的文件
     */
    function processFile(from: string): Promise<void>

    /**
     * 编译文件内容，返回编译后的对象，不写入到硬盘
     * @param from 模板文件夹tmplFolder中的文件
     * @param to 源文件夹srcFolder中的文件位置，可选
     * @param content 文件内容，可选
     */
    function processContent(from: string, to?: string, content?: string): Promise<ICombineResult>

    /**
     * 处理tmpl文件夹中的模板文件，通常向节点添加spm等属性
     */
    function processTmpl(): Promise<void>
    /**
     * 移除某个文件的缓存，在下次编译的时候重新编译该文件
     * @param file 文件路径
     */
    function removeCache(file: string): void

    /**
     * 获取依赖当前文件的其它文件
     * @param file 文件路径
     */
    function getFileDependents(file: string): object
}