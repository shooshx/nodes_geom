"use strict"

var selected_node = null


const TERM_RADIUS = 8
const TERM_MARGIN_X = 20
const TERM_MARGIN_Y = 2

const NODE_WIDTH = 120


// https://github.com/gdenisov/cardinal-spline-js/blob/master/curve_func.min.js
function curve(d,j,u,g,c){u=(typeof u==="number")?u:0.5;g=g?g:25;var k,e=1,f=j.length,o=0,n=(f-2)*g+2+(c?2*g:0),m=new Float32Array(n),a=new Float32Array((g+2)*4),b=4;k=j.slice(0);if(c){k.unshift(j[f-1]);k.unshift(j[f-2]);k.push(j[0],j[1])}else{k.unshift(j[1]);k.unshift(j[0]);k.push(j[f-2],j[f-1])}a[0]=1;for(;e<g;e++){var p=e/g,q=p*p,s=q*p,r=s*2,t=q*3;a[b++]=r-t+1;a[b++]=t-r;a[b++]=s-2*q+p;a[b++]=s-q}a[++b]=1;h(k,a,f);if(c){k=[];k.push(j[f-4],j[f-3],j[f-2],j[f-1]);k.push(j[0],j[1],j[2],j[3]);h(k,a,4)}function h(H,A,C){for(var B=2,I;B<C;B+=2){var D=H[B],E=H[B+1],F=H[B+2],G=H[B+3],J=(F-H[B-2])*u,K=(G-H[B-1])*u,L=(H[B+4]-D)*u,M=(H[B+5]-E)*u;for(I=0;I<g;I++){var v=I<<2,w=A[v],x=A[v+1],y=A[v+2],z=A[v+3];m[o++]=w*D+x*F+y*J+z*L;m[o++]=w*E+x*G+y*K+z*M}}}f=c?0:j.length-2;m[o++]=j[f];m[o]=j[f+1];for(e=0,f=m.length;e<f;e+=2){d.lineTo(m[e],m[e+1])}return m};
// maybe better: https://github.com/Raymond-C/CubicHermite


function connector_line_s(fx, fy, tx, ty) { // from, to
    ctx_nodes.beginPath()
    ctx_nodes.moveTo(fx + nodes_view.pan_x, fy + nodes_view.pan_y)
    ctx_nodes.lineTo(tx + nodes_view.pan_x, ty + nodes_view.pan_y)
    ctx_nodes.strokeStyle = "#000"
    ctx_nodes.lineWidth = 2
    ctx_nodes.stroke()    
}

function draw_curve(ctx, cpnts) {
    ctx.moveTo(cpnts[0], cpnts[1])
    for(let i=2; i<cpnts.length; i+=2)
        ctx.lineTo(cpnts[i], cpnts[i+1])
}

const LINE_ARROW = {out:7, back:14}

