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
        accesskey: 'accessKey',
        class: 'className',
        contenteditable: 'contentEditable',
        dir: 'dir',
        draggable: 'draggable',
        hidden: 'hidden',
        id: 'id',
        is: 'is',
        lang: 'lang',
        slot: 'slot',
        style: 'style',
        spellcheck: 'spellcheck',
        tabindex: 'tabIndex',
        title: 'title',
        translate: 'translate',
        role: 'role'
    },
    a: {
        href: 'href',
        charset: 'charset',
        hreflang: 'hreflang',
        download: 'download',
        name: 'name',
        rel: 'rel',
        rev: 'rev',
        type: 'type',
        target: 'target'
    },
    area: {
        href: 'href',
        coords: 'coords',
        shape: 'shape',
        target: 'target',
        nohref: 'noHref',
        alt: 'alt',
        name: 'name'
    },
    audio: {
        autoplay: 'autoplay',
        controls: 'controls',
        src: 'src',
        loop: 'loop',
        muted: 'muted',
        volume: 'volume'
    },
    button: {
        autofocus: 'autofocus',
        disabled: 'disabled',
        value: 'value',
        name: 'name',
        form: 'form',
        type: 'type',
        formenctype: 'formEnctype',
        formmethod: 'formMethod',
        formnovalidate: 'formNovalidate',
        formaction: 'formAction',
        formtarget: 'formTarget'
    },
    canvas: {
        width: 'width',
        height: 'height'
    },
    col: {
        align: 'align',
        char: 'ch',
        charoff: 'chOff',
        span: 'span',
        valign: 'vAlign',
        width: 'width'
    },
    colgroup: {
        align: 'align',
        char: 'ch',
        charoff: 'chOff',
        span: 'span',
        valign: 'vAlign',
        width: 'width'
    },
    del: {
        site: 'site',
        datetime: 'dateTime'
    },
    dialog: {
        open: 'open'
    },
    embed: {
        width: 'width',
        height: 'height',
        src: 'src',
        type: 'type'
    },
    fieldset: {
        disabled: 'disabled',
        form: 'form',
        name: 'name'
    },
    form: {
        autocomplete: 'autocomplete',
        novalidate: 'noValidate',
        'accept-charset': 'acceptCharset',
        action: 'action',
        target: 'target',
        method: 'method',
        enctype: 'enctype',
        name: 'name'
    },
    hr: {
        noshade: 'noShade'
    },
    label: {
        for: 'for',
        form: 'form'
    },
    input: {
        name: 'name',
        type: 'type',
        autofocus: 'autofocus',
        maxlength: 'maxLength',
        minlength: 'minLength',
        disabled: 'disabled',
        readonly: 'readOnly',
        value: 'value',
        placeholder: 'placeholder',
        required: 'required',
        size: 'size',
        pattern: 'pattern',
        multiple: 'multiple',
        src: 'src',
        autocomplete: 'autocomplete',
        formenctype: 'formEnctype',
        formmethod: 'formMethod',
        formnovalidate: 'formNovalidate',
        formaction: 'formAction',
        formtarget: 'formTarget',
        list: 'list'
    },
    'input&checkbox': {
        disabled: 'disabled',
        checked: 'checked'
    },
    'input&radio': {
        disabled: 'disabled',
        checked: 'checked'
    },
    'input&number': {
        disabled: 'disabled',
        readonly: 'readOnly',
        value: 'value',
        placeholder: 'placeholder',
        size: 'size',
        max: 'max',
        min: 'min',
        step: 'step'
    },
    'input&range': {
        disabled: 'disabled',
        readonly: 'readOnly',
        max: 'max',
        min: 'min',
        step: 'step'
    },
    'input&file': {
        accept: 'accept'
    },
    iframe: {
        src: 'src',
        scrolling: 'scrolling',
        sandbox: 'sandbox',
        width: 'width',
        height: 'height',
        name: 'name',
        frameborder: 'frameBorder',
        longdesc: 'longDesc',
        marginheight: 'marginHeight',
        marginwidth: 'marginWidth',
        seamless: 'seamless',
        srcdoc: 'srcdoc'
    },
    img: {
        src: 'src',
        alt: 'alt',
        width: 'width',
        height: 'height',
        usemap: 'useMap',
        ismap: 'isMap',
        longdesc: 'longDesc'
    },
    map: {
        id: 'id',
        name: 'name'
    },
    meter: {
        form: 'form',
        high: 'high',
        low: 'low',
        max: 'max',
        min: 'min',
        optimum: 'optimum',
        value: 'value'
    },
    object: {
        align: 'align',
        archive: 'archive',
        border: 'border',
        classid: 'classId',
        codebase: 'codeBase',
        codetype: 'codeType',
        data: 'date',
        declare: 'declare',
        form: 'form',
        height: 'height',
        hspace: 'hspace',
        name: 'name',
        standby: 'standby',
        type: 'type',
        usemap: 'useMap',
        vspace: 'vspace',
        width: 'width'
    },
    ol: {
        reversed: 'reversed',
        start: 'start',
        type: 'type'
    },
    optgroup: {
        label: 'label',
        disabled: 'disabled'
    },
    option: {
        disabled: 'disabled',
        label: 'label',
        selected: 'selected',
        value: 'value'
    },
    output: {
        for: 'for',
        form: 'form',
        name: 'name'
    },
    param: {
        name: 'name',
        type: 'type',
        value: 'value',
        valuetype: 'valueType'
    },
    pre: {
        width: 'width'
    },
    progress: {
        max: 'max',
        value: 'value'
    },
    section: {
        cite: 'cite'
    },
    select: {
        autofocus: 'autofocus',
        disabled: 'disabled',
        multiple: 'multiple',
        form: 'form',
        name: 'name',
        size: 'size',
        required: 'required'
    },
    source: {
        src: 'src',
        type: 'type',
        media: 'media'
    },
    textarea: {
        autofocus: 'autofocus',
        cols: 'cols',
        rows: 'rows',
        form: 'form',
        wrap: 'wrap',
        placeholder: 'placeholder',
        readonly: 'readOnly',
        required: 'required',
        maxlength: 'maxLength',
        minlength: 'minLength'
    },
    table: {
        border: 'border',
        cellpadding: 'cellPadding',
        cellSpacing: 'cellSpacing',
        frame: 'frame',
        rules: 'rules',
        summary: 'summary',
        width: 'width'
    },
    tbody: {
        align: 'align',
        char: 'ch',
        charoff: 'chOff',
        valign: 'vAlign'
    },
    th: {
        abbr: 'abbr',
        align: 'align',
        axis: 'axis',
        char: 'ch',
        charoff: 'chOff',
        colspan: 'colSpan',
        rowspan: 'rowSpan',
        nowrap: 'noWrap',
        headers: 'headers',
        height: 'height',
        scope: 'scope',
        valign: 'vAlign',
        width: 'width'
    },
    td: {
        abbr: 'abbr',
        align: 'align',
        axis: 'axis',
        char: 'ch',
        charoff: 'chOff',
        colspan: 'colSpan',
        rowspan: 'rowSpan',
        nowrap: 'noWrap',
        headers: 'headers',
        height: 'height',
        scope: 'scope',
        valign: 'vAlign',
        width: 'width'
    },
    thead: {
        align: 'align',
        char: 'ch',
        charoff: 'chOff',
        valign: 'vAlign'
    },
    tfoot: {
        align: 'align',
        char: 'ch',
        charoff: 'chOff',
        valign: 'vAlign'
    },
    tr: {
        align: 'align',
        char: 'ch',
        charoff: 'chOff',
        valign: 'vAlign'
    },
    time: {
        datetime: 'dateTime',
        pubdate: 'pubDate'
    },
    track: {
        default: 'default',
        kind: 'kind',
        label: 'label',
        src: 'src',
        srclang: 'srclang'
    },
    video: {
        autoplay: 'autoplay',
        controls: 'controls',
        src: 'src',
        loop: 'loop',
        muted: 'muted',
        volume: 'volume',
        width: 'width',
        height: 'height',
        poster: 'poster'
    }
};
module.exports = {
    getAll(tag, type) {
        let all = Object.assign({}, tagsProps['*']);
        let tags = tagsProps[tag];
        if (tags) {
            all = Object.assign(all, tags);
        }
        tags = tagsProps[tag + '&' + type];
        if (tags) {
            all = Object.assign(all, tags);
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