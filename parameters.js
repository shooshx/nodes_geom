
class Parameter
{
    constructor(node, label) {
        this.label = label
        this.label_elem = null  // use for changing the label 
        this.line_elem = null  // used for enable
        this.enable = true
        if (node !== null) // will be null in DispParams
            node.parameters.push(this)
        this.owner = node
        this.dirty = true  // was it changed since the last run?
    }
    set_label(text) {
        this.label = text
        if (this.label_elem !== null) // can be null if we call this before displaying elements
            this.label_elem.innerText = text
    }
    set_enable(v) {
        this.enable = v
        if (this.line_elem !== null)
            this.line_elem.classList.toggle("param_disabled", !this.enable)
    }
    init_enable() {
        if (this.line_elem !== null && !this.enable)
            this.line_elem.classList.toggle("param_disabled", !this.enable)
    }
    pset_dirty(draw=true) { // p for parameter to differentiate it from the others
        this.dirty = true
        if (draw)
            trigger_frame_draw(true)
    }
}

// if the text of one of the labels is too long, fix the length of all of them
function fix_label_lengths(parameters) {
    let max_width = 0
    for(let p of parameters) {
        if (p.label_elem && p.label_elem.scrollWidth > p.label_elem.offsetWidth) {
            max_width = Math.max(max_width, p.label_elem.scrollWidth + 5)
        }
    }
    if (max_width != 0) {
        for(let p of parameters) {
            p.label_elem.style.width = max_width + "px"
        }
    }
}

function clear_elem(id) {
    let e = document.getElementById(id)
    var cNode = e.cloneNode(false);
    e.parentNode.replaceChild(cNode, e);
    return cNode    
}

function show_params_of(node) {
    // clear children
    let div_params_list = clear_elem('div_params_list')
    if (node === null)
        return
    
    for(let p of node.parameters) {
        p.add_elems(div_params_list)
        p.init_enable()
    }
    fix_label_lengths(node.parameters)
}

function show_display_params(obj, disp_node) {
    let params = null
    if (disp_node && obj)
        params = obj.get_disp_params(disp_node.display_values) // sets defaults if needed
    let div_display_params = clear_elem('div_display_params')
    if (obj === null || params === null || disp_node === null || disp_node !== selected_node)
        return
    for(let p of params) {
        p.add_elems(div_display_params)
    }
}

function create_elem(elem_type, cls) {
    let e = document.createElement(elem_type);
    if (cls !== undefined) {
        if (!Array.isArray(cls))
            cls = [cls]
        e.classList = cls.join(" ")
    }
    return e
}
function add_elem(parent, elem_type, cls) {
    let e = create_elem(elem_type, cls)
    parent.appendChild(e)
    return e
}
function create_div(cls) {
    return create_elem('div', cls)
}

function add_div(parent, cls) {
    let e = create_div(cls)
    parent.appendChild(e)
    return e
}
function add_param_line(parent) { return add_div(parent, 'param_line') }
function add_param_block(parent) { return add_div(parent, 'param_block') } // for multi-line params

