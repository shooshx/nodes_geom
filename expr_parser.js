"use strict"

// https://github.com/NishadSaraf/First-Order-Differentiation-In-C/blob/d6965c15bef4fe84837105eb0e5ed8f21ae9f80b/calculator.hpp


const FUNC_TYPE_BY_COMPONENT = 0; // not a real type, run the function component by component
const FUNC_TYPE_LOOKUP = -1;  // type for function, given func name is actually a dictionary between type and actual func
const TYPE_NUM = 1;
const TYPE_BOOL = 2;
const TYPE_VEC3 = 10; 
const TYPE_VEC4 = 11;
const TYPE_VEC2 = 12;
const TYPE_FUNCTION = 21;  // function 
// returned from global check_type to mean there's not enough info to know what the type is since it depends on evaulators
// that will be set by the cls, check_type will try again in dyn_eval
const TYPE_UNDECIDED = 100; 
// similar to UNDECIDED but only on variables
const TYPE_DEPEND_ON_VAR = 101;

const PARSE_EXPR = 1;
const PARSE_CODE = 2;
var g_lineNum = 0

class ExprErr extends Error {
    constructor(msg, line_num=null) { 
        super(msg)
        if (line_num !== null && line_num !== undefined)
            this.line = line_num
        else
            this.line = g_lineNum
    }
}
class TypeErr extends ExprErr {
    constructor(msg, line_num=null) { super(msg, line_num) }
}

// thrown when the type of the object is really undecided, can depend on input terminal for instance
class UndecidedTypeErr extends Error {
    constructor() { super("undecided-type") }
}
class DependOnVarErr extends Error {
    constructor(msg) { super(msg) }
}

// throw in expressions
function eassert(cond, msg, line_num=null) {
    if (!cond)
        throw new ExprErr(msg, line_num)
}

class NodeBase {
    constructor() {
        this.type = null
        this.line = g_lineNum
    }
    
    clear_types_cache() { // should implemet recursion
        this.type = null
    }
    consumes_subscript() { // for evaluator nodes to tell the parser if they consumed all the subscripts of the identifier that get_evaluator was sent
        return false 
    }
    // needs to be implemented if check_type returns TYPE_FUNC
    //  this predicts what's going to be the type returned by the call to the function object
    func_ret_type(arg_type_tuple) { 
        eassert(false, "func_ret_type not implemented")
    }
    get_const_value() { // if it's a node that has a constant value (number, vec) return it for higher percision than saving a string
        return null
    }
    eval() {
        eassert(false, "eval not implemented")
    }
    check_type() {
        eassert(false, "check_type not implemented")
    }
    to_glsl() { 
        eassert(false, "to_glsl not implemented") 
    }
}

// base class for all evaluators
class EvaluatorBase extends NodeBase {
    constructor() {
        super()
        this.line_num = null // set it StateAccess.get_evaluator
    }
}

function typename(t) {
    switch(t) {
    case TYPE_NUM: return "number"
    case TYPE_BOOL: return "bool"
    case TYPE_VEC2: return "vec2"
    case TYPE_VEC3: return "vec3"
    case TYPE_VEC4: return "vec4"
    case TYPE_FUNCTION: return "function"
    default: return "<" + t + ">"
    }
}
function numbersInType(t) {
    switch(t) {
    case TYPE_NUM: return 1
    case TYPE_BOOL: return 1
    case TYPE_VEC2: return 2
    case TYPE_VEC3: return 3
    case TYPE_VEC4: return 4
    default: return null
    }
}

// pack multiple types in the same value, used for function lookup by argument types
function type_tuple_l(lst) {
    if (lst.length > 4)
        throw new TypeErr("too many arguments to function")
    let at = 0, idx = 0
    for(let t of lst)
        at = at | (t << (8*idx++))
    return at
}
function type_tuple() {
    return type_tuple_l(arguments)
}
function type_tuple_str(tt) {
    let s = []
    while(tt !== 0) {
        s.push(typename(tt & 0xff))
        tt = tt >> 8
    }
    return s.join(",")
}


function clamp(a, v, b) {
    if (v < a) return a;
    if (v > b) return b;
    return v;
}

const SUBSCRIPT_TO_IDX = { x:0, y:1, z: 2, w:3, r:0, g:1, b:2, a: 3, alpha:3 }
const SUBIDX_TO_GLSL = ['r','g','b','w']

class FuncsSet {
    constructor() {
        this.set = {}
    }
    add(name, text) {
        if (this.set[name] !== undefined)
            return
        this.set[name] = text
    }
    extend(v) {
        if (v === null)
            return
        this.set = {...this.set, ...v.set}
    }
    to_text() {
        const func_lst = []
        for(let ft_name in this.set)
            func_lst.push(this.set[ft_name])
        return func_lst.join("\n")
    }
    get_kv() {
        return this.set
    }
    get(name) {
        return this.set[name]
    }
    append_text(name, text) {
        if (this.set[name] === undefined)
            this.set[name] = text
        else
            this.set[name] += text
    }
}

