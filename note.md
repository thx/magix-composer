## 界面更新
1. 界面更新的前提是每次`digest`数据有变化，如果数据本身无变化则直接跳过更新过程
2. 对于表单类可输入的元素，如`input`等，当数据有变化时，如果是`<input />`这样写，没有写`value`，用户在界面上向`input`输入的值会保留
3. 如果界面有`input`可供用户输入，此时`digest`时数据无变化，则界面上用户输入的并不会被清除掉，请参考第`1`点
4. 如果可以请给可供输入的如`input`都绑定对应的数据，做好双向绑定的工作，这样更利于理解：有什么样的数据就有什么样的界面

## 双向绑定
双向绑定技术已经成型，参考`zs_gallery/mx-form/index.js`即可

## 传递整个参数对象
```html
<mx-vframe src="./view"
 *="{{# params }}"/>
```

## checkbox
> 如何支持`indeterminate`?
1. 把`indeterminate`当成和`checked`一样的布尔属性进行输出
2. 在`view`的`domready`后，使用`mxe`属性查找属于当前`view`的`checkbox`，根据`checked`及是否有`indeterminate`来决定`input`的`indeterminate`是否选中
3. 该功能可以和双向绑定合并实现，在运行时增强表单元素。
4. 如`<input type="checkox" indeterminate="{{=true}}" />`

## 校验
1. 增加一个校验器`mixin`插件
2. 页面使用，这样才能更大化的灵活
```html
<input value="{{:user.name&{required:true,maxLength:20}}}" vd-trigger="input,focusin"/>
<span vd-msg-for="{{~user.name}}"></span>
```

## 引用文件内容
### html
1. 默认支持的后缀有`html,htm,tpl,art,quick,qk`
2. 支持配置其它后缀，对于一些如`jade`的文件，需要开发者通过`compileTmplStart`钩子方法进行处理后传回`magix-combine`,`magix-combine`只处理合法的`html`片断
3. `@`语法支持`@:file.html`和`compiled@:file.html`两种，`compiled`前缀的输出完整的字符串

### js
1. 目前仅内置支持`js,ts`两个后缀
2. 语法为`@:file.js`或`top@:file.js`,在当前位置或当前文件的顶部或底部输出文件内容
3. 被输出文件的顶部最好添加`#snippet;`指令禁止被输出文件编译到目标位置

### css
1. 目前内置支持`css,less,mx,style`
2. 为了使用方便，这些文件根据后缀使用相应的处理器被自动处理
3. `@:file.css`,`ref@:file.css`,`compiled@:file.css`
4. `css`中保持选择器不被变换：`:global(.selector){}`或`.cond::global(.selector)`或`@global{.selector{}}`

### 其它

### 已内置的前缀
以下文件`@`前缀已被内置，如果您需要自定义前缀，请避开这些`top,bottom,src,global,ref,compiled,str,base64,style,html`

## 引用样式

1. `js`中引用样式`@:./path.css:name`
2. `js`中引用`css3`中的变量`@:./path.css:--name`;
3. `js`中引用`@`规则 `@:./path.css:@font-face(name) @:./path.css:@keyframes(name)`

4. `css`中引用样式:`["ref@:./path.css:name"]{}`或[ref="@:./path.css:name"]
5. `css`中引用其它`css`文件中的变量`color:var("ref@:./path.css:--name")`;
6. `css`中引用其它`css`文件中的`@`规则`font-family:("ref@:./path.css:@font-face(name)")`,`animation-name:("ref@:./path.css:@keyframes(name)")`;

7. `html`中引用样式:`@:(name)`。只能引用当前文件有关联的样式，不能引用其它样式
8. `html`中引用变量:`@:(--name)`。只能引用当前文件有关联的样式，不能引用其它样式
9. `html`中引用@规则:`@:@keyframes(scale)`，`@:@font-face(scale)`。只能引用当前文件有关联的样式，不能引用其它样式

10. 变量名称用`--`两个字符开头识别，普通选择器不要使用`--`开头
11. 全局样式`:gloal(.selector)`，全局编译变量`var(--scoped-var-name)`,全局不编译变量`var(--mx-var-name)`
12. 引用其它可能变化的字符串`counter("ref@:./path.css#counter-name")`
13. 一半编译`.user--name` `@keyframe anim--1`

## css变量
1. 不编译，需要配置`cssGlobalVarPrefixes`这个数组，默认为['--mx-','--magix-']
2. 全局编译，默认`--scoped-`前缀，在`js`中需要使用时`@scoped.style:--scoped-var-name`
3. 其它正常写`--var-name`，引用其它文件中的`color:var("ref@:./path.css:--var-name")`

## 内置标签
1. `mx-vframe` 引用其它`view`，如`<mx-vframe src="./path/to/view" tag="td" *param="123"/>`
2. `mx-link` 跳转链接，并自动处理参数，如`<mx-link to="/link/address" *name="行列">click</mx-link>`
3. `mx-slots` 定义`html`复用的片断

## 参数
`mx-link`或`mx-vframe`中的参数必须以`*`开头

