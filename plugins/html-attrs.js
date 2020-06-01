/*
    属性映射，仅罗列了常用属性，后期有时间再补充完整
 */
let tagsBooleanPrpos = {
    '*': {
        spellcheck: 1,
        hidden: 1
    },
    input: {
        autofocus: 1,
        disabled: 1,
        readonly: 1,
        required: 1,
        multiple: 1
    },
    'input&checkbox': {
        checked: 1,
        indeterminate: 1
    },
    'input&radio': {
        checked: 1,
        indeterminate: 1
    },
    textarea: {
        autofocus: 1,
        disabled: 1,
        readonly: 1,
        required: 1
    },
    select: {
        disabled: 1,
        multiple: 1,
        required: 1
    },
    audio: {
        autoplay: 1,
        controls: 1,
        loop: 1,
        muted: 1
    },
    video: {
        autoplay: 1,
        controls: 1,
        loop: 1,
        muted: 1
    },
    button: {
        autofocus: 1,
        disabled: 1
    },
    form: {
        novalidate: 1
    },
    img: {
        ismap: 1
    },
    hr: {
        noshade: 1
    },
    area: {
        nohref: 1
    },
    td: {
        nowrap: 1
    },
    progress: {
        indeterminate: 1
    }
};
let tagsProps = {
    '*': {

    },
    input: {
        value: 'value'
    },
    'input:checkbox': {
        checked: 'checked'
    },
    'input:radio': {
        checked: 'checked'
    },
    option: {
        selected: 'selected'
    },
    textarea: {
        value: 'value'
    }
};

let tagsAcceptUserInput = {
    input: 1,
    textarea: 1,
    option: 1
};
let escapeReg = /[<>"']/g;
let escapeMap = {
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#27;'
};
let escapeProcessor = m => escapeMap[m] || m;
module.exports = {
    getInputTags() {
        return tagsAcceptUserInput;
    },
    escapeAttr(attr) {
        return attr.replace(escapeReg, escapeProcessor);
    },
    getProps(tag, type) {
        let all = Object.assign({}, tagsProps['*']);
        let tagAndType = `${tag}:${type}`;
        let props = tagsProps[tagAndType];
        if (props) {
            all = Object.assign(all, props);
        } else {
            let tags = tagsProps[tag];
            if (tags) {
                all = Object.assign(all, tags);
            }
            tags = tagsProps[tag + '&' + type];
            if (tags) {
                all = Object.assign(all, tags);
            }
        }
        return all;
    },
    getBooleanProps(tag, type) {
        let globals = Object.assign({}, tagsBooleanPrpos['*']);
        let tags = tagsBooleanPrpos[tag];
        if (tags) {
            globals = Object.assign(globals, tags);
        }
        tags = tagsBooleanPrpos[tag + '&' + type];
        if (tags) {
            globals = Object.assign(globals, tags);
        }
        return globals;
    }
};