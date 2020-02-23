"use strict"

// https://github.com/NishadSaraf/First-Order-Differentiation-In-C/blob/d6965c15bef4fe84837105eb0e5ed8f21ae9f80b/calculator.hpp


const FUNC_TYPE_BY_COMPONENT = 0; // not a real type, run the function component by component
const FUNC_TYPE_LOOKUP = -1;  // type for function, given func name is actually a dictionary between type and actual func
const TYPE_NUM = 1;
const TYPE_VEC3 = 2; 
const TYPE_VEC4 = 3;
const TYPE_VEC2 = 4;

const PARSE_EXPR = 1;
const PARSE_CODE = 2;

class ExprErr extends Error {
    constructor(msg) { super(msg) }
}
class TypeErr extends Error {
    constructor(msg) { super(msg) }
}

function clamp(a, v, b) {
    if (v < a) return a;
    if (v > b) return b;
    return v;
}

var ExprParser = (function() {


class NumNode  {  
    constructor(_v, str_was_decimal) {
        eassert(_v !== null && _v !== undefined, "unexpected non-number value")
        this.v = _v;
        this.decimal = str_was_decimal
    }
    eval() {
        return this.v;
    }
    is_decimal_num() { return this.decimal } // used for display
    check_type() {
        return TYPE_NUM
    }
    to_glsl() {
        if (Number.isInteger(this.v))
            return this.v + ".0"
        return this.v;
    }
}

function make_num_node(old_node, v) {
    if (old_node !== null && old_node.is_decimal_num !== undefined) {
        old_node.v = v
        return old_node
    }
    return new NumNode(v, true)
}


class VecNode {
    constructor(_v, type) {
        this.v = _v;
        this.type = type
    }
    eval() {
        return this.v
    }
    check_type() {
        return this.type
    }
}

function checkZero(v) {
    if (v == 0) {
        throw new ExprErr("Division by zero");
    }
    return v;
}

function call_operator(v1, v2, op) {
    let ret;
    switch (op) {
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
        case OPERATOR_LOGIC_AND:      ret = v1 && v2; break // not short-circuting evaluation since that would complicate vector ops
        case OPERATOR_LOGIC_OR:       ret = v1 || v2; break
        default:  throw new ExprErr("unexpected operator");
    }
    return ret;
}


class BinaryOpNode {
    constructor(l, r, _op) {
        this.left = l;
        this.right = r;
        this.op = _op;
        this.type = null
        this.t1 = null; this.t2 = null
    }
    check_type() {
        if (this.type === null) {
            let t1 = this.left.check_type(), t2 = this.right.check_type()
            this.t1 = t1; this.t2 = t2
            if (t1 > t2) {  let tmp = t1; t1 = t2; t2 = tmp } // t1 is lower
            if (t1 == TYPE_NUM)
                this.type = t2 // the vec (or float) type
            else if (t1 != t2)
                throw new TypeErr("can't handle different vec types")
            else 
                this.type = t1 // both same vec type
        }
        return this.type
    }

    eval() {
        console.assert(this.type !== null)
        const v1 = this.left.eval();
        const v2 = this.right.eval();
        if (this.type == TYPE_NUM)
            return call_operator(v1, v2, this.op)
        if (this.t1 == this.t2) // save vec type
            return apply_by_component([v1, v2], (v1, v2)=>{ return call_operator(v1, v2, this.op)})
        // vec and num
        let v,n
        if (this.t1 == TYPE_NUM)
            v = v2, n = v1
        else
            v = v1, n = v2
        const num_comp = v.length
        const ret = new v.constructor(num_comp)
        for(let i = 0; i < num_comp; ++i) 
            ret[i] = call_operator(v[i], n, this.op)
        return ret
    }

    to_glsl() {
        return '(' + this.left.to_glsl() + ops[this.op].str + this.right.to_glsl() + ')'
    }
}


function call_unary_op(v, op) {
    switch (op) {
    case OPERATORU_NEG: return -v;
    case OPERATORU_BITWISE_NOT: return ~v;
    case OPERATORU_LOGIC_NOT: return !v;
    default:  throw new ExprErr("unexpected unary operator");
    }
}

class UnaryOpNode {
    constructor(c, op) {
        this.child = c;
        this.type = null
        this.op = op
    }
    eval() {
        const v = this.child.eval();
        if (this.type == TYPE_NUM)
            return call_unary_op(v, this.op)
        const num_comp = v.length
        const ret = new v.constructor(num_comp)
        for(let i = 0; i < num_comp; ++i) 
            ret[i] = call_unary_op(v[i], this.op)
        return ret
    }
    check_type() {
        if (this.type === null)            
            this.type = this.child.check_type()
        return this.type
    }
    to_glsl() {
        const v = this.child.to_glsl() + ')'
        switch (this.op) {
        case OPERATORU_NEG: return '(-' + v;
        case OPERATORU_BITWISE_NOT: return '(~' + v;
        case OPERATORU_LOGIC_NOT: return '(!' + v;
        default:  throw new ExprErr("unexpected unary operator");
        }
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
const OPERATOR_LOGIC_AND = 18 // &&
const OPERATOR_LOGIC_OR = 19 // ||

const OPERATORU_LOGIC_NOT = 100 // !
const OPERATORU_BITWISE_NOT = 101 // ~
const OPERATORU_NEG = 102 // -


class Operator
{
    constructor(opr, prec, assoc, str)
    { 
        this.op = opr; /// Operator, one of the OPERATOR_* enum definitions
        this.precedence = prec;
        /// 'L' = left or 'R' = right
        this.associativity = assoc;
        this.str = str
    }
}

// needs to be ordered by the numbers of the operators, only binary operators
// higher number = higher precedence
const ops = [
    new Operator(OPERATOR_NULL, 0, 'L', '<null>'),

    new Operator(OPERATOR_BITWISE_OR, 40, 'L', '|'),
    new Operator(OPERATOR_BITWISE_XOR, 50, 'L', '^'),
    new Operator(OPERATOR_BITWISE_AND, 60, 'L', '&'),
    new Operator(OPERATOR_BITWISE_SHL, 70, 'L', '<<'),
    new Operator(OPERATOR_BITWISE_SHR, 70, 'L', '>>'),

    new Operator(OPERATOR_ADDITION, 100, 'L', '+'),
    new Operator(OPERATOR_SUBTRACTION, 100, 'L', '-'),
    new Operator(OPERATOR_MULTIPLICATION, 200, 'L', '*'),
    new Operator(OPERATOR_DIVISION, 200, 'L', '/'),
    new Operator(OPERATOR_MODULO, 200, 'L', '%'),
    new Operator(OPERATOR_POWER, 300, 'R', 'TBD'),
    new Operator(OPERATOR_EXPONENT, 400, 'R', 'e'),

    new Operator(OPERATOR_LESS, 30, 'L', '<'),
    new Operator(OPERATOR_LESS_EQ, 30, 'L', '<='),
    new Operator(OPERATOR_GREATER, 30, 'L', '>'),
    new Operator(OPERATOR_GREATER_EQ, 30, 'L', '>='),
    new Operator(OPERATOR_EQ, 30, 'L', '=='),

    new Operator(OPERATOR_LOGIC_AND, 20, 'L', '&&'),
    new Operator(OPERATOR_LOGIC_OR, 10, 'L', '||'),

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
    if (expr_.substr(index_, str.length) !== str)
        unexpected();
    index_ += str.length;
}

function unexpected() {
    throw new ExprErr("Syntax error: unexpected token at " + index_)
}

/// Eat all white space characters at the
/// current expression index.
function eatSpaces() {
    while (true) {
        const c = getCharacter()
        if (c !== ' ' && c !== '\n')
            break
        index_++;
    }
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
            ne = getCharacter()
            if (ne == '|') {
                index_++;
                return ops[OPERATOR_LOGIC_OR];
            }            
            return ops[OPERATOR_BITWISE_OR];
        case '^':
            index_++;
            return ops[OPERATOR_BITWISE_XOR];
        case '&':
            index_++;
            ne = getCharacter()
            if (ne == '&') {
                index_++;
                return ops[OPERATOR_LOGIC_AND];
            }
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
    constructor(jsfunc, num_args, type=FUNC_TYPE_BY_COMPONENT) {
        this.f = jsfunc
        this.num_args = num_args
        this.dtype = type
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
function glsl_clamp(v, minv, maxv) {
    if (v < minv) return minv;
    if (v > maxv) return maxv;
    return v;
}
function sqr(v) { return v*v }
function degrees(v) { return v*180/Math.PI }
function radians(v) { return v*Math.PI/180 }
function fit01(v, nmin, nmax) { return fit(v, 0, 1, nmin, nmax) }
function fit11(v, nmin, nmax) { return fit(v, -1, 1, nmin, nmax) }
function ifelse(v, vt, vf) { return v?vt:vf }

function rgb(r, g, b) { return vec3.fromValues(r, g, b) }
function rgba(r, g, b, a) { return vec4.fromValues(r, g, b, a) } 
function make_vec2(x, y) { return vec2.fromValues(x, y) }
function make_vec3(x, y, z) { return vec3.fromValues(x, y, z) }
function make_vec4(x, y, z, w) { return vec4.fromValues(x, y, z, w) }

const distance_lookup = {
[TYPE_NUM]:  function(a,b) { return Math.abs(a-b) },
[TYPE_VEC2]: function(a,b) { return vec2.distance(a,b) },
[TYPE_VEC3]: function(a,b) { return vec3.distance(a,b) },
[TYPE_VEC4]: function(a,b) { return vec4.distance(a,b) },
}


const func_defs = {
    'cos': new FuncDef(Math.cos, 1), 'sin': new FuncDef(Math.sin, 1), 'tan': new FuncDef(Math.tan, 1),
    'acos': new FuncDef(Math.acos, 1), 'asin': new FuncDef(Math.acos, 1), 'atan': new FuncDef(Math.atan, 1), 'atan2': new FuncDef(Math.atan2, 2),
    'sqrt': new FuncDef(Math.sqrt, 1), 'sqr': new FuncDef(sqr, 1), 'distance': new FuncDef(distance_lookup, 2, FUNC_TYPE_LOOKUP),
    'log': new FuncDef(Math.log, 1), 'log10': new FuncDef(Math.log10, 1), 'log2': new FuncDef(Math.log2, 1),
    'round': new FuncDef(Math.round, 1), 'ceil': new FuncDef(Math.ceil, 1), 'floor': new FuncDef(Math.floor, 1), 'trunc': new FuncDef(Math.trunc, 1),
    'abs': new FuncDef(Math.abs, 1), 'sign': new FuncDef(Math.sign, 1),
    'min': new FuncDef(Math.min, -2), 'max': new FuncDef(Math.min, -2), 'clamp': new FuncDef(glsl_clamp, 3), // negative meants atleast
    'rand': new FuncDef(myrand, 1),
    'fit': new FuncDef(fit, 5), 'fit01': new FuncDef(fit01, 3), 'fit11': new FuncDef(fit11, 3),
    'degrees': new FuncDef(degrees, 1), 'radians': new FuncDef(radians, 1),
    'if': new FuncDef(ifelse, 3),
    'rgb': new FuncDef(rgb, 3, TYPE_VEC3), 'rgba': new FuncDef(rgba, 4, TYPE_VEC3),
    'vec2': new FuncDef(make_vec2, 2, TYPE_VEC2), 'vec3': new FuncDef(make_vec3, 3, TYPE_VEC3), 'vec4': new FuncDef(make_vec4, 4, TYPE_VEC4),
}

class AddGlslFunc {
    constructor(s) { this.func_str = s }
}

const glsl_translate = {
    'rgb': "vec3", "rgba": "vec4",
    'sqr': new AddGlslFunc("$T sqr($T v) { return v*v; }"),
    'log10': new AddGlslFunc("$T log10($T v) { return log(v)/log(10) }"),
    'rand': null, 'fit': null, 'fit01': null, 'fit11': null, 'if': null
}

// given a function f that takes num and a list of vecs, apply f individually on the components of f
function apply_by_component(argvals, f) {
    let num_comp = argvals[0].length // 3 or 4
    let ret = new argvals[0].constructor(num_comp)
    let c_argvals = new Array(num_comp)
    for(let ci = 0; ci < num_comp; ++ci) {
        for(let ai = 0; ai < argvals.length; ++ai)
            c_argvals[ai] = argvals[ai][ci]
        const r = f.apply(null, c_argvals)
        ret[ci] = r
    } 
    return ret
}

class FuncCallNode {
    constructor(jsfunc, funcname, args) {
        this.def = func_defs[funcname]
        if (jsfunc === undefined) // from serializaton
            this.f = def.f
        else
            this.f = jsfunc // optimization
        this.args = args // input nodes
        this.type = null
        this.funcname = funcname
        this.args_type = null
    }
    eval() {
        let argvals = []
        for(let arg of this.args)
            argvals.push(arg.eval())
        if (this.def.dtype == FUNC_TYPE_LOOKUP)
            return this.f[this.args_type].apply(null, argvals)       
        if (this.def.dtype != FUNC_TYPE_BY_COMPONENT || this.type == TYPE_NUM)
            return this.f.apply(null, argvals)
        apply_by_component(argvals, this.f)
    }
    check_type() {
        if (this.type === null) {
            let def_t = this.def.dtype
            let ret_t = def_t
            if (def_t == FUNC_TYPE_BY_COMPONENT || def_t == FUNC_TYPE_LOOKUP) { // all arguments need to be the same type
                this.args_type = this.args[0].check_type()
                for(let arg of this.args)
                    if (arg.check_type() !== this.args_type)
                        throw new TypeErr("function needs all arguments of the same type")
                if (def_t == FUNC_TYPE_LOOKUP)
                    ret_t = TYPE_NUM // assumed right now since its only distance
                else
                    ret_t = this.args_type
            }
            else { // return value has a specific given type
                for(let arg of this.args)
                    if (arg.check_type() !== TYPE_NUM) // assume this right now since it's only rgb,rgba
                        throw new TypeErr("function needs all arguments to be numbers")
            }
            this.type = ret_t
        }
        return this.type
    }
    to_glsl() {
        let slst = []
        const tr = glsl_translate[this.funcname] 
        let name = this.funcname
        if (tr !== undefined) {
            if (tr === null)
                throw new ExprErr("Function not supported in GLSL: " + this.funcname)
            if (typeof tr === 'string')
                name = tr
            else if (tr.constructor === AddGlslFunc) {
                const gtype = TYPE_TO_STR[this.type]
                let text = tr.func_str.replace(/\$T/g, gtype) // assume there's only on type, that's the same as the func return type
                const key = name + "|" + gtype
                if (g_added_funcs[key] === undefined)
                    g_added_funcs[key] = text
            }
        }
        for(let arg of this.args)
            slst.push(arg.to_glsl())
        return name + '(' + slst.join(',') + ')'
    }
}

function parseFuncCall(func_name) {
    let def = func_defs[func_name]
    if (def === undefined)
        throw new ExprErr("Unknown func " + func_name + " at " + index_)
    let args = []
    do {
        index_++; // first time skips the parent, after that skips the comma
        if (def.num_args > 0 && args.length == def.num_args)
            throw new ExprErr("Too many argument to function " + func_name + " at " + index_)
        let arg = parseExpr()
        args.push(arg)
        eatSpaces();
    } while (getCharacter() == ',')
    if ((def.num_args > 0 && args.length != def.num_args) || (def.num_args < 0 && args.length < -def_num_args))
        throw new ExprErr("Not enough arguments to function " + func_name + " at " + index_)
    if (getCharacter() != ')')
        throw new ExprErr("Expected closing paren for argument list at " + index_)
    ++index_; // skip paren
    return new FuncCallNode(def.f, func_name, args)
}

const constants = {"PI": Math.PI, "true":1, "false":0}

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

    if (constants[sb] !== undefined)
        return new NumNode(constants[sb])

    if (g_symbol_table !== null) {
        const sps = sb.split('.')
        const sn = g_symbol_table[sps[0]]
        if (sn !== undefined) {
            if (sps.length === 1) 
                return sn
            return new SubscriptNode(sn, sps.slice(1))
        }    
    }

    let e = g_state_access.get_evaluator(sb)
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
            val = new UnaryOpNode(parseValue(), OPERATORU_NEG);
            break;
        case '~':
            index_++;
            val = new UnaryOpNode(parseValue(), OPERATORU_BITWISE_NOT);
            break;
        case '!':
            index_++;
            val = new UnaryOpNode(parseValue(), OPERATORU_LOGIC_NOT);
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


function parseNewIdentifier() {
    let sb = ''
    let c = getCharacter();
    if (c == '#')
        return null // comment
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')))
        throw new ExprErr("unexpected char at start of statement " + c)
    while(true) {
        let c = getCharacter();
        if (c === null)
            break;
        // identifier can have digits but not start with a digit
        if ( (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' || (c >= '0' && c <= '9') )
            sb = sb + c;
        else
            break;
        index_++;
    }
    return sb
}

// added to the symbol table when parsing
// assignment sets a value into it, expression reference it from parseIdentifier
class SymbolNode {
    constructor(name) {
        this.name = name
        this.valueNode = null  // NumNode or VecNode
        this.type = null
    }
    eval() {
        if (this.valueNode === null)
            throw new ExprErr("Symbol " + this.name + " not assigned to yet")
        return this.valueNode.eval()
    }
    check_type() {
        if (this.type === null)
            throw new ExprErr("Symbol " + this.name + " not assigned to yet (tyoe)")
        return this.type
    }
    to_glsl() {
        return this.name
    }
}

const SUBSCRIPT_TO_IDX = { x:0, y:1, z: 2, w:3, r:0, g:1, b:2, a: 3 }
class SubscriptNode {
    constructor(wrapNode, subscripts) {
        this.wrapNode = wrapNode
        if (subscripts.length !== 1)
            throw new ExprErr("Only one subscript is supported")
        this.subname = subscripts[0]
        this.subidx = SUBSCRIPT_TO_IDX[this.subname]
        if (this.subidx === undefined)
            throw new ExprErr("unknown subscript: " + this.subname)
    }
    eval() {
        let v = this.wrapNode.eval()
        let sv = v[this.subidx]
        if (sv === undefined)
            throw new ExprErr("object doesn't have this subscript " + this.subname)
        return sv
    }
    check_type() {
        return TYPE_NUM
    }
    to_glsl() {
        return this.wrapNode.to_glsl() + "." + this.subname
    }
}

function parseStmt() {
    eatSpaces()
    // statement starts with a variable name to assign to or 'return'
    const name = parseNewIdentifier()
    if (name === null) // comment statement
        return null 
    eatSpaces()
    let assign_type = null
    if (name !== 'return') 
    {
        assign_type = OPERATOR_NULL
        let c = getCharacter();
        switch(c) {
        case '+': assign_type = OPERATOR_ADDITION; break;
        case '-': assign_type = OPERATOR_SUBTRACTION; break;
        case '*': assign_type = OPERATOR_MULTIPLICATION; break;
        case '/': assign_type = OPERATOR_DIVISION; break;
        }
        if (assign_type !== OPERATOR_NULL) {
            index_++;
            c = getCharacter();
        }
        if (c !== '=')
            throw new ExprErr("expected assignment")
        index_++;
        eatSpaces()
    }
    const expr = parseExpr()
    if (assign_type === null) {
        return new ReturnStmt(expr)
    }
    if (assign_type === OPERATOR_NULL) {
        return new AssignNameStmt(name, expr, null)
    }
    return new AssignNameStmt(name, expr, assign_type)
    
}

class ReturnStmt {
    constructor(expr) {
        this.expr = expr
    }
    isReturn() { return true }
    invoke() {
        const v = this.expr.eval()
        return v
    }
    scheck_type() {
        return this.expr.check_type()
    }
    sto_glsl() {
        return this.expr.to_glsl()  // ; will be added in template
    }
}




const TYPE_TO_STR = { [TYPE_NUM]:'float', [TYPE_VEC2]:'vec2', [TYPE_VEC3]:'vec3', [TYPE_VEC4]:'vec4' }
class AssignNameStmt {  // not a proper node (no eval, has side-effects)
    constructor(name, expr, op) {
        this.name = name
        this.expr = expr
        this.op = op
        this.type = null
        this.symbol = g_symbol_table[name]
        this.vNode = null
        this.first_definition = false
        if (this.symbol === undefined) { // wasn't already there
            if (this.op === null) {
                this.symbol = new SymbolNode(name)
                g_symbol_table[name] = this.symbol
                this.first_definition = true
            }
            else
                throw new ExprErr("Unassigned symbol used: " + name)
        }
    }
    isReturn() { return false }
    invoke() {
        const v = this.expr.eval()
        if (this.op === null)
            this.vNode.v = v
        else
            this.vNode.v = call_operator(this.symbol.valueNode.v, v, this.op)
        // valueNode in symbol is null as long as the symbol doesn't have a value
        this.symbol.valueNode = this.vNode
        return v
    }
    scheck_type() {
        this.type = this.expr.check_type()
        // if there's op, this might or might not change the type
        this.vNode = (this.type == TYPE_NUM) ? (new NumNode(NaN, false)) : (new VecNode(null, this.type))
        this.symbol.type = this.type
        return this.type
    }
    sto_glsl() {
        let s = this.name
        if (this.op !== null)
            s += ops[this.op].str
        s += "=" + this.expr.to_glsl() + ";"
        if (this.first_definition)
            s = TYPE_TO_STR[this.type] + " " + s
        return s
    }
}

// maps name to SymbolNode with the value that resulted from the expression
var g_symbol_table = null
var g_added_funcs = null // map [name of func]_[arg type] to the func text

class CodeNode {
    constructor(stmts, symbol_table) {
        this.stmts = stmts
        this.symbol_table = symbol_table
    }
    eval() {
        // clear values from symbol table 
        for(let [name,sym] of Object.entries(this.symbol_table)) {
            sym.valueNode = null
        }

        g_symbol_table = this.symbol_table
        let ret = null
        for(let stmt of this.stmts) {
            ret = stmt.invoke()
            if (stmt.isReturn()) {
                break
            }
        }
        g_symbol_table = null
        return ret
    }
    check_type() {
        let ret = null
        for(let stmt of this.stmts) {
            ret = stmt.scheck_type()
            if (stmt.isReturn()) {
                break
            }
        }
        return ret
    }
    to_glsl(emit_ctx) {
        g_added_funcs = {}
        for(let stmt of this.stmts) {
            let ret = stmt.sto_glsl()
            if (stmt.isReturn()) {
                for(let ti in g_added_funcs)
                    emit_ctx.add_funcs.push(g_added_funcs[ti])
                return ret
            }
            emit_ctx.before_expr.push(ret)
        }
        throw new ExprErr("No return?")
    }
}

function skip_to_next_line() {
    while(true) {
        let c = getCharacter()
        if (c === null)
            break;
        ++index_
        if (c == '\n')
            break
    }
}

function parseCode() {
    let lst = [], has_return = false
    let symbol_table = {}
    g_symbol_table = symbol_table
    while(!isEnd()) {
        let e = parseStmt()
        if (e === null) {
            skip_to_next_line()
            continue
        }
        if (e.isReturn())
            has_return = true
        lst.push(e)
    }
    g_symbol_table = null
    if (!has_return)
        throw new ExprErr("missing return statement")
    return new CodeNode(lst, symbol_table)
}

/// Expression string
var expr_ = null
/// Current expression index, incremented whilst parsing
var index_ = 0

var g_state_access = null

function eparse(expr, state_access, opt) {
    if (typeof expr != "string")
        return new NumNode(expr)
    if (expr == "")
        throw new ExprErr("empty expression")
    index_ = 0;
    expr_ = expr;
    if (state_access) {
        g_state_access = state_access
    }
    let result = null;
    try {
        if (opt === PARSE_EXPR)
            result = parseExpr();   
        else if (opt == PARSE_CODE)
            result = parseCode();
        else 
            throw new ExprErr("unknown opt " + opt)
        if (!isEnd())
            unexpected();
    }
    catch(e)
    {
        while (stack_.length != 0)
            stack_.pop();
        throw e;
    }
    finally {
        g_state_access = null
    }
    return result;
}


return {parse:eparse, make_num_node:make_num_node}
})()