```html
<mx-link *user-id="{{=a}}"></mx-link>
```

禁止自动参数编码
```html
<mx-link *user-id="{{=a}}" mx-encode="false"></mx-link>
```
追加到`url`中，支持:expr和${expr}两种语法
```html
<mx-link to="path/to/:target/${type}.html" *target="{{=target}}" *type="{{=type}}"></mx-link>
```

布尔条件判断输出属性
```html
<mx-link *user-id="{{=a}}?"></mx-link><!--a为trusy时输出user-id-->
<mx-link *user-id="{{=a}}?{{=b}}"></mx-link><!--a为trusy时输出b的值-->
```
有值条件判断输出属性
```html
<div data-test="{{=a}}??"></div><!--当a不为null或undefined时，输出data-test="a value"，当a计算为false或null时，删除data-tst-->
<div data-test="{{=a}}??bbb"></div><!--当a不为null或undefined时,输出data-test="bbb"-->
```
保留??或?

```html
<mx-link *@url="{{=preifx}}?key=a&sub=b"></mx-link>
```

## html复用
> 假设同样一段`html`在不同的场景下放在不同的节点里，比如在场景`a`放在`div`标签，场景`b`放在`span`标签，我们可以使用内置的`mx-group`标签来实现

```html
<div>
    top div
</div>
<mx-slot name="content">
    content {{=name}} here
    <div>
        <span>inner</span>
    </div>
</mx-slot>

{{if from=='a'}}
    <div>
        <mx-slot use="content"/>
    <div>
{{else}}
    <span>
        <mx-slot use="content"/>
    </span>
{{/if}}
```

> 注意使用顺序，内容只能放前面，使用只能放后面，即先定义再使用

## 试验中的片断传递
```html
<mx-vframe src="./a">
    <mx-slot name="a-b-c" fn="src">
        {{=src.name}}
    </mx-slot>
</mx-vframe>
<!--a.html-->
<mx-slot use="a-b-c" fn="{{={name:'123'}}}">
```


## 模板中保留的变量
1. $viewId
> 用于获取当前view的id

## 组件配置
> 通过组件目录下放置`_cfg.js`来提供配置，如
```js
module.exports={
    'mx-table.test'(){
        return '<div class="@:./index.less:table-root"></div>'
    }
}
```
通过`@:./index.less:table-root`引用当前相对目录下的样式文件


## 改变模块id
1. 通过`resolveModuleId`改变`define`时的`id`
2. 通过`mxViewProcessor`改变`html`中的`view`模块
3. 通过`resolveRequire`改变`require`或`import`写法及对应的模块`id`


## mx-key
如果想进一步提升渲染性能，可对如each列表指定key，magix5会在数据移动时，直接移动节点替换逐个更新节点。新手请忽略该配置

{{each list as e}}
    <div mx-key="{{=e.id}}">
        {{=e.id}}
    </div>
{{/each}}

## mx-updateby
可通过mx-updateby强制view与某些数据关联，如

<mx-vframe src="./path/to/view" *user-id="{{# user.id }}" *card="{{# list[0].cards[1]}}" mx-updateby="user,list,coupons"/>

## mx-syncto mx-bindexpr
syncto指定数据同步到哪个view上,bindexpr指定绑定表达式

mx-syncfrom mx-bindfrom 从哪个view同步或绑定
<input mx-bindfrom="{{=viewId}}" />

<input mx-syncto="{{=a}}" mx-bindexpr="[user.name]"/>
修改动态生成的mx5-expr
<input mx-forexpr="{{~expr.path}}" />

多绑定，忽略mx-mbind，开发时更符合html属性规范
`mx-multi-bind`
<input mx-mbind="{{:user?.name}}" mx-mbind="{{:current.name}}"/>


## mx-source及 mx-source-whole

```html
<!--以下代码art模板会执行，其它转义输出，整体放在pre标签内-->
<mx-source>
    <div>adfd</span>
    {{each list as a}}
    <span>{{=a}}
    {{/each}}
</mx-source>
```

```html
<!--以下代码全部转义输出，整体放在pre标签内-->
<mx-source whole="true">
    <div>adfd</span>
    {{each list as a}}
    <span>{{=a}}
    {{/each}}
</mx-source>
```

 ```html
<!--以下代码全部转义输出，没有pre标签-->
<mx-source-whole>
    <div>adfd</span>
    {{each list as a}}
    <span>{{=a}}
    {{/each}}
</mx-source-whole>
```

### mx-html及mx-safe-html
<div mx-html="{{=html}}"></div>
<div mx-safe-html="{{=html}}"></div> 需提供$sanitize方法
<div mx-html="{{=html}}??"></div> 不支持boolean判断


## 内置模块或路径转换
> 在ts代码中书写

```ts
'@:{moduleId}'//当前模块id
'@:../name/to'//相对转绝对
'@:~/path/to'//~是为开发者保留的需要自己逻辑的占位符，需要实现resolveVirtual方法
'@:*/path/to'//*表示根项目名称
```