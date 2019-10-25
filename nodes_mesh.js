"use strict"

class NodeCls {
    constructor(node) {
        this.error = null
        this.node = node
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
}


class NodeTestDummy extends NodeCls {
    static name() { return "Test_Dummy" }
    constructor(node) {
        super(node)
        this.in_1 = new InTerminal(node, "in_1")
        this.in_2 = new InTerminal(node, "in_2")
        this.out = new OutTerminal(node, "out")
    }
}


class NodeGeomPrimitive extends NodeCls
{
    static name() { return "Geom_Primitive" }
    constructor(node) {
        super(node)
        this.out = new OutTerminal(node, "out_mesh")
        this.size = new ParamVec2(node, "Size", 0.5, 0.5)
        this.transform = new ParamTransform(node, "Transform")
    }
    run() {
        let mesh = new Mesh()
        // center at 0,0
        let hx = this.size.x * 0.5, hy = this.size.y * 0.5
        mesh.set('vtx_pos', new TVtxArr([-hx, -hy, hx, -hy, hx, hy, -hx, hy]), 2)
        mesh.set('idx', new TIdxArr([0, 1, 2, 3]))
        mesh.set_type(MESH_QUAD)
        mesh.transform(this.transform.v)
        this.out.set(mesh)
    }
    draw_selection(m) {
        let outmesh = this.out.get_const()
        dassert(outmesh !== null, "No output object to select")
        this.transform.draw_dial_at_obj(outmesh, m)
    }    
    image_find_obj(vx, vy, ex, ey) {
        return this.transform.dial.find_obj(ex, ey)
    }
}

class PointSelectHandle
{
    constructor(list_param, index, ofnode) {
        this.list_param = list_param
        this.index = index
        this.ofnode = ofnode
        // TBD add offset
    }
    mousedown() {
        this.ofnode.set_selection(this.index) 
        trigger_frame_draw(false)
    }
    mouseup() {}
    mousemove(dx,dy, vx,vy, ex,ey) {
        this.ofnode.move_selection(dx, dy)
    }
}

class ParamCoordList extends ListParam {
    constructor(node, label, table, selected_indices) {
        super(node, label, 2, table, TVtxArr, {cls:"param_monospace", to_string: (v)=>{ 
            return "(" + v[0].toFixed(3) + "," + v[1].toFixed(3) + ")" 
        }, 
        get_clss: (index)=>{
            let r = ["param_monospace"]
            if (selected_indices.indexOf(index) != -1)
                r.push("param_list_selected_line")
            return r
        }
        })
        this.need_normalize = false  // not really needed for coordinates but just for remembering
    }
    def_value() { return [0,0] }
}
class ParamFloatList extends ListParam {
    constructor(node, label, table) {
        super(node, label, 1, table, Float32Array, { cls:"param_monospace", to_string: function(v) { 
            return v.toFixed(3)
        }})
        this.need_normalize = false
    }
    def_value() { return 0; }
}

function uint8arr_to_color(arr) {
    return {r:arr[0], g:arr[1], b:arr[2], alpha:arr[3]/255}
}
function color_to_uint8arr(c) {
    return [c.r, c.g, c.b, c.alpha*255]
}
class ParamColorList extends ListParam {
    constructor(node, label, table) {
        super(node, label, 4, table, TColorArr, { create_elem: function(parent, start_val, changed_func) { 
            let [col,elem,ce] = add_param_color(parent, uint8arr_to_color(start_val), "param_table_input_color", function(c) {
                changed_func(color_to_uint8arr(c))
            })
            return elem
        }})
        this.need_normalize = true
    }
    def_value() { return [0xcc, 0xcc, 0xcc, 0xff] }
}

class PathCmdsList extends Parameter {
    constructor(node) {
        super(node, "cmds")
        this.lst = []
    }
    save() { return {lst:this.lst} }
    load(v) { this.lst = v.lst } // always a plain list
    add(v) {
        this.lst.push(v)
        this.pset_dirty()
    }
    add_default() {
        let cmd = 'L'
        if (this.lst.length == 0)
            cmd = 'M'
        else {
            let last_cmd = this.lst[this.lst.length - 1]
            if (last_cmd[last_cmd.length - 1] == 'Z')
                cmd = 'M'
        }
        this.add([cmd])
    }
    close_current(clicked_index) {
        if (this.lst[clicked_index][0] != 'M')
            return false// clicked something that is not a start of a poly
        // go backwards to see if the clicked point is actually the first point of the poly we're currently doing
        for(let i = this.lst.length-1; i > clicked_index; --i) {
            if (this.lst[i] == 'M')
                return false// found another M that is not clicked_index
        }
        
        let last_cmd = this.lst[this.lst.length-1]
        if (last_cmd[last_cmd.length - 1] !== 'Z') {// already closed?
            last_cmd.push('Z')
            this.pset_dirty()
        }
        return true // managed to close
    }
    remove(indices) {
        for(let index in indices)
            delete this.lst[index]
    }
    add_elems(parent) {}
}

class NodeManualGeom extends NodeCls
{
    static name() { return "Manual Geometry" }
    constructor(node) {
        super(node)
        this.selected_indices = [] // point indices. DO NOT RECREATE THIS. a reference of it goes to this.points

        this.out = new OutTerminal(node, "out_mesh")
        this.geom_type = new ParamSelect(node, "Type", 0, ["Mesh", "Paths"])
        this.add_pnts_btn = new ParamBool(node, "Add points", true, null)
        this.add_pnts_btn.display_as_btn(true)
        this.table = new ParamTable(node, "Point List")
        this.points = new ParamCoordList(node, "Coord", this.table, this.selected_indices)
        this.dummy = new ParamFloatList(node, "Dummy", this.table)
        this.color = new ParamColorList(node, "Point Color", this.table)
        this.cmds = new PathCmdsList(node) // not shown

        this.pnt_attrs = [this.dummy, this.color]  // Param objets of additional attributes of each point other than it's coordinate
        this.rect_elem = null // rect selection DOM elem if one is active
    }
    image_click(ex, ey) {
        if (!this.add_pnts_btn.v)
            return
        let ti = image_view.epnt_to_model(ex, ey)
        this.points.add(ti)
        for(let attr_param of this.pnt_attrs) {
            attr_param.add(attr_param.def_value())
        }

        this.cmds.add_default() // do this anyway just to keep it simple, not much of an overhead

        trigger_frame_draw(true)
    }