function connector_line(fx, fy, fxoffset, tx, ty, txoffset, free, uid) { // from, to
    fx += nodes_view.pan_x, tx += nodes_view.pan_x
    fy += nodes_view.pan_y, ty += nodes_view.pan_y
    let dy = ty - fy, dx = tx - fx
    let cpnts;
    if (ty - 2*TERM_RADIUS -5 > fy || Math.sqrt(dx*dx+dy*dy) < 70 || free) {// going down or very short        
        cpnts = getCurvePoints([fx,fy, 
                                    fx+dx*0.16, fy+dy*0.3, 
                                    tx-dx*0.16, ty-dy*0.3,  
                                    tx, ty])
    }
    else {
        if (tx > fx) {
            // go over the upper left corner of destination and under lower right corner of source
            let pnts = [fx, fy, fx + NODE_WIDTH-fxoffset, fy + TERM_RADIUS, tx-txoffset, ty - TERM_RADIUS - 5, tx, ty]
            cpnts = getCurvePoints(pnts, 0.5)
        }
        else {
            let pnts = [fx, fy, fx - fxoffset, fy + TERM_RADIUS, tx+NODE_WIDTH-txoffset, ty - TERM_RADIUS - 5, tx, ty]
            cpnts = getCurvePoints(pnts)
        }
        
    }

    ctx_nodes.beginPath()
    draw_curve(ctx_nodes, cpnts)

    {
        let arrow_at = Math.round(cpnts.length*0.6*0.5)*2
        let ac1_x = cpnts[arrow_at], ac1_y = cpnts[arrow_at+1], ac2_x = cpnts[arrow_at+2], ac2_y = cpnts[arrow_at+3]
        let dx = ac2_x-ac1_x, dy=ac2_y-ac1_y
        let len = Math.sqrt(dx*dx+dy*dy)
        dx /= len; dy /= len
        let pdx = -dy, pdy = dx
        let p1_x = ac2_x - pdx*LINE_ARROW.out -dx*LINE_ARROW.back
        let p1_y = ac2_y - pdy*LINE_ARROW.out -dy*LINE_ARROW.back
        let p2_x = ac2_x + pdx*LINE_ARROW.out -dx*LINE_ARROW.back
        let p2_y = ac2_y + pdy*LINE_ARROW.out -dy*LINE_ARROW.back

        ctx_nodes.moveTo(p1_x, p1_y)
        ctx_nodes.lineTo(ac2_x, ac2_y)
        ctx_nodes.lineTo(p2_x, p2_y)
    }

    ctx_nodes.strokeStyle = "#aaa"
    ctx_nodes.lineWidth = 1.5
    ctx_nodes.stroke()

    if (uid !== undefined) {
        //draw_curve_crisp(ctx_nd_shadow, cpnts, 5, "#ffff00") //color_from_uid(uid)) 
        ctx_nd_shadow.beginPath()
        draw_curve(ctx_nd_shadow, cpnts)
        ctx_nd_shadow.lineWidth = 11
        ctx_nd_shadow.strokeStyle = color_from_uid(uid)
        ctx_nd_shadow.stroke()
    }
}

function zero_pad_hex2(n) {
    if (n <= 0xf)
        return '0' + n.toString(16)
    return n.toString(16)
}
function color_from_uid(uid) {
    console.assert(uid < 0xfffff)
    return "#" + zero_pad_hex2(uid & 0xff) + zero_pad_hex2((uid >> 8) & 0xff) + 'f' + ((uid >> 16) & 0xf)
}
function uid_from_color(c) {
    if ((c & 0xf00000) != 0xf00000)
        return null // result of antialiasing, not a real color
    return c & 0xfffff
}

function round_to(x, v) {
    return Math.round(x / v) * v
}

// https://stackoverflow.com/questions/1255512/how-to-draw-a-rounded-rectangle-on-html-canvas/3368118
function rounded_rect_f(ctx, x, y, width, height, rtl, rbl, rtr, rbr) {
    ctx.moveTo(x + rtl, y);
    ctx.lineTo(x + width - rtr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + rtr);
    ctx.lineTo(x + width, y + height - rbr);
    ctx.quadraticCurveTo(x + width, y + height, x + width - rbr, y + height);
    ctx.lineTo(x + rbl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - rbl);
    ctx.lineTo(x, y + rtl);
    ctx.quadraticCurveTo(x, y, x + rtl, y);
    ctx.closePath();
}
function rounded_rect(ctx, x, y, width, height, r) {
    rounded_rect_f(ctx, x, y, width, height, r,r,r,r);
}

class Line {
    constructor(from_term, to_term, uid) {
        console.assert(to_term.is_input !== undefined, "unexpected undefined")
        this.uid = null
        if (!to_term.is_input) {
            this.from_term = to_term
            this.to_term = from_term
        }
        else {
            this.from_term = from_term
            this.to_term = to_term
        }
    }
    
