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
3. `@:file.css`,`global@:file.css`,`ref@:file.css`,`compiled@:file.css`
4. `css`中保持选择器不被变换：`:global(.selector){}`或`@global{.selector{}}`

### 其它

### 已内置的前缀
以下文件`@`前缀已被内置，如果您需要自定义前缀，请避开这些`top,bottom,src,global,ref,compiled,str,base64,style,html`

## 引用样式
1. 引用全局或全局局部样式`@:scoped.style:name`
2. `js`中引用样式`@:./path.css:name`或`@:$(name)`
3. `css`中引用样式:`[ref="@:./path.css:name"]{}`
4. `html`中引用样式:`@:$(name)`。只能引用当前文件有关联的样式，不能引用其它样式
5. `js`中引用`css3`中的变量`@:./path.css:--name`;
6. `css`中引用其它`css`文件中的变量`color:var("ref=@:./path.css:--name")`;
7. `html`中引用变量:`@:$(--name)`。只能引用当前文件有关联的样式，不能引用其它样式
8. 变量与样式选择器名称用`--`两个字符开头识别，普通选择器不要使用`--`开头
9. 全局样式`:gloal(.selector)`全局变量`var(--__global__-var-name)`

## 内置标签
1. `mx-vframe` 引用其它`view`，如`<mx-vframe src="./path/to/view" tag="td" *param="123"/>`
2. `mx-link` 跳转链接，并自动处理参数，如`<mx-link to="/link/address" *name="行列">click</mx-link>`
3. `mx-group` 定义`html`复用的片断

## html复用
> 假设同样一段`html`在不同的场景下放在不同的节点里，比如在场景`a`放在`div`标签，场景`b`放在`span`标签，我们可以使用内置的`mx-group`标签来实现

```html
<div>
    top div
</div>
<mx-group name="content">
    content {{=name}} here
    <div>
        <span>inner</span>
    </div>
</mx-group>

{{if from=='a'}}
    <div>
        <mx-group use="content"/>
    <div>
{{else}}
    <span>
        <mx-group use="content"/>
    </span>
{{/if}}
```

> 注意使用顺序，内容只能放前面，使用只能放后面，即先定义再使用

## 试验中的片断传递
```html
<mx-group name="list" fn="$list">
    list fn:
    {{if list}}
        {{each $list as item index}}
        {{=index+1}}:{{=item.title}}
        {{/each}}
    {{/if}}
    {{=outerVariable}}
</mx-group>

<mx-vframe src="./x" *ref="{{# $groups.list }}"/>
or 
{{& groups.list([{title:'good'}])}}
```
> 本质上这个`mx-group`被编译成函数，为了防止函数形参与外部相同，建议使用`_`开头的变量


## 模板中保留的变量
1. $viewId
> 用于获取当前view的id
2. $groups
> 用于获取所有`<mx-group>`

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