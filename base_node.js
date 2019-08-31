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


function connector_line(fx, fy, fxoffset, tx, ty, txoffset, free) { // from, to
    ctx_nodes.beginPath()
    fx += nodes_view.pan_x, tx += nodes_view.pan_x
    fy += nodes_view.pan_y, ty += nodes_view.pan_y
    ctx_nodes.moveTo(fx, fy)
    let dy = ty - fy, dx = tx - fx
    if (ty - 2*TERM_RADIUS -5 > fy || Math.sqrt(dx*dx+dy*dy) < 70 || free) {// going down or very short
        ctx_nodes.bezierCurveTo(fx + dx*0.1, fy + dy*0.58, tx - dx*0.1, ty - dy*0.58,  tx, ty)
    }
    else {
        if (tx > fx) {
            // go over the upper left corner of destination and under lower right corner of source
            let pnts = [fx, fy, fx + NODE_WIDTH-fxoffset, fy + TERM_RADIUS, tx-txoffset, ty - TERM_RADIUS - 5, tx, ty]
            curve(ctx_nodes, pnts, 0.5)
        }
        else {
            let pnts = [fx, fy, fx - fxoffset, fy + TERM_RADIUS, tx+NODE_WIDTH-txoffset, ty - TERM_RADIUS - 5, tx, ty]
            curve(ctx_nodes, pnts)
        }
        
    }

    ctx_nodes.strokeStyle = "#aaa"
    ctx_nodes.lineWidth = 1.5
    ctx_nodes.stroke()    
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
    constructor(from_term, to_term) {
        console.assert(to_term.is_input !== undefined, "unexpected undefined")
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
                       this.to_term.center_x(), this.to_term.center_y(), this.to_term.center_offset(), false)
    }
}

class TerminalBase {
    constructor(name, in_node, is_input) {
        this.name = name
        console.assert(is_input !== undefined, "don't instantiate TerminalBase")
        this.owner = null  // set in Node
        this.line_pending = null
        this.lines = []
        this.node = in_node
        if (is_input)
            in_node.inputs.push(this)
        else
            in_node.outputs.push(this)
    }
    