    draw() {
        connector_line(this.from_term.center_x(), this.from_term.center_y(), this.from_term.center_offset(),
                       this.to_term.center_x(), this.to_term.center_y(), this.to_term.center_offset(), false, this.uid)
    }
}

// does just the graphics
class TerminalBase {
    constructor(name, in_node, is_input) {
        this.name = name
        console.assert(is_input !== undefined, "don't instantiate TerminalBase")
        this.owner = null  // set in Node
        this.line_pending = null
        this.lines = []
        this.node = in_node
        this.is_input = is_input
        if (is_input)
            in_node.inputs.push(this)
        else
            in_node.outputs.push(this)
    }
    
    move_with_owner(is_input) {
        this.cx = this.owner.x + this.offset  // center
        if (this.is_input)
            this.cy = this.owner.y - TERM_RADIUS - TERM_MARGIN_Y
        else
            this.cy = this.owner.y + this.owner.height + TERM_RADIUS + TERM_MARGIN_Y    
    }

    px() { return this.cx + nodes_view.pan_x }
    py() { return this.cy + nodes_view.pan_y }
    center_x() { return this.cx }
    center_y() { return this.cy }
    center_offset() { return this.offset }

    is_connected_to(other_term) {
        for(let l of this.lines) {
            if (l.from_term === other_term || l.to_term === other_term)
                return true;
        }
        return false;
    }
    gender_match(other_term) {
        return (this.is_input && !other_term.is_input) || (!this.is_input && other_term.is_input)
    }
    
    get_attachment() { return this }// useful in multi
    get_attachee() { return this }    
    
    mousemove(dx, dy, px, py, ex, ey, cvs_x, cvs_y) {
        let linkto = find_node_obj(px, py, cvs_x, cvs_y)
        this.line_pending = null
        draw_nodes()
        if (linkto === this) { // should not connect to itself
            return
        }
        if (linkto === null || linkto.owner === undefined || linkto.owner === this.owner || 
            !this.gender_match(linkto) || this.is_connected_to(linkto)) 
        {
            // free line
            connector_line(this.cx, this.cy, 0, px, py, 0, true)
        }
        else {
            this.line_pending = new Line(this.get_attachment(), linkto.get_attachment())
            this.line_pending.draw()
        }        
    }
    mouseup() {
        if (this.line_pending !== null) {
            program.add_line(this.line_pending)
            this.line_pending = null
        }

        draw_nodes()  // erase temp line
    }
    mousedown() {
    }    
}


// rules for PObjects (for clone)
// - should have no-arg constructor
// - should not have more than one reference to the same object
// - should not have cycles
class PObject {
    constructor() {
        this.refcount = 0
    }
    get_disp_params(disp_values) { return null }
}
class PHandle {
    constructor(obj) {
        this.p = obj
        if (obj !== null)
            obj.refcount += 1
    }
    get_const() {
        return this.p
    }
    get_mutable() {
        if (this.p === null || this.p.refcount == 1)
            return this.p
        let copy = clone(this.p)
        copy.refcount = 1
        this.p.refcount -= 1
        this.p = copy
        return copy
    }
    clear() {
        if (this.p === null)
            return
        this.p.refcount -= 1
        if (this.p.refcount == 0 && this.p.destructor)
            this.p.destructor()
        this.p = null
    }
    is_null() {
        return this.p == null
    }
}

function clone(obj) {
    if (obj === null || typeof (obj) !== 'object')
        return obj;    
    if (obj.BYTES_PER_ELEMENT !== undefined) { // it's a typed array 
        return new obj.constructor(obj)
    }
    if (obj.constructor === WebGLBuffer) {
        return null // gl buffers can't be cloned
    }
    let n = new obj.constructor()
    for(let k in obj) {
        n[k] = clone(obj[k])
    }
    return n
}

class PWeakHandle {
    constructor(obj) {
        this.p = obj
    }
    get_const() {
        return this.p
    }
    clear() {
        this.p = null
    }
    is_null() {
        return this.p == null
    }    
}


