
// https://github.com/NishadSaraf/First-Order-Differentiation-In-C/blob/d6965c15bef4fe84837105eb0e5ed8f21ae9f80b/calculator.hpp
var ExprParser = (function() {

class NumNode  {
    constructor(_v) {
        this.v = _v;
    }
    eval() {
        return this.v;
    }
    is_just_num() { return true }
}

function checkZero(v) {
    if (v == 0) {
        throw new Error("Division by zero");
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
            default:  throw new Error("unexpected operator");
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
    new Operator(OPERATOR_EXPONENT, 40, 'R')
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
    throw new Error("Syntax error: unexpected token at " + index_)
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
            expect("<<");
            return ops[OPERATOR_BITWISE_SHL];
        case '>':
            expect(">>");
            return ops[OPERATOR_BITWISE_SHR];
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

    let e = state_access_.get_evaluator(sb)
    if (e === null) 
        throw new Error("Unknown identifier " + sb + " at " + index_)

    return e;
}

function toInteger(c) {
    if (c === null)
        return 0xf + 1
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 0xa;
    if (c >= 'A' && c <= 'F') return c - 'A' + 0xa;
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
        f = 0.1
        for (let d; (d = getInteger()) <= 9; index_++) {
            value = value + d * f;
            f *= 0.1
        }
    }
    return new NumNode(value);
}

function parseHex() {
    index_ = index_ + 2;
    let value = 0;
    for (let h; (h = getInteger()) <= 0xf; index_++)
        value = value * 0x10 + h;
    return new NumNode(value);
}
function parseBin() {
    index_ = index_ + 2;
    let value = 0;
    for (let h; (h = getInteger()) <= 1; index_++)
        value = value * 2 + h;
    return new NumNode(value);
}
function parseOct() {
    index_ = index_ + 2;
    let value = 0;
    for (let h; (h = getInteger()) <= 7; index_++)
        value = value * 8 + h;
    return new NumNode(value);
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
                throw new Error("Syntax error: `)' expected at end of expression");
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
            throw new Error("Syntax error: value expected at end of expression");
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

function eval(expr, state_access) {
    if (typeof expr != "string")
        return new NumNode(expr)
    index_ = 0;
    expr_ = expr;
    if (state_access) {
        state_access_ = state_access
        state_access_.reset_check()
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


return {eval:eval}
})()
