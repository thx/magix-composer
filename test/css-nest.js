let cssParser = require('../plugins/css-parser');
require('chalk');
let expect = (source, result) => {
    if (source != result) {
        console.log('expect:', result.red, 'source:', source.red);
    } else {
        console.log('ok:', result.blue);
    }
};

let t1 = `
table.colortable{&td {
      text-align:center;
      &.c { text-transform:uppercase }
      &:first-child, &:first-child + td { border:1px solid black }
    }
    & th,.abc {
      text-align:center;
      background:black;
      color:white;
    }
    & .parent{
        &.child{
            color:red
        }
    }
    .col || td{
        color:red
    }
  }

  .a .b .c .d{
      color:red
  }

  .foo {
    color: red;
    @nest .parent & {
      color: blue;
    }
  }
`;
// let t1=`
// a.span{//tip

// }
// `;
let c1 = cssParser(t1);
console.log(c1);
console.log(JSON.stringify(c1.selectors));