// normal circle terminal taking a single value
class Terminal extends TerminalBase
{
    draw() {
        ctx_nodes.beginPath();
        ctx_nodes.arc(this.px(), this.py() , TERM_RADIUS, 0, 2*Math.PI)
        ctx_nodes.fillStyle = "#aaa"
        ctx_nodes.fill()
        ctx_nodes.stroke() 
    }
    hit_test(px, py) {
        return px >= this.cx - TERM_RADIUS && px <= this.cx + TERM_RADIUS && 
               py >= this.cy - TERM_RADIUS && py <= this.cy + TERM_RADIUS
    }


}

// inputs by default have a weak handle that can be upgraded to a counting handle
// if a mutable object is needed
class InTerminal extends Terminal {
    constructor(in_node, name) {
        super(name, in_node, true)
        this.h = null
        // an input terminal gets dirty when it's being set a new value.
        // this may be the only indication that a node is dirty if we changed a upper node when it was visible
        // and the dirtyness did not propogate down
        //   unset when cleaning the entire node
        this.dirty = true
    }
    set(v) {
        assert(this.h === null || this.h.is_null(), this.owner.cls, "too many lines connected to input " + this.name)

        if (v.constructor === PHandle || v.constructor === PWeakHandle)
            this.h = new PWeakHandle(v.p) // copy ctor
        else            
            this.h = new PWeakHandle(v)
        this.tset_dirty(true)
    }    
    get_const() {
        if (this.h === null)
            return null        
        return this.h.get_const()
    }
    get_mutable() {
        if (this.h === null)
            return null        
        if (this.h.constructor === PWeakHandle) // need upgrade
            this.h = new PHandle(this.h.p)
        return this.h.get_mutable()
    }
    clear() {
        if (this.h !== null)
            this.h.clear()
    }
    tset_dirty(v) {
        this.dirty = v
    }
    is_dirty() {
        return this.dirty
    }
}

// outputs are by default owning because they are going to need this object
// as a cache for the next frame
class OutTerminal extends Terminal {
    constructor(in_node, name) {
        super(name, in_node, false)
        this.h = null
    }
    set(v) {
        // and also save a wear-ref to it so that display would work 
        if (v.constructor === PHandle || v.constructor === PWeakHandle)
            this.h = new PHandle(v.p) // copy ctor
        else            
            this.h = new PHandle(v)
    }
    get_const() {
        if (this.h === null)
            return null
        return this.h.get_const()
    }
    get_mutable() {
        if (this.h === null)
            return null        
        return this.h.get_mutable()
    }    
    clear() {
        if (this.h !== null)
            this.h.clear()
    }
}

const TERM_MULTI_HWIDTH = 30

class InAttachMulti {
    constructor(owner_term) {
        this.owner_term = owner_term
        this.lines = owner_term.lines  // needed by add_line
        this.is_input = owner_term.is_input // needed by Line ctor
        //this.owner = owner_term.owner
        this.h = null
    }
    get_attachee() {
        return this.owner_term
    }
    center_x() {
        return this.owner_term.cx
    }
    center_y() {
        return this.owner_term.cy
    }
    center_offset() {
        return this.owner_term.offset
    }
    set(v) {
        if (v.constructor === PHandle || v.constructor === PWeakHandle)
            this.h = new PHandle(v.p) // copy ctor
        else            
            this.h = new PHandle(v)
        this.tset_dirty(true)
    }    
    get_const() {
        return this.h.get_const()
    }
    get_mutable() {
        return this.h.get_mutable()
    }
    clear() {
        if (this.h !== null)
            this.h.clear()
    }
    tset_dirty(v) {
        this.owner_term.tset_dirty(v)
    }
    is_dirty() {
        return this.owner_term.is_dirty()
    }
}
// elongated
class InTerminalMulti extends TerminalBase
{
    constructor(in_node, name) {
        super(name, in_node, true)
        this.dirty = true
    }
    draw() {
        rounded_rect(ctx_nodes, this.px() - TERM_MULTI_HWIDTH, this.py() - TERM_RADIUS, TERM_MULTI_HWIDTH*2, 2*TERM_RADIUS, TERM_RADIUS)
        ctx_nodes.fillStyle = "#aaa"
        ctx_nodes.fill()
        ctx_nodes.stroke()         
    }
    hit_test(px, py) {
        return px >= this.cx - TERM_MULTI_HWIDTH && px <= this.cx + TERM_MULTI_HWIDTH && 
               py >= this.cy - TERM_RADIUS && py <= this.cy + TERM_RADIUS
    } 
    get_attachment() {
        return new InAttachMulti(this)
    }
    clear() {
        for(let line of this.lines)
            line.to_term.clear()
    }
    tset_dirty(v) {
        this.dirty = v
    }
    is_dirty() {
        return this.dirty
    }
}


