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
    did_connect(to_term, line) {}
    doing_disconnect(to_term, line) {}
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
        this.shape = new ParamSelect(node, "Shape", 0, ["Rectangle", "Ellipse"])
        this.size = new ParamVec2(node, "Size", 0.5, 0.5)
        this.transform = new ParamTransform(node, "Transform")
    }
    run() {
        assert(this.transform.is_valid(), this, "invalid transform")
        let obj
        let hx = this.size.x * 0.5, hy = this.size.y * 0.5
        if (this.shape.sel_idx == 0) {
            obj = new Mesh()
            // center at 0,0
            obj.set('vtx_pos', new TVtxArr([-hx, -hy, -hx, hy, hx, hy, hx, -hy]), 2)
            obj.set('idx', new TIdxArr([0, 1, 2, 3]))
            obj.set_type(MESH_QUAD)
        }
        else {
            obj = new MultiPath()
            obj.set('vtx_pos', new TVtxArr([hx,0, 0,-hy, -hx,0, 0,hy]))
            let dc = 0.5 * 4*(Math.sqrt(2)-1)/3 // see https://stackoverflow.com/questions/1734745/how-to-create-circle-with-b%C3%A9zier-curves
            let dc_x = this.size.x * dc, dc_y = this.size.y * dc
            obj.set('ctrl_to_prev',   new TVtxArr([0,dc_y, dc_x,0,  0,-dc_y,  -dc_x,0] ))
            obj.set('ctrl_from_prev', new TVtxArr([dc_x,0,  0,-dc_y, -dc_x,0, 0,dc_y] ))
            obj.paths_ranges = [0,4,PATH_CLOSED]
        }
        obj.transform(this.transform.v)
        this.out.set(obj)
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
        if (this.ofnode.point_mousedown)
            this.ofnode.point_mousedown(this.index)
        else            
            this.ofnode.set_selection(this.index) 
        trigger_frame_draw(false)
    }
    mouseup() {}
    mousemove(dx,dy, vx,vy, ex,ey) {
        this.ofnode.move_selection(dx, dy)
    }
}