    move_with_owner(is_input) {
        if (is_input !== undefined)
            this.is_input = is_input
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
    
    mousemove(dx, dy, px, py) {
        let linkto = find_node_obj(px, py)
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
            add_line(this.line_pending)
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
        this.p.refcount -= 1
        this.p = null
    }
}

function clone(obj) {
    if (obj === null || typeof (obj) !== 'object')
        return obj;    
    if (obj.BYTES_PER_ELEMENT !== undefined) { // it's a typed array 
        return new obj.constructor(obj)
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

class InTerminal extends Terminal {
    constructor(in_node, name) {
        super(name, in_node, true)
        this.h = null
    }
    set(v) {
        if (v.constructor === PHandle || v.constructor === PWeakHandle)
            this.h = new PHandle(v.p) // copy ctor
        else            
            this.h = new PHandle(v)
    }    
    get_const() {
        return this.h.get_const()
    }
    get_mutable() {
        return this.h.get_mutable()
    }
    clear() {
        this.h.clear()
    }    
}

class OutTerminal extends Terminal {
    constructor(in_node, name) {
        super(name, in_node, false)
        this.h = null
    }
    set(v) {
        // and also save a wear-ref to it so that display would work 
        if (v.constructor === PHandle || v.constructor === PWeakHandle)
            this.h = new PWeakHandle(v.p) // copy ctor
        else            
            this.h = new PWeakHandle(v)
    }
    get_const() {
        return this.h.get_const()
    }    
    clear() {
        this.h = new PWeakHandle(null)
    }
}

const TERM_MULTI_HWIDTH = 30

class InAttachMulti {
    constructor(owner_term) {
        this.owner_term = owner_term
        this.lines = owner_term.lines  // needed by add_line
        this.is_input = owner_term.is_input // needed by Line ctor
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
    }    
    get_const() {
        return this.h.get_const()
    }
    get_mutable() {
        return this.h.get_mutable()
    }
    clear() {
        this.h.clear()
    }    
}
// elongated
class InTerminalMulti extends TerminalBase
{
    constructor(in_node, name) {
        super(name, in_node, true)
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
}


const NODE_NAME_PROPS = { font:"14px Verdana", margin_top:3, margin_left:5, height:15}
const NODE_FLAG_DISPLAY = {offset: 105, color: "#00A1F7" }

class Node {    
    constructor(x, y, name, cls, id) {
        this.x = x
        this.y = y
        this.width = NODE_WIDTH
        this.height = 30
        this.set_name(name)
        this.color = "#ccc"
        this.id = id

        // calculated data members
        this.parameters = []
        this.inputs = []
        this.outputs = [] 
        this.cls = new cls(this)
        this.make_term_offset(this.inputs, true)
        this.make_term_offset(this.outputs, false)
        this.terminals = this.inputs.concat(this.outputs)
    }
   
    make_term_offset(lst, is_input) {
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
            t.move_with_owner(is_input)
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
        ctx_nodes.beginPath();
        ctx_nodes.strokeStyle = "#000"
        rounded_rect(ctx_nodes, px, py, this.width, this.height, 5)
        ctx_nodes.fillStyle = this.color
        ctx_nodes.fill()
        ctx_nodes.stroke() 

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
            return
        selected_node = this
        draw_nodes() // need to paint the previous selected one
        show_params_of(this)
    }
    
    set_name(name) {
        this.name = name
        ctx_nodes.font = NODE_NAME_PROPS.font
        this.name_measure = ctx_nodes.measureText(this.name)
        
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
    
}

function unselect_all(redraw) {
    if (selected_node == null)
        return
    selected_node = null
    if (redraw)
        draw_nodes()
    show_params_of(null)
}

function set_display_node(node) {
    if (node == program.display_node)
        return
    program.display_node = node
    trigger_frame_draw()
}

function find_node_obj(px, py) {
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
    return null
}

var last_nodes_ctx_menu = null;
function nodes_dismiss_ctx_menu() {
    if (last_nodes_ctx_menu != null) {
        main_view.removeChild(last_nodes_ctx_menu)
        last_nodes_ctx_menu = null
    }
}


function nodes_context_menu(px, py, wx, wy) {
    let node = find_node_obj(px, py)
    
    nodes_dismiss_ctx_menu()
        
    if (node != null) {
        var opt = [{text:"Delete", func:function() { delete_node(node, true)} }]
    }
    else {
        let clss = []
        for(let c of nodes_classes)
            clss.push( {text: c.name(), func:function() { add_node(px, py, null, c); draw_nodes() } } )
        var opt = clss
    }
    
    last_nodes_ctx_menu = open_context_menu(opt, wx, wy, main_view, nodes_dismiss_ctx_menu)    
    
}

function delete_node(node, redraw)
{
    if (selected_node == node)
        unselect_all(false)
    if (program.display_node == node) 
        set_display_node(null)
    var index = program.nodes.indexOf(node);
    program.nodes.splice(index, 1);        
    delete program.nodes_map[node.id];
    for(let t of node.terminals) {
        while(t.lines.length > 0)
            delete_line(t.lines[0])
    }
    
    if (redraw)
        draw_nodes()
}




function add_node(x, y, name, cls, id) 
{
    if (name === null) {
        if (program.names_indices[cls.name()] === undefined)
            program.names_indices[cls.name()] = 1
        else
            program.names_indices[cls.name()]++
        name = cls.name().toLowerCase() + "_" + program.names_indices[cls.name()]
    }
    if (id === null || id === undefined) {
        id = program.next_node_id++ 
    }
    var node = new Node(x, y, name, cls, id)
    program.nodes_map[node.id] = node
    program.nodes.push(node)
    return node
}

function add_line(line) {
    program.lines.push(line)
    line.from_term.lines.push(line)
    line.to_term.lines.push(line)
    trigger_frame_draw()
}

function delete_line(line) {
    line.from_term.lines.splice(line.from_term.lines.indexOf(line), 1)
    line.to_term.lines.splice(line.to_term.lines.indexOf(line), 1)
    program.lines.splice(program.lines.indexOf(line), 1)
}

const NODES_GRID_SIZE = 50


function draw_nodes()
{   
    save_state()
    ctx_nodes.lineWidth = 1
    ctx_nodes.fillStyle = '#312F31'
    ctx_nodes.fillRect(0, 0, canvas_nodes.width, canvas_nodes.height)
    ctx_nodes.textBaseline = "top"
    
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