const NODE_NAME_PROPS = { font:"14px Verdana", margin_top:3, margin_left:5, height:15}
const NODE_FLAG_DISPLAY = {offset: 105, color: "#00A1F7" }


function wrapText(context, text, x, center_y, maxWidth, lineHeight) {
    var words = text.split(' ');
    var line = '';
    let lines = []
    let y = 0
    for(var n = 0; n < words.length; n++) {
      var testLine = line + words[n] + ' ';
      var metrics = context.measureText(testLine);
      var testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        lines.push({y:y,l:line})  
        line = words[n] + ' ';
        y += lineHeight;
      }
      else {
        line = testLine;
      }
    }
    lines.push({y:y,l:line})  
    let start_y = center_y - lines.length * 0.5 * lineHeight
    for(let l of lines)
        context.fillText(l.l, x, start_y + l.y);
}




// bit field
const EXPR_CONST = 0  // didn't lookup anything
const EXPR_NEED_INPUT = 1  //  looked up a value that does change depend on input

class StateAccess {
    constructor(state_evaluators) {
        this.state_evaluators = state_evaluators // from the node, map name to evaluator type
        this.known_objrefs = {}
        // have a store of objrefs so that these will always be the same ones, no matter which expression is calling for them
        // reset between expressions in the same node doesn't create a new set of objrefs
        for(let name in state_evaluators)
            this.known_objrefs[name] = new ObjRef(name)
        //keep track of what the currently parsed expression was looking up
        this.reset_check()
    }
    // called right before parsing an expression
    reset_check() {
        this.score = EXPR_CONST
        this.need_inputs = {} // map name of input to its evaluator
    }
    get_evaluator(name) {
        let sp = name.split('.')
        let varname = sp[0]
        // did we already create it?
        let top_level = this.need_inputs[varname]
        if (top_level === undefined) {
            let known_obj = this.known_objrefs[varname]
            if (known_obj === undefined)
                return null;
                top_level = this.need_inputs[varname] = this.known_objrefs[varname]
        }
        let evaluator_factory = this.state_evaluators[varname] // as specified by the node_cls
        if (evaluator_factory !== undefined) {
            let e = evaluator_factory(top_level, sp.slice(1))
            this.score |= EXPR_NEED_INPUT // TBD depend on evaluator?
            return e
        }

        return null
    }
}