function add_point_select_mixin(node_cls, selected_indices, points_param) {

    // API
    node_cls.image_find_obj = function(vx, vy, ex, ey) {
        let [x,y] = image_view.epnt_to_model(ex, ey)
        let r = Math.max(7, MESH_DISP.vtx_radius) / image_view.viewport_zoom // if the disp radius gets lower, we still want it at reasonable value
        let len = points_param.count()
        for(let i = 0; i < len; ++i) {
            let [px,py] = points_param.get_value(i*2)
            if (px === null)
                continue
            if (m_dist(px, py, x, y) < r) {
                return new PointSelectHandle(this.points, i, this)
            }
        }
        return null
    }
    node_cls.move_selection = function(dx, dy) {
        dx /= image_view.viewport_zoom
        dy /= image_view.viewport_zoom
        for(let idx of selected_indices)
            points_param.increment(idx, [dx, dy])
        trigger_frame_draw(true)
    }

    node_cls.clear_selection = function() {
        selected_indices.length = 0 // don't recreate the array since there's reference from the CoordListParam
        trigger_frame_draw(false)
        points_param.reprint_all_lines()
    }
    node_cls.set_selection = function(idx) {
        // change the selection only if we just clicked an unselected point
        // otherwise we might be trying to move a selected group of points
        if (!selected_indices.includes(idx)) {
            selected_indices.length = 0
            selected_indices.push(idx)    
        }
        points_param.reprint_all_lines() // mark with yellow the selected
    }

    let rect_elem = null // rect selection DOM elem if one is active
    node_cls.rect_select = function(min_ex, min_ey, max_ex, max_ey) {
        if (min_ex === undefined && rect_elem !== null) { // indicates it needs to be cleared
            main_view.removeChild(rect_elem)   // rect can be null if there was no move with ctrl
            rect_elem = null
            return;
        }
        let [min_x,min_y] = image_view.epnt_to_model(min_ex, min_ey)
        let [max_x,max_y] = image_view.epnt_to_model(max_ex, max_ey)
        let len = points_param.count()
        selected_indices.length = 0
        for(let i = 0; i < len; ++i) {
            let [x,y] = points_param.get_value(i*2)
            if (x > min_x && x < max_x && y > min_y && y < max_y) {
                selected_indices.push(i)
            }
        }
        if (rect_elem === null) {
            rect_elem = add_div(main_view, "selection_rect")
        }
        rect_elem.style.left = min_ex + "px"
        rect_elem.style.top = min_ey + "px"
        rect_elem.style.width = (max_ex - min_ex) + "px"
        rect_elem.style.height = (max_ey - min_ey) + "px"
        trigger_frame_draw(false)
        points_param.reprint_all_lines() // re-mark yellows
    } 
    
    node_cls.draw_selection = function(m) {
        let obj = this.out.get_const()
        dassert(obj !== null, "No output object to select") // might be it's not connected so it doesn't have output
        obj.draw_selection(m, selected_indices)
    }    
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
        this.dummy = new ParamFloatList(node, "Dummy", this.table, this.selected_indices)
        this.color = new ParamColorList(node, "Point Color", this.table)
        this.paths_ranges = new PathRangesList(node) // not shown

        this.pnt_attrs = [this.dummy, this.color]  // Param objets of additional attributes of each point other than it's coordinate

        add_point_select_mixin(this, this.selected_indices, this.points)
    }
    image_click(ex, ey) {
        if (!this.add_pnts_btn.v)
            return
        let ti = image_view.epnt_to_model(ex, ey)
        this.points.add(ti)
        for(let attr_param of this.pnt_attrs) {
            attr_param.add(attr_param.def_value())
        }

        this.paths_ranges.add_default() // do this anyway just to keep it simple, not much of an overhead

        trigger_frame_draw(true)
    }

    point_mousedown(idx) {
        if (this.add_pnts_btn.v && this.geom_type.sel_idx == 1) {
            // when adding points to path, instead of select, close the path
            if (this.paths_ranges.close_current(idx)) {
                trigger_frame_draw(true)
                return
            } // if didn't close, select
        }
        this.set_selection(idx)     
    }

    selected_obj_name() { return (this.selected_indices.length > 0) ? "points" : null }
    delete_selection() {
        this.points.remove(this.selected_indices)
        for(let attr_param of this.pnt_attrs) {
            attr_param.remove(this.selected_indices)
        }
        this.paths_ranges.remove(this.selected_indices)
        this.clear_selection()
        trigger_frame_draw(true)
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
            obj.paths_ranges = this.paths_ranges.lst.slice();
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

// examples:
//  abs(in_mesh.vtx_pos.x)*20
//  in_src.r
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

    prop_from_input_framebuffer(prop, mesh, src, value_need_src, value_need_mesh, src_param, transform, src_ctor) 
    {
        mesh.ensure_tcache(transform)
        let vtx = mesh.tcache.vtx_pos

        // see https://www.khronos.org/opengl/wiki/Vertex_Post-Processing#Viewport_transform
        // from Xw = (w/2)*Xp + (w/2) 
        let w = src.width(), h = src.height()
        let wf = w/2
        let hf = h/2
        let pixels = src.get_pixels()
        assert(pixels !== null, this, "Input image is empty")

        let samp_vtx = (this.bind_to.sel_idx == 0)
        //let face_sz = mesh.face_size()
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
                let vidxs = mesh.vidxs_of_face(i) // returns the list of indices into vtx of the points that make face i (index of x, +1 of y)
                for(let vidx of vidxs) {
                    x += vtx[vidx]
                    y += vtx[vidx+1]                    
                }
                x /= vidxs.length
                y /= vidxs.length
            }

            x = Math.round(x)
            y = Math.round(y)

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

        assert(src_param.get_last_error() === null, this, "Parameter expression error " + src_param.get_last_error())
        let value_need_src = src_param.need_input_evaler("in_src")
        let value_need_mesh = src_param.need_input_evaler("in_mesh")
        let need_inputs = value_need_src || value_need_mesh
        
        let src = null
        if (value_need_src !== null) { // make sure we have a src to get the value from
            src = this.in_source.get_const()
            assert(src !== null, this, "missing input source")
            if (src.get_pixels_adapter !== undefined)
                src = src.get_pixels_adapter(mesh) // got Gradient
            assert(src.get_pixels !== undefined, this, "expected object with pixels")
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
                let transform = src.get_transform_to_pixels()
                this.prop_from_input_framebuffer(prop, mesh, src, value_need_src, value_need_mesh, src_param, transform, src.constructor)
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


// items are maps with { name: id: } only name is displayed
class ParamInputOrderList extends ListParam
{
    constructor(node, label, table, sorted_order) {
        super(node, label, 1, table, Array, { create_elem:(parent, start_val, index, change_func, get_cur_val)=>{
            let wrap = add_div(parent, "param_lst_order_cell")
            let elem = add_div(wrap, "")
            elem.innerText = start_val.name
            elem.p_lst_index = index // index of the item in the lst, before sorting
            elem.setAttribute('draggable', "true")
            elem.addEventListener('dragstart', (ev)=>{
                ev.dataTransfer.setData("text/plain", ev.target.p_lst_index);
            })
            //let drop_elem = add_div(wrap, "param_lst_order_drop")
            elem.addEventListener('dragover', (ev)=>{
                //console.log('++', ev.target.p_lst_index)
                ev.preventDefault();
            })
            elem.addEventListener('drop', (ev)=>{
                ev.preventDefault();
                const data = ev.dataTransfer.getData("text/plain");     
                console.log('~~', data, ev.target.p_lst_index)
                const from = parseInt(data), to = ev.target.p_lst_index
                const from_i = this.sorted_d.findIndex((d)=>{return d.lst_index == from})
                const to_i = this.sorted_d.findIndex((d)=>{return d.lst_index == to})
                // swap
                const tmpd = this.sorted_d[to_i]
                this.sorted_d[to_i] = this.sorted_d[from_i]
                this.sorted_d[from_i] = tmpd
                this.redo_sort()
            })
    
            return elem
        }, external_update:(elem, value, index)=>{
            // nothing to do?
        }})
        this.sorted_order = sorted_order
        this.sorted_d = []

        // TBD handle name change
    }

    idx_from_id(id) {
        return this.lst.findIndex((e)=>{return e.id === id})
    }    

    redo_sort() {
        this.sorted_order.length = 0
        for(let d of this.sorted_d)
            this.sorted_order.push(d.lst_index)
        this.table.remake_table()
    }    
    add(v) {
        v.lst_index = this.lst.length // index in this.lst
        this.sorted_d.push(v)
        super.add(v) // need to be before redo_sort which recreates the table
        this.redo_sort()
    }
    remove(idx_lst) {
        console.assert(idx_lst.length == 1, "expected only single item to remove")
        let idx = idx_lst[0]
        let d = this.lst[idx]
        super.remove(idx_lst)
        // fix the indices of all the items that came after this item. (adjust for the culling of lst)
        for(let od of this.sorted_d)
            if (od.lst_index > d.lst_index)
                od.lst_index--;
        this.redo_sort()        
    }
    
}


class NodeGroupObjects extends NodeCls {
    static name() { return "Group_Objects" }
    constructor(node) {
        super(node)
        this.sorted_order = []
        
        this.in_m = new InTerminalMulti(node, "in_multi_mesh")
        this.out = new OutTerminal(node, "out_mesh")
        this.table = new ParamTable(node, "Order", this.sorted_order)
        this.order = new ParamInputOrderList(node, "Order", this.table, this.sorted_order)
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


    did_connect(to_term, line) {
        if (to_term !== this.in_m)
            return
        let node = line.from_term.owner
        if (this.order.idx_from_id(node.id) !== -1)
            return // already there
        let d = { name:node.name, 
                  id:node.id  } 
        this.order.add(d)
    }
    doing_disconnect(to_term, line) {
        if (to_term !== this.in_m)
            return
        let node = line.from_term.owner
        let idx = this.order.idx_from_id(node.id)
        console.assert(idx != -1)

        this.order.remove([idx])

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
        assert(this.transform.is_valid(), this, "invalid transform")
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
    let dx = ax - bx, dy = ay - by
    return Math.sqrt(dx*dx+dy*dy)
}
function m_dist(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
}

class Timer {
    constructor() {
        this.start = new Date().valueOf()
    }
    elapsed() {
        return new Date().valueOf() - this.start
    }
}


// https://www.sidefx.com/docs/houdini/nodes/sop/scatter.html
// https://www.jasondavies.com/poisson-disc/
class NodeRandomPoints extends NodeCls
{
    static name() { return "Scatter" }
    constructor(node) {
        super(node)
        this.in_obj = new InTerminal(node, "in_obj")
        this.out_mesh = new OutTerminal(node, "out_mesh")
        this.seed = new ParamInt(node, "Seed", 1)
        this.min_dist = new ParamFloat(node, "Min Distance", 0.02)

        //this.by_density.change_func() // enact the changes it does
        node.set_state_evaluators({"vtx_pos":  (m,s)=>{ return new ObjSubscriptEvaluator(m,s) }} )        
    }
        
    run() {
        let in_obj = this.in_obj.get_const()
        assert(in_obj !== null, this, "No mesh input")
        assert(in_obj["get_bbox"] !== undefined, this, "Input does not define a bounding box")
        let bbox = in_obj.get_bbox()  // TBD cut into shape if shape allows that
        assert(bbox !== null, this, "Object doesn't have content for a bounding box")

        let value_need_src = this.min_dist.need_input_evaler("vtx_pos")

        let vtx = [] 
        let addi = 0 
        let r, inner2, A

        //let timer = new Timer()

        function emitSample(p) {
            queue.push(p)
            vtx.push(p[0], p[1])
            addi += 2
        }

        function generateAround(p) {
            let phi = prng.next() * 2 * Math.PI
            let r = Math.sqrt(prng.next() * A + inner2); 
            return [p[0] + r * Math.cos(phi), p[1] + r * Math.sin(phi)];  // TBD use rejection
        }

        function withinExtent(p) {
            var x = p[0], y = p[1];
            return bbox.min_x <= x && x <= bbox.max_x && bbox.min_y <= y && y <= bbox.max_y;
        }
        function near(of_px, of_py) {  // TBD can make this better by using a grid 
            for(let vi = 0; vi < addi; vi += 2) {
                let px = vtx[vi], py = vtx[vi+1]
                let dx = px - of_px, dy = py - of_py
                let d = dx*dx+dy*dy
                if (d < inner2)
                    return true
            }
            return false
        }
        
        let prng = new RandNumGen(this.seed.v)
        let cand = {x:null, y:null }
        if (value_need_src)
            value_need_src.dyn_set_obj(cand)

        cand.x = bbox.min_x + bbox.width()*prng.next() 
        cand.y = bbox.min_y + bbox.height()*prng.next()
        let queue = [[cand.x, cand.y]]
        emitSample(queue[0]);
        let got_zeros = 0, too_many_zeros = false

        while (queue.length > 0) {
            let i = prng.next() * queue.length | 0
            let p = queue[i], j
            cand.x = p[0]; cand.y = p[1]

            r = (value_need_src === null)?this.min_dist.v : this.min_dist.dyn_eval(0)
            if (r == 0 && ++got_zeros > 100) {
                too_many_zeros = true
                break
            }
            inner2 = r * r
            A = 4 * inner2 - inner2

            for (j = 0; j < 20; ++j) {
                let q = generateAround(p);
                if (withinExtent(q) && !near(q[0], q[1])) {
                    emitSample(q);
                    break;
                }
            }
            if (j === 20) { // exhausted all possibilites with this point in the queue
                queue[i] = queue[queue.length-1]
                queue.pop();   
            }
        }
        assert(!too_many_zeros, this, "Expression evaluates to zero too much")

        if (in_obj.is_point_inside) {
            let vtx_in = []
            for(let i = 0; i < vtx.length; i += 2) {
                let x = vtx[i], y = vtx[i + 1]
                if (!in_obj.is_point_inside(x, y))
                    continue               
                vtx_in.push(x, y)
            }
            vtx = vtx_in
        }

        
        let ret = new Mesh()
        ret.set("vtx_pos", new TVtxArr(vtx), 2)
        this.out_mesh.set(ret)
        
        //console.log("Scatter: ", vtx.length, "  ", timer.elapsed(), "msec")
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
            obj.halfedges = d.halfedges
            obj.hull = d.hull
            this.out_mesh.set(obj)
        }
        else if (obj.constructor === MultiPath) {
            let out_mesh = triangulate_path(obj, this)
            this.out_mesh.set(out_mesh)
        }
    }
}


class PathsBuilder {
    constructor() {
        this.vtx_pos = []
        this.paths_ranges = []
    }
    moveTo(x,y) {
        let l = this.vtx_pos.length / 2
        this.paths_ranges.push(l,l+1,0)
        this.vtx_pos.push(x,y)
    }
    lineTo(x,y) {
        ++this.paths_ranges[this.paths_ranges.length-2]
        this.vtx_pos.push(x,y)
    }
    closePath() {
        this.paths_ranges[this.paths_ranges.length-1] = 1
    }
    finalize(paths) {
        paths.set('vtx_pos', this.vtx_pos, 2, false)
        paths.paths_ranges = this.paths_ranges
    }
}


class NodeVoronoi extends NodeCls
{
    static name() { return "Voronoi" }
    constructor(node) {
        super(node)
        this.in_obj = new InTerminal(node, "in_mesh")
        this.out_mesh = new OutTerminal(node, "out_paths")
        this.margin = new ParamVec2(node, "Margin", 0.2, 0.2)
    }
    run() {
        let mesh = this.in_obj.get_const()
        assert(mesh !== null, this, "Missing input mesh")
        assert(mesh.arrs !== undefined && mesh.arrs.vtx_pos !== undefined, this, "Input doesn't have vertices. type: " + mesh.constructor.name())
        assert(mesh.halfedges !== undefined && mesh.hull !== undefined, this, "missing halfedges or hull")
        // voronoi for multiple paths or of non-convex path is not well-defined
        // there is a result but it might have holes. To make it do the "right thing" the paths
        // itself need to be the hulls (and not the delaunay hull) as is computed in paths triangulate
        // but that would also not look good since the separate voronois would intersect each other
        // it is possible to introduce the concept of multiple hulls into the algorithm but I didn't do it

        let bbox = mesh.get_bbox()
        let mx = this.margin.x, my = this.margin.y

        let delaunay = { triangles:mesh.arrs.idx, points:mesh.arrs.vtx_pos, halfedges:mesh.halfedges, hull:mesh.hull }
        let voronoi = new Voronoi(delaunay, [bbox.min_x-mx,bbox.min_y-my, bbox.max_x+mx,bbox.max_y+my]);
        let builder = new PathsBuilder()
        voronoi.renderCells(builder)
        let new_paths = new MultiPath()
        builder.finalize(new_paths)
        this.out_mesh.set(new_paths)
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
            out_mesh.set('vtx_pos', new TVtxArr(out_vtx), 2, false)
            out_mesh.set('idx', new TIdxArr(out_idx))
            out_mesh.type = MESH_QUAD
            this.out_mesh.set(out_mesh)
        }
        else {
            assert(false, this, "unexpected geometry")
        }
    }
}

// for debugging
class LinesObj extends PObject
{
    static name() { return "Lines" }
    constructor(lines) {
        super()
        this.lines = lines
    }
    draw_m(m) {
        ctx_img.beginPath();
        for(let l of this.lines) {
            ctx_img.moveTo(l[0][0], l[0][1])
            ctx_img.lineTo(l[1][0], l[1][1])
        }
        ctx_img.strokeStyle = "#000"
        ctx_img.lineWidth = 1 / image_view.viewport_zoom
        ctx_img.stroke()
    }
}


function mesh_lines(idxs, vtx, face_size) {
    let lines = []
    for(let i = 0; i < idxs.length; i += face_size) {
        for(let j = 0; j < face_size; ++j) {
            let idx = idxs[i+j]
            let vidx = idx<<1
            let p_cur = vec2.fromValues(vtx[vidx], vtx[vidx+1])
            p_cur.from_idx = idx
            let idx_next = idxs[i+((j+1) % face_size)]
            let vidx_next = idx_next<<1
            let p_next = vec2.fromValues(vtx[vidx_next], vtx[vidx_next+1])
            p_next.from_idx = idx_next
            lines.push([p_cur, p_next])
        }
    }
    return lines
}

function inset_lines(lines, width) {
    let from_to = vec2.create(), ort = vec2.create()

    for(let l of lines) {
        vec2.subtract(from_to, l[1], l[0])
        vec2.normalize(from_to, from_to)
        vec2.set(ort, from_to[1], -from_to[0]) // orthogonal
        //vec2.set(ort, from_to[1], -from_to[0]) // orthogonal
        vec2.scaleAndAdd(l[0], l[0], ort, width)
        vec2.scaleAndAdd(l[1], l[1], ort, width)     
    }
    return lines
}    


class ShrinkFaces extends NodeCls
{
    static name() { return "Shrink Faces" }
    constructor(node) {
        super(node)
        this.in_mesh = new InTerminal(node, "in_mesh")
        this.out_mesh = new OutTerminal(node, "out_mesh")    
        this.offset = new ParamFloat(node, "Offset", 0.01)
        this.allow_overshoot = new ParamBool(node, "Allow over-shoot", false)
    }

    get_line_intersection(l0, l1) 
    {
        var p0_x = l0[0][0], p0_y = l0[0][1]
        var p1_x = l0[1][0], p1_y = l0[1][1]
        var p2_x = l1[0][0], p2_y = l1[0][1]
        var p3_x = l1[1][0], p3_y = l1[1][1]
        var s1_x = p1_x - p0_x;
        var s1_y = p1_y - p0_y;
        var s2_x = p3_x - p2_x;
        var s2_y = p3_y - p2_y;
        var s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / (-s2_x * s1_y + s1_x * s2_y);
        var t = ( s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / (-s2_x * s1_y + s1_x * s2_y);
        if (this.allow_overshoot.v || (s >= 0 && s <= 1 && t >= 0 && t <= 1))
        {
            // intersect detected
            var i_x = p0_x + (t * s1_x);
            var i_y = p0_y + (t * s1_y);
            return [i_x, i_y];
        }
        return null; // No collision
    }

    run() {
        let mesh = this.in_mesh.get_const()
        assert(mesh !== null, this, "missing input mesh")
        assert(mesh.face_size !== undefined, this, "input needs to be a mesh")

        let face_size = mesh.face_size()
        // a line is a list of two points. `lines` has `face_size` lines for each face
        let lines = mesh_lines(mesh.arrs.idx, mesh.arrs.vtx_pos, face_size)
        lines = inset_lines(lines, this.offset.v) // in-place

        //this.out_mesh.set(new LinesObj(lines))
        //return

        let new_vtx = [], new_idx = [], from_vidx = [], from_face = []

        let ri = 0
        for (let i = 0, fi=0; i < lines.length; i += face_size, ++fi) {
            let got_null = false, intersections = []
            for(let j = 0; j < face_size; ++j) {
                var p = this.get_line_intersection(lines[i+j], lines[i+((j+1) % face_size)])
                if (p === null) {
                    got_null = true
                    break
                }
                p.from_idx = lines[i+j][1].from_idx
                intersections.push(p)
            }
            if (got_null)
                continue
            for(let p of intersections) {
                new_vtx.push(p[0], p[1])
                from_vidx.push(p.from_idx)
                new_idx.push(ri)
                ri += 1
            }
            from_face.push(fi)
        }
        let out_obj = new Mesh()
        out_obj.set('vtx_pos', new TVtxArr(new_vtx), 2)
        out_obj.set('idx', new TIdxArr(new_idx))
        // duplicate other attributes
        for(let arr_name in mesh.arrs) {
            if (arr_name == "idx" || arr_name == "vtx_pos")
                continue
            
            let from_arr = mesh.arrs[arr_name]
            let num_elems = mesh.meta[arr_name].num_elems
            let idx_src;
            if (arr_name.startsWith("vtx_")) 
                idx_src = from_vidx
            else if (arr_name.startsWith("face_")) 
                idx_src = from_face
            else
                continue

            let new_arr = new from_arr.constructor(idx_src.length * num_elems)
            let ni = 0

            for(let idx of idx_src) {
                for(let i = 0; i < num_elems; ++i) {
                    new_arr[ni++] = from_arr[idx*num_elems+i]  
                }
            }
            out_obj.set(arr_name, new_arr, num_elems, mesh.meta[arr_name].need_normalize)

        }
        // TBD dup other attributes?
        // TBD Quads
        out_obj.set_type(mesh.type)
        this.out_mesh.set(out_obj)
    }
}