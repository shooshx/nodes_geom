"use strict"

var selected_node = null


const TERM_RADIUS = 8
const TERM_MARGIN_X = 20
const TERM_MARGIN_Y = 2

const NODE_WIDTH = 120

const TEMPLATE_LINE_COLOR = "#de77f1"


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

function connector_line(fx, fy, fxoffset, tx, ty, txoffset, free, uid, kind) { // from, to
    fx += nodes_view.pan_x, tx += nodes_view.pan_x
    fy += nodes_view.pan_y, ty += nodes_view.pan_y
    let dy = ty - fy, dx = tx - fx
    let cpnts;
    if (ty - 2*TERM_RADIUS -5 > fy || Math.sqrt(dx*dx+dy*dy) < 70 || free || kind == KIND_VARS) {// going down or very short        
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

    if (kind == KIND_VARS)
        ctx_nodes.strokeStyle = LINE_COLOR_VARS
    else
        ctx_nodes.strokeStyle = "#aaa"
    ctx_nodes.lineWidth = 1.5
    ctx_nodes.stroke()

    if (uid !== null) {
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
                       this.to_term.center_x(), this.to_term.center_y(), this.to_term.center_offset(), false, this.uid, this.from_term.kind)
    }
}

const KIND_OBJ = 0   // terminal that passes renderable objects
const KIND_VARS = 1  // terminal that passes variable packs

// does just the graphics
class TerminalBase {
    constructor(name, in_node, is_input) {
        this.name = name
        console.assert(is_input !== undefined, "don't instantiate TerminalBase")
        this.owner = in_node // Node object
        this.line_pending = null
        this.lines = []
      //  this.node = in_node
        this.is_input = is_input
        this.tuid = null // set in add_node
        this.kind = KIND_OBJ
        this.color = "#aaa"

        this.xoffset = null // will be set again in Node

        if (is_input) {
            in_node.inputs.push(this)
            this.yoffset = - TERM_RADIUS - TERM_MARGIN_Y
        }
        else {
            in_node.outputs.push(this)
            this.yoffset = this.owner.height + TERM_RADIUS + TERM_MARGIN_Y   
        }
    }

    px() { return this.owner.x + this.xoffset + nodes_view.pan_x }
    py() { return this.owner.y + this.yoffset + nodes_view.pan_y }
    center_x() { return this.owner.x + this.xoffset }
    center_y() { return this.owner.y + this.yoffset }
    center_offset() { return this.xoffset }

    is_connected_to(other_term) {
        for(let l of this.lines) {
            if (l.from_term === other_term || l.to_term === other_term)
                return true;
        }
        return false;
    }
    gender_match(other_term) {
        return ((this.is_input && !other_term.is_input) || (!this.is_input && other_term.is_input)) && (this.kind == other_term.kind)
    }
    
    get_attachment() { return this }// useful in multi
    get_attachee() { return this }
    connect_events_dest() { return owner.cls }

    tdid_connect(line) {
        this.owner.cls.did_connect(this, line)
    }
    tdoing_disconnect(line) {
        this.owner.cls.doing_disconnect(this, line)
    }

    draw(force=false) {
        ctx_nodes.beginPath();
        this.draw_path(ctx_nodes, force)
        ctx_nodes.fillStyle = this.color
        ctx_nodes.fill()
        ctx_nodes.strokeStyle = "#000"
        ctx_nodes.lineWidth = 1
        ctx_nodes.stroke()
    }
    draw_shadow() {
        ctx_nd_shadow.beginPath();
        this.draw_path(ctx_nd_shadow)
        ctx_nd_shadow.fillStyle = color_from_uid(this.tuid)
        ctx_nd_shadow.fill()        
    }
    