    move_selection(dx, dy) {
        dx /= image_view.viewport_zoom
        dy /= image_view.viewport_zoom
        for(let idx of this.selected_indices)
            this.points.increment(idx, [dx, dy])
        trigger_frame_draw(true)
    }
    clear_selection() {
        this.selected_indices.length = 0 // don't recreate the array since there's reference from the CoordListParam
        trigger_frame_draw(false)
        this.points.reprint_all_lines()
    }
    set_selection(idx) {
        if (this.add_pnts_btn.v && this.geom_type.sel_idx == 1) {
            // when adding points to path, instead of select, close the path
            if (this.cmds.close_current(idx)) {
                trigger_frame_draw(true)
                return
            } // if didn't close, select?
        }
        // change the selection only if we just clicked an unselected point
        // otherwise we might be trying to move a selected group of points
        if (!this.selected_indices.includes(idx)) {
            this.selected_indices.length = 0
            this.selected_indices.push(idx)    
        }
        this.points.reprint_all_lines() // mark with yellow the selected
    }
    selected_obj_name() { return (this.selected_indices.length > 0) ? "points" : null }
    delete_selection() {
        this.points.remove(this.selected_indices)
        for(let attr_param of this.pnt_attrs) {
            attr_param.remove(this.selected_indices)
        }
        this.cmds.remove(this.selected_indices)
        this.clear_selection()
        trigger_frame_draw(true)
    }
    // API
    image_find_obj(vx, vy, ex, ey) {
        let [x,y] = image_view.epnt_to_model(ex, ey)
        let lst = this.points.lst
        let r = Math.max(7, MESH_DISP.vtx_radius) / image_view.viewport_zoom// if the disp radius gets lower, we still want it at reasonable value
        for(let i = 0; i < lst.length; i += 2) {
            if (m_dist(lst[i], lst[i+1], x, y) < r) {
                return new PointSelectHandle(this.points, i/2, this)
            }
        }
        return null
    }
    rect_select(min_ex, min_ey, max_ex, max_ey) {
        if (min_ex === undefined) { // indicates it needs to be cleared
            main_view.removeChild(this.rect_elem)
            this.rect_elem = null
            return;
        }
        let [min_x,min_y] = image_view.epnt_to_model(min_ex, min_ey)
        let [max_x,max_y] = image_view.epnt_to_model(max_ex, max_ey)
        let lst = this.points.lst
        this.selected_indices.length = 0
        for(let i = 0; i < lst.length; i += 2) {
            let x = lst[i], y = lst[i+1]
            if (x > min_x && x < max_x && y > min_y && y < max_y) {
                this.selected_indices.push(i/2)
            }
        }
        if (this.rect_elem === null) {
            this.rect_elem = add_div(main_view, "selection_rect")
        }
        this.rect_elem.style.left = min_ex + "px"
        this.rect_elem.style.top = min_ey + "px"
        this.rect_elem.style.width = (max_ex - min_ex) + "px"
        this.rect_elem.style.height = (max_ey - min_ey) + "px"
        trigger_frame_draw(false)
        this.points.reprint_all_lines() // re-mark yellows
    }
    // API
    run() {
        let obj
        if (this.geom_type.sel_idx == 0) // mesh
        {
            obj = new Mesh()
        }
        else if (this.geom_type.sel_idx == 1) // paths
        {
            obj = new MultiPath()
            if (this.points.lst.length > 0) {
                let cur_path = []
                for(let i = 0; i < this.cmds.lst.length; ++i) {
                    let cmd = this.cmds.lst[i]
                    cur_path.push(cmd[0], i)
                    for(let j = 1; j < cmd.length; ++j) // rest of the cmd
                        cur_path.push(cmd[j])
                    if (cmd[cmd.length-1] == 'Z') { // path ends
                        obj.add_path(cur_path)
                        cur_path = []
                    }
                }
                obj.add_path(cur_path)
            }
        }
        else {
            assert(false, this, "unexpected type")
        }

        obj.set('vtx_pos', this.points.lst, 2)
        for (let attr of this.pnt_attrs) {
            obj.set(attr.label, attr.lst, attr.values_per_entry, attr.need_normalize)
        }
        this.out.set(obj)
    }
    draw_selection(m) {
        let mesh = this.out.get_const()
        dassert(mesh !== null, "No output object to select") // might be it's not connected so it doesn't have output
        mesh.draw_selection(m, this.selected_indices)
    }
}


class ObjRef { // top level variable that references an object
    constructor(name) {
        this.name = name
        this.obj = null
        this.idx = null
        this.dirty_obj_ver = 1 // incremented evaluator needs to invalidation anything it cached about the object
    }
    dyn_set_obj(obj) {
        this.obj = obj
        ++this.dirty_obj_ver;
    }
    dyn_set_prop_index(idx) { // for mesh objects
        this.idx = idx
    }       
}
class ObjSubscriptEvaluator {
    constructor(objref, subscripts) {
        if (subscripts.length != 1)
            throw new Error("Wrong subscript given to variable " + name)
        this.objref = objref
        this.subscript = subscripts[0]
    }