function add_param_label(line, text) {
    let e = document.createElement('span')
    if (text != null) {
        e.innerText = text
        e.className = 'param_label_pre'
    }
    else
        e.className = 'param_label_pre_empty'

    line.appendChild(e)
    if (text != null) {
        let colon = document.createElement('span')
        colon.className = 'param_label_colon'    
        colon.innerText = ':'  // can't just concatenate this above since the label may change
        line.append(colon)
    }
    return e
}
const ED_FLOAT=0
const ED_INT=1
const ED_STR=2
function add_param_edit(line, value, type, set_func) {
    let e = document.createElement('input')
    e.className = 'param_input'
    e.type = 'text'
    e.spellcheck = false
    e.value = (type == ED_FLOAT) ? toFixedMag(value) : value
    // TBD parse error
    e.addEventListener("input", function() { set_func(e.value); })
    line.appendChild(e)
    return e
}
function add_param_color(line, value, cls, set_func) {
    let e = document.createElement('input')
    e.className = cls
    line.appendChild(e) // must have parent
    // TBD move setting the func to be the last thing to avoid spurious triggers
    let ce = ColorEditBox.create_at(e, 200, function(c) { set_func(c) }, {with_alpha:true}, value)
    return [ce.get_color().copy(), e]
}
let g_input_ids = 1
function add_param_checkbox(line, label, value, set_func) {
    let ein = add_elem(line, 'input', 'param_checkbox_input')
    ein.type = 'checkbox'
    ein.id = 'p_chb_' + g_input_ids++
    ein.checked = value
    ein.addEventListener('change', function() { set_func(ein.checked); })
    let edisp = add_elem(line, 'label', 'param_checkbox_disp')
    edisp.setAttribute("for", ein.id)
    let etext = add_elem(line, 'label', 'param_checkbox_text')
    etext.setAttribute("for", ein.id)
    etext.innerText = label
    return etext
}
function add_push_btn(parent, label, onclick) {
    let btn = add_div(parent, "param_btn")
    btn.innerText = label
    btn.addEventListener("click", onclick)
    return btn
}
function add_checkbox_btn(parent, label, value, onchange) {
    let ein = add_elem(parent, 'input', 'param_checkbox_input')
    ein.type = 'checkbox'
    ein.id = 'p_chb_' + g_input_ids++
    ein.checked = value
    ein.addEventListener('change', function() { onchange(ein.checked); })
    let btn = add_elem(parent, 'label', 'param_btn')
    btn.setAttribute("for", ein.id)
    btn.innerText = label
    return [ein, btn]
}
function add_combobox(parent, opts, sel_idx, onchange) {
    let se = add_elem(parent, 'select', ['param_select', 'param_input'])
    for(let s of opts) {
        let o = add_elem(se, 'option')
        o.innerText = s
    }
    se.selectedIndex = sel_idx
    se.addEventListener('change', function() { onchange(se.selectedIndex); })
    return se
}

class ParamSeparator extends Parameter {
    constructor(node) {
        super(node, null)
    }
    save() { return null }
    load(v) {}
    add_elems(parent) {
        add_elem(parent, "hr", "param_separator")
    }
}


class ParamInt extends Parameter {
    constructor(node, label, start_v) {
        super(node, label)
        this.v = start_v
    }
    save() { return {v:this.v}}
    load(v) { this.v = v.v }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        add_param_edit(this.line_elem, this.v, ED_INT, (v)=>{ this.v = parseInt(v); this.pset_dirty() }) // TBD enforce int with parsing
    }
}

class ParamFloat extends Parameter {
    constructor(node, label, start_v) {
        super(node, label)
        this.v = start_v
    }
    save() { return {v:this.v}}
    load(v) { this.v = v.v }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        add_param_edit(this.line_elem, this.v, ED_FLOAT, (v)=>{ this.v = parseFloat(v); this.pset_dirty() }) // TBD enforce int with parsing
    }
}

class ParamBool extends Parameter {
    constructor(node, label, start_v, change_func) {
        super(node, label)
        this.v = start_v
        this.change_func = change_func
    }
    save() { return {v:this.v} }
    load(v) { this.v = v.v; this.call_change()  }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        add_param_label(this.line_elem, null)  // empty space
        this.label_elem = add_param_checkbox(this.line_elem, this.label, this.v, (v) => { 
            this.v = v; 
            this.pset_dirty()
            if (this.change_func) 
                this.change_func(v) 
        })
    }
    call_change() {
        if (this.change_func) 
            this.change_func(this.v)
    }
}

function get_default(m, k, d) {
    if (m[k] === undefined)
        m[k] = d
    return m[k]
}

class DispParamBool extends ParamBool {
    constructor(disp_values, label, prop_name, start_v) {
        super(null, label, get_default(disp_values, prop_name, start_v), (v)=>{disp_values[prop_name]=v; trigger_frame_draw()})
    }
    pset_dirty() {} // this override is needed to avoid draw triggers that mess with the controls
}