class Node {    
    constructor(x, y, name, cls, id) {
        this.rename_observers = []

        this.x = x
        this.y = y
        this.width = NODE_WIDTH
        this.height = 30
        this.set_name(name)
        this.color = "#ccc"
        this.id = id  // used for identification in the program and serialization

        // calculated data members
        this.parameters = []
        this.inputs = []
        this.outputs = [] 
        this.state_evaluators = {} // map variable name to its evaluator type. Evaluator instance will be created with its subscripts when the expression is parsed
        this.cls = new cls(this)
        this.call_params_change() // set the enables or other changes that functions attached to params do
        this.make_term_offset(this.inputs)
        this.make_term_offset(this.outputs)
        this.terminals = this.inputs.concat(this.outputs)

        // controls caching
        // means it needs a call to run() to refresh its output according to updated parameters and inputs
        // this member is managed by the engine in its scan for dirty subtrees. should not be set by the node itself        
        this._node_dirty = true 
        // indication for the engine traversal of this node.
        // if the engine visited this node it means it doesn't need to distribute it's output to connections
        // I keep track of that since it's useful to know (and check) that any input is only being set once in a run
        this._visited = false
        // should be set by the node if anything happened that dirtied itss state (that is not a parameter)
        // used for viewport dependent nodes when viewport changes
        this.self_dirty = false
        // key-value of parameters for displaying any sort of object.
        // kept per-node since every node can want something different
        this.display_values = {}

        this.state_access = new StateAccess(this.state_evaluators)
    }

    set_state_evaluators(d) { // called in cls ctor to configure how StateAccess accesses state
        this.state_evaluators = d
    }

    make_term_offset(lst) {
        if (lst.length == 1) {
            lst[0].offset = this.width / 2
        }
        else {
            const step = (this.width - TERM_MARGIN_X*2) / (lst.length - 1)
            for(let i = 0; i < lst.length; ++i) {
                let input = lst[i]
                if (input.offset === undefined)
                    input.offset = TERM_MARGIN_X + i * step
            }
        }
        for(let t of lst) {
            t.owner = this
            t.move_with_owner()
        }        
    }
    
    px() {  // panned
        return this.x + nodes_view.pan_x
    }
    py() {
        return this.y + nodes_view.pan_y
    }
    namex() {
        return this.px() + this.width + NODE_NAME_PROPS.margin_left
    }
    namey() {
        return this.py() + NODE_NAME_PROPS.margin_top
    }
    
    draw() {
        let px = this.px(), py = this.py()
        if (this.cls.get_error() !== null) {
            ctx_nodes.beginPath();
            ctx_nodes.arc(px, py + this.height*0.5, 40, 0, 2*Math.PI)
            ctx_nodes.fillStyle = "#B10005"
            ctx_nodes.fill()
            ctx_nodes.strokeStyle = "#900000"
            ctx_nodes.lineWidth = 5
            ctx_nodes.stroke()
            ctx_nodes.lineWidth = 1
            ctx_nodes.font = "16px Verdana"
            ctx_nodes.fillStyle = "#ffA0A0"
            ctx_nodes.textAlign = "end"
            wrapText(ctx_nodes, this.cls.get_error().message, px, py + this.height*0.5, 150, 18)
            ctx_nodes.textAlign = "start"
        }
        // main rect
        ctx_nodes.beginPath();
        ctx_nodes.strokeStyle = "#000"
        rounded_rect(ctx_nodes, px, py, this.width, this.height, 5)
        ctx_nodes.fillStyle = this.color
        ctx_nodes.fill()
        ctx_nodes.stroke() 

        // debug rect
        //ctx_nodes.strokeStyle = "#f00"
        //ctx_nodes.strokeRect(this.tx + nodes_view.pan_x, this.ty + nodes_view.pan_y, this.twidth, this.theight)
        //ctx_nodes.strokeStyle = "#000"
        
        if (selected_node === this) {
            ctx_nodes.beginPath();            
            ctx_nodes.lineWidth = 1.5
            ctx_nodes.strokeStyle = "#FFEE00"
            rounded_rect(ctx_nodes, px-2, py-2, this.width+4, this.height+4, 7)
            ctx_nodes.stroke() 
            
            ctx_nodes.strokeStyle = "#000"
            ctx_nodes.lineWidth = 1
        }
        
        // display flag
        if (program.display_node === this) {
            ctx_nodes.beginPath();
            rounded_rect_f(ctx_nodes, px + NODE_FLAG_DISPLAY.offset, py, this.width - NODE_FLAG_DISPLAY.offset, this.height, 0, 0, 5, 5)
            ctx_nodes.fillStyle = "#00A1F7"
            ctx_nodes.fill()
            ctx_nodes.stroke() 
        }        
        // flag line
        ctx_nodes.beginPath();
        ctx_nodes.moveTo(px + NODE_FLAG_DISPLAY.offset, py)
        ctx_nodes.lineTo(px + NODE_FLAG_DISPLAY.offset, py+this.height)
        ctx_nodes.stroke()
        
        for(let t of this.terminals) {
            t.draw()
        }
        ctx_nodes.fillStyle = "#fff"
        ctx_nodes.font = NODE_NAME_PROPS.font;
        ctx_nodes.fillText(this.name, this.namex(), this.namey())
    }
    