    eval() {
        let v = this.objref.obj[this.subscript]
        eassert(v !== undefined, "subscript not found " + this.subscript)        
        return v
    }
}

const VAL_INDICES = { r:0, g:1, b:2, alpha:3, x:0, y:1, z:2, w:3, index:-1 } // TBD add HSV 
class MeshPropEvaluator {
    constructor(meshref, subscripts, param_bind_to) {
        console.assert(meshref !== undefined  && meshref !== null)
        eassert(subscripts.length == 2 || subscripts.length == 1, "Not enough subscript given to variable " + name)
        this.meshref = meshref
        this.attrname = subscripts[0]
        this.param_bind_to = param_bind_to
        this.valname = (subscripts.length == 2) ? subscripts[1] : null
        this.valindex = (this.valname !== null) ? VAL_INDICES[this.valname] : 0
        eassert(this.valindex !== undefined, "Unknown subscript `" + this.valname + "`")
        // idx is in meshref not multiplied for any property
        this.attr = null
        this.num_elems = null
        this.last_obj_ver = 0
    }

    eval() {
        if (this.attr === null || this.last_obj_ver != this.meshref.dirty_obj_ver) {
            eassert(this.meshref.obj !== null, "unexpecrted null mesh")
            eassert(this.meshref.idx !== null, "unexpecrted null mesh")
            if (this.param_bind_to.sel_idx == 0) // vertices
                eassert(this.attrname.startsWith("vtx"), "bind to Vertices can only sample vertex attribute")
            else if (this.param_bind_to.sel_idx == 1) // faces
                eassert(this.attrname.startsWith("face"), "bind to Faces can only sample face attribute")
            let attr = this.meshref.obj.arrs[this.attrname]
            eassert(attr !== undefined, "unknown attribute " + this.attrname + " of mesh")
            this.num_elems = this.meshref.obj.meta[this.attrname].num_elems
            if (this.num_elems == 1)
                eassert(this.valname === null, "unexpected additional subscript to value")
            else 
                eassert(this.valname !== null, "missing addtitional subscript to select a value")
            this.attr = attr
            this.last_obj_ver = this.meshref.dirty_obj_ver
        }
        if (this.valindex == -1)
            return this.meshref.idx
        return this.attr[this.meshref.idx * this.num_elems + this.valindex]
    }
}

class NodeSetAttr extends NodeCls
{
    static name() { return "Set Attribute" }
    constructor(node) {
        super(node)
        this.in_mesh = new InTerminal(node, "in_mesh")
        this.in_source = new InTerminal(node, "in_src") // future - may not be an image? proximity to other mesh?
        this.out_mesh = new OutTerminal(node, "out_mesh")

        //this.use_code = new ParamBool(node, "Use Code", false, (v)=>{})
        this.bind_to = new ParamSelect(node, "Bind To", 0, ["Vertices", "Faces"]) // TBD also lines?
        this.attr_name = new ParamStr(node, "Name", "color")
        this.attr_type = new ParamSelect(node, "Type", 0, ["Color", "Float", "Float2"], (v)=>{
            this.expr_color.set_visible(v == 0)
            this.expr_float.set_visible(v == 1)
            this.expr_vec2.set_visible(v == 2)
        })
        this.expr_color = new ParamColor(node, "Color", "#cccccc")
        this.expr_float = new ParamFloat(node, "Float", 0)
        this.expr_vec2 = new ParamVec2(node, "Float2", 0, 0, true)
        //this.expr_code = new ParamCode(node, "Code")

        // node says what evaluators it wants for its inputs
        node.set_state_evaluators({"in_src":  (m,s)=>{ return new ObjSubscriptEvaluator(m,s) }, 
                                   "in_mesh": (m,s)=>{ return new MeshPropEvaluator(m,s, this.bind_to) }})
    }

