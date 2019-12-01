"use strict"

// https://github.com/NishadSaraf/First-Order-Differentiation-In-C/blob/d6965c15bef4fe84837105eb0e5ed8f21ae9f80b/calculator.hpp

class ExprErr extends Error {
    constructor(msg) {
        super(msg)
    }
}

function clamp(a, v, b) {
    if (v < a) return a;
    if (v > b) return b;
    return v;
}

var ExprParser = (function() {

class NumNode  {
    constructor(_v, str_was_decimal) {
        this.v = _v;
        this.decimal = str_was_decimal
    }
    eval() {
        return this.v;
    }
    is_decimal_num() { return this.decimal }
}

function checkZero(v) {
    if (v == 0) {
        throw new ExprErr("Division by zero");
    }
    return v;
}

class BinaryOpNode {
    constructor(l, r, _op) {
        this.left = l;
        this.right = r;
        this.op = _op;
    }

    eval() {
        let v1 = this.left.eval();
        let v2 = this.right.eval();
        let ret;
        switch (this.op) {
            case OPERATOR_BITWISE_OR:     ret = v1 | v2; break;
            case OPERATOR_BITWISE_XOR:    ret = v1 ^ v2; break;
            case OPERATOR_BITWISE_AND:    ret = v1 & v2; break;
            case OPERATOR_BITWISE_SHL:    ret = v1 << v2; break;
            case OPERATOR_BITWISE_SHR:    ret = v1 >> v2; break;
            case OPERATOR_ADDITION:       ret = v1 + v2; break;
            case OPERATOR_SUBTRACTION:    ret = v1 - v2; break;
            case OPERATOR_MULTIPLICATION: ret = v1 * v2; break;
            case OPERATOR_DIVISION:       ret = v1 / checkZero(v2); break;
            case OPERATOR_MODULO:         ret = v1 % checkZero(v2); break;
            case OPERATOR_POWER:          ret = Math.pow(v1, v2); break;
            case OPERATOR_EXPONENT:       ret = v1 * Math.pow(10, v2); break;

            case OPERATOR_LESS:           ret = v1 < v2; break
            case OPERATOR_LESS_EQ:        ret = v1 <= v2; break
            case OPERATOR_GREATER:        ret = v1 > v2; break
            case OPERATOR_GREATER_EQ:     ret = v1 >= v2; break
            case OPERATOR_EQ:             ret = v1 == v2; break
            default:  throw new ExprErr("unexpected operator");
        }
        return ret;
    }
}
class UnaryNegNode {
    constructor(c) {
        this.child = c;
    }
    eval() {
        return -this.child.eval();
    }
}


const OPERATOR_NULL = 0
const OPERATOR_BITWISE_OR = 1     /// |
const OPERATOR_BITWISE_XOR = 2    /// ^
const OPERATOR_BITWISE_AND = 3    /// &
const OPERATOR_BITWISE_SHL = 4    /// <<
const OPERATOR_BITWISE_SHR = 5    /// >>
const OPERATOR_ADDITION = 6       /// +
const OPERATOR_SUBTRACTION = 7    /// -
const OPERATOR_MULTIPLICATION = 8 /// *
const OPERATOR_DIVISION = 9       /// /
const OPERATOR_MODULO = 10         /// %
const OPERATOR_POWER = 11          /// **
const OPERATOR_EXPONENT = 12        /// e, E
const OPERATOR_LESS = 13 // <
const OPERATOR_LESS_EQ = 14 // <=
const OPERATOR_GREATER = 15 // >
const OPERATOR_GREATER_EQ = 16 // >=
const OPERATOR_EQ = 17 // ==

class Operator
{
    constructor(opr, prec, assoc)
    { 
        this.op = opr; /// Operator, one of the OPERATOR_* enum definitions
        this.precedence = prec;
        /// 'L' = left or 'R' = right
        this.associativity = assoc;
    }
}

const ops = [
    new Operator(OPERATOR_NULL, 0, 'L'),
    new Operator(OPERATOR_BITWISE_OR, 4, 'L'),
    new Operator(OPERATOR_BITWISE_XOR, 5, 'L'),
    new Operator(OPERATOR_BITWISE_AND, 6, 'L'),
    new Operator(OPERATOR_BITWISE_SHL, 9, 'L'),
    new Operator(OPERATOR_BITWISE_SHR, 9, 'L'),
    new Operator(OPERATOR_ADDITION, 10, 'L'),
    new Operator(OPERATOR_SUBTRACTION, 10, 'L'),
    new Operator(OPERATOR_MULTIPLICATION, 20, 'L'),
    new Operator(OPERATOR_DIVISION, 20, 'L'),
    new Operator(OPERATOR_MODULO, 20, 'L'),
    new Operator(OPERATOR_POWER, 30, 'R'),
    new Operator(OPERATOR_EXPONENT, 40, 'R'),
    new Operator(OPERATOR_LESS, 50, 'L'),
    new Operator(OPERATOR_LESS_EQ, 50, 'L'),
    new Operator(OPERATOR_GREATER, 50, 'L'),
    new Operator(OPERATOR_GREATER_EQ, 50, 'L'),
    new Operator(OPERATOR_EQ, 50, 'L'),
]



function isEnd() {
    return index_ >= expr_.length;
}

/// Returns the character at the current expression index or
/// 0 if the end of the expression is reached.
function getCharacter() {
    if (!isEnd())
        return expr_[index_];
    return null;
}

/// Parse str at the current expression index.
/// @throw error if parsing fails.
///
function expect(str) {
    if (expr_.substr(index_, index_ + str.length) !== str)
        unexpected();
    index_ += str.length;
}

function unexpected() {
    throw new ExprErr("Syntax error: unexpected token at " + index_)
}

/// Eat all white space characters at the
/// current expression index.
///
function eatSpaces() {
    while (getCharacter() == ' ')
        index_++;
}

/// Parse a binary operator at the current expression index.
/// @return Operator with precedence and associativity.
///
function parseOp()
{
    eatSpaces();
    let ne
    switch (getCharacter()) {
        case '|':
            index_++;
            return ops[OPERATOR_BITWISE_OR];
        case '^':
            index_++;
            return ops[OPERATOR_BITWISE_XOR];
        case '&':
            index_++;
            return ops[OPERATOR_BITWISE_AND];
        case '<':
            index_++;
            ne = getCharacter()
            if (ne == '<') {
                index_++;
                return ops[OPERATOR_BITWISE_SHL];
            }
            if (ne == '=') {
                index_++;
                return ops[OPERATOR_LESS_EQ];
            }
            return ops[OPERATOR_LESS];
        case '>':
            index_++;
            ne = getCharacter()
            if (ne == '>') {
                index_++;
                return ops[OPERATOR_BITWISE_SHR];
            }
            if (ne == '=') {
                index_++;
                return ops[OPERATOR_GREATER_EQ];
            }
            return ops[OPERATOR_GREATER];
        case '=':
            expect('==')
            return ops[OPERATOR_EQ];
        case '+':
            index_++;
            return ops[OPERATOR_ADDITION];
        case '-':
            index_++;
            return ops[OPERATOR_SUBTRACTION]
        case '/':
            index_++;
            return ops[OPERATOR_DIVISION];
        case '%':
            index_++;
            return ops[OPERATOR_MODULO];
        case '*':
            index_++;
            if (getCharacter() != '*')
                return ops[OPERATOR_MULTIPLICATION];
            index_++;
            return ops[OPERATOR_POWER];
        case 'e':
            index_++;
            return ops[OPERATOR_EXPONENT];
        case 'E':
            index_++;
            return ops[OPERATOR_EXPONENT];
        default:
            return ops[OPERATOR_NULL];
    }
}

class FuncDef {
    constructor(jsfunc, num_args) {
        this.f = jsfunc
        this.num_args = num_args
    }
}

function md5(d){return ((binl_md5(rstr2binl(d),8*d.length)))}function rstr2hex(d){for(var _,m="0123456789ABCDEF",f="",r=0;r<d.length;r++)_=d.charCodeAt(r),f+=m.charAt(_>>>4&15)+m.charAt(15&_);return f}function rstr2binl(d){for(var _=Array(d.length>>2),m=0;m<_.length;m++)_[m]=0;for(m=0;m<8*d.length;m+=8)_[m>>5]|=(255&d.charCodeAt(m/8))<<m%32;return _}function binl2rstr(d){for(var _="",m=0;m<32*d.length;m+=8)_+=String.fromCharCode(d[m>>5]>>>m%32&255);return _}function binl_md5(d,_){d[_>>5]|=128<<_%32,d[14+(_+64>>>9<<4)]=_;for(var m=1732584193,f=-271733879,r=-1732584194,i=271733878,n=0;n<d.length;n+=16){var h=m,t=f,g=r,e=i;f=md5_ii(f=md5_ii(f=md5_ii(f=md5_ii(f=md5_hh(f=md5_hh(f=md5_hh(f=md5_hh(f=md5_gg(f=md5_gg(f=md5_gg(f=md5_gg(f=md5_ff(f=md5_ff(f=md5_ff(f=md5_ff(f,r=md5_ff(r,i=md5_ff(i,m=md5_ff(m,f,r,i,d[n+0],7,-680876936),f,r,d[n+1],12,-389564586),m,f,d[n+2],17,606105819),i,m,d[n+3],22,-1044525330),r=md5_ff(r,i=md5_ff(i,m=md5_ff(m,f,r,i,d[n+4],7,-176418897),f,r,d[n+5],12,1200080426),m,f,d[n+6],17,-1473231341),i,m,d[n+7],22,-45705983),r=md5_ff(r,i=md5_ff(i,m=md5_ff(m,f,r,i,d[n+8],7,1770035416),f,r,d[n+9],12,-1958414417),m,f,d[n+10],17,-42063),i,m,d[n+11],22,-1990404162),r=md5_ff(r,i=md5_ff(i,m=md5_ff(m,f,r,i,d[n+12],7,1804603682),f,r,d[n+13],12,-40341101),m,f,d[n+14],17,-1502002290),i,m,d[n+15],22,1236535329),r=md5_gg(r,i=md5_gg(i,m=md5_gg(m,f,r,i,d[n+1],5,-165796510),f,r,d[n+6],9,-1069501632),m,f,d[n+11],14,643717713),i,m,d[n+0],20,-373897302),r=md5_gg(r,i=md5_gg(i,m=md5_gg(m,f,r,i,d[n+5],5,-701558691),f,r,d[n+10],9,38016083),m,f,d[n+15],14,-660478335),i,m,d[n+4],20,-405537848),r=md5_gg(r,i=md5_gg(i,m=md5_gg(m,f,r,i,d[n+9],5,568446438),f,r,d[n+14],9,-1019803690),m,f,d[n+3],14,-187363961),i,m,d[n+8],20,1163531501),r=md5_gg(r,i=md5_gg(i,m=md5_gg(m,f,r,i,d[n+13],5,-1444681467),f,r,d[n+2],9,-51403784),m,f,d[n+7],14,1735328473),i,m,d[n+12],20,-1926607734),r=md5_hh(r,i=md5_hh(i,m=md5_hh(m,f,r,i,d[n+5],4,-378558),f,r,d[n+8],11,-2022574463),m,f,d[n+11],16,1839030562),i,m,d[n+14],23,-35309556),r=md5_hh(r,i=md5_hh(i,m=md5_hh(m,f,r,i,d[n+1],4,-1530992060),f,r,d[n+4],11,1272893353),m,f,d[n+7],16,-155497632),i,m,d[n+10],23,-1094730640),r=md5_hh(r,i=md5_hh(i,m=md5_hh(m,f,r,i,d[n+13],4,681279174),f,r,d[n+0],11,-358537222),m,f,d[n+3],16,-722521979),i,m,d[n+6],23,76029189),r=md5_hh(r,i=md5_hh(i,m=md5_hh(m,f,r,i,d[n+9],4,-640364487),f,r,d[n+12],11,-421815835),m,f,d[n+15],16,530742520),i,m,d[n+2],23,-995338651),r=md5_ii(r,i=md5_ii(i,m=md5_ii(m,f,r,i,d[n+0],6,-198630844),f,r,d[n+7],10,1126891415),m,f,d[n+14],15,-1416354905),i,m,d[n+5],21,-57434055),r=md5_ii(r,i=md5_ii(i,m=md5_ii(m,f,r,i,d[n+12],6,1700485571),f,r,d[n+3],10,-1894986606),m,f,d[n+10],15,-1051523),i,m,d[n+1],21,-2054922799),r=md5_ii(r,i=md5_ii(i,m=md5_ii(m,f,r,i,d[n+8],6,1873313359),f,r,d[n+15],10,-30611744),m,f,d[n+6],15,-1560198380),i,m,d[n+13],21,1309151649),r=md5_ii(r,i=md5_ii(i,m=md5_ii(m,f,r,i,d[n+4],6,-145523070),f,r,d[n+11],10,-1120210379),m,f,d[n+2],15,718787259),i,m,d[n+9],21,-343485551),m=safe_add(m,h),f=safe_add(f,t),r=safe_add(r,g),i=safe_add(i,e)}return Array(m,f,r,i)}function md5_cmn(d,_,m,f,r,i){return safe_add(bit_rol(safe_add(safe_add(_,d),safe_add(f,i)),r),m)}function md5_ff(d,_,m,f,r,i,n){return md5_cmn(_&m|~_&f,d,_,r,i,n)}function md5_gg(d,_,m,f,r,i,n){return md5_cmn(_&f|m&~f,d,_,r,i,n)}function md5_hh(d,_,m,f,r,i,n){return md5_cmn(_^m^f,d,_,r,i,n)}function md5_ii(d,_,m,f,r,i,n){return md5_cmn(m^(_|~f),d,_,r,i,n)}function safe_add(d,_){var m=(65535&d)+(65535&_);return(d>>16)+(_>>16)+(m>>16)<<16|65535&m}function bit_rol(d,_){return d<<_|d>>>32-_}

function myrand(seed) {
    let r = md5('x' + seed)[seed%4]
    r &= 2147483647
    r /= 2147483647
    return r;
}
function fit(v, oldmin, oldmax, newmin, newmax) {
    eassert((oldmin < oldmax) == (newmin < newmax), "mismatch order of arguments in fit()")
    if (v > oldmax)
        v = oldmax
    if (v < oldmin)
        v = oldmin
    let nv = (v - oldmin)/(oldmax-oldmin)*(newmax-newmin) + newmin
    return nv;
}
function fit01(v, nmin, nmax) { return fit(v, 0, 1, nmin, nmax) }
function fit11(v, nmin, nmax) { return fit(v, -1, 1, nmin, nmax) }
function ifelse(v, vt, vf) { return v?vt:vf }

// cos,sin,tan,acos,asin.atan,atan2,log,log10,log2,round,ceil,floor,trunc,abs,sqrt,max(multi),min,clamp(to range),sign
const func_defs = {
    'cos': new FuncDef(Math.cos, 1), 'sin': new FuncDef(Math.sin, 1), 'tan': new FuncDef(Math.tan, 1),
    'acos': new FuncDef(Math.acos, 1), 'asin': new FuncDef(Math.acos, 1), 'atan': new FuncDef(Math.atan, 1), 'atan2': new FuncDef(Math.atan2, 2),
    'log': new FuncDef(Math.log, 1), 'log10': new FuncDef(Math.log10, 1), 'log2': new FuncDef(Math.log2, 1),
    'round': new FuncDef(Math.round, 1), 'ceil': new FuncDef(Math.ceil, 1), 'floor': new FuncDef(Math.floor, 1), 'trunc': new FuncDef(Math.trunc, 1),
    'abs': new FuncDef(Math.abs, 1), 'sign': new FuncDef(Math.sign, 1),
    'min': new FuncDef(Math.min, -2), 'max': new FuncDef(Math.min, -2), 'clamp': new FuncDef(clamp, 3), // negative meants atleast
    'rand': new FuncDef(myrand, 1),
    'fit': new FuncDef(fit, 5), 'fit01': new FuncDef(fit01, 3), 'fit11': new FuncDef(fit11, 3),
    'if': new FuncDef(ifelse, 3),
}

class FuncCallNode {
    constructor(jsfunc, funcname, args) {
        if (jsfunc === undefined) // from serializaton
            this.f = func_defs[funcname].f
        else
            this.f = jsfunc
        this.args = args
    }
    eval() {
        let argvals = []
        for(let arg of this.args)
            argvals.push(arg.eval())
        return this.f.apply(null, argvals)
    }
}

function parseFuncCall(func_name) {
    let def = func_defs[func_name]
    if (def === undefined)
        throw ExprErr("Unknown func " + func_name + " at " + index_)
    let args = []
    do {
        index_++; // first time skips the parent, after that skips the comma
        if (def.num_args > 0 && args.length == def.num_args)
            throw ExprErr("Too many argument to function " + func_name + " at " + index_)
        let arg = parseExpr()
        args.push(arg)
        eatSpaces();
    } while (getCharacter() == ',')
    if ((def.num_args > 0 && args.length != def.num_args) || (def.num_args < 0 && args.length < -def_num_args))
        throw ExprErr("Not enough arguments to function " + func_name + " at " + index_)
    if (getCharacter() != ')')
        throw ExprErr("Expected closing paren for argument list at " + index_)
    ++index_; // skip paren
    return new FuncCallNode(def.f, func_name, args)
}


function parseIdentifier() {
    let sb = ''
    while(true) {
        let c = getCharacter();
        if (c === null)
            break;
        // identifier can have digits but not start with a digit
        if ( (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' || c == '.' || (c >= '0' && c <= '9') )
            sb = sb + c;
        else
            break;
        index_++;
    }
    if (sb[0] == '.' || sb[sb.length-1] == '.')
        throw new ExprErr("Unexpected dot in an identifier at " + index_)

    eatSpaces()
    if (getCharacter() == '(')  {// function call
        return parseFuncCall(sb) 
    }   

    let e = state_access_.get_evaluator(sb)
    if (e === null) 
        throw new ExprErr("Unknown identifier " + sb + " at " + index_)

    return e;
}

function toInteger(c) {
    if (c === null)
        return 0xf + 1
    if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48; // '0'
    if (c >= 'a' && c <= 'f') return c.charCodeAt(0) - 97 + 0xa;  // 'a'
    if (c >= 'A' && c <= 'F') return c.charCodeAt(0) - 65 + 0xa;  // 'A'
    return  0xf + 1;
}

function getInteger() {
    return toInteger(getCharacter());
}

function parseDecimal() {
    let value = 0;
    for (let d; (d = getInteger()) <= 9; index_++)
        value = value * 10 + d;
    if (getCharacter() == '.') {
        index_++;
        let f = 0.1
        for (let d; (d = getInteger()) <= 9; index_++) {
            value = value + d * f;
            f *= 0.1
        }
    }
    return new NumNode(value, true);
}

function parseHex() {
    index_ = index_ + 2;
    let value = 0;
    for (let h; (h = getInteger()) <= 0xf; index_++)
        value = value * 0x10 + h;
    return new NumNode(value, false);
}
function parseBin() {
    index_ = index_ + 2;
    let value = 0;
    for (let h; (h = getInteger()) <= 1; index_++)
        value = value * 2 + h;
    return new NumNode(value, false);
}
function parseOct() {
    index_ = index_ + 2;
    let value = 0;
    for (let h; (h = getInteger()) <= 7; index_++)
        value = value * 8 + h;
    return new NumNode(value, false);
}

function getBase()
{
    if (index_ + 2 < expr_.length) {
        let x = expr_[index_ + 1].toLowerCase();
        let h = expr_[index_ + 2];
        if (x == 'x' && toInteger(h) <= 0xf)
            return 16;
        if (x == 'b' && toInteger(h) <= 1)
            return 2;
        if (x == 'o' && toInteger(h) <= 8)
            return 8;
    }
    return 10;
}

/// Parse an integer value at the current expression index.
/// The unary `+', `-' and `~' operators and opening
/// parentheses `(' cause recursion.
///
function parseValue() {
    let val = null;
    eatSpaces();
    let c = getCharacter();
    switch (c) {
        case '0':
            let base = getBase();
            if (base == 16)
                val = parseHex();
            else if (base == 2)
                val = parseBin();
            else if (base == 8)
                val = parseOct();
            else
                val = parseDecimal();
            break;
        case '1':  case '2':   case '3':
        case '4':  case '5':   case '6':
        case '7':  case '8':   case '9':   case '.':
            val = parseDecimal();
            break;
        case '(':
            index_++;
            val = parseExpr();
            eatSpaces();
            if (getCharacter() != ')') {
                if (!isEnd())
                    unexpected();
                throw new ExprErr("Syntax error: `)' expected at end of expression");
            }
            index_++;
            break;

        case '+':
            index_++;
            val = parseValue();
            break;
        case '-':
            index_++;
            val = new UnaryNegNode(parseValue());
            break;
        default:
            if ( (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_') {
                val = parseIdentifier();
                break;
            }
            if (!isEnd())
                unexpected();
            throw new ExprErr("Syntax error: value expected at end of expression");
    }
    return val;
}

/// The current operator and its left value
/// are pushed onto the stack if the operator on
/// top of the stack has lower precedence.
var stack_ = [];

/// Parse all operations of the current parenthesis
/// level and the levels above, when done
/// return the result (value).
///
function parseExpr() {
    stack_.push({ op:ops[OPERATOR_NULL] });
    // first parse value on the left
    let value = parseValue();

    while (stack_.length != 0) {
        // parse an operator (+, -, *, ...)
        let op = parseOp();
        while (op.precedence < stack_[stack_.length-1].op.precedence || 
               (op.precedence == stack_[stack_.length-1].op.precedence && op.associativity == 'L'))
        {
            let peek = stack_[stack_.length-1]
            // end reached
            if (peek.op.op == OPERATOR_NULL) {
                stack_.pop();
                return value;
            }
            // do the calculation ("reduce"), producing a new value
            value = new BinaryOpNode(peek.value, value, peek.op.op);
            stack_.pop();
        }

        // store on stack_ and continue parsing ("shift")
        stack_.push( {op:op, value:value });
        // parse value on the right
        value = parseValue();
    }
    return null;
}

/// Expression string
var expr_ = null
/// Current expression index, incremented whilst parsing
var index_ = 0

var state_access_ = null

function eeval(expr, state_access) {
    if (typeof expr != "string")
        return new NumNode(expr)
    index_ = 0;
    expr_ = expr;
    if (state_access) {
        state_access_ = state_access
    }
    let result = null;
    try {
        result = parseExpr();
        if (!isEnd())
            unexpected();
    }
    catch(e)
    {
        while (stack_.length != 0)
            stack_.pop();
        throw e;
    }
    return result;
}


return {eval:eeval}
})()