class ParamVec2 extends Parameter {
    constructor(node, label, start_x, start_y) {
        super(node, label)
        this.x = start_x
        this.y = start_y
    }
    save() { return {x:this.x, y:this.y} }
    load(v) { this.x=v.x; this.y=v.y }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        add_param_edit(this.line_elem, this.x, ED_FLOAT, (v) => { this.x = parseFloat(v); this.pset_dirty() })
        add_param_edit(this.line_elem, this.y, ED_FLOAT, (v) => { this.y = parseFloat(v); this.pset_dirty() })
    }
}

class ParamVec2Int extends Parameter {
    constructor(node, label, start_x, start_y) {
        super(node, label)
        this.x = start_x
        this.y = start_y
    }
    save() { return {x:this.x, y:this.y} }
    load(v) { this.x=v.x; this.y=v.y }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        add_param_edit(this.line_elem, this.x, ED_INT, (v) => { this.x = parseInt(v); this.pset_dirty() })
        add_param_edit(this.line_elem, this.y, ED_INT, (v) => { this.y = parseInt(v); this.pset_dirty() })
    }
}


class ParamColor extends Parameter {
    constructor(node, label, start_c_str) {
        super(node, label)
        this.v = ColorPicker.parse_hex(start_c_str)
    }
    save() { return (this.v !== null) ? this.v.hex : null }
    load(v) { this.v = ColorPicker.parse_hex(v) }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        let [v, elem] = add_param_color(this.line_elem, this.v, 'param_input', (v)=>{ 
            if (this.v !== null && this.v.hex == v.hex) 
                return;
            if (v === null)
                this.v = null
            else
                this.v = v.copy() // make a copy so that this.v will be different object than the internal object
            this.pset_dirty()
        })
        this.v = v
    }
}

function toFixedMag(f) {
    if (Math.abs(f) < 1e-13)
        return "0"
    let af = Math.min(Math.round(Math.log10(Math.abs(f)))-2, -3)
    return f.toFixed(-af)
}


class ParamTransform extends Parameter {
    constructor(node, label) {
        super(node, label)
        this.translate = vec2.fromValues(0,0)
        this.rotate = 0
        this.scale = vec2.fromValues(1,1)
        this.v = mat3.create()
        
        this.elems = {tx:null, ty:null, r:null, sx:null, sy:null }
        this.dial = null
    }
    save() { return {t:this.translate, r:this.rotate, s:this.scale} }
    load(v) { this.translate[0] = v.t[0]; this.translate[1] = v.t[1]; this.rotate = v.r; this.scale[0] = v.s[0]; this.scale[1] = v.s[1]; this.calc_mat() }
    calc_mat() {
        mat3.identity(this.v)
        mat3.translate(this.v, this.v, this.translate)
        mat3.rotate(this.v, this.v, glm.toRadian(this.rotate))
        mat3.scale(this.v, this.v, this.scale)
        this.pset_dirty()
    }
    add_elems(parent) {  // TBD support enable
        add_elem(parent, "hr", "param_separator")
        let line1 = add_param_line(parent)
        add_param_label(line1, "Translate")
        this.elems.tx = add_param_edit(line1, this.translate[0], ED_FLOAT, (v)=>{ this.translate[0] = parseFloat(v); this.calc_mat() })
        this.elems.ty = add_param_edit(line1, this.translate[1], ED_FLOAT, (v)=>{ this.translate[1] = parseFloat(v); this.calc_mat()})
        let line2 = add_param_line(parent)
        add_param_label(line2, "Rotate")
        this.elems.r = add_param_edit(line2, this.rotate, ED_FLOAT, (v)=>{ this.rotate = parseFloat(v); this.calc_mat()})
        let line3 = add_param_line(parent)
        add_param_label(line3, "Scale")
        this.elems.sx = add_param_edit(line3, this.scale[0], ED_FLOAT, (v)=>{ this.scale[0] = parseFloat(v); this.calc_mat()})
        this.elems.sy = add_param_edit(line3, this.scale[1], ED_FLOAT, (v)=>{ this.scale[1] = parseFloat(v); this.calc_mat()})
    }
    repaint_elems() {
        if (this.elems.tx === null) // not displayed yet
            return
        this.elems.tx.value = toFixedMag(this.translate[0])
        this.elems.ty.value = toFixedMag(this.translate[1])
        this.elems.r.value = toFixedMag(this.rotate)
        this.elems.sx.value = toFixedMag(this.scale[0])
        this.elems.sy.value = toFixedMag(this.scale[1])
    }
    move(dx, dy) {
        this.translate[0] += dx; 
        this.translate[1] += dy; 
        this.calc_mat(); 
        this.repaint_elems()
    }
    do_rotate(d_angle) {
        this.rotate += d_angle;
        if (this.rotate > 360)  this.rotate -= 360
        if (this.rotate < 0) this.rotate += 360
        this.calc_mat(); 
        this.repaint_elems()
    }
    set_scale(sx, sy) {
        this.scale[0] = sx
        this.scale[1] = sy
        this.calc_mat(); 
        this.repaint_elems()
    }
    draw_dial(cx, cy) {
        if (this.dial === null)
            this.dial = new TransformDial(this)
        this.dial.set_center(cx, cy)
        this.dial.draw()
        return this.dial
    }
    draw_dial_at_obj(obj, m) {
        if (obj === null)
            return // might be it's not connected so it doesn't have output
        let bbox = obj.get_bbox()
        let center = vec2.fromValues((bbox.min_x + bbox.max_x) * 0.5, (bbox.min_y + bbox.max_y) * 0.5)
        vec2.transformMat3(center, center, m)
        this.draw_dial(center[0], center[1])        
    }
}