    prop_from_const(prop, src) {
        if (this.attr_type.sel_idx == 0) {
            let col = src.v
            for(let i = 0; i < prop.length; i += prop.elem_sz) {
                prop[i] = col.r
                prop[i+1] = col.g
                prop[i+2] = col.b
                prop[i+3] = col.alphai // normalized back to 0-1 in mesh draw
            }
        }
        else if (this.attr_type.sel_idx == 1) {
            for(let i = 0; i < prop.length; i += prop.elem_sz) {
                prop[i] = src.v
            }
        }
        else if (this.attr_type.sel_idx == 2) {
            for(let i = 0; i < prop.length; i += prop.elem_sz) {
                prop[i] = src.x
                prop[i+1] = src.y
            }
        }
    }

    prop_from_mesh_attr(prop, value_need_mesh, src_param) 
    {
        for(let i = 0, pi = 0; pi < prop.length; ++i, pi += prop.elem_sz) 
        {
            value_need_mesh.dyn_set_prop_index(i)
            for(let si = 0; si < prop.elem_sz; ++si) {
                prop[pi+si] = src_param.dyn_eval(si) 
            }
        }
    }

    prop_from_input_framebuffer(prop, mesh, src, value_need_src, value_need_mesh, src_param, transform, fb_viewport) 
    {
        mesh.ensure_tcache(transform)
        let vtx = mesh.tcache.vtx_pos

        // see https://www.khronos.org/opengl/wiki/Vertex_Post-Processing#Viewport_transform
        // from Xw = (w/2)*Xp + (w/2) 
        let w = src.width(), h = src.height()
        let wf = w/2
        let hf = src.height()/2
        let pixels = src.get_pixels()

        let samp_vtx = (this.bind_to.sel_idx == 0)
        let face_sz = mesh.face_size()
        let vtxi = 0, idxi = 0
        let expr_input = { r:0, g:0, b:0, alpha:0 }
        value_need_src.dyn_set_obj(expr_input)

        for(let i = 0, pi = 0; pi < prop.length; ++i, pi += prop.elem_sz) 
        {
            let x = 0, y = 0
            if (samp_vtx) {
                x = vtx[vtxi++]
                y = vtx[vtxi++]
            }
            else { // sample at faces, at center of the face (average face points)
                for(let fi = 0; fi < face_sz; ++fi) {
                    let idx = mesh.arrs.idx[idxi++] * 2
                    x += vtx[idx]
                    y += vtx[idx+1]
                }
                x /= face_sz
                y /= face_sz
            }

            if (fb_viewport) {
                x = Math.round(wf*x + wf)
                y = Math.round(hf*y + hf)
            }
            else {
                x = Math.round(x + wf)
                y = Math.round(y + hf)
            }

            if (value_need_mesh !== null)
                value_need_mesh.dyn_set_prop_index(i)
            
            if (x < 0 || y < 0 || x >= w || y >= h) {
                expr_input.r = expr_input.g = expr_input.b = expr_input.alpha = 0
            }
            else {
                let pidx = (y*w + x)*4
                expr_input.r = pixels[pidx]
                expr_input.g = pixels[pidx+1]
                expr_input.b = pixels[pidx+2]
                expr_input.alpha = pixels[pidx+3]
            }

            for(let si = 0; si < prop.elem_sz; ++si) {
                prop[pi+si] = src_param.dyn_eval(si) 
            }
        }
    }

