let translateEscapeSingleQuote = expr => {
    let r = [],
        inStr = false,
        strStart = '',
        escaped = false;
    for (let i = 0; i < expr.length; i++) {
        let c = expr[i];
        if (!inStr) {
            if (c == '\'' ||
                c == '"') {
                inStr = true;
                strStart = c;
                r.push(c);
            } else {
                r.push(c);
            }
        } else {
            if (c == '\\') {
                escaped = !escaped;
                if (!escaped) {
                    r.push('\\\\');
                }
            } else if (escaped) {
                if (c == '\'') {
                    r.push('`');
                } else {
                    r.push('\\' + c);
                }
                escaped = false;
            } else if (c == strStart) {
                inStr = false;
                escaped = false;
                r.push(c);
            } else {
                r.push(c);
            }
        }
    }
    return r.join('');
};

console.log(translateEscapeSingleQuote(`'\\\\ab\\c\\''`));