var ExprParser = (function() {

// immutable object
class NumNode  extends NodeBase {  
    constructor(_v, str_was_decimal) {
        super()
        eassert(_v !== null && _v !== undefined, "unexpected non-number value")
        this.v = _v;
        this.decimal = str_was_decimal
    }
    eval() {
        return this.v;
    }
    check_type() {
        this.type = TYPE_NUM
        return TYPE_NUM
    }
    to_glsl(emit_ctx) {
        if (Number.isInteger(this.v))
            return this.v + ".0"
        return this.v;
    }
    get_const_value() { 
        if (!this.decimal)
            return null  // original text was hex or oct, don't want to spoil that
        return this.v
    }
}

function make_num_node(v) {
    return new NumNode(v, true)
}


class BoolNode extends NodeBase {
    constructor(_v, str_was_decimal) {
        super()
        eassert(_v !== null && _v !== undefined, "unexpected non-number value")
        this.v = _v;
    }
    eval() {
        return this.v;
    }
    check_type() {
        this.type = TYPE_BOOL
        return TYPE_BOOL
    }
    to_glsl(emit_ctx) {
        return this.v ? "true":"false";
    }
    get_const_value() { 
        return this.v
    }
}


class VecNode extends NodeBase {
    constructor(_v, type) {
        super()
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
    //    case OPERATOR_EXPONENT:       ret = v1 * Math.pow(10, v2); break;
        case OPERATOR_SUBSCRIPT:      throw new ExprErr("subscript in binary (bug)");

        case OPERATOR_LESS:           ret = (v1 < v2); break // + to make it a number
        case OPERATOR_LESS_EQ:        ret = (v1 <= v2); break
        case OPERATOR_GREATER:        ret = (v1 > v2); break
        case OPERATOR_GREATER_EQ:     ret = (v1 >= v2); break
        case OPERATOR_EQ:             ret = (v1 == v2); break
        case OPERATOR_NEQ:            ret = (v1 != v2); break
        case OPERATOR_LOGIC_AND:      ret = (v1 && v2); break // not short-circuting evaluation since that would complicate vector ops
        case OPERATOR_LOGIC_OR:       ret = (v1 || v2); break
        default:  throw new ExprErr("unexpected operator");
    }
    return ret;
}

function op_str(op) {
    switch (op) {
        case OPERATOR_BITWISE_OR:     return '|'
        case OPERATOR_BITWISE_XOR:    return '^'
        case OPERATOR_BITWISE_AND:    return '&'
        case OPERATOR_BITWISE_SHL:    return '<<'
        case OPERATOR_BITWISE_SHR:    return '>>'
        case OPERATOR_ADDITION:       return '+'
        case OPERATOR_SUBTRACTION:    return '-'
        case OPERATOR_MULTIPLICATION: return '*'
        case OPERATOR_DIVISION:       return '/'
        case OPERATOR_MODULO:         return '%'
        case OPERATOR_POWER:          return '**'
    //    case OPERATOR_EXPONENT:       return 'e'
        case OPERATOR_SUBSCRIPT:      throw new ExprErr("subscript in binary (bug)");

        case OPERATOR_LESS:           return '<'
        case OPERATOR_LESS_EQ:        return '<='
        case OPERATOR_GREATER:        return '>'
        case OPERATOR_GREATER_EQ:     return '>='
        case OPERATOR_EQ:             return '=='
        case OPERATOR_NEQ:            return '!='
        case OPERATOR_LOGIC_AND:      return '&&'
        case OPERATOR_LOGIC_OR:       return '||'
        default:  throw new ExprErr("unexpected operator");
    }
}

function is_order_op(op) {
    return op == OPERATOR_LESS || op == OPERATOR_LESS_EQ ||  
           op == OPERATOR_GREATER || op == OPERATOR_GREATER_EQ 
}
function is_logic_op(op) {
    return op == OPERATOR_LOGIC_AND || op == OPERATOR_LOGIC_OR
}


class BinaryOpNode extends NodeBase {
    constructor(l, r, _op) {
        super()
        this.left = l;
        this.right = r;
        this.op = _op;
        this.type = null
        this.t1 = null; this.t2 = null
    }
    clear_types_cache() {
        this.type = null
        this.left.clear_types_cache()
        this.right.clear_types_cache()
    }
    check_type() {
        if (this.type === null) {
            let t1 = this.left.check_type(), t2 = this.right.check_type()
            this.t1 = t1; this.t2 = t2
            if (is_order_op(this.op)) { // only between numbers, not supporting vectors of booleans
                if (t1 !== TYPE_NUM || t2 !== TYPE_NUM)
                    throw new TypeErr("boolean operator " + op_str(this.op) + " expects numbers", this.line)
                this.type = TYPE_BOOL
            }
            else if (this.op == OPERATOR_EQ || this.op == OPERATOR_NEQ) {
                if (t1 !== t2)
                    throw new TypeErr("Equality op of different types " + typename(t1) + ", " + typename(t2), this.line)
                this.type = TYPE_BOOL
            }
            else if (is_logic_op(this.op)) {
                if (t1 !== TYPE_BOOL || t2 !== TYPE_BOOL)
                    throw new TypeErr("logic operator " + op_str(this.op) + " expected booleans", this.line)
                this.type = TYPE_BOOL
            }
            else {
                if (t1 > t2) {  let tmp = t1; t1 = t2; t2 = tmp } // t1 is lower
                if (t1 === TYPE_NUM)
                    this.type = t2 // the vec (or float) type
                else if (t1 != t2)
                    throw new TypeErr("can't handle different vec types")
                else 
                    this.type = t1 // both same vec type
            }
        }
        return this.type
    }

    eval() {
        console.assert(this.type !== null)
        const v1 = this.left.eval();
        const v2 = this.right.eval();
        if (this.type === TYPE_NUM || this.type === TYPE_BOOL)
            return call_operator(v1, v2, this.op)
        if (this.t1 == this.t2) // save vec type
            return apply_by_component([v1, v2], (v1, v2)=>{ return call_operator(v1, v2, this.op)})
        // vec and num
        let v,n
        if (this.t1 == TYPE_NUM || this.t1 == TYPE_BOOL)
            v = v2, n = v1
        else
            v = v1, n = v2
        const num_comp = v.length
        const ret = new v.constructor(num_comp)
        for(let i = 0; i < num_comp; ++i) 
            ret[i] = call_operator(v[i], n, this.op)
        return ret
    }

    to_glsl(emit_ctx) {
        return '(' + this.left.to_glsl(emit_ctx) + ops[this.op].str + this.right.to_glsl(emit_ctx) + ')'
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

class UnaryOpNode extends NodeBase {
    constructor(c, op) {
        super()
        this.child = c;
        this.type = null
        this.op = op
    }
    eval() {
        const v = this.child.eval();
        if (this.type == TYPE_NUM || this.type == TYPE_BOOL)
            return call_unary_op(v, this.op)
        const num_comp = v.length
        const ret = new v.constructor(num_comp)
        for(let i = 0; i < num_comp; ++i) 
            ret[i] = call_unary_op(v[i], this.op)
        return ret
    }
    clear_types_cache() {
        this.type = null
        this.child.clear_types_cache()
    }
    check_type() {
        if (this.type === null)            
            this.type = this.child.check_type()
        return this.type
    }
    to_glsl(emit_ctx) {
        const v = this.child.to_glsl(emit_ctx) + ')'
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
const OPERATOR_NEQ = 18 // ==
const OPERATOR_LOGIC_AND = 19 // &&
const OPERATOR_LOGIC_OR = 20 // ||
const OPERATOR_SUBSCRIPT = 21 // a.x
const OPERATOR_TRINARY = 22 // ?:

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
        this.associativity = assoc;  // means in what order operators are ground with the same precedence (1+2+3 is (1+2)+3 or 1+(2+3)
        this.str = str
    }
}

// NOTICE: needs to be ordered by the numbers of the operators, only binary operators
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
    null, //new Operator(OPERATOR_EXPONENT, 400, 'R', 'e'),

    new Operator(OPERATOR_LESS, 30, 'L', '<'),
    new Operator(OPERATOR_LESS_EQ, 30, 'L', '<='),
    new Operator(OPERATOR_GREATER, 30, 'L', '>'),
    new Operator(OPERATOR_GREATER_EQ, 30, 'L', '>='),
    new Operator(OPERATOR_EQ, 30, 'L', '=='),
    new Operator(OPERATOR_NEQ, 30, 'L', '=='),

    new Operator(OPERATOR_LOGIC_AND, 20, 'L', '&&'),
    new Operator(OPERATOR_LOGIC_OR, 10, 'L', '||'),
    new Operator(OPERATOR_SUBSCRIPT, 500, 'L', '.'),

    new Operator(OPERATOR_TRINARY, 10, null, '?:')
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
        new ExprErr("Syntax error: unexpected token, expected " + str)
    index_ += str.length;
}


/// Eat all white space characters at the
/// current expression index.
function eatSpaces() {
    while (true) {
        const c = getCharacter()
        if (c === '\n')
            g_lineNum++
        if (c !== ' ' && c !== '\n' && c !== '\r' && c !== '\t')
            break
        index_++
    }
}
function isSpace(c) {
    return (c === ' ' || c === '\n' || c === '\r' || c === '\t')
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
        case '!':
            expect('!=')
            return ops[OPERATOR_NEQ];            
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
     /*   case 'e':
            index_++;
            return ops[OPERATOR_EXPONENT];
        case 'E':
            index_++;
            return ops[OPERATOR_EXPONENT];*/
        case '.':
            index_++;
            return ops[OPERATOR_SUBSCRIPT]
        case '?':
            index_++;
            return ops[OPERATOR_TRINARY]
        default:
            return ops[OPERATOR_NULL];
    }
}

class FuncDef {
    constructor(jsfunc, num_args, type=FUNC_TYPE_BY_COMPONENT, ret_type=null) {
        this.f = jsfunc
        this.num_args = num_args // negative means atleast that many
        this.dtype = type
        this.ret_type = ret_type // for FUNC_TYPE_LOOKUP - either a type or null to indicate it's the same as the input-arg type
    }
}


function md5(d){return ((binl_md5(rstr2binl(d),8*d.length)))}function rstr2hex(d){for(var _,m="0123456789ABCDEF",f="",r=0;r<d.length;r++)_=d.charCodeAt(r),f+=m.charAt(_>>>4&15)+m.charAt(15&_);return f}function rstr2binl(d){for(var _=Array(d.length>>2),m=0;m<_.length;m++)_[m]=0;for(m=0;m<8*d.length;m+=8)_[m>>5]|=(255&d.charCodeAt(m/8))<<m%32;return _}function binl2rstr(d){for(var _="",m=0;m<32*d.length;m+=8)_+=String.fromCharCode(d[m>>5]>>>m%32&255);return _}function binl_md5(d,_){d[_>>5]|=128<<_%32,d[14+(_+64>>>9<<4)]=_;for(var m=1732584193,f=-271733879,r=-1732584194,i=271733878,n=0;n<d.length;n+=16){var h=m,t=f,g=r,e=i;f=md5_ii(f=md5_ii(f=md5_ii(f=md5_ii(f=md5_hh(f=md5_hh(f=md5_hh(f=md5_hh(f=md5_gg(f=md5_gg(f=md5_gg(f=md5_gg(f=md5_ff(f=md5_ff(f=md5_ff(f=md5_ff(f,r=md5_ff(r,i=md5_ff(i,m=md5_ff(m,f,r,i,d[n+0],7,-680876936),f,r,d[n+1],12,-389564586),m,f,d[n+2],17,606105819),i,m,d[n+3],22,-1044525330),r=md5_ff(r,i=md5_ff(i,m=md5_ff(m,f,r,i,d[n+4],7,-176418897),f,r,d[n+5],12,1200080426),m,f,d[n+6],17,-1473231341),i,m,d[n+7],22,-45705983),r=md5_ff(r,i=md5_ff(i,m=md5_ff(m,f,r,i,d[n+8],7,1770035416),f,r,d[n+9],12,-1958414417),m,f,d[n+10],17,-42063),i,m,d[n+11],22,-1990404162),r=md5_ff(r,i=md5_ff(i,m=md5_ff(m,f,r,i,d[n+12],7,1804603682),f,r,d[n+13],12,-40341101),m,f,d[n+14],17,-1502002290),i,m,d[n+15],22,1236535329),r=md5_gg(r,i=md5_gg(i,m=md5_gg(m,f,r,i,d[n+1],5,-165796510),f,r,d[n+6],9,-1069501632),m,f,d[n+11],14,643717713),i,m,d[n+0],20,-373897302),r=md5_gg(r,i=md5_gg(i,m=md5_gg(m,f,r,i,d[n+5],5,-701558691),f,r,d[n+10],9,38016083),m,f,d[n+15],14,-660478335),i,m,d[n+4],20,-405537848),r=md5_gg(r,i=md5_gg(i,m=md5_gg(m,f,r,i,d[n+9],5,568446438),f,r,d[n+14],9,-1019803690),m,f,d[n+3],14,-187363961),i,m,d[n+8],20,1163531501),r=md5_gg(r,i=md5_gg(i,m=md5_gg(m,f,r,i,d[n+13],5,-1444681467),f,r,d[n+2],9,-51403784),m,f,d[n+7],14,1735328473),i,m,d[n+12],20,-1926607734),r=md5_hh(r,i=md5_hh(i,m=md5_hh(m,f,r,i,d[n+5],4,-378558),f,r,d[n+8],11,-2022574463),m,f,d[n+11],16,1839030562),i,m,d[n+14],23,-35309556),r=md5_hh(r,i=md5_hh(i,m=md5_hh(m,f,r,i,d[n+1],4,-1530992060),f,r,d[n+4],11,1272893353),m,f,d[n+7],16,-155497632),i,m,d[n+10],23,-1094730640),r=md5_hh(r,i=md5_hh(i,m=md5_hh(m,f,r,i,d[n+13],4,681279174),f,r,d[n+0],11,-358537222),m,f,d[n+3],16,-722521979),i,m,d[n+6],23,76029189),r=md5_hh(r,i=md5_hh(i,m=md5_hh(m,f,r,i,d[n+9],4,-640364487),f,r,d[n+12],11,-421815835),m,f,d[n+15],16,530742520),i,m,d[n+2],23,-995338651),r=md5_ii(r,i=md5_ii(i,m=md5_ii(m,f,r,i,d[n+0],6,-198630844),f,r,d[n+7],10,1126891415),m,f,d[n+14],15,-1416354905),i,m,d[n+5],21,-57434055),r=md5_ii(r,i=md5_ii(i,m=md5_ii(m,f,r,i,d[n+12],6,1700485571),f,r,d[n+3],10,-1894986606),m,f,d[n+10],15,-1051523),i,m,d[n+1],21,-2054922799),r=md5_ii(r,i=md5_ii(i,m=md5_ii(m,f,r,i,d[n+8],6,1873313359),f,r,d[n+15],10,-30611744),m,f,d[n+6],15,-1560198380),i,m,d[n+13],21,1309151649),r=md5_ii(r,i=md5_ii(i,m=md5_ii(m,f,r,i,d[n+4],6,-145523070),f,r,d[n+11],10,-1120210379),m,f,d[n+2],15,718787259),i,m,d[n+9],21,-343485551),m=safe_add(m,h),f=safe_add(f,t),r=safe_add(r,g),i=safe_add(i,e)}return Array(m,f,r,i)}function md5_cmn(d,_,m,f,r,i){return safe_add(bit_rol(safe_add(safe_add(_,d),safe_add(f,i)),r),m)}function md5_ff(d,_,m,f,r,i,n){return md5_cmn(_&m|~_&f,d,_,r,i,n)}function md5_gg(d,_,m,f,r,i,n){return md5_cmn(_&f|m&~f,d,_,r,i,n)}function md5_hh(d,_,m,f,r,i,n){return md5_cmn(_^m^f,d,_,r,i,n)}function md5_ii(d,_,m,f,r,i,n){return md5_cmn(m^(_|~f),d,_,r,i,n)}function safe_add(d,_){var m=(65535&d)+(65535&_);return(d>>16)+(_>>16)+(m>>16)<<16|65535&m}function bit_rol(d,_){return d<<_|d>>>32-_}

function myrand(seed) {
    let r = md5('x' + seed)[seed%4]
    r &= 2147483647
    r /= 2147483647
    return r;
}
function randvec2(seed) {
    var r = myrand(seed) * 2.0 * Math.PI;
    return vec2.fromValues(Math.cos(r), Math.sin(r))
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
function glsl_clamp(v, minv, maxv) {  // normal clamp has different argument order
    if (v < minv) return minv;
    if (v > maxv) return maxv;
    return v;
}
function smoothstep(edge0, edge1, x) {
    // Scale, bias and saturate x to 0..1 range
    const r = glsl_clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0); 
    // Evaluate polynomial
    return r * r * (3 - 2 * r);
}

function sqr(v) { return v*v }
function degrees(v) { return v*180/Math.PI }
function radians(v) { return v*Math.PI/180 }
function fit01(v, nmin, nmax) { return fit(v, 0, 1, nmin, nmax) }
function fit11(v, nmin, nmax) { return fit(v, -1, 1, nmin, nmax) }
//function ifelse(v, vt, vf) { return v?vt:vf }

function make_float(v) { return +v }
function make_vec2(x, y) { return vec2.fromValues(x, y) }

const make_vec3 = {
[type_tuple(TYPE_NUM, TYPE_NUM, TYPE_NUM)]: function(x, y, z) { return vec3.fromValues(x, y, z) },
[type_tuple(TYPE_VEC2, TYPE_NUM)]: function(v2,z) { return vec3.fromValues(v2[0], v2[1], z) },
[TYPE_VEC3]: function(v) { return v },
[TYPE_VEC4]: function(v) { return vec3.fromValues(v[0], v[1], v[2]) }
}
const make_vec4 = {
[type_tuple(TYPE_NUM, TYPE_NUM, TYPE_NUM, TYPE_NUM)]: function(x, y, z, w) { return vec4.fromValues(x, y, z, w) },
[type_tuple(TYPE_VEC2, TYPE_NUM, TYPE_NUM)]: function(v2,z,w) { return vec4.fromValues(v2[0], v2[1], z, w) },
[type_tuple(TYPE_VEC3, TYPE_NUM)]: function(v3,z) { return vec4.fromValues(v3[0], v3[1], v3[2], w) },
[TYPE_VEC4]: function(v) { return v }
}

const distance_lookup = {
[type_tuple(TYPE_NUM, TYPE_NUM)]:  function(a,b) { return Math.abs(a-b) },
[type_tuple(TYPE_VEC2, TYPE_VEC2)]: function(a,b) { return vec2.distance(a,b) },
[type_tuple(TYPE_VEC3, TYPE_VEC3)]: function(a,b) { return vec3.distance(a,b) },
[type_tuple(TYPE_VEC4, TYPE_VEC4)]: function(a,b) { return vec4.distance(a,b) },
}
const length_lookup = {
[TYPE_NUM]:  function(a) { return Math.abs(a) },
[TYPE_VEC2]: function(a) { return vec2.length(a) },
[TYPE_VEC3]: function(a) { return vec3.length(a) },
[TYPE_VEC4]: function(a) { return vec4.length(a) },
}
const normalize_lookup = {
[TYPE_NUM]:  function(v) { return 1 },
[TYPE_VEC2]: function(v) { let x = vec2.create(); vec2.normalize(x,v); return x },
[TYPE_VEC3]: function(v) { let x = vec3.create(); vec3.normalize(x,v); return x },
[TYPE_VEC4]: function(v) { let x = vec3.create(); vec3.normalize(x,v); return x },
}

// range 360,100,100
function hsl(h, s, v) {
    const obj = {}
    ColorPicker.HSLtoRGB(h, s, v, obj)
    return [obj.r, obj.g, obj.b]
}
// range 360,100,100, 1.0
function hsla(h, s, v, a) {
    const obj = {}
    ColorPicker.HSLtoRGB(h, s, v, obj)
    return [obj.r, obj.g, obj.b, a]
}

function plasma(coord, time=null, move=null) {
    x = coord[0]*10  
    y = coord[1]*10 
    if (time === null)
        t = 20000
    if (move === null)
        move = vec2.create(0,0)

    da = vec2.distance(vec2.fromValues(x+Math.cos(time/1110.0)*4.0,y), vec2.fromValues(1.0,2.1))
    db = vec2.distance(vec2.fromValues(x,y), vec2.fromValues(8.0 + 16.0*move[0], 6.1 + 8.0*(1.0 - move[1]) ))
    dc = vec2.distance(vec2.fromValues(x,y + Math.cos(time / 998.0)*2.0), vec2.fromValues(10.0, 3.1))
    c1 = Math.sin(da) + Math.sin(x) * Math.sin(time/1000.0)
    c2 = Math.sin(db - time / 500.0)*1.0
    c3 = Math.cos(dc / 2.0) + Math.sin(time/1000.0)
    c = (c1 + c2 + c3) / 3.0
    
    return c*0.5+0.5  // return range [0,1]
}

function smoothmin(k, d1, d2) {
    eassert(false, "not-implemented")
}

// input and outputs are in range [0,1]
// https://stackoverflow.com/questions/17242144/javascript-convert-hsb-hsv-color-to-rgb-accurately/54024653#54024653
function rgb2hsv(va) {
    let r=va[0], g=va[1], b=va[2]
    let v=Math.max(r,g,b), c=v-Math.min(r,g,b);
    let h= c && ((v==r) ? (g-b)/c : ((v==g) ? 2+(b-r)/c : 4+(r-g)/c)); 
    return [60*(h<0?h+6:h)/360, v&&c/v, v];
}
function hsv2rgb(va) {
    let h = va[0]*360, s = va[1], v = va[2]
    let f= (n,k=(n+h/60)%6) => v - v*s*Math.max( Math.min(k,4-k,1), 0);     
    return [f(5),f(3),f(1)];   
}


const func_defs = {
    'cos': new FuncDef(Math.cos, 1), 'sin': new FuncDef(Math.sin, 1), 'tan': new FuncDef(Math.tan, 1),
    'acos': new FuncDef(Math.acos, 1), 'asin': new FuncDef(Math.acos, 1), 'atan': new FuncDef(Math.atan, 1), 'atan2': new FuncDef(Math.atan2, 2),
    'sqrt': new FuncDef(Math.sqrt, 1), 'sqr': new FuncDef(sqr, 1), 'pow': new FuncDef(Math.pow, 2),
    'distance': new FuncDef(distance_lookup, 2, FUNC_TYPE_LOOKUP, TYPE_NUM), 'length': new FuncDef(length_lookup, 1, FUNC_TYPE_LOOKUP, TYPE_NUM),
    'log': new FuncDef(Math.log, 1), 'log10': new FuncDef(Math.log10, 1), 'log2': new FuncDef(Math.log2, 1),
    'round': new FuncDef(Math.round, 1), 'ceil': new FuncDef(Math.ceil, 1), 'floor': new FuncDef(Math.floor, 1), 'trunc': new FuncDef(Math.trunc, 1),
    'abs': new FuncDef(Math.abs, 1), 'sign': new FuncDef(Math.sign, 1),
    'min': new FuncDef(Math.min, -2), 'max': new FuncDef(Math.max, -2), 'clamp': new FuncDef(glsl_clamp, 3), // negative means atleast
    'smoothstep' : new FuncDef(smoothstep, 3),
    'rand': new FuncDef(myrand, 1),
    'randvec2': new FuncDef(randvec2, 1, [TYPE_NUM], TYPE_VEC2),
    'fit': new FuncDef(fit, 5), 'fit01': new FuncDef(fit01, 3), 'fit11': new FuncDef(fit11, 3),
    'degrees': new FuncDef(degrees, 1), 'radians': new FuncDef(radians, 1),
 //   'ifelse': new FuncDef(ifelse, 3),
    'float':new FuncDef(make_float, 1, [TYPE_BOOL], TYPE_NUM),
    'vec2': new FuncDef(make_vec2, 2, [TYPE_NUM, TYPE_NUM], TYPE_VEC2), 'vec3': new FuncDef(make_vec3, [1,3], FUNC_TYPE_LOOKUP, TYPE_VEC3), 'vec4': new FuncDef(make_vec4, [1,4], FUNC_TYPE_LOOKUP, TYPE_VEC4),
    'normalize': new FuncDef(normalize_lookup, 1, FUNC_TYPE_LOOKUP, null),
    'hsl' : new FuncDef(hsl, 3, [TYPE_NUM, TYPE_NUM, TYPE_NUM], TYPE_VEC3), 
    'hsla' : new FuncDef(hsla, 4, [TYPE_NUM, TYPE_NUM, TYPE_NUM, TYPE_NUM],TYPE_VEC4),
    'rgb2hsv' : new FuncDef(rgb2hsv, 1, [TYPE_VEC3], TYPE_VEC3), 'hsv2rgb' : new FuncDef(hsv2rgb, 1, [TYPE_VEC3], TYPE_VEC3),
    'plasma' : new FuncDef(plasma, [1,3], [TYPE_VEC2, TYPE_NUM, TYPE_VEC2] , TYPE_NUM),
    'smoothmin' : new FuncDef(smoothmin, -3, [TYPE_NUM, TYPE_NUM, TYPE_NUM], TYPE_NUM)

}
// aliases
func_defs['rgb'] = func_defs['vec3']
func_defs['rgba'] = func_defs['vec4']

// a place holder for an internal func that is returned from lookup and replaced by a FuncCallNode
class FuncDefNode extends NodeBase {
    constructor(def) {
        super()
        this.def = def
    }
    num_args() { return this.def.num_args }
    check_type() {
        return TYPE_FUNCTION
    }
}

class AddGlslFunc {
    constructor(s) { this.func_str = s }
}

const glsl_translate = {
    'rgb': "vec3", "rgba": "vec4",
    'atan2': 'atan',
    'sqr': new AddGlslFunc("$T sqr($T v) { return v*v; }"),
    'log10': new AddGlslFunc("$T log10($T v) { return log(v)/log(10) }"),
    'rand': null, 'fit': null, 'fit01': null, 'fit11': null, 
//    'ifelse': new AddGlslFunc("$T ifelse(bool c, $T a, $T b) { return c?a:b; }"),
    'plasma': new AddGlslFunc(`
float plasma(vec2 coord, float time, vec2 move) {    
    float x = coord.x * 10.0;
    float y = coord.y * 10.0;
    float da = distance(vec2(x+cos(time / 1110.0) * 4.0, y), vec2(1.0,2.1));
    float db = distance(vec2(x,y), vec2(8.0 + 16.0 * move.x, 6.1 + 8.0*(1.0 - move.y) ));
    float dc = distance(vec2(x,y + cos(time / 998.0)*2.0), vec2(10.0, 3.1));
    float c1 = sin(da) + sin(x) * sin(time / 1000.0);
    float c2 = sin(db - time / 500.0)*1.0;
    float c3 = cos(dc / 2.0) + sin(time / 1000.0);
    float c = (c1 + c2 + c3) / 3.0;
    return c * 0.5 + 0.5;
}
float plasma(vec2 coord, float time) { return plasma(coord, time, vec2(0.0, 0.0)); }
float plasma(vec2 coord) { return plasma(coord, 20000.0, vec2(0.0, 0.0)); }
    `),
    'smoothmin': new AddGlslFunc(`
float smoothmin(float k, float d1, float d2) {
    float h = clamp( 0.5 + 0.5*(d2-d1)/k, 0.0, 1.0 );
    return mix( d2, d1, h ) - k*h*(1.0-h); 
}
    `),
    'rgb2hsv': new AddGlslFunc(`
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
    `),
    'hsv2rgb': new AddGlslFunc(`
vec3 hsv2rgb(vec3 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}  
    `)
    
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

function args_check_type_tuple(args) {
    const atypes = []
    for(let arg of args)
        atypes.push(arg.check_type())
    return type_tuple_l(atypes)    
}

function args_check_type_lst(args) {
    const atypes = []
    for(let arg of args)
        atypes.push(arg.check_type())
    return atypes    
}

class InternalFuncCallNode extends NodeBase {
    constructor(def, funcname, args) {
        super()
        this.def = def
        this.f = def.f
        this.args = args // input nodes
        this.type = null
        this.funcname = funcname
        this.lookedup_f = null
    }
    eval() {
        let argvals = []
        for(let arg of this.args)
            argvals.push(arg.eval())
        if (this.def.dtype == FUNC_TYPE_LOOKUP)
            return this.lookedup_f.apply(null, argvals)       
        if (this.def.dtype != FUNC_TYPE_BY_COMPONENT || this.type == TYPE_NUM || this.type == TYPE_BOOL)
            return this.f.apply(null, argvals) 
        return apply_by_component(argvals, this.f)
    }
    clear_types_cache() {
        this.type = null
        for(let arg of this.args)
            arg.clear_types_cache()
    }
    check_type() {
        if (this.type !== null) {
            return this.type
        }
        let def_t = this.def.dtype
        let ret_t = null
        if (def_t == FUNC_TYPE_BY_COMPONENT) { // all arguments need to be the same type
            const args_type = this.args[0].check_type()
            for(let arg of this.args) {
                const t = arg.check_type()
                if (t !== args_type)
                    throw new TypeErr("function needs all arguments of the same type, got " + typename(t))
            }
            ret_t = args_type
        }
        else if (def_t == FUNC_TYPE_LOOKUP) {          
            const args_type = args_check_type_tuple(this.args)
            this.lookedup_f = this.f[args_type]
            eassert(this.lookedup_f !== undefined, "Can't find function overload for argument types") // TBD better error
            // return type
            if (this.def.ret_type === null) {
                if (atypes.length === 1)
                    ret_t = atypes[0]
                else
                    throw new TypeErr("Can't deduce return type of func " + this.funcname)
            }
            else
                ret_t = this.def.ret_type
        }
        else { // args value has a specific given type
            eassert(Array.isArray(def_t))
            const args_type = args_check_type_lst(this.args)

            if (def_t.num_args > 0) // sanity, might have been checked before
                eassert(args_type.length === def_t.length, "Unexpected number of arguments " + args_type.length, " != " + def_t.length)
            else {
                eassert(args_type.length >= def_t.length, "Unexpected number of arguments " + args_type.length, " != " + def_t.length)
                // check the last ones, if the exist, type needs to be as the last type of the in the definition
                for(let i = def_t.length; i < args_type.length; ++i)
                    if (args_type[i] !== def_t[def_t.length - 1])
                        throw new TypeErr("Unexpected argument types expected arg: " + (i+1) + ": " + type_tuple_str(def_t[def_t.length - 1]) + " got " + type_tuple_str(args_type[i]))    
            }
            for(let i = 0; i < def_t.length; ++i) // check only upto how many are given
                if (args_type[i] !== def_t[i])  
                    throw new TypeErr("Unexpected argument types expected arg: " + (i+1) + ": " + type_tuple_str(def_t[i]) + " got " + type_tuple_str(args_type[i]))



            ret_t = this.def.ret_type
        }
        this.type = ret_t
        return this.type        
    }
    to_glsl(emit_ctx) {
        let slst = []
        const tr = glsl_translate[this.funcname] 
        let name = this.funcname
        if (tr !== undefined) {
            if (tr === null) // marks is as unsupported
                throw new ExprErr("Function not supported in GLSL: " + this.funcname)
            if (typeof tr === 'string')
                name = tr
            else if (tr.constructor === AddGlslFunc) {
                const gtype = TYPE_TO_STR[this.type]
                let text = tr.func_str.replace(/\$T/g, gtype) // assume there's only on type, that's the same as the func return type
                const key = name + "|" + gtype
                g_glsl_added_funcs.add(key, {name:name, text:text})
            }
        }
        for(let arg of this.args)
            slst.push(arg.to_glsl(emit_ctx))
        
        if (this.def.num_args <= -2 && slst.length > 2) {
            // case of "at least two arguments but maybe more" - Math.min like functions - call pairwise
            // if there are more than 2 args, assume the first are constant to all calls (like smoothmin)
            let constant_args = ""
            const c_offset = -(2 + this.def.num_args)
            for(let i = 0; i < c_offset; ++i)
                constant_args += slst[i] + ", "

            let ret = "", len = slst.length
            for(let i = c_offset; i < len - 2; ++i) 
                ret += name + "(" + constant_args + slst[i] + ", "
            ret += name + "(" + constant_args + slst[len-2] + ", " + slst[len-1]
            ret += ')'.repeat(len-1-c_offset)
            return ret
        }

        // number of arguments was check during parse
        return name + '(' + slst.join(',') + ')'
        
    }
}


class FuncObjCallNode extends NodeBase 
{
    constructor(func_node, func_name, args) {
        super()
        this.func_node = func_node
        this.arg_nodes = args
        this.func_name = func_name
    }
    eval() { 
        let argvals = []
        for(let arg of this.arg_nodes)
            argvals.push(arg.eval())
            
        eassert(this.func_node.eval_func !== undefined, "func node without eval_func")
        return this.func_node.eval_func(argvals)
    }
    check_type() { 
        if (this.type !== null) 
            return this.type
        if (this.func_node.check_type() !== TYPE_FUNCTION)
            throw new TypeErr("Identifier " + this.func_name + " is not a function")
        let arg_types = []    
        for(let arg of this.arg_nodes)
            arg_types.push(arg.check_type())
        this.type = this.func_node.func_ret_type(type_tuple_l(arg_types))
        return this.type
    }
    clear_types_cache() { 
        for(let arg of this.arg_nodes)
            arg.clear_types_cache()
        this.func_node.clear_types_cache()
    }  
    to_glsl(emit_ctx) { 
        let args = []
        for(let arg of this.arg_nodes)
            args.push(arg.to_glsl(emit_ctx))

        let name
        if (this.func_node.to_glsl_mutate_args !== undefined) // hack for allowing the function node to modify the arguments (image distance field needs it)
            name = this.func_node.to_glsl_mutate_args(emit_ctx, args)
        else
            name = this.func_node.to_glsl(emit_ctx)

        return name + "(" + args.join(",") + ")"
    }
}

function parseFuncCall(func_node, func_name) {
    //if (!func_node.is_function())
    //    throw new ExprErr("Identifier " + func_name + " is not a function" )  
    let args = []
    // negative num_args means at least that many
    do {
        index_++; // first time skips the paren, after that skips the comma
        let arg = parseExpr()
        args.push(arg)
        eatSpaces();
    } while (getCharacter() == ',')
    if (getCharacter() != ')')
        throw new ExprErr("Expected closing paren for argument list at " + index_)
    ++index_; // skip paren

    if (func_node.constructor === FuncDefNode) { // dummy is discarded
        // internal func can have the argument number check during parsing
        const expect_num_arg = func_node.num_args()
        if (Array.isArray(expect_num_arg)) { // range was given
            if (args.length < expect_num_arg[0] || args.length > expect_num_arg[1])
                throw new ExprErr("Wrong number of arguments to function " + func_name + " expected in range [" + expect_num_arg[0] + ", " + expect_num_arg[1] + "] got " + args.length)
        }
        if (expect_num_arg === 0)
            throw new ExprErr("internal func can't have 0 arguments")
        if (expect_num_arg > 0) {
            if (args.length != expect_num_arg)
                throw new ExprErr("Wrong number of argument to function " + func_name + " expected " + expect_num_arg + " got " + args.length)
        }
        else {
            if (args.length < -expect_num_arg)
                throw new ExprErr("Not enough arguments to function " + func_name + " expected at least " + expect_num_arg + " got " + args.length)
        }
        return new InternalFuncCallNode(func_node.def, func_name, args)
    }
    else {
        return new FuncObjCallNode(func_node, func_name, args)
    }
}

const constants = {"PI": new NumNode(Math.PI, true), 
                   "true": new BoolNode(true), "false":new BoolNode(false)}

function parseIdentifier() {
    let sb = ''
    while(true) {
        let c = getCharacter();
        if (c === null)
            break;
        // identifier can have digits but not start with a digit (checked by the caller)
        if ( (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' || c == '.' || (c >= '0' && c <= '9') )
            sb = sb + c;
        else
            break;
        index_++;
    }
    if (sb[0] == '.' || sb[sb.length-1] == '.')
        throw new ExprErr("Unexpected dot in an identifier at " + index_)

    return [sb, lookupIdentifier(sb)]
}

function lookupIdentifier(sb)
{
    if (constants[sb] !== undefined)
        return constants[sb]
    if (func_defs[sb] !== undefined)
        return new FuncDefNode(func_defs[sb])

    if (g_symbol_table !== null) {
        const sps = sb.split('.')
        const sn = g_symbol_table[sps[0]]
        if (sn !== undefined) {
            if (sps.length === 1) 
                return sn
            return new SubscriptNode(sn, sps.slice(1))
        }    
    }

    let e = g_state_access.get_evaluator(sb, g_lineNum)
    if (e === null) 
        throw new ExprErr("Unknown identifier " + sb + " at " + index_)
    
    if (!e.consumes_subscript()) {
        const sps = sb.split('.')
        if (sps.length !== 1) 
            return new SubscriptNode(e, sps.slice(1))        
    }

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
    let c = getCharacter()
    if (c == 'e' || c == 'E') {
        const lookahead = (expr_[index_+1] == '-')?1:0
        c = expr_[index_+lookahead+1]
        if (c >= '0' && c <= '9') {
            index_ += 1+lookahead
            let exp = 0
            for (let d; (d = getInteger()) <= 9; index_++)
                exp = exp * 10 + d;
            if (lookahead)
                exp = -exp
            value = value * Math.pow(10, exp)
            console.log(value)
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
        case '0': {
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
        }
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
                const [name, val_] = parseIdentifier();
                val = val_

                eatSpaces()
                if (getCharacter() == '(')  {// function call - TBD shouldn't really be here. should be outside
                    val = parseFuncCall(val, name) 
                }

                break;
            }
            throw new ExprErr("Syntax error: value expected at end of expression");
    }
    return val;
}

// just holds a parsed token in the middle of parsing.
// used for holding the subscript when parsing OPERATOR_SUBSCRIPT
class TokenDummyNode extends NodeBase {
    constructor(token) {
        super()
        this.token = token
    }
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
    let tri_mid_expr = null

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
            if (peek.op.op === OPERATOR_SUBSCRIPT)
                value = new SubscriptNode(peek.value, null, value) // handle things like rgb(1,2,3).r
            else if (peek.op.op == OPERATOR_TRINARY) {
                eassert(tri_mid_expr !== null, "Missing mid value in trinary operator")
                value = new TrinaryOpNode(peek.value, tri_mid_expr, value)
                tri_mid_expr = null
            }
            else
                value = new BinaryOpNode(peek.value, value, peek.op.op);
            stack_.pop();
        }

        // store on stack_ and continue parsing ("shift")
        stack_.push( {op:op, value:value });
        // parse value on the right
        if (op.op === OPERATOR_SUBSCRIPT)
            value = new TokenDummyNode(parseNewIdentifier())  // assume only one subscript in the chain
        else if (op.op == OPERATOR_TRINARY) {
            tri_mid_expr = parseExpr() // middle value between the ? and :
            let c = getCharacter()
            eassert(c === ':', "Trinary operator expects ':'")
            index_++
            value = parseValue(); // not parseExpr since we only want to collect something if its in parens, and not a binary operator that might be there like in (1 == 1)?0.1:0.2+0.1
        }
        else {
            value = parseValue();  // next part in the chain
        }
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
        if ( (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' || c == '.' || (c >= '0' && c <= '9') )
            sb = sb + c;
        else
            break;
        index_++;
    }
    return sb
}

// added to the symbol table when parsing
// assignment sets a value into it, expression reference it from parseIdentifier
class SymbolNode extends NodeBase {
    constructor(name) {
        super()
        this.name = name
        this.valueNode = null  // NumNode or VecNode
        this.type = null  // set by assignment
    }
    eval() {
        if (this.valueNode === null)
            throw new ExprErr("Symbol " + this.name + " not assigned to yet")
        return this.valueNode.eval()
    }
    check_type() {
        if (this.type === null)
            throw new ExprErr("Symbol " + this.name + " not assigned to yet (type)")
        return this.type
    }
    to_glsl(emit_ctx) {
        return this.name
    }
}


class SubscriptNode extends NodeBase 
{
    constructor(wrapNode, subscripts, token_dummy=null) {
        super()
        this.wrapNode = wrapNode
        if (subscripts !== null) {
            if (subscripts.length !== 1)
                throw new ExprErr("Only one subscript is supported")
            this.subname = subscripts[0]
        }
        else if (token_dummy !== null && token_dummy.constructor === TokenDummyNode) {
            this.subname = token_dummy.token
        }
        else 
            eassert(false, "unexpected SubscriptNode without source")
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
        const wrapped = this.wrapNode.check_type()
        if (wrapped !== TYPE_VEC2 && wrapped !== TYPE_VEC3 && wrapped !== TYPE_VEC4)
            throw new TypeErr("Can't take subscript of something that's not a vector: " + typename(wrapped))
        this.type = TYPE_NUM
        return TYPE_NUM
    }
    to_glsl(emit_ctx) {
        return this.wrapNode.to_glsl(emit_ctx) + "." + SUBIDX_TO_GLSL[this.subidx]
    }
}

function parseAssignStmt(name) {
    let assign_type = OPERATOR_NULL
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
    const expr = parseExpr()
    if (assign_type === OPERATOR_NULL) {
        return new AssignNameStmt(name, expr)
    }
    return new AssignNameStmt(name, new BinaryOpNode(lookupIdentifier(name), expr, assign_type))
}



function parseIfStmt() {
    eatSpaces()
    let c = getCharacter();
    if (c !== '(')
        throw new ExprErr("if expects open trace '('")
    index_++;
    const cond = parseExpr()
    eatSpaces()
    c = getCharacter();
    if (c !== ')')
        throw new ExprErr("if condition expects close trace ')'")
    index_++;
    eatSpaces()
    let true_code = parseCodeBlock()
    if (true_code.count() == 0)
        true_code = null
    eatSpaces()
    let else_code = null
    if (expr_.substr(index_, 4) == 'else') {
        index_ += 4
        else_code = parseCodeBlock()
        if (else_code.count() == 0)
            else_code = null
    }
    return new IfStatement(cond, true_code, else_code)
}


class Statement {
    constructor() {
        this.type = null
    }
    sclear_types_cache() {
        this.type = null
    }
    invoke() {  // returns non-null when the code did "return"
        return null
    }
}

class IfStatement extends Statement
{
    constructor(cond, true_code, else_code) {
        super()
        this.cond_expr = cond
        this.true_code = true_code // either can be null
        this.else_code = else_code 
    }
    invoke() {
        const cv = this.cond_expr.eval()
        let v = null
        if (cv === true) {
            if (this.true_code !== null)
                v = this.true_code.eval()
        }
        else if(cv === false) {
            if (this.else_code !== null)
                v = this.else_code.eval()
        }
        else 
            throw new ExprErr("Unexpected value from if condition " + v)
        return v
    }
    sclear_types_cache() {
        super.sclear_types_cache()
        this.cond_expr.clear_types_cache()
        if (this.true_code !== null)
            this.true_code.clear_types_cache()
        if (this.else_code !== null)
            this.else_code.clear_types_cache()            
    }
    scheck_type() {
        const cond_type = this.cond_expr.check_type()
        eassert(cond_type === TYPE_BOOL, "If statement with non-bool condition")
        let t1 = null, t2 = null
        if (this.true_code !== null)
            t1 = this.true_code.check_type()
        if (this.else_code !== null)
            t2 = this.else_code.check_type()
        if (t1 !== null && t2 != null) {
            eassert(t1 === t2, "return different types: " + typename(t1) + " != " + typename(t2))
            this.type = t1
            return t1
        }
        this.type = null // also means we didn't check, that's why there's no caching of the type here
        return null      
    }
    sto_glsl(emit_ctx) {
        let s = "if (" + this.cond_expr.to_glsl(emit_ctx) + ") {\n"
        if (this.true_code !== null)
            s += this.true_code.to_glsl(emit_ctx)
        if (this.else_code !== null) {
            s += "} else {\n"
            s += this.else_code.to_glsl(emit_ctx)
        }
        s += "}\n"
        return s
    }

}

class TrinaryOpNode extends NodeBase {
    constructor(cond, true_node, false_node) {
        super()
        this.cond = cond
        this.true_node = true_node
        this.false_node = false_node
    }
    clear_types_cache() {
        this.type = null
        this.cond.clear_types_cache()
        this.true_node.clear_types_cache()
        this.false_node.clear_types_cache()
    }
    check_type() {
        if (this.type === null) {
            const cond_type = this.cond.check_type()
            eassert(cond_type === TYPE_BOOL, "Trinary expression with non-bool condition")            
            let t1 = this.true_node.check_type(), t2 = this.false_node.check_type()
            eassert(t1 === t2, "Trinary expression mismatch types " + typename(t1) + ", " + typename(t2))
            this.type = t1
        }
        return this.type
    }

    eval() {
        console.assert(this.type !== null)
        const cv = this.cond.eval()
        if (cv === true)
            return this.true_node.eval()
        else if (cv === false)
            return this.false_node.eval()
        else
            throw new ExprErr("Unexpected value from trinary condition " + cv)
    }

    to_glsl(emit_ctx) {
        return '((' + this.cond.to_glsl(emit_ctx) + ')?(' + this.true_node.to_glsl(emit_ctx) + '):(' + this.false_node.to_glsl(emit_ctx) + '))';
    }

}



const STMT_COMMENT = 1
const STMT_END_BLOCK = 2

function parseStmt() {
    eatSpaces()
    if (index_ > 0 && !isSpace(expr_[index_-1]))
        throw new ExprErr("Statments must be separated by whitespace")
    // statement starts with a variable name to assign to or 'return'
    let c = getCharacter();
    if (c === '}')
        return STMT_END_BLOCK

    const name = parseNewIdentifier()
    if (name === null) // comment statement
        return STMT_COMMENT 
    eatSpaces()
    if (name === 'if') {
        return parseIfStmt()
    }
    if (name === 'return') {
        const expr = parseExpr()
        return new ReturnStmt(expr)
    }
    return parseAssignStmt(name)
}

class ReturnStmt extends Statement {
    constructor(expr) {
        super()
        this.expr = expr
        this.type = null
    }
    invoke() {
        const v = this.expr.eval()
        return v
    }
    sclear_types_cache() {
        super.sclear_types_cache()
        this.expr.clear_types_cache()
    }
    scheck_type() {
        if (this.type !== null)
            return this.type
        this.type = this.expr.check_type()
        return this.type
    }
    sto_glsl(emit_ctx) {
        return "return " + this.expr.to_glsl(emit_ctx) + ";"
    }
}


const TYPE_TO_STR = { [TYPE_NUM]:'float', [TYPE_VEC2]:'vec2', [TYPE_VEC3]:'vec3', [TYPE_VEC4]:'vec4' }

class AssignNameStmt  extends Statement {  // not a proper node (no eval, has side-effects)
    constructor(in_name, expr) {
        super()
        this.in_name = in_name // for err msg
        const sp = in_name.split('.')
        eassert(sp.length == 1 || sp.length == 2, "Assigning to multi-level subscript not supported") // no such use case yet
        this.name = sp[0]
        this.subscriptName = (sp.length > 1) ? sp[1] : null
        this.subscriptIdx = (sp.length > 1) ? SUBSCRIPT_TO_IDX[sp[1]] : null
        eassert(this.subscriptIdx !== undefined, "Unknown subscript in: " + in_name)
        this.expr = expr
        this.expr_type = null
        this.symbol = g_symbol_table[this.name]
        this.vNode = null  // a new node that has the actual value assigned to the symbol
        this.first_definition = false
        if (this.symbol === undefined) { // wasn't already there
            this.symbol = new SymbolNode(this.name)
            g_symbol_table[this.name] = this.symbol
            this.first_definition = true
        }
    }
    invoke() {
        const v = this.expr.eval()
        if (this.subscriptIdx !== null) { 
            eassert(this.symbol.valueNode !== null, "Assign to undefiend symbol") // sanity, was already checked in scheck_type
            this.symbol.valueNode.v[this.subscriptIdx] = v
        }
        else {
            let vNode
            switch  (this.expr_type) {
            case TYPE_NUM: vNode = new NumNode(v, false); break;
            case TYPE_BOOL: vNode = new BoolNode(v); break;
            default: vNode = new VecNode(v, this.expr_type); break;
            }
            // valueNode in symbol is null as long as the symbol doesn't have a value
            this.symbol.valueNode = vNode
        }
        return null // never returning from the code in this statement
    }
    sclear_types_cache() {
        super.sclear_types_cache()
        this.expr.clear_types_cache()
    }
    scheck_type() {
        this.expr_type = this.expr.check_type()
        if (this.subscriptIdx !== null) {
            eassert(this.expr_type === TYPE_NUM || this.expr_type === TYPE_BOOL, "Subscript assign to `" + this.in_name + "` expects a number") // assume we don't assign things bigger than a number (no swizzle yet)
            eassert(this.symbol.type !== null, "Trying to assign subscipt of an undefined symbol: " + this.name)
            eassert(this.symbol.type !== TYPE_NUM && this.symbol.type !== TYPE_BOOL, "Number type symbol `" + this.name + "` can't have subscript")
            eassert(this.subscriptIdx < numbersInType(this.symbol.type), "Assigning to non-existing subscript " + this.subscriptName + " of symbol " + this.name)
        }
        else {
            if (this.symbol.type !== null)
                eassert(this.symbol.type === this.expr_type, "Symbol `" + this.in_name + "` can't change type (from " + typename(this.symbol.type) + " to " + typename(this.expr_type) + ")")
            // changing type of a variable won't work in glsl so we don't allow it                
            this.symbol.type = this.expr_type  // needs to be here since it's needed in the check_type of referencing this symbol
        }
        this.type = null
        return null // doesn't return from a code-block so it needs to be null
    }
    sto_glsl(emit_ctx) {
        let s = this.name
        if (this.subscriptIdx !== null) {
            s += "." + SUBIDX_TO_GLSL[this.subscriptIdx]
        }
        s += "=" + this.expr.to_glsl(emit_ctx) + ";"
        if (this.first_definition)
            emit_ctx.locals_defs[this.name] = this.expr_type
        return s
    }
}

// maps name to SymbolNode with the value that resulted from the expression
var g_symbol_table = null
var g_glsl_added_funcs = null // map [name of func]_[arg type] to the func text

class CodeNode extends NodeBase {
    constructor(stmts, symbol_table) {
        super()
        this.stmts = stmts
        this.symbol_table = symbol_table
    }
    count() {
        return this.stmts.length
    }
    eval() {  // returns non-null if the code does "return"
        let ret = null
        for(let stmt of this.stmts) {
            ret = stmt.invoke()
            if (ret !== null) {
                break
            }
        }
        return ret
    }
    clear_types_cache() {
        this.type = null
        for(let stmt of this.stmts)
            stmt.sclear_types_cache()
    }
    check_type() {
        if (this.type !== null)
            return this.type
        for(let stmt of this.stmts) {
            const sret = stmt.scheck_type()
            if (sret !== null) { // means all control paths of this statement return a value
                this.type = sret
                break // anything after that is not going to be executed so it doesn't need to be checked
            }
        }
        return this.type
    }
    to_glsl(emit_ctx) {
        let s = ""
        for(let stmt of this.stmts) {
            let ret = stmt.sto_glsl(emit_ctx) 
            s += ret + "\n"
        }
        return s
    }

}

function skip_to_next_line() {
    while(true) {
        let c = getCharacter()
        if (c === null)
            break;
        ++index_
        if (c == '\n') {
            g_lineNum++
            break
        }
    }
}

// with the curly braces, if they exist - sub code of an if statement
function parseCodeBlock() {
    let c = getCharacter();
    let code
    if (c == '{') {
        index_++;
        code = parseCode()
        eatSpaces()
        c = getCharacter();
        if (c !== '}')
            throw new ExprErr("code block expects closing curly braces")
        index_++;
    }
    else { // single command
        code = parseCode(true)
        eatSpaces()
    }
    return code
}

// parse block of statements (without curly braces) or just one statement (instead of a block where there are no curly brances in an if)
function parseCode(only_one_line) {
    let lst = []
    while(!isEnd()) {
        const e = parseStmt()
        if (e === STMT_COMMENT) {
            skip_to_next_line() // comment
            continue
        }
        else if (e === STMT_END_BLOCK)
            break
        lst.push(e)
        if (only_one_line)
            break
    }
    return new CodeNode(lst, g_symbol_table)
}

// parse a complete program from the use
function parseCompleteCode()
{
    let symbol_table = {}
    g_symbol_table = symbol_table
    const c = parseCode()
    g_symbol_table = null
    return c
}

/// Expression string
var expr_ = null
/// Current expression index, incremented whilst parsing
var index_ = 0

var g_state_access = null

function eparse(expr, state_access, opt) {
    if (typeof expr != "string")
        return new NumNode(expr, true)
    if (expr == "")
        throw new ExprErr("empty expression")
    index_ = 0;
    expr_ = expr;
    g_lineNum = 1
    if (state_access) {
        g_state_access = state_access
    }
    let result = null;
    try {
        if (opt === PARSE_EXPR)
            result = parseExpr();   
        else if (opt == PARSE_CODE) 
            result = parseCompleteCode();
        else 
            throw new ExprErr("unknown opt " + opt)
        if (!isEnd())
            throw new ExprErr("Syntax error: unexpected token, expected expression end")
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

// expect_var_resolved means if there are still unresolved vars, throw, rather than set the exception
function check_type(node, expect_var_resolved=false) {
    try {
        const ret = node.check_type()
        if (ret === null)
            throw new ExprErr("Not all control paths return a value")
        return ret
    } catch(e) {
        if (e.constructor === UndecidedTypeErr)
            return TYPE_UNDECIDED
        if (e.constructor === DependOnVarErr && !expect_var_resolved)
            return TYPE_DEPEND_ON_VAR
        throw e
    }
}

function clear_types_cache(node) {
    node.clear_types_cache()
}

function do_eval(node) {
    if (node.symbol_table !== undefined) {
        g_symbol_table = node.symbol_table
        // clear values from symbol table 
        for(let [name,sym] of Object.entries(node.symbol_table)) {
            sym.valueNode = null
        }
    }
    const ret = node.eval()
    g_symbol_table = null
    return ret
}

function do_to_glsl(node, emit_ctx, opt=null) {
    g_glsl_added_funcs = new FuncsSet()
    let ret = node.to_glsl(emit_ctx)
    if (ret === null)
        throw new ExprErr("No return statement")
    if (opt === PARSE_EXPR)  //  single expression, no multiple lines, should be wrapped in return to be a function body
        ret = "return " + ret + ";"

    // g_glsl_added_funcs is keyed by name|type, need to aggregate just by name
    const funcs_agg = new FuncsSet()
    for(let k in g_glsl_added_funcs.get_kv()) {
        const entry = g_glsl_added_funcs.get(k)
        funcs_agg.append_text(entry.name, entry.text)
    }
    emit_ctx.add_funcs = funcs_agg

    return ret
}

return {parse:eparse, 
       make_num_node:make_num_node, 
       check_type:check_type, 
       clear_types_cache:clear_types_cache, 
       do_eval:do_eval, 
       do_to_glsl:do_to_glsl
    }
})()