    run() {
        assert(this.bind_to.sel_idx != -1, this, "'Bind To' not set")
        //assert(this.source_sel.sel_idx != -1, this, "'Bind To' not set")
        let mesh = this.in_mesh.get_const()
        assert(mesh, this, "missing in_mesh")

        /*if (this.source_sel.sel_idx == 0 && this.expr_color.v === null) {
            this.out_mesh.set(mesh)
            return // TBD warning
        }*/

        let elem_num, attr_prefix;
        // check that the mesh has face to bind to, otherwise this is a noop
        if (this.bind_to.sel_idx == 1) { 
            elem_num = mesh.face_count()
            if (elem_num == 0) {
                this.out_mesh.set(mesh)
                return  // TBD warning
            }
            attr_prefix = 'face_'
        }
        else {
            elem_num = mesh.vtx_count()
            attr_prefix = 'vtx_'
        }

        let prop, src_param
        if (this.attr_type.sel_idx == 0) { // color
            prop = new TColorArr(elem_num * 4)
            prop.elem_sz = 4
            src_param = this.expr_color
        }
        else if (this.attr_type.sel_idx == 1) { // float
            prop = new Float32Array(elem_num * 1)
            prop.elem_sz = 1
            src_param = this.expr_float
        }
        else if (this.attr_type.sel_idx == 2) { // float2
            prop = new Float32Array(elem_num * 2)
            prop.elem_sz = 2
            src_param = this.expr_vec2
        }
        else {
            assert(false, this, "unknown type")
        }

        assert(!src_param.has_error(), this, "Parameter expression error")
        let value_need_src = src_param.need_input_evaler("in_src")
        let value_need_mesh = src_param.need_input_evaler("in_mesh")
        let need_inputs = value_need_src || value_need_mesh
        
        let src = null
        if (value_need_src !== null) { // make sure we have a src to get the value from
            src = this.in_source.get_const()
            assert(src !== null, this, "missing attribute source")
            assert(src.constructor === FrameBuffer || 
                   src.constructor === PImage, this, "expected FrameBuffer or Image as input")
        }
        if (value_need_mesh !== null) {
            value_need_mesh.dyn_set_obj(mesh)
        }


        // commiting to work
        mesh = this.in_mesh.get_mutable()    

        try {
            if (!need_inputs) { // from const
                this.prop_from_const(prop, src_param)
            }
            else if (value_need_src !== null) { // from img input
                let isfb = (src.constructor === FrameBuffer)
                let transform = mat3.create()
                mat3.invert(transform, src.t_mat) 
                this.prop_from_input_framebuffer(prop, mesh, src, value_need_src, value_need_mesh, src_param, transform, isfb)
            }
            else if (value_need_mesh !== null) {
                this.prop_from_mesh_attr(prop, value_need_mesh, src_param)
            }
        }
        catch(e) {
            if (e instanceof ExprErr) 
                assert(false, this, "Parameter expression error")
            else
                throw e
        }

        mesh.set(attr_prefix + this.attr_name.v, prop, 4, true)
        this.out_mesh.set(mesh)
    }
}

class NodeMeshMerge extends NodeCls
{
    static name() { return "Mesh_Merge" }
    constructor(node) {
        super(node)
        this.in_m = new InTerminalMulti(node, "in_multi_mesh")
        this.out = new OutTerminal(node, "out_mesh")
    }
    run() {
        if (this.in_m.lines.length == 0) {
            this.out.set(new Mesh())
            return
        }
        if (this.in_m.lines.length == 1) {
            this.out.set(this.in_m.lines[0].to_term.v)
            return
        }

        // first calculate the size of the eventual arrays and check type agreement
        let szs = this.in_m.lines[0].to_term.v.get_sizes()
        for(let i = 1; i < this.in_m.lines.length; ++i) {
            let line = this.in_m.lines[i]
            let lm = line.to_term.v.get_size()
            assert(lm.type === szs.type, this, "Input " + i + " has different type from input 0")
            for(let k in m.arrs) {
                if (szs[k] === undefined)
                    szs.arrs[k] = lm.arrs[k]
                else {
                    assert(szs.arrs[k].type === lm.arrs[k].type, "Input " + i + " has wrong data-type of element " + k + " from that of input 0")
                    szs.arrs[k].sz += lm.arrs[k].sz
                }
            }
        }
        // create the arrays
        let r = new Mesh()
        for(let k in szs)
            r.arrs[k] = new szs.arrs[k].type(szs.arrs[k].sz)
        // copy the data TBD

    }
}

// TBD: a slightly better way to do this is to own PHandle and have a custom clone
//      that clones only objects with more than 1 refcount
class PObjGroup extends PObject{
    static name() { return "Group" }
    constructor() {
        super()
        this.v = []
        this.disp_params = []
    }
    transform(m) {
        for(let obj of this.v) {
            obj.transform(m)
        }
    }
    async draw(m, display_values) {
        console.assert(display_values.length == this.v.length, "display_values length mismatch")
        for(let i in this.v) {
            let p = this.v[i].draw(m, display_values[i])
            if (p !== undefined)
                await p
        }
    }
    get_disp_params(values) {
        let r = []
        for(let i in this.v) {
            r.push(this.v[i].get_disp_params(values[i]))
        }
        return r 
    }
}

class NodeGroupObjects extends NodeCls {
    static name() { return "Group_Objects" }
    constructor(node) {
        super(node)
        this.in_m = new InTerminalMulti(node, "in_multi_mesh")
        this.out = new OutTerminal(node, "out_mesh")
        //this.order = new InputOrderParam(node, "Order", this.in_m)
    }
    run() {
        this.node.display_values = []
        let r = new PObjGroup()
        for(let line of this.in_m.lines) {
            let obj = line.to_term.get_const()
            r.v.push(obj)
            // gather the display nodes from the nodes that output the thing
            this.node.display_values.push(line.from_term.owner.display_values) 
        }
        this.out.set(r)
    }
}

// maybe wrap with a proxy?
class NodeTransform extends NodeCls
{
    static name() { return "Transform" }
    constructor(node) {
        super(node)
        this.in = new InTerminal(node, "input")
        this.out = new OutTerminal(node, "output")
        this.transform = new ParamTransform(node, "transform")
    }
    run() {
        // TBD mutate only if not identity
        let obj = this.in.get_mutable()
        assert(obj, this, "missing input")
        obj.transform(this.transform.v)
        this.out.set(obj)
    }
    draw_selection(m) {
        let out = this.out.get_const()
        dassert(out !== null, "No output object to select")
        this.transform.draw_dial_at_obj(out, m)
        out.draw_border(m)
    }    
    image_find_obj(vx, vy, ex, ey) {
        return this.transform.dial.find_obj(ex, ey)
    }
}


class RandNumGen
{
    constructor(seed) {
        this.state = seed
    }
    next() {
        this.state = (this.state * 1103515245 + 12345) % 2147483648
        return this.state / 2147483648
    }
}

function dist(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by
    return Math.sqrt(dx*dx+dy*dy)
}
function m_dist(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
}

// https://www.sidefx.com/docs/houdini/nodes/sop/scatter.html
class NodeRandomPoints extends NodeCls
{
    static name() { return "Scatter" }
    constructor(node) {
        super(node)
        this.in_mesh = new InTerminal(node, "in_mesh")
        this.out_mesh = new OutTerminal(node, "out_mesh")
        this.seed = new ParamInt(node, "Seed", 1)
        this.by_density = new ParamBool(node, "Set Density", false, (v)=>{
            this.count.set_label(v ? "Max Count" : "Count")
            this.min_dist.set_enable(v)
        })
        this.min_dist = new ParamFloat(node, "Min Distance", 0.02)
        this.count = new ParamInt(node, "Count", 50)
        this.smooth_iter = new ParamInt(node, "Smoothness", 20)

        //this.by_density.change_func() // enact the changes it does
    }
        