class DialMoveHandle {
    constructor(param, do_x, do_y) {
        this.param = param
        this.do_x = do_x; this.do_y = do_y
    }
    mousedown() {}
    mouseup() {}
    mousemove(dx,dy, vx,vy, ex,ey) {
        dx /= image_view.viewport_zoom
        dy /= image_view.viewport_zoom        
        this.param.move(this.do_x ? dx : 0, this.do_y ? dy: 0)
        trigger_frame_draw(true)
    }
}

class DialRotHandle {
    constructor(param, cx,cy) {
        this.param = param
        this.cx = cx; this.cy = cy
    }
    mousedown(e, vx,vy) {
        this.prev_angle = Math.atan2(vy-this.cy, vx-this.cx) * 180 / Math.PI
        //console.log("start-angle", this.start_angle)
    }
    mouseup() {}
    mousemove(dx,dy, vx,vy, ex,ey) {
        let angle = Math.atan2(vy-this.cy, vx-this.cx) * 180 / Math.PI
        let d_angle = angle - this.prev_angle
        if (d_angle > 180) d_angle -= 360
        if (d_angle < -180) d_angle += 360
        //console.log("angle", angle - this.prev_angle)
        this.param.do_rotate(d_angle)
        this.prev_angle = angle
        trigger_frame_draw(true)
    }
}

function closed_line(ctx, ln) {
    ctx.moveTo(ln[0], ln[1])
    for(let i = 2; i < ln.length; i += 2)
        ctx.lineTo(ln[i], ln[i+1])
    ctx.lineTo(ln[0], ln[1])
}

const SQ_HALF = 0.70710678118

