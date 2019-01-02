## 界面更新
1. 界面更新的前提是每次`digest`数据有变化，如果数据本身无变化则直接跳过更新过程
2. 对于表单类可输入的元素，如`input`等，当数据有变化时，如果是`<input />`这样写，即使没有写`value`，用户在界面上向`input`输入的值也会被清除掉，严格遵循有什么样的数据就有什么样的界面
3. 如果界面有`input`可供用户输入，此时`digest`时数据无变化，则界面上用户输入的并不会被清除掉，请参考第`1`点
4. 如果可以请给可供输入的如`input`都绑定对应的数据，做好双向绑定的工作，这样更利于理解：有什么样的数据就有什么样的界面

## 双向绑定
双向绑定技术已经成型，参考`zs_gallery/mx-form/index.js`即可

## checkbox
> 如何支持`indeterminate`?
1. 把`indeterminate`当成和`checked`一样的布尔属性进行输出
2. 在`view`的`domready`后，使用`mxe`属性查找属于当前`view`的`checkbox`，根据`checked`及是否有`indeterminate`来决定`input`的`indeterminate`是否选中
3. 该功能可以和双向绑定合并实现，在运行时增强表单元素。

## 引用文件内容
### html
1. 默认支持的后缀有`html,haml,pug,jade,tpl`
2. 支持配置其它后缀，对于一些如`jade`的文件，需要开发者通过`compileTmplStart`钩子方法进行处理后传回`magix-combine`,`magix-combine`只处理合法的`html`片断
3. `@`语法支持`@file.html`和`src@file.html`两种，`src`前缀的输出完整的字符串

### js
1. 目前仅内置支持`js,ts`两个后缀
2. 语法为`@file.js`或`top@file.js`,在当前位置或当前文件的顶部或底部输出文件内容
3. 被输出文件的顶部最好添加`#snippet;`指令禁止被输出文件编译到目标位置

### css
1. 目前内置支持`css,less,scss,sass,mx,style`
2. 为了使用方便，这些文件根据后缀使用相应的处理器被自动处理
3. `@file.css`,`global@file.css`,`ref@file.css`,`names@file.css`

### 其它

### 已内置的前缀
以下文件`@`前缀已被内置，如果您需要自定义前缀，请避开这些`top,bottom,src,global,ref,names,str,base64`