    select() {
        if (selected_node === this) 
            return // already selected
        selected_node = this
        draw_nodes() // need to paint the previous selected one
        show_params_of(this)
        trigger_frame_draw(false) // if there was image display of the selected node, remove/update it (selected point)
    }
    
    set_name(name) {
        this.name = name
        ctx_nodes.font = NODE_NAME_PROPS.font
        this.name_measure = ctx_nodes.measureText(this.name)
        for(let ob of this.rename_observers)
            ob(this.name)
        
        this.recalc_bounding_box() 
    }
    
    // geom including terminals and name
    recalc_bounding_box() {
        this.tx = this.x
        this.ty = this.y - TERM_RADIUS*2 - 2
        this.twidth = this.width + this.name_measure.width + NODE_NAME_PROPS.margin_left
        this.theight = this.height + TERM_RADIUS * 4 + TERM_MARGIN_Y*2
    }

    mousemove(dx, dy) {
        this.x += dx
        this.y += dy
        this.recalc_bounding_box()
        for(let t of this.terminals) {
            t.move_with_owner()
        }        
        draw_nodes()
    }
    
    mouseup() {
    }
    
    mousedown() {
        this.select()
    }

    has_anything_dirty() {
        if (this.self_dirty)
            return true
        for(let p of this.parameters)
            if (p.dirty)
                return true
        for(let t of this.inputs) 
            if (t.is_dirty())
                return true
        return false
    }
    clear_dirty() {
        this._node_dirty = false
        this.self_dirty = false
        for(let p of this.parameters)
            p.dirty = false
        for(let t of this.inputs) 
            t.tset_dirty(false)
    }
    
    call_params_change() {
        for(let p of this.parameters)
            if (p.call_change)
                p.call_change()
    }
}

function nodes_unselect_all(redraw) {
    if (selected_node == null)
        return
    selected_node = null
    if (redraw)
        draw_nodes()
    show_params_of(null)
    trigger_frame_draw(false) // if there was something selected, undisplay it's selection in the image
}

function set_display_node(node) {
    if (node == program.display_node)
        return
    program.display_node = node
    trigger_frame_draw(true)  // need to do run since the const output might have gotten changed
}

function find_node_obj(px, py, cvs_x, cvs_y) {
    for(let n of program.nodes) {
        // in this node (including terminals) ?
        if (px < n.tx || px > n.tx + n.twidth || py < n.ty || py >  n.ty + n.theight) {
            continue;
        }
        
        if (py >= n.y && py <= n.y + n.height && px <= n.x + n.width) {
            if (px >= n.x + NODE_FLAG_DISPLAY.offset)
                return new DisplayFlagProxy(n)
            if (px >= n.x)                
                return n
        }
        for(let t of n.terminals) {
            if (t.hit_test(px, py))
                return t
        }
        if (px > n.x + n.width && px < n.x + n.width + n.name_measure.width + NODE_NAME_PROPS.margin_left && py >= n.y && py <= n.y + NODE_NAME_PROPS.height) {
            return new NameInput(n, edit_nodes)
        }
    }

    let shadow_col = ctx_nd_shadow.getImageData(cvs_x, cvs_y, 1, 1).data
    let shadow_val = new Uint32Array(shadow_col.buffer)[0]
    let obj_id = uid_from_color(shadow_val)
    //console.log("obj",obj_id)
    if (obj_id != 0 && obj_id !== null) {
        let obj = program.obj_map[obj_id]
        console.assert(obj !== undefined, "can't find object with id " + obj_id)
        return obj
    }

    return null
}