    mousemove(dx, dy, px, py, ex, ey, cvs_x, cvs_y) {
        let linkto = find_node_obj(px, py, cvs_x, cvs_y)
        this.line_pending = null
        draw_nodes()
        if (linkto === this) { // should not connect to itself
            return
        }
        if (linkto !== null) {
            let i = 0;
        }
        if (linkto !== null && linkto.owner === undefined && this.kind == KIND_VARS && linkto.cls !== undefined) {
            // when linking a vars line, target the whole node
            linkto = linkto.cls.vars_in
        }
        if (linkto === null || linkto.owner === undefined || linkto.owner === this.owner || 
            !this.gender_match(linkto) || this.is_connected_to(linkto)) 
        {
            // free line
            connector_line(this.center_x(), this.center_y(), 0, px, py, 0, true, null, this.kind)
        }
        else {
            this.line_pending = new Line(this.get_attachment(), linkto.get_attachment())
            if (this.kind == KIND_VARS) // draw the terminal that is normally invisible
                linkto.draw(true)
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
    mousedown() {}
    hover(wx, wy) {
        hover_box.innerHTML = this.name
        hover_box.style.display = "initial"
        hover_box.style.left = nodes_view.rect.left + nodes_view.pan_x + this.center_x() + "px"
        let y_offset = 0
        if (this.is_input)
            y_offset = -30;
        hover_box.style.top = nodes_view.rect.top + nodes_view.pan_y + this.center_y() + y_offset + "px"
    }
    
}

function canvas_transform(ctx, m) {
    ctx.transform(m[0], m[1], m[3], m[4], m[6], m[7])
}
function canvas_setTransform(ctx, m) {
    ctx.setTransform(m[0], m[1], m[3], m[4], m[6], m[7])
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

    // do any work that requires async, before doing any actual drawing to avoid having drawn half a frame
    async pre_draw(m, disp_values) {
    }

    // this is the default that just sets the transform and calls draw_m which doesn't need to worry about it
    draw(m, disp_values) {
        ctx_img.save()
        try {
            canvas_setTransform(ctx_img, m)
            this.draw_m(m, disp_values)
        }
        finally {
            ctx_img.restore()
        }
    } 
    draw_selection(m, select_vindices) {
        ctx_img.save()
        try {
            canvas_setTransform(ctx_img, m)
            this.draw_selection_m(m, select_vindices)
        }
        finally {
            ctx_img.restore()
        }        
    }

    draw_template(m) {
        ctx_img.save()
        try {
            canvas_setTransform(ctx_img, m)
            this.draw_template_m(m)
        }
        finally {
            ctx_img.restore()
        }
    }

    draw_border() {} // called in NodeTransform
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

function isTypedArray(obj) {
    return (obj.BYTES_PER_ELEMENT !== undefined)
}

function clone(obj) {
    if (obj === null || typeof (obj) !== 'object')
        return obj;    
    if (isTypedArray(obj) || obj.constructor == Path2D) { 
        // it's a typed array or Path2D (that have copy ctor)
        return new obj.constructor(obj)
    }
    if (obj.constructor === WebGLBuffer || obj.constructor === WebGLTexture || obj.constructor === CanvasGradient) {
        return null // gl buffers can't be cloned
    }
    if (obj.constructor === HTMLImageElement) {
        return obj // immutable object (once it's loaded) so it's ok for several clones to reference it
    }
    if (obj.constructor === ObjConstProxy) {
        return obj // this is a proxy that wraps another object that is going to remain const so we don't need to copy it further
    }
    if (obj._class !== undefined)
        return null // paper.js object, can be discarded, it will be regenerated since it's a cache
    // it's ok for a PObject constructor to take arguments
    // as long as it's fine with getting them as undefined and later being assigned the same
    // values as properties
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
    draw_path(ctx) {
        ctx.arc(this.px(), this.py() , TERM_RADIUS, 0, 2*Math.PI)
    }

    hit_test(px, py) {
        return px >= this.center_x() - TERM_RADIUS && px <= this.center_x() + TERM_RADIUS && 
               py >= this.center_y() - TERM_RADIUS && py <= this.center_y() + TERM_RADIUS
    }


}

// inputs by default have a weak handle that can be upgraded to a counting handle
// if a mutable object is needed
class InTerminal extends Terminal {
    constructor(in_node, name) {
        super(name, in_node, true)
        this.h = null
        // an input terminal gets dirty when it's being set a new value.
        // this may be the only indication that a node is dirty if we changed a upper node when it was not visible
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
        this.tset_dirty(true)  // see desing_concepts
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
        return this.owner_term.center_x()
    }
    center_y() {
        return this.owner_term.center_y()
    }
    center_offset() {
        return this.owner_term.xoffset
    }
    set(v) {
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
        this.width = TERM_MULTI_HWIDTH
    }
    draw_path(ctx) {
        rounded_rect(ctx, this.px() - this.width, this.py() - TERM_RADIUS, this.width*2, 2*TERM_RADIUS, TERM_RADIUS)
    }

    hit_test(px, py) {
        return px >= this.center_x() - this.width && px <= this.center_x() + this.width && 
               py >= this.center_y() - TERM_RADIUS && py <= this.center_y() + TERM_RADIUS
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

    get_input_consts() {
        let ret = []
        for(let line of this.lines)
            ret.push(line.to_term.get_const())
        return ret
    }

}


const NODE_NAME_PROPS = { font:"14px Verdana", margin_top:3, margin_left:5, height:15}
const NODE_FLAG_DISPLAY = {offset: 105, color: "#00A1F7" }
const NODE_FLAG_TEMPLATE = {offset: 90, color: "#de77f1" }
const NODE_FLAG_INPUT = { width: 15, color: "#8AE600" }


function wrapText(context, text, x, center_y, maxWidth, lineHeight) {
    let words = text.split(' ');
    let line = '';
    let lines = []
    let y = 0
    for(let n = 0; n < words.length; n++) {
      let testLine = line + words[n] + ' ';
      let metrics = context.measureText(testLine);
      let testWidth = metrics.width;
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
const EXPR_NEED_VAR = 2  // looked up a variable

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
        this.need_inputs = {} // map name of input to its ObjRef, gets taken away right after parsing is done
        this.need_variables = {} // list of VariableEvaluator in the currently parsing expr
    }
    get_evaluator(name, line_num) { // called from parser
        let sp = name.split('.')
        let varname = sp[0]
        // did we already create it?
        let top_level = this.need_inputs[varname]
        if (top_level === undefined) {
            let known_obj = this.known_objrefs[varname]
            if (known_obj === undefined)  { 
                // name is not in needed and not in known (which comes from state_evaluators) so it something we know nothing about
                // default is to assume it's a variable
                this.score |= EXPR_NEED_VAR
                // create only 1 evaluator for any variable in an expression
                let ve = this.need_variables[varname]
                if (ve === undefined) {
                    ve = new VariableEvaluator(varname, line_num) // a VarBox will be set to it in resolve_variables
                    this.need_variables[varname] = ve
                }
                return ve
            }
            top_level = this.need_inputs[varname] = this.known_objrefs[varname]
        }
        let evaluator_factory = this.state_evaluators[varname] // as specified by the node_cls
        if (evaluator_factory !== undefined) {
            let e = evaluator_factory(top_level, sp.slice(1))
            this.score |= EXPR_NEED_INPUT // TBD depend on evaluator?
            return e
        }

        return null // shouldn't reach here
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
        this.can_display = true // vars nodes can't display, set in cls ctor
        this.can_input = false  // vars node can get mouse input
        this.name_xmargin = 0   // distance of name from node, use for var input node
        this.nkind = KIND_OBJ

        // calculated data members
        this.parameters = []
        this.param_aliases = {} // map old name of a parameter to its new Parameter object
        this.terminal_aliases = {} // same for terminals
        this.inputs = []
        this.outputs = [] 
        this.state_evaluators = {} // map variable name to its evaluator type. Evaluator instance will be created with its subscripts when the expression is parsed
        this.state_access = null
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
        // used for viewport dependent nodes when viewport changes (not actaully used right now)
        this.self_dirty = false
        // key-value of parameters for displaying any sort of object.
        // kept per-node since every node can want something different
        this.display_values = {}

        this.disp_template = false
        this.receives_input = false // depends on can_input

        if (this.state_access === null)
            this.set_state_evaluators([]) // if cls ctor did not call it
    }

    set_state_evaluators(d) { // called in cls ctor to configure how StateAccess accesses state
        this.state_evaluators = d
        // evaluators created in the cls ctor
        this.state_access = new StateAccess(this.state_evaluators) 
        return this.state_access
    }


    make_term_offset(lst) {
        if (lst.length == 0)
            return;
        let count = 0
        for(let t of lst)
            if (t.kind == KIND_OBJ)
                ++count

        const step = (this.width - TERM_MARGIN_X*2) / (count - 1)
        let cidx = 0
        for(let i = 0; i < lst.length; ++i) {
            let term = lst[i]
            if (term.kind != KIND_OBJ)
                continue
            if (term.xoffset === null) {
                if (count == 1)
                    term.xoffset = this.width / 2
                else
                    term.xoffset = TERM_MARGIN_X + cidx * step
            }
            ++cidx;    
        }

        //  for(let t of lst) {
      //      t.owner = this
      //  }        
    }
    
    px() {  // panned
        return this.x + nodes_view.pan_x
    }
    py() {
        return this.y + nodes_view.pan_y
    }
    namex() {
        return this.px() + this.width + this.name_xmargin + NODE_NAME_PROPS.margin_left
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

        // selection border
        if (selected_node === this) {
            ctx_nodes.beginPath();            
            ctx_nodes.lineWidth = 1.5
            ctx_nodes.strokeStyle = "#FFEE00"
            rounded_rect(ctx_nodes, px-2, py-2, this.width+4, this.height+4, 7)
            ctx_nodes.stroke() 
            
            ctx_nodes.strokeStyle = "#000"
            ctx_nodes.lineWidth = 1
        }
        
        if (this.can_display) 
        {
            // display flag
            if (program.display_node === this) {
                ctx_nodes.beginPath();
                rounded_rect_f(ctx_nodes, px + NODE_FLAG_DISPLAY.offset, py, this.width - NODE_FLAG_DISPLAY.offset, this.height, 0, 0, 5, 5)
                ctx_nodes.fillStyle = NODE_FLAG_DISPLAY.color
                ctx_nodes.fill()
                ctx_nodes.stroke()  // looks bad without this
            }        

            // template flag
            if (this.disp_template) {
                ctx_nodes.fillStyle = NODE_FLAG_TEMPLATE.color
                ctx_nodes.fillRect(px + NODE_FLAG_TEMPLATE.offset, py, NODE_FLAG_DISPLAY.offset - NODE_FLAG_TEMPLATE.offset, this.height)
                ctx_nodes.strokeRect(px + NODE_FLAG_TEMPLATE.offset, py, NODE_FLAG_DISPLAY.offset - NODE_FLAG_TEMPLATE.offset, this.height)
            }
            
            // flags lines
            ctx_nodes.beginPath();
            ctx_nodes.moveTo(px + NODE_FLAG_DISPLAY.offset, py)
            ctx_nodes.lineTo(px + NODE_FLAG_DISPLAY.offset, py+this.height)
            ctx_nodes.moveTo(px + NODE_FLAG_TEMPLATE.offset, py)
            ctx_nodes.lineTo(px + NODE_FLAG_TEMPLATE.offset, py+this.height)
            ctx_nodes.stroke()
        }
        if (this.can_input)
        {
            if (this.receives_input) {
                ctx_nodes.fillStyle = NODE_FLAG_INPUT.color
                ctx_nodes.beginPath();
                rounded_rect_f(ctx_nodes, px, py, NODE_FLAG_INPUT.width, this.height, 5, 5, 0, 0)
                ctx_nodes.fill()
                ctx_nodes.stroke()
            }
            ctx_nodes.beginPath();
            ctx_nodes.moveTo(px + NODE_FLAG_INPUT.width, py)
            ctx_nodes.lineTo(px + NODE_FLAG_INPUT.width, py+this.height)
            ctx_nodes.stroke()
        }

        for(let t of this.terminals) {
            t.draw()
        }
        ctx_nodes.fillStyle = "#fff"
        ctx_nodes.font = NODE_NAME_PROPS.font;
        ctx_nodes.fillText(this.name, this.namex(), this.namey())
    }

    draw_shadow() {
        for(let t of this.terminals) {
            t.draw_shadow()
        }
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
    register_rename_observer(func) {
        this.rename_observers.push(func)
    }
    remove_rename_observer(func) {
        let idx = this.rename_observers.findIndex((v)=>{ return v === func })
        if (idx !== -1)
            this.rename_observers.splice(idx, 1)
    }

    // geom including terminals and name
    recalc_bounding_box() {
        this.tx = this.x - 8 // in var term
        this.ty = this.y - TERM_RADIUS*2 - 2
        this.twidth = this.width + this.name_measure.width + NODE_NAME_PROPS.margin_left
        this.theight = this.height + TERM_RADIUS * 4 + TERM_MARGIN_Y*2
    }

    mousemove(dx, dy) {
        this.x += dx
        this.y += dy
        this.recalc_bounding_box()      
        draw_nodes()
    }
    
    mouseup() {
    }
    
    mousedown() {
        this.select()
    }

    has_cached_output() {
        return this.outputs[0].get_const() !== null
    }
    has_anything_dirty() {
        if (this.self_dirty || this.cls.is_internal_dirty())
            return true
        for(let p of this.parameters)
            if (p.pis_dirty())
                return true
        // terminals get dirty when something is connected or disconnected from them. That's it.
        for(let t of this.inputs)
            if (t.is_dirty())
                return true
        return false
    }
    clear_dirty() {
        this._node_dirty = false
        this.self_dirty = false
        for(let p of this.parameters)
            p.pclear_dirty()
        for(let t of this.inputs) 
            t.tset_dirty(false)
        this.cls.cclear_dirty()
    }
    
    call_params_change() {
        for(let p of this.parameters)
            if (p.call_change)
                p.call_change()
    }
    reeval_all_exprs() {
        for(let p of this.parameters)
            if (p.pis_visible())
                p.reeval_all_exprs()
    }

    remove_param(prm) {
        const i = this.parameters.findIndex(function(p) { return Object.is(prm, p) })
        console.assert(i !== -1)
        this.parameters.splice(i, 1)
    }

    param_alias(name, prm) {
        this.param_aliases[name] = prm
    }
    terminal_alias(name, terminal) {
        this.terminal_aliases[name] = terminal
    }
}



class NodeCls {
    constructor(node) {
        this.error = null
        this.node = node
        // any node can have a variables in
        this.vars_in = new VarsInTerminal(node, "vars_in")
    }
    // mouse interaction in image_view
    image_click() {}
    image_find_obj() { return null }
    clear_selection() {}
    draw_selection() {}
    selected_obj_name() { return null }
    // rect_select(min_x, min_y, max_x, max_y) {} if it's not defined, rect doesn't even show

    // nodes that depends on the viewport should implement and dirty themselves
    dirty_viewport() {}

    get_error() { return this.error }
    clear_error() { this.error = null }
    nset_error(e) { this.error = e }
    did_connect(to_term, line) {}
    doing_disconnect(to_term, line) {}
    cclear_dirty() {} // clear the dirty things in a NodeCls that are not exposed to the outside via proxies (used in variable)

    is_internal_dirty() { return false } // for nodes with internal nodes

    nresolve_variables() {
        try {
            for(let p of this.node.parameters) {
                p.resolve_variables(this.vars_in.my_vsb) // variables already have the vars_box referenced
            }
        } 
        catch(err) {
            assert(false, this, "Parameter variables error")
        }
    }

    run() {  // for normal kind node (nkind=KIND_OBJ)
        assert(false, this, "run() not implemented")
    }
    var_run() { // for var kind node (nkind=KIND_VARS)
        assert(false, this, "var_run() not implemented")
    }

}


function nodes_unselect_all(redraw=true, trig_frame=true) {
    if (selected_node == null)
        return
    selected_node = null
    if (redraw)
        draw_nodes()
    show_params_of(null)
    if (trig_frame)
        trigger_frame_draw(false) // if there was something selected, undisplay it's selection in the image
}


// pass along the messages to the node and just flip the display flag
class NodeFlagProxy
{
    constructor(node, func, notifyNode=true) {
        this.node = node
        this.func = func
        this.notifyNode = notifyNode
    }
    mousedown(e) {
        this.func(this.node) 
        draw_nodes()
        if (this.notifyNode)
            this.node.mousedown(e) // selects node
    }
    mouseup() {
        if (this.notifyNode)
            this.node.mouseup()
    }
    mousemove(a,b,c,d) {
        if (this.notifyNode)
            this.node.mousemove(a,b,c,d)
    }
}

function nodes_find_obj_shadow(cvs_x, cvs_y) {
    if (cvs_x < 0 || cvs_y < 0 || cvs_x > canvas_nd_shadow.width || cvs_y > canvas_nd_shadow.height)
        return null

    // TBD cache the data, don't sample each time
    let shadow_col = ctx_nd_shadow.getImageData(cvs_x, cvs_y, 1, 1).data
    let shadow_val = new Uint32Array(shadow_col.buffer)[0]
    let obj_id = uid_from_color(shadow_val)
    //console.log("obj",obj_id)
    if (obj_id != 0 && obj_id !== null) {
        let obj = program.obj_map[obj_id]
        if (obj === undefined) // can still happen in the aliasing between two colors
            return null
        // the right way to do this is to take a majority vote between the pixels around
        return obj
    }
    return null
}

function find_node_obj(px, py, cvs_x, cvs_y) {
    for(let n of program.nodes) {
        // in this node (including terminals and name input) ?
        if (px < n.tx || px > n.tx + n.twidth || py < n.ty || py >  n.ty + n.theight) {
            continue;
        }
        
        for(let t of n.terminals) {
            if (t.hit_test(px, py))
                return t
        }
        if (py >= n.y && py <= n.y + n.height && px <= n.x + n.width) {
            if (n.can_display) {
                if (px >= n.x + NODE_FLAG_DISPLAY.offset)
                    return new NodeFlagProxy(n, (n)=>{ program.set_display_node(n) })
                if (px >= n.x + NODE_FLAG_TEMPLATE.offset)
                    return new NodeFlagProxy(n, (n)=>{ program.set_template_node(n) })
            }
            if (n.can_input) {
                if (px <= n.x + NODE_FLAG_INPUT.width)
                    return new NodeFlagProxy(n, (n)=>{ program.set_input_node(n) }, false) // don't select node since that's only annying most of the time
            }
            if (px >= n.x)                
                return n
        }

        const name_xstart = n.x + n.width + n.name_xmargin
        if (px > name_xstart && px < name_xstart + n.name_measure.width + NODE_NAME_PROPS.margin_left && 
            py >= n.y && py <= n.y + NODE_NAME_PROPS.height) {
            return new NameInput(n, edit_nodes)
        }
    }

    return nodes_find_obj_shadow(cvs_x, cvs_y)
}


function nodes_context_menu(px, py, wx, wy, cvs_x, cvs_y) {
    let obj = find_node_obj(px, py, cvs_x, cvs_y)
    
    let opt = null, node = null;
    if (obj != null) {
        if (obj.constructor === Node)
            node = obj
        else if (obj.constructor === NodeFlagProxy)
            node = obj.node
        else if (obj.constructor === Line)
            opt = [{text:"Delete Line", func:function() { program.delete_line(obj, true)} }]       
        else if (obj.constructor === NameInput)
            obj = null // treat it like we pressed the background
        else
            return null
    }
    if (node !== null)
        opt = [{text:"Delete Node", func:function() { program.delete_node(node, true)} }]
    else if (opt === null) {
        opt = [{text:"Clear", func:()=>{ clear_program(); draw_nodes() } }, {text:"-"}]
        for(let c of nodes_classes)
            opt.push( {text: c.name(), func:function() { program.add_node(px, py, null, c); draw_nodes() } } )
    }
    
    nodes_view.last_ctx_menu = open_context_menu(opt, wx, wy, main_view, ()=>{nodes_view.dismiss_ctx_menu()})    
    return nodes_view.last_ctx_menu
}

let last_nodes_hover_obj = null
function nodes_hover(px_, py_, wx, wy, cvs_x, cvs_y) {
    let obj = nodes_find_obj_shadow(cvs_x, cvs_y)
    if (obj !== null && obj.hover !== undefined) {
        if (obj !== last_nodes_hover_obj)
            obj.hover(wx, wy)
    }
    else {        
        hover_box.style.display = "none"
        obj = null
    }
    last_nodes_hover_obj = obj
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
    // in the shadow canvas nodes should be above lines so that the lines don't obscure the terminals
    for(let n of program.nodes) {
        n.draw_shadow();
    }
}