    run() {
        let in_mesh = this.in_mesh.get_const()
        assert(in_mesh !== null, this, "No mesh input")
        assert(in_mesh["get_bbox"] !== undefined, this, "Input does not define a bounding box")
        let bbox = in_mesh.get_bbox()  // TBD cut into shape if shape allows that
        assert(bbox !== null, this, "Object doesn't have content for a bounding box")

        let dx = bbox.max_x - bbox.min_x, dy = bbox.max_y - bbox.min_y
        let vtx = new TVtxArr(this.count.v * 2)

        let addi = 0
        function nearest_neighbor_dist(of_px, of_py) {
            var min_d = Number.MAX_VALUE
            for(let vi = 0; vi < addi; vi += 2) {
                let px = vtx[vi], py = vtx[vi+1]
                var d = dist(px, py, of_px, of_py)
                if (d < min_d)
                    min_d = d
            }
            return min_d
        }        

        let prng = new RandNumGen(this.seed.v)
        for(let pi = 0; pi < this.count.v; ++pi) {
            let cand_x = null, cand_y, bestDistance = 0;
            for (let ti = 0; ti < this.smooth_iter.v; ++ti) {
                let x = prng.next() * dx + bbox.min_x
                let y = prng.next() * dy + bbox.min_y
                let d = nearest_neighbor_dist(x, y);
                if (d > bestDistance) {
                    bestDistance = d;
                    cand_x = x; cand_y = y
                }
            }
            if (this.by_density.v && bestDistance < this.min_dist.v)
                break;
            vtx[addi++] = cand_x
            vtx[addi++] = cand_y
        }

        if (addi < vtx.length) {
            vtx = vtx.slice(0,addi)
        }
        
        let r = new Mesh()
        r.set("vtx_pos", vtx, 2)
        this.out_mesh.set(r)
        
    }
}


class NodeTriangulate extends NodeCls
{
    static name() { return "Triangulate" }
    constructor(node) {
        super(node)
        this.in_obj = new InTerminal(node, "in_obj")
        this.out_mesh = new OutTerminal(node, "out_mesh")        
    }
    run() {
        let obj = this.in_obj.get_const()
        assert(obj !== null, this, "Missing input mesh")
        assert(obj.arrs !== undefined && obj.arrs.vtx_pos !== undefined, this, "Input doesn't have vertices. type: " + obj.constructor.name())
        if (obj.constructor === Mesh) {
            let obj = this.in_obj.get_mutable()
            let d = new Delaunator(obj.arrs.vtx_pos)
            obj.set('idx', d.triangles)
            obj.set_type(MESH_TRI)
            this.out_mesh.set(mesh)
        }
        else if (obj.constructor === MultiPath) 
        { // https://github.com/shooshx/ArNavNav/blob/352a5a3acaabbc0591fb995b36255dc750406d22/src/poly2tri/adapter.cc
            
            var swctx = new poly2tri.SweepContext([]);
            let vtx = obj.arrs.vtx_pos;
            let added_poly = 0
            let all_pnts = []
            for(let pcmds of obj.cmds) 
            {
                let plst = []
                let ci = 0;
                while(ci < pcmds.length) {
                    let cmd = pcmds[ci]
                    if (cmd == 'M' || cmd == 'L') {
                        let idx = pcmds[ci+1]
                        let vidx = idx * 2
                        let tpnt = new poly2tri.Point(vtx[vidx], vtx[vidx+1])
                        tpnt.my_index = idx
                        tpnt.visited = false
                        plst.push(tpnt)
                        all_pnts.push(tpnt)
                        ci += 2
                    }
                    else if (cmd = 'Z')
                        ++ci
                    else 
                        dassert(false, "Unexpected path cmd " + cmd)
                }
                if (plst.length >= 3) {
                    swctx.addHole(plst)
                    ++added_poly;
                }
            }
            let out_mesh = new Mesh()
            let idx = []
            if (added_poly > 0) {
                // need to iterate since triangulate only processes one countour and its holes at a time
                while(true) {
                    try {
                        swctx.triangulate()
                    } catch(e) {
                        assert(false, this, "Failed triangulation")
                    }
                    var triangles = swctx.getTriangles();
                    for(let tri of triangles) {
                        let tripnt = tri.getPoints()
                        console.assert(tripnt.length == 3, "unexpected size of triangle")
                        idx.push(tripnt[0].my_index, tripnt[1].my_index, tripnt[2].my_index)
                        tripnt[0].visited = true; tripnt[1].visited = true; tripnt[2].visited = true
                    }

                    let leftover = []
                    for(let p of all_pnts) {
                        if (!p.visited)
                            leftover.push(p)
                    }
                    if (leftover.length < 3)
                        break;

                    // hack poly2tri to start over without having to reinitialize the holes
                    swctx.points_ = leftover
                    swctx.map_ = []
                    swctx.triangles_ = []
                }
            }
            for(let attrname in obj.arrs) {
                let attrarr = obj.arrs[attrname]
                console.assert(isTypedArray(attrarr), "not a typed-array " + attrname)
                out_mesh.set(attrname, new attrarr.constructor(attrarr), obj.meta[attrname].num_elems, obj.meta[attrname].need_normalize)
            }
            out_mesh.set("idx", new TIdxArr(idx))
            out_mesh.set_type(MESH_TRI)
            this.out_mesh.set(out_mesh)
        }
    }
}


class GeomDivide extends NodeCls
{
    static name() { return "Divide" }
    constructor(node) {
        super(node)
        this.in_mesh = new InTerminal(node, "in_mesh")
        this.out_mesh = new OutTerminal(node, "out_mesh")
        this.by_dist = new ParamBool(node, "Set approximate distance", false, (v)=>{
            this.divisions.set_enable(!v)
            this.distance.set_enable(v)
        })
        this.divisions = new ParamInt(node, "Divisions", 4)
        this.distance = new ParamFloat(node, "Distance", 0.1)
    }