function nodes_context_menu(px, py, wx, wy, cvs_x, cvs_y) {
    let obj = find_node_obj(px, py, cvs_x, cvs_y)
    
    let opt
    if (obj != null) {
        if (obj.constructor === Node)
            opt = [{text:"Delete Node", func:function() { delete_node(obj, true)} }]
        else if (obj.constructor === Line)
            opt = [{text:"Delete Line", func:function() { delete_line(obj, true)} }]
        else
            return null
    }
    else {
        opt = [{text:"Clear", func:()=>{ clear_program(); draw_nodes() } }, {text:"-"}]
        for(let c of nodes_classes)
            opt.push( {text: c.name(), func:function() { program.add_node(px, py, null, c); draw_nodes() } } )
    }
    
    nodes_view.last_ctx_menu = open_context_menu(opt, wx, wy, main_view, ()=>{nodes_view.dismiss_ctx_menu()})    
    return nodes_view.last_ctx_menu
}

function delete_node(node, redraw)
{
    if (selected_node == node)
        nodes_unselect_all(false)
    if (program.display_node == node) 
        set_display_node(null)
    if (node.destructor)
        node.destructor()
    var index = program.nodes.indexOf(node);
    program.nodes.splice(index, 1);        
    delete program.obj_map[node.id];
    for(let t of node.terminals) {
        while(t.lines.length > 0)
            delete_line(t.lines[0], false)
    }
    
    if (redraw) {
        draw_nodes()
        trigger_frame_draw(true)
    }
}


function delete_line(line, redraw) {
    line.from_term.lines.splice(line.from_term.lines.indexOf(line), 1)
    line.to_term.lines.splice(line.to_term.lines.indexOf(line), 1)
    line.to_term.tset_dirty(true)
    program.lines.splice(program.lines.indexOf(line), 1)
    if (redraw) {
        draw_nodes()
        trigger_frame_draw(true)
    }
}

const NODES_GRID_SIZE = 50


function draw_nodes()
{   
    save_state()
    ctx_nodes.lineWidth = 1
    ctx_nodes.fillStyle = '#312F31'
    ctx_nodes.fillRect(0, 0, canvas_nodes.width, canvas_nodes.height)
    ctx_nodes.textBaseline = "top"

    ctx_nd_shadow.fillStyle = "#000"
    ctx_nd_shadow.fillRect(0, 0, canvas_nd_shadow.width, canvas_nd_shadow.height)
    
    const left = -nodes_view.pan_x, top = -nodes_view.pan_y
    const right = canvas_nodes.width - nodes_view.pan_x, bottom = canvas_nodes.height - nodes_view.pan_y
    
    // grid
    ctx_nodes.beginPath();
    for(let x = round_to(left, NODES_GRID_SIZE); x < right; x += NODES_GRID_SIZE) {
        ctx_nodes.moveTo(x + nodes_view.pan_x, top + nodes_view.pan_y)
        ctx_nodes.lineTo(x + nodes_view.pan_x, bottom + nodes_view.pan_y)
    }
    for(let y = round_to(top, NODES_GRID_SIZE); y < bottom; y += NODES_GRID_SIZE) {
        ctx_nodes.moveTo(left + nodes_view.pan_x, y + nodes_view.pan_y)
        ctx_nodes.lineTo(right + nodes_view.pan_x, y + nodes_view.pan_y)
    }    
    ctx_nodes.strokeStyle = "#444"
    ctx_nodes.stroke()

    // nodes
    
    for(let n of program.nodes) {
        n.draw();
    }
    
    for(let l of program.lines) {
        l.draw()
    }
}