class TransformDial {
    constructor(param, move_rect) {
        this.param = param
        this.cx = null; this.cy = null
    }
    set_center(cx, cy) { 
        this.cx = cx; this.cy = cy
        this.mv = {x:cx - 20, y:cy - 20, w:40, h:40}
        // up arrow
        this.uab = {x:this.cx-8, y:this.cy-25, bw:16, bh:20, tw:10, th:40} // bw=baseWidth, bh=baseHeight, tw=topWidth, th=topHeight
        // right arrow
        this.rab = {x:this.cx+25, y:this.cy-8, bw:16, bh:20, tw:10, th:40}
        this.rot = {r0:60, r1:75, a0:-0.4*Math.PI, a1:-0.1*Math.PI}
    }
    find_obj(ex, ey) { // event coords
        let mv = this.mv, uab = this.uab, rab = this.rab, rot=this.rot
        if (ex >= mv.x && ey >= mv.y && ex <= mv.x + mv.w && ey <= mv.y + mv.h)
            return new DialMoveHandle(this.param, true, true)
        if (ex >= uab.x && ex <= uab.x+uab.bw && ey >= uab.y-uab.th && ey <= uab.y)
            return new DialMoveHandle(this.param, false, true)
        if (ex >= rab.x && ex < rab.x+rab.th && ey >= rab.y && ey <= rab.y+rab.bw)
            return new DialMoveHandle(this.param, true, false)
        let tcx = ex-this.cx, tcy = ey-this.cy
        let de = Math.sqrt(tcx*tcx + tcy*tcy), ang = Math.atan2(ey-this.cy, ex-this.cx)
        if (de >= rot.r0 && de <= rot.r1 && ang >= rot.a0 && ang <= rot.a1)
            return new DialRotHandle(this.param, this.cx, this.cy)
        return null
    }
    draw() {
        ctx_img.beginPath()
        // square
        let mv = this.mv, uab = this.uab, rab = this.rab, rot=this.rot
        closed_line(ctx_img, [mv.x,mv.y, mv.x+mv.w,mv.y, mv.x+mv.w,mv.y+mv.h, mv.x,mv.y+mv.h])
        // up arrow
        closed_line(ctx_img, [uab.x,uab.y, uab.x,uab.y-uab.bh, uab.x-uab.tw,uab.y-uab.bh, this.cx,uab.y-uab.th,
                              uab.x+uab.tw+uab.bw,uab.y-uab.bh, uab.x+uab.bw,uab.y-uab.bh, uab.x+uab.bw,uab.y])
        // right arrow
        closed_line(ctx_img, [rab.x,rab.y, rab.x+rab.bh,rab.y, rab.x+rab.bh,rab.y-rab.tw, rab.x+rab.th,this.cy,
                              rab.x+rab.bh,rab.y+rab.tw+rab.bw, rab.x+rab.bh,rab.y+rab.bw, rab.x,rab.y+rab.bw])
        // rotate circle
        ctx_img.moveTo(this.cx+rot.r1*Math.cos(rot.a0),this.cy+rot.r1*Math.sin(rot.a0))
        ctx_img.arc(this.cx,this.cy, rot.r0, rot.a0, rot.a1)
        ctx_img.arc(this.cx,this.cy, rot.r1, rot.a1, rot.a0, true)

        ctx_img.strokeStyle = '#ffff00'
        ctx_img.lineWidth = 3
        ctx_img.stroke()
        ctx_img.lineWidth = 1
        ctx_img.strokeStyle = '#ff0000'
        ctx_img.stroke()
    }
}

function cull_list(lst) {
    let newlst = new lst.constructor()
    for(let v of lst) 
        if (v !== undefined)
            newlst.push(v) // don't want a list with holes    
    return newlst
}

class ListParam extends Parameter {
    constructor(node, label, values_per_entry, in_table, lst_type, elem_prm) {
        super(node, label)
        this.elem_prm = elem_prm
        this.values_per_entry = values_per_entry
        this.lst_type = lst_type
        this.lst = new lst_type()  // flat list
        this.elem_lst = []
        this.table = in_table
        this.column = in_table.register(this)  // columns are vertical, rows are horizontal
    }
    add_elems(parent) {}
    save() { return {lst:this.lst} }
    load(v) { this.lst = new this.lst_type(v.lst) }

    add(v) { // for multiple lists in a table, needs to be called in the right order of the columns
        let av = v
        if (v.length === undefined)  // support single value and list of values for vec
            av = [v]
        console.assert(av.length == this.values_per_entry, "Unexpected number of values")
        let newlst = new this.lst_type(this.lst.length + av.length)
        newlst.set(this.lst)
        newlst.set(av, this.lst.length)
        this.lst = newlst
        this.pset_dirty(this.table === null) // if we're in a table, don't draw yet since not all the columns are set

        let vindex = (this.lst.length - this.values_per_entry)
        this.create_entry_elems(v, this.table.get_column_elem(this.column), vindex)
    }

    for_values(func) {
        for(let vindex = 0; vindex < this.lst.length; vindex += this.values_per_entry) {
            let v = []
            if (this.values_per_entry > 1)
                for(let vi = 0; vi < this.values_per_entry; ++vi)
                    v[vi] = this.lst[vindex + vi]            
            else
                v = this.lst[vindex]
            func(v, vindex)
        }
    }
    add_column_elems(column_elem) {
        this.elem_lst = []
        this.for_values((v, vindex)=>{ this.create_entry_elems(v, column_elem, vindex) })
    }

    create_entry_elems(v, parent, vindex) {
        let e
        if (this.elem_prm.create_elem !== undefined) {
            e = this.elem_prm.create_elem(parent, v, (v) => {
                // change that come from the input element in the list
                console.assert(v.length == this.values_per_entry, "unexpected length of value")
                for(let vi = 0; vi < this.values_per_entry; ++vi)
                    this.lst[vindex + vi] = v[vi]
                this.pset_dirty()
                trigger_frame_draw(true)
            })
        }
        else {
            let clss = this.elem_prm.get_clss ? this.elem_prm.get_clss(vindex / this.values_per_entry) : [this.elem_prm.cls]
            e = create_div(clss)
            e.innerText = this.elem_prm.to_string(v)
            parent.appendChild(e)
        }
        this.elem_lst.push(e)
        return e
    }    

    remove(index_lst) { // need to remove a list since the indices will change if we remove one by one
        let tmplst = Array.from(this.lst) // for removing put it in a normal array (can't remove from typed array or set to undefined in there)
        let tmplen = tmplst.length
        for(let index of index_lst) {
            let vindex = index * this.values_per_entry
            console.assert(vindex < this.lst.length, "remove out of range")
            for(let i = 0; i < this.values_per_entry; ++i)
                delete tmplst[vindex+i]
            tmplen -= this.values_per_entry
            this.elem_lst[index].remove() // remove from DOM tree
            delete this.elem_lst[index]  // make it undefined for later cull
        }

        this.lst = new this.lst.constructor(tmplen)
        let addi = 0
        for(let v of tmplst) 
            if (v !== undefined)
                this.lst[addi++] = v
        this.pset_dirty()

        this.elem_lst = cull_list(this.elem_lst)
        console.assert(this.lst.length == this.elem_lst.length * this.values_per_entry, "unexpected number of elements")
    }

    reprint_line(vidx, v) {
        let idx = vidx / this.values_per_entry
        let elem = this.elem_lst[idx]
        if (this.elem_prm.get_clss)
            elem.classList = this.elem_prm.get_clss(idx).join(" ")
        elem.innerText = this.elem_prm.to_string(v)
    }

    reprint_all_lines() {
        this.for_values((v, vindex)=>{ this.reprint_line(vindex, v) })
    }

    // for changes that come from user interaction in the image_canvas
    modify(index, v) { // index is already multiplied by values_per_entry
        console.assert(v.length == this.values_per_entry, "Unexpected number of values")
        let vindex = index * this.values_per_entry
        console.assert(vindex < this.lst.length, "modify out of range")
        for(let vi = 0; vi < v.length; ++vi)
            this.lst[vindex + vi] = v[vi]
        this.pset_dirty()
        this.reprint_line(vindex, v)
    }
    increment(index, v) {
        console.assert(v.length == this.values_per_entry, "Unexpected number of values")
        let vindex = index * this.values_per_entry
        console.assert(vindex < this.lst.length, "modify out of range")
        for(let vi = 0; vi < v.length; ++vi) {
            this.lst[vindex + vi] += v[vi]
        }
        this.pset_dirty()
        this.reprint_line(vindex, this.lst.slice(vindex, vindex + this.values_per_entry))
    }    
}

class ParamTable extends Parameter {
    constructor(node, label) {
        super(node, label)
        this.list_params = []  // registered ListParams
        //this.elem_rows = []  // entire row div
        this.elem_cols = []
    }
    register(list_param) {
        this.list_params.push(list_param)
        return this.list_params.length - 1
    }
    get_column_elem(column) {
        console.assert(column <= this.elem_cols.length, "column index too high")
        return this.elem_cols[column]
    }
    save() { return null }
    load(v) { }