    divide_quad(mesh, out_vtx, out_idx, idx0, idx1, idx2, idx3) {
        let vtx = mesh.arrs.vtx_pos
        let p0_x = vtx[idx0*2], p0_y = vtx[idx0*2+1]
        let p1_x = vtx[idx1*2], p1_y = vtx[idx1*2+1]
        let p3_x = vtx[idx3*2], p3_y = vtx[idx3*2+1]
        let da_x = p1_x - p0_x, da_y = p1_y - p0_y // vector a from 0 to 1
        let db_x = p3_x - p0_x, db_y = p3_y - p0_y // vector b from 0 to 3

        let div_a, div_b;
        if (!this.by_dist.v)
            div_a = div_b = this.divisions.v;
        else {
            let dist = this.distance.v
            assert(dist != 0, this, "Division by zero")
            div_a = Math.round(Math.sqrt(da_x*da_x + da_y*da_y)/dist)
            div_b = Math.round(Math.sqrt(db_x*db_x + db_y*db_y)/dist)
        }
        assert(div_a != 0 && div_b != 0, this, "Division by zero")
        da_x /= div_a; da_y /= div_a
        db_x /= div_b; db_y /= div_b

        for(let bi = 0; bi <= div_b; ++bi) {
            for(let ai = 0; ai <= div_a; ++ai) {
                let np_x = p0_x + da_x*ai + db_x*bi
                let np_y = p0_y + da_y*ai + db_y*bi
                out_vtx.push(np_x, np_y)
            }
        }

        // quads
        let sz_a = div_a+1
        for(let ai = 0; ai < div_a; ++ai) {
            for(let bi = 0; bi < div_b; ++bi) {
                let idx0 = ai+bi*sz_a
                let idx1 = idx0+1
                let idx2 = idx1+sz_a
                let idx3 = idx0+sz_a
                out_idx.push(idx0, idx1, idx2, idx3)
            }
        }
    }

    run() {
        let mesh = this.in_mesh.get_const()
        assert(mesh !== null, this, "Missing input points")
        let out_vtx = [], out_idx = []
        let idx = mesh.arrs.idx
        if (mesh.type == MESH_QUAD) {
            for(let i = 0; i < idx.length; i += 4) {
                this.divide_quad(mesh, out_vtx, out_idx, idx[i], idx[i+1], idx[i+2], idx[i+3])
            }
            let out_mesh = new Mesh()
            out_mesh.set('vtx_pos', new Float32Array(out_vtx), 2, false)
            out_mesh.set('idx', new Uint32Array(out_idx))
            out_mesh.type = MESH_QUAD
            this.out_mesh.set(out_mesh)
        }
    }
}