    add_elems(parent) {
        this.line_elem = add_param_block(parent)
        this.label_elem = add_div(this.line_elem, "param_list_title")
        this.label_elem.innerText = this.label + ":"

        this.table_elem = add_div(this.line_elem)

        this.elem_cols = []

        for(let lst_prm of this.list_params) {
            let column = add_div(this.table_elem, "param_table_column")
            this.elem_cols.push(column)
            lst_prm.add_column_elems(column)
            let grip = add_div(column, "param_table_grip")
            add_grip_handlers(grip, column)
        }
    }
}


function add_grip_handlers(grip, cell) {
    var moving = false;
    var startOffset;
    var column_width;

    grip.addEventListener('mousedown', function(e) {
        moving = true;
        startOffset = parseFloat(window.getComputedStyle(cell)["width"]) - e.pageX;
    });
    document.addEventListener('mousemove', function(e) {
      if (moving) {
            column_width = startOffset + e.pageX
            cell.style.width = column_width + "px"
            e.preventDefault(); // prevent selection action from messing it up
      }
    });
    document.addEventListener('mouseup', function() {
        moving = false;
    });
}


class ParamTextBlock extends Parameter 
{
    constructor(node, label) {
        super(node, label)
        this.dlg = null
        this.dlg_elem = null
        this.text_input = null
        this.dlg_rect = null
        this.text = ""
        node.rename_observers.push((name)=>{
            this.dlg.set_title(this.title())
        })
    }
    save() { return { dlg_rect: this.dlg_rect, text:this.text } }
    load(v) { this.text = v.text; this.dlg_rect = v.dlg_rect; }
    
    title() { return this.owner.name + " - " + this.label }
    set_text(v) { this.text = v; this.pset_dirty() }

    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        this.dlg = create_dialog(parent, this.title(), true, this.dlg_rect, (visible)=>{ edit_btn.checked = visible })
        this.dlg_elem = this.dlg.elem, this.dlg_rect = this.dlg.rect
        let [edit_btn, edit_disp] = add_checkbox_btn(this.line_elem, "Edit...", this.dlg.rect.visible, this.dlg.set_visible)

        this.text_input = add_elem(this.dlg_elem, "textarea", "param_text_area")
        this.text_input.spellcheck = false
        this.text_input.value = this.text
        this.text_input.addEventListener("input", ()=>{ this.text = this.text_input.value; this.pset_dirty() }) // TBD save and trigger draw after timeout
        //this.text_input.value = this.text        
    }
}

class ParamSelect extends Parameter
{
    constructor(node, label, selected_idx, opts) {
        super(node, label)
        this.opts = opts
        this.sel_idx = selected_idx
    }
    save() { return { sel_str: this.opts[this.sel_idx] } }
    load(v) { this.sel_idx = this.opts.indexOf(v.sel_str); }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        add_combobox(this.line_elem, this.opts, this.sel_idx, (v)=>{ this.sel_idx = v; this.pset_dirty() })
    }
}

class ParamFileUpload extends Parameter
{
    constructor(node, label) {
        super(node, label)
        this.file = null // file from file input, null if file came from a url
        this.remote_url = null
        this.remote_url_elem = null
        this.upload_progress_elem = null
    }
    save() { return {rurl:this.remote_url} }
    load(v) { 
        this.remote_url = v.rurl 
        if (this.remote_url !== null && this.remote_url.trim() != "")
            this.load_url(this.remote_url)
    }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        let fin = add_elem(this.line_elem, "input", "param_file_input")
        fin.type = "file"
        fin.id = "p_fl_" + g_input_ids++
        let btn = add_elem(this.line_elem, "label", ["param_btn", "param_file_choose_btn"])
        btn.innerText = "Choose File..."
        btn.setAttribute("for", fin.id)
        fin.addEventListener("change", ()=>{ 
            this.file = fin.files[0]
            fin.value = "" // make the input forget about this file so that the same filename can be uploaded again
            filename_show.textContent = this.file.name 
            this.read_file(this.file, true, (file, url)=>{ this.load_url(url) })
            upload_btn.style.display = ""
            // pset_dirty() done only when everything is loaded
        })
        let upload_btn = add_push_btn(this.line_elem, "Upload", ()=>{ // onclick 
            this.read_file(this.file, false, (file, data)=> { this.upload_to_imgur(file, data)} ) 
        })
        let show_div = add_div(this.line_elem, "param_file_show_parent")
        let filename_show = add_div(show_div, "param_file_show")
        if (this.file !== null)
            filename_show.textContent = this.file.name
        else
            upload_btn.style.display = "none"
        this.upload_progress_elem = add_elem(show_div, "progress", "param_file_progress")
        this.upload_progress_elem.max = 100
        this.upload_progress_elem.value = 0

        let line2_elem = add_param_line(parent)
        add_param_label(line2_elem, "Url")
        this.remote_url_elem = add_param_edit(line2_elem, this.remote_url, ED_STR, (v)=>{ 
            this.remote_url = v; 
            this.file = null // the file in the file input is no longer relevant if we changed the url manually
            this.filename_show = ""
            this.load_url(v) 
        })
        this.remote_url_elem.classList.add("param_input_long")
    }

    read_file(file, asurl, onload) {
        let reader = new FileReader();
        reader.onload = (e)=>{
            onload(file, e.target.result)
        }
        reader.onerror = (e)=>{
            console.error(e)
        }
        if (asurl)
            reader.readAsDataURL(file);
        else
            reader.readAsArrayBuffer(file)
    }

    upload_to_imgur(file, data) {
        var req = new XMLHttpRequest();
        
        req.onload = ()=>{
            console.log(req.responseText)
            var re = JSON.parse(req.responseText)
            if (re.success != true || re.status != 200) {
                console.error("Failed upload, " + re.status)
                return
            }
            this.remote_url = re.data.link
            this.remote_url_elem.value = this.remote_url
            this.upload_progress_elem.style.display = "none"
            save_state()
        }
        req.onprogress = (e)=>{
            if (e.total == 0)
                return
            var percentComplete = (e.loaded / e.total)*100; 
            this.upload_progress_elem.value = percentComplete
        }
        if (req.upload) // in chrome there's a different progress listener
            req.upload.onprogress = req.onprogress
        req.onerror = (e)=>{
            console.error(e)
            this.upload_progress_elem.style.display = "none"
        }
    
        this.upload_progress_elem.value = 0
        this.upload_progress_elem.style.display = "initial"

        req.open("POST", 'https://api.imgur.com/3/image', true)
        req.setRequestHeader("Authorization", "Client-ID 559401233d3e1e6")
        req.setRequestHeader("Accept", 'application/json')
        req.setRequestHeader("Content-Type", file.type)
        req.send(data)
    }
    
}


class ParamImageUpload extends ParamFileUpload
{
    constructor(node, label) {
        super(node, label)
        this.image = null
        this.last_error = null
    }
    load_url(url) {
        this.last_error = null
        this.image = null
        let newimage = new Image()
        newimage.onload = (e)=>{
            this.image = newimage
            this.pset_dirty()
        }
        newimage.onerror = (e)=>{
            this.last_error = "Failed download image from URL"
            console.error("Failed to download image", e)
            this.pset_dirty() // trigger a draw that will show this error
        }
        newimage.crossOrigin = ''
        newimage.src = url        
    }

    get_image() {
        if (this.image === null && this.last_error !== null)
            assert(false, this.owner.cls, this.last_error)
        return this.image
    }
}

// not really a parameter that holds a value. it's a button that shows in the parameters panel
class ParamButton extends Parameter 
{
    constructor(node, label, onclick) {
        super(node, label)
        this.onclick = onclick
    }
    save() { return null }
    load(v) { }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        add_param_label(this.line_elem, null)  // empty space
        add_push_btn(this.line_elem, this.label, this.onclick)
    }
}