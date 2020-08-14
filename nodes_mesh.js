"use strict"


class NodeTestDummy extends NodeCls {
    static name() { return "Test_Dummy" }
    constructor(node) {
        super(node)
        this.in_1 = new InTerminal(node, "in_1")
        this.in_2 = new InTerminal(node, "in_2")
        this.out = new OutTerminal(node, "out")
    }
}


function make_mesh_quadtri(hx, hy) {
    const obj = new Mesh()
    // center at 0,0
    obj.set('vtx_pos', new TVtxArr([-hx, -hy, -hx, hy, hx, hy, hx, -hy]), 2)
    obj.set('idx', new TIdxArr([0, 1, 2, 0, 2, 3]))
    obj.set_type(MESH_TRI)
    return obj
}
function vec2_len(x, y) {
    return Math.sqrt(x*x+y*y)
}
function vecs_angle(a, b) {
    return Math.asin( vec2.dot(a, b) / (vec2.len(a)*vec2.len(b)) )
}

class NodeGeomPrimitive extends NodeCls
{
    static name() { return "Geom Primitive" }
    constructor(node) {
        super(node)
        this.out = new OutTerminal(node, "out_mesh")
        this.shape = new ParamSelect(node, "Shape", 0, ["Rectangle", "Rectangle from triangles", "Ellipse", "Regular Poly", "Star"], (sel_idx)=>{
            this.num_points.set_visible(sel_idx == 3 || sel_idx == 4)
            this.inner_point.set_visible(sel_idx == 4)
            this.center_inner_btn.set_visible(sel_idx == 4)
        })
        this.size = new ParamVec2(node, "Size", 0.5, 0.5)
        this.num_points = new ParamInt(node, "Num Points", 5, [3,12]) 
        this.inner_point = new ParamVec2(node, "Inner Point", 0.226, -0.311) // for a nice 5 point star
        this.center_inner_btn = new ParamButton(node, "Center", ()=>{
            const angle = 0.5/this.num_points.v*Math.PI*2
            const r = vec2_len(this.inner_point.x, this.inner_point.y)
            this.inner_point.modify(vec2.fromValues(r*Math.sin(angle), -r*Math.cos(angle)))
        })
        this.center_inner_btn.share_line_elem_from(this.inner_point)

        this.transform = new ParamTransform(node, "Transform")

        this.size_dial = new SizeDial(this.size)

        this.inner_dial = new PointDial((dx,dy)=>{
            this.inner_point.increment(vec2.fromValues(dx/this.size.x*2, dy/this.size.y*2))
        })
    }
    run() {
        assert(this.transform.is_valid(), this, "invalid transform")
        let obj
        let hx = this.size.x * 0.5, hy = this.size.y * 0.5
        if (this.shape.sel_idx == 0) { //quad
            obj = new Mesh()
            // center at 0,0
            obj.set('vtx_pos', new TVtxArr([-hx, -hy, -hx, hy, hx, hy, hx, -hy]), 2)
            obj.set('idx', new TIdxArr([0, 1, 2, 3]))
            obj.set_type(MESH_QUAD)
        }
        else if (this.shape.sel_idx == 1) { // square
            obj = make_mesh_quadtri(hx, hy)
        }
        else if (this.shape.sel_idx == 2) { // circle
            obj = new MultiPath()
            obj.set('vtx_pos', new TVtxArr([hx,0, 0,-hy, -hx,0, 0,hy]), 2)
            let dc = 0.5 * 4*(Math.sqrt(2)-1)/3 // see https://stackoverflow.com/questions/1734745/how-to-create-circle-with-b%C3%A9zier-curves
            let dc_x = this.size.x * dc, dc_y = this.size.y * dc
            obj.set('ctrl_to_prev',   new TVtxArr([0,dc_y, dc_x,0,  0,-dc_y,  -dc_x,0] ), 2)
            obj.set('ctrl_from_prev', new TVtxArr([dc_x,0,  0,-dc_y, -dc_x,0, 0,dc_y] ), 2)
            obj.paths_ranges = [0,4,PATH_CLOSED]
        }
        else if (this.shape.sel_idx == 3 || this.shape.sel_idx == 4) { // regular poly or star
            const vtx = [], np = this.num_points.v
            const rx = this.size.x*0.5, ry = this.size.y*0.5

            const isStar = this.shape.sel_idx == 4
            const inner = vec2.fromValues(this.inner_point.x, this.inner_point.y)
            const start_inner_angle = Math.atan2(this.inner_point.y, this.inner_point.x)+Math.PI/2
            const r_inner = vec2.len(inner)
            for(let i = 0; i < np; ++i) {
                const angle = i/np*Math.PI*2
                vtx.push(rx*Math.sin(angle), -ry*Math.cos(angle))
                if (isStar) {
                    const inner_angle = start_inner_angle + i/np*Math.PI*2
                    vtx.push(rx*r_inner*Math.sin(inner_angle), -ry*r_inner*Math.cos(inner_angle))
                }
            }

            if (!isStar && (np == 3 || np == 4)) {
                obj = new Mesh()
                if (np == 3) {
                    obj.type = MESH_TRI
                    obj.arrs.idx = [0,1,2]
                }
                else {
                    obj.type = MESH_QUAD
                    obj.arrs.idx = [0,1,2,3]
                }
            }
            else {
                obj = new MultiPath()
                obj.paths_ranges = [0,np*(isStar?2:1),PATH_CLOSED]
            }
            obj.set('vtx_pos', new TVtxArr(vtx), 2)
        }
        else 
            assert("unknown shape")
        obj.transform(this.transform.v)
        this.out.set(obj)
    }
    draw_selection(m) {
        let outmesh = this.out.get_const()
        if (outmesh === null)
            return
        this.transform.draw_dial_at_obj(outmesh, m)

        //  dials
        this.size_dial.draw(this.transform.v, m)
        // the inner point needs to move along with the entire size
        if (this.shape.sel_idx == 4)
            this.inner_dial.draw(this.inner_point.x*this.size.x/2, this.inner_point.y*this.size.y/2, this.transform.v, m)
    }    
    image_find_obj(vx, vy, ex, ey) {
        let hit = this.transform.dial.find_obj(ex, ey) || this.size_dial.find_obj(ex, ey)
        if (hit)
            return hit
        if (this.shape.sel_idx == 4)
            return this.inner_dial.find_obj(ex, ey)
        return null
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
        if (obj === null) 
            return
        let s = selected_indices
        // this is needed since in Gradient the order of the points in the object is different (sorted) than in the Node
        if (points_param.translate_idx_to_obj !== undefined)
            s = points_param.translate_idx_to_obj(s)
        obj.draw_selection(m, s)
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
        this.points = new ParamCoordList(node, "vtx_pos", this.table, this.selected_indices)
      //  this.dummy = new ParamFloatList(node, "Dummy", this.table, this.selected_indices)
        this.color = new ParamColorList(node, "vtx_color", this.table)
        this.paths_ranges = new PathRangesList(node) // not shown

        // backwards compat
        node.param_alias("Coord", this.points)
        node.param_alias("Point Color", this.color)

        // TBD user able to add columns
        this.pnt_attrs = [this.color]  // Param objets of additional attributes of each point other than it's coordinate

        add_point_select_mixin(this, this.selected_indices, this.points)
    }
    image_click(ex, ey) {
        if (!this.add_pnts_btn.v)
            return
        let ti = image_view.epnt_to_model(ex, ey)
        this.points.add(ti)
        for(let attr_param of this.pnt_attrs) {
            attr_param.add(get_default_value(attr_param.label, attr_param.values_per_entry))
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
            obj.type = MESH_POINTS
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
            obj.set(attr.label, attr.lst, attr.values_per_entry, attr.pneed_normalize)
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
    dyn_set_obj(obj) { // existing epression set with a new object
        this.obj = obj
        ++this.dirty_obj_ver;
    }
    dyn_set_prop_index(idx) { // for mesh objects
        this.idx = idx  // usually index of the current vertex or face being evaluated
    }       
}

class ObjSingleEvaluator extends NodeBase{
    constructor(objref, subscripts) {
        super()
        if (subscripts.length != 0)
            throw new Error("Unexpected subscript given to variable")
        this.objref = objref
    }
    consumes_subscript() { return true }

    eval() {
        // single obj needs to be a reference object we make it a 1 item array
        return this.objref.obj[0]
    }
    check_type() {
        return TYPE_NUM
    }
}

class ObjSubscriptEvaluator extends NodeBase{
    constructor(objref, subscripts) {
        super()
        //if (subscripts.length != 1)
        //    throw new Error("Wrong subscript given to variable " + name)
        this.objref = objref
        this.subscript = (subscripts.length > 0) ? subscripts[0] : null
        this.type = null
    }
    consumes_subscript() { return true }

    eval() {
        if (this.subscript === null) {
            eassert(this.objref.obj._get_as_vec !== undefined, "Missing subscript")
            return this.objref.obj._get_as_vec()
        }
        eassert(this.objref.obj !== null, "object not set")
        let v = this.objref.obj[this.subscript]
        eassert(v !== undefined, "subscript not found " + this.subscript)        
        return v
    }
    check_type() {
        if (this.subscript === null) { // need to wait for obj
            if (this.objref.obj === null)
                throw new UndecidedTypeErr()
            else {
                const v = this.objref.obj._get_as_vec()
                this.type = type_from_numelems(v.length)
            }
        }
        else
            this.type = TYPE_NUM
        return this.type
    }
}

function type_from_numelems(num_elems) {
    switch(num_elems) { // this could be just return num_elems but better to do it explicit
        case 1: return TYPE_NUM; 
        case 2: return TYPE_VEC2;
        case 3: return TYPE_VEC3;
        case 4: return TYPE_VEC4;
    }
}


class MeshPropEvaluator extends NodeBase
{
    constructor(meshref, subscripts, param_bind_to) 
    {
        super()
        console.assert(meshref !== undefined  && meshref !== null)
        eassert(subscripts.length == 2 || subscripts.length == 1, "Not enough subscript given to variable " + name)
        this.meshref = meshref
        this.param_bind_to = param_bind_to
        this.attrname = subscripts[0]
        if (this.attrname == "index") {
            eassert(subscripts.length == 1, "unexpected additional subscript to value")
            this.valindex = -1;
        }
        else {
            // valname is line x,y,alpha
            this.valname = (subscripts.length == 2) ? subscripts[1] : null
            this.valindex = (this.valname !== null) ? SUBSCRIPT_TO_IDX[this.valname] : 0  // 0 for the case it's a float property
            eassert(this.valindex !== undefined, "Unknown subscript `" + this.valname + "`")
        }
        // idx is in meshref not multiplied for any property
        this.attr = null
        this.num_elems = null
        this.last_obj_ver = 0
        this.type = null
    }
    consumes_subscript() { return true }

    resolve_attr() {
        if (this.valindex === -1) 
            return
        if (this.attr !== null && this.last_obj_ver === this.meshref.dirty_obj_ver) 
            return // don't need an update 
        eassert(this.meshref.obj !== null, "unexpected null object")
        if (this.param_bind_to.sel_idx == 0) // vertices  TBD this is not invalidated if bind_to changes
            eassert(this.attrname.startsWith("vtx_"), "bind to Vertices can only sample vertex attribute")
        else if (this.param_bind_to.sel_idx == 1) // faces
            eassert(this.attrname.startsWith("face_"), "bind to Faces can only sample face attribute")
        let attr = this.meshref.obj.arrs[this.attrname]
        if (attr === undefined && this.meshref.obj.computed_prop !== undefined)
            attr = this.meshref.obj.computed_prop(this.attrname)
        eassert(attr !== undefined && attr !== null, "unknown attribute " + this.attrname + " of object")

        if (attr.computed_value === undefined) { // it's not computed
            this.num_elems = this.meshref.obj.meta[this.attrname].num_elems
            if (this.num_elems == 1)
                eassert(this.valname === null, "unexpected additional subscript to value")
            // else no further subscripts, return vec
            if (this.valname === null) // only if it doesn't have a extra subscript
                this.type = type_from_numelems(this.num_elems)
        }
        else {
            if (this.valname === null)
                this.type = attr.computed_type()
        }
        this.attr = attr
        this.last_obj_ver = this.meshref.dirty_obj_ver // incrememnted when the object changes so we need to retake its array
    }

    eval() {
        eassert(this.meshref.idx !== null, "unexpected null object")
        eassert(this.type !== null, "unexpected null type")
          
        this.resolve_attr()

        if (this.valindex === -1)
            return this.meshref.idx        

        if (this.attr.computed_value !== undefined) {
            const v = this.attr.computed_value(this.meshref.idx)
            if (this.valname === null)
                return v  // no subscript, just return whatever we computed
            return v[this.valindex]
        }
        else {
            const offs = this.meshref.idx * this.num_elems
            switch(this.type) {
            case TYPE_NUM: return this.attr[offs + this.valindex]  // either the prop is float or we gave a subscript
            case TYPE_VEC2: return vec2.fromValues(this.attr[offs], this.attr[offs + 1])
            case TYPE_VEC3: return vec3.fromValues(this.attr[offs], this.attr[offs + 1], this.attr[offs + 2])
            case TYPE_VEC4: return vec3.fromValues(this.attr[offs], this.attr[offs + 1], this.attr[offs + 2], this.attr[offs + 3])    
            }
            eassert(false, "unexpected num_elems " + this.num_elems)
        }
    }
    check_type() {
        // in case it's not ".index" but the expr didn't give any subscript
        //  the type needs to be whatever is the type of the mesh property, which is not known in parse type
        if (this.valindex >= 0 && this.valname === null) {
            if (this.meshref.obj === null)
                throw new UndecidedTypeErr() // would cause a call to here when there's a mesh set (rather than only after parse)
                // happens for instance for `p = in_obj.face_center`
            this.resolve_attr()
        }
        else {
            this.type = TYPE_NUM
        }
        return this.type
    }    
}




// examples:
//  abs(in_obj.vtx_pos.x)*20
//  in_src.r
//  center of faces is sampled only when sampling color
//  rand(in_obj.index)  - works for vertices and faces
//  in_obj.face_center - for faces
// with "Image Fill" the attr_name needs to be "fill", bind to face, and in_src is what's being filled
//     
class NodeSetAttr extends NodeCls
{
    static name() { return "Set Attribute" }
    constructor(node) {
        super(node)
        this.in_mesh = new InTerminal(node, "in_obj")
        this.in_source = new InTerminal(node, "in_src") // future - may not be an image? proximity to other mesh?
        this.out_mesh = new OutTerminal(node, "out_mesh")

        // node says what evaluators it wants for its inputs
        node.set_state_evaluators({"in_src":  (m,s)=>{ return new ObjSubscriptEvaluator(m,s) }, 
                                   "in_obj": (m,s)=>{ return new MeshPropEvaluator(m,s, this.bind_to) }})

        // should be above attr_name that sets it                                    
        this.name_per_type = new ParamObjStore(node, "npt", { 0:"color", 1:"radius", 2:"normal", 3:"fill", 4:"transform" })

        //this.use_code = new ParamBool(node, "Use Code", false, (v)=>{})
        this.bind_to = new ParamSelect(node, "Bind To", 0, ["Vertices", "Faces"]) // TBD also lines?
        // needs to be before attr_name since otherwise the loaded name goes to the initial type (color)

        this.attr_type = new ParamSelect(node, "Type", 0, ["Color", "Float", "Float2", "Image Fill", "Transform"], (sel_idx)=>{
            const type_idx = this.attr_type.sel_idx
            this.expr_color.set_visible(type_idx == 0)
            this.expr_float.set_visible(type_idx == 1)
            this.expr_vec2.set_visible(type_idx == 2)
            this.expr_bool.set_visible(type_idx == 3)
            this.expr_transform.set_visible(type_idx == 4)

            const prm = this.param_of_index[type_idx]
            if (prm.show_code !== undefined) // update show code checkbox according to the type
                this.edit_code.modify(prm.show_code)
            else
                this.edit_code.modify(false)

            this.attr_name.modify(this.name_per_type.st_get(sel_idx))
        })
        this.edit_code = new ParamBool(node, "Edit code", false, (v)=>{
            // can be different for each type
            const prm = this.param_of_index[this.attr_type.sel_idx]
            if (prm.set_show_code)
                prm.set_show_code(v)
        })
        this.edit_code.share_line_elem_from(this.attr_type)

        this.attr_name = new ParamStr(node, "Name", "color", (v)=>{
            this.name_per_type.st_set(this.attr_type.sel_idx, v)
        })
        this.expr_color = new ParamColor(node, "Color", [DEFAULT_VTX_COLOR.hex, DEFAULT_VTX_COLOR.rgb])
        this.expr_float = new ParamFloat(node, "Float", 0)
        this.expr_vec2 = new ParamVec2(node, "Float2", 0, 0, true)
        this.expr_bool = new ParamFloat(node, "Select", "true")  
        this.expr_transform = new ParamTransform(node, "Transform")

        this.param_of_index = [this.expr_color, this.expr_float, this.expr_vec2, this.expr_bool, this.expr_transform]

        // connect callback from context menu to the bool param
        const show_code_callback = (v)=>{this.edit_code.modify(v) }
        for(let p of this.param_of_index) {
            if (p.show_code_callback !== undefined) 
                p.show_code_callback = show_code_callback
        }
    }

    prop_from_const(mesh, prop, src, mutate_assign) {
        if (this.attr_type.sel_idx == 0) {
            let col = src.v
            for(let i = 0; i < prop.length; i += prop.elem_sz) {
                prop[i] = col.r
                prop[i+1] = col.g
                prop[i+2] = col.b
                prop[i+3] = col.alphai // normalized back to 0-1 in mesh draw
            }
        }
        else if (this.attr_type.sel_idx == 1) { // float
            prop.fill(src.v)
        }
        else if (this.attr_type.sel_idx == 2) { // vec2 
            for(let i = 0; i < prop.length; i += prop.elem_sz) {
                prop[i] = src.x
                prop[i+1] = src.y
            }
        }
        else if (this.attr_type.sel_idx == 3) { // fill
            let dummy = []
            mutate_assign(dummy, 0, src.v)
            if (src.v !== 0)
                prop.fill(dummy[0])
        }
        else if (this.attr_type.sel_idx == 4) { // transform
            for(let i = 0; i < prop.length; i += prop.elem_sz) {
                mutate_assign(prop, i, src.v)
            }
        }
        else
            assert(false, this, "unknown attr")
    }

    prop_from_mesh_attr(prop, value_need_mesh, src_param, mutate_assign) 
    {
        for(let i = 0, pi = 0; pi < prop.length; ++i, pi += prop.elem_sz) 
        {
            value_need_mesh.dyn_set_prop_index(i)
            let vc = src_param.dyn_eval()
            mutate_assign(prop, pi, vc)
        }
    }

    prop_from_input_framebuffer(prop, mesh, src, value_need_src, value_need_mesh, src_param, transform, mutate_assign) 
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
        let expr_input = { r:0, g:0, b:0, alpha:0, _get_as_vec: function() { return vec4.fromValues(this.r, this.g, this.b, this.alpha)} }
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

            const vc = src_param.dyn_eval()
            mutate_assign(prop, pi, vc)
        }

    }

    async run() {
        assert(this.bind_to.sel_idx != -1, this, "'Bind To' not set")
        //assert(this.source_sel.sel_idx != -1, this, "'Bind To' not set")
        let mesh = this.in_mesh.get_const()
        assert(mesh, this, "missing in_mesh")

        /*if (this.source_sel.sel_idx == 0 && this.expr_color.v === null) {
            this.out_mesh.set(mesh)
            return // TBD warning
        }*/

        let elem_num, attr_name;
        // check that the mesh has face to bind to, otherwise this is a noop
        if (this.bind_to.sel_idx == 1) { 
            elem_num = mesh.face_count()
            if (elem_num == 0) {
                this.out_mesh.set(mesh)
                return  // TBD warning
            }
            attr_name = 'face_'
        }
        else {
            elem_num = mesh.vtx_count()
            attr_name = 'vtx_'
        }
        attr_name += this.attr_name.v

        let prop = null, src_param = null
        //let mutate_value = (prevv, newv)=>{return newv} // optional transformation on the value that comes from the expression
        let mutate_assign = null, need_normalize = false

        if (this.attr_type.sel_idx == 0) { // color
            prop = new TColorArr(elem_num * 4)
            prop.elem_sz = 4
            src_param = this.expr_color
            mutate_assign = (prop, pi, vc)=>{
                for(let si = 0; si < 4; ++si)
                    prop[pi+si] = vc[si]
            }
            need_normalize = true
        }
        else if (this.attr_type.sel_idx == 1) { // float
            prop = new Float32Array(elem_num * 1)
            prop.elem_sz = 1
            src_param = this.expr_float
            mutate_assign = (prop, pi, vc)=>{
                prop[pi] = vc
            }            
        }
        else if (this.attr_type.sel_idx == 2) { // float2
            prop = new Float32Array(elem_num * 2)
            prop.elem_sz = 2
            src_param = this.expr_vec2
            mutate_assign = (prop, pi, vc)=>{
                prop[pi] = vc[0]
                prop[pi+1] = vc[1]
            }            
        }
        else if (this.attr_type.sel_idx == 3) { // image-fill
            // TBD warning that the attr name to should be "fill"
            const existing = mesh.arrs[attr_name]
            if (existing !== undefined) { // if it already exists, add upon it (expression controls when to write)
                assert(existing.length == elem_num, this, "unexpected existing prop size")
                prop = new Uint16Array(existing)
            }
            else
                prop = new Uint16Array(elem_num)
            prop.elem_sz = 1
            src_param = this.expr_bool
            let id = this.set_image_fill(attr_name, elem_num)
            // don't change what's there if we're setting 0
            mutate_assign = (prop, pi, vc)=>{
                if (vc !== 0) // vc is 1 or 0 - put the new one or not
                    prop[pi] = id
            }
        }
        else if (this.attr_type.sel_idx == 4) { // transform
            src_param = this.expr_transform;
            prop = new Float32Array(elem_num * 6)
            prop.elem_sz = 6
            mutate_assign = (prop, pi, vc)=>{
                prop[pi] = vc[0];   prop[pi+1] = vc[1]; prop[pi+2] = vc[3]
                prop[pi+3] = vc[4]; prop[pi+4] = vc[6]; prop[pi+5] = vc[7]
            }            
        }
        else {
            assert(false, this, "unknown type")
        }

        assert(src_param.get_last_error() === null, this, "Parameter expression error " + src_param.get_last_error())
        let value_need_src = src_param.need_input_evaler("in_src")
        let value_need_mesh = src_param.need_input_evaler("in_obj")
        let need_inputs = value_need_src || value_need_mesh
        
        let src = null
        if (value_need_src !== null) { // make sure we have a src to get the value from
            src = this.in_source.get_const()
            assert(src !== null, this, "missing input source")
            if (src.get_pixels_adapter !== undefined)
                src = await src.get_pixels_adapter(mesh, false) // got Gradient
            assert(src.get_pixels !== undefined, this, "expected object with pixels")
        }
        if (value_need_mesh !== null) {
            value_need_mesh.dyn_set_obj(mesh)
        }


        // commiting to work
        const out_mesh = this.in_mesh.get_mutable()
        if (prop.out_mesh !== undefined)
            prop.out_mesh = out_mesh

        try {
            if (!need_inputs) { // from const
                this.prop_from_const(out_mesh, prop, src_param, mutate_assign)
            }
            else if (value_need_src !== null) { // from img input
                let transform = src.get_transform_to_pixels()
                this.prop_from_input_framebuffer(prop, out_mesh, src, value_need_src, value_need_mesh, src_param, transform, mutate_assign)
            }
            else if (value_need_mesh !== null) {
                this.prop_from_mesh_attr(prop, value_need_mesh, src_param, mutate_assign)
            }
        }
        catch(e) {
            if (e instanceof ExprErr) 
                assert(false, this, "Parameter expression error")
            else
                throw e
        }
        finally {
            if (value_need_mesh !== null)
                value_need_mesh.dyn_set_obj(null) // don't want these to reference local objects that are no longer relevant (and hide errors)
            if (value_need_src !== null)
                value_need_src.dyn_set_obj(null)
        }

        out_mesh.set(attr_name, prop, prop.elem_sz, need_normalize) // normalize true has effect only on int which is only color here
        this.out_mesh.set(out_mesh)
    }

    set_image_fill() {
        const src = this.in_source.get_const()
        assert(src !== null, this, "missing input source image")

        const mesh = this.in_mesh.get_mutable()
        // there's going to be a single line since it's not a multi terminal
        const disp_values = this.in_source.lines[0].from_term.owner.display_values
        const id = mesh.add_fillobj(new ObjConstProxy(src, clone(disp_values)))
        return id        
    }
}

class ObjConstProxy {
    constructor(in_obj, display_values) {
        this.obj = in_obj
        this.with_display_values = display_values
        if (Object.keys(this.with_display_values).length == 0) { 
            // happens if this node was never displayed
            //   used for the side-effect that it sets the defaults
            this.obj.get_disp_params(this.with_display_values)
        }
    }
    draw(m) {
        this.obj.draw(m, this.with_display_values)
    }
    async pre_draw(m) {
        await this.obj.pre_draw(m, this.with_display_values)
    }
}


const DEFAULT_FOR_VTX_ATTRS = {
    "vtx_radius" : { v:[MESH_DISP.vtx_radius],  num_elems:1 },
    "vtx_color"  : { v:DEFAULT_VTX_COLOR.arr,   num_elems:4 }
}

function get_default_value(name, numelems) {
    const def = DEFAULT_FOR_VTX_ATTRS[name]
    if (def === undefined || def.num_elems !== numelems)
        return Array(numelems).fill(0);
    return def.v
}

function fill_default_value(narr, at_index, name, num_elems, count) {
    const def = DEFAULT_FOR_VTX_ATTRS[name] // fill with a default value?
    if (def !== undefined && def.num_elems === num_elems) { // if it's not the same num_elems, don't bother
        for(let i = 0; i < count * num_elems; ++i)
            narr[at_index++] = def.v[i % num_elems]
    }  // otherwise keep it 0
    else 
        at_index += count * num_elems
    return at_index
}

class NodeGeomMerge extends NodeCls
{
    static name() { return "Geom Merge" }
    constructor(node) {
        super(node)
        this.in_m = new InTerminalMulti(node, "in_multi_mesh")
        this.out = new OutTerminal(node, "out_mesh")

        this.dedup_vtx = new ParamBool(node, "Deduplicate Points (Output mesh)", false, (v)=>{
            this.dedup_epsilon.set_enable(v)
        })
        this.dedup_epsilon = new ParamFloat(node, "Dedup epsilon", 0.00001, {visible:false})
        this.sorted_order = []       
        mixin_multi_reorder_control(node, this, this.sorted_order, this.in_m)
    }

    analyze_inputs(meshes) {
        // figure out the size and type of the unified arrays
        let obj_ctor = null    // mesh or multipath
        let mesh_type = null   // if it's a mesh, the type

        const uni_meta = {}
        assert(this.sorted_order.length == meshes.length, this, "unexpected meshes size")
        for(let si of this.sorted_order) 
        {
            const m = meshes[si]
            assert(m.constructor === Mesh || m.constructor === MultiPath, this, "input is not a mesh or paths")
            if (obj_ctor === null) // first
                obj_ctor = m.constructor 
            else if (obj_ctor !== m.constructor) // mixing mesh and paths 
                obj_ctor = MultiPath

            if (obj_ctor == Mesh) { // all of what we've seen so far were meshes
                if (mesh_type === null) { // first
                    mesh_type = m.type
                    assert(m.type !== MESH_NOT_SET, this, "input mesh type not set")
                    if (m.type !== MESH_POINTS)
                        assert(m.arrs.idx !== null && m.arrs.idx !== undefined, this, "input mesh with faces but no idx array?")
                }
                else if (mesh_type !== m.type) // mixing mesh of different types,
                    obj_ctor = MultiPath
            }
            for(let name in m.arrs) {
                if (m.arrs[name] === null)
                    continue
                if (name.startsWith("vtx_") || name.startsWith("ctrl_"))
                    assert(m.arrs[name].length === m.vtx_count() * m.meta[name].num_elems, this, "unexpected size of array " + name)
                else if (name.startsWith("face_"))
                    assert(m.arrs[name].length === m.face_count() * m.meta[name].num_elems, this, "unexpected size of array " + name)                                        
                else if (name != "idx")
                    assert(false, this, "unexpected array name " + name)

                if (uni_meta[name] === undefined) {
                    uni_meta[name] = { num_elems: m.meta[name].num_elems,
                                       ctor: m.arrs[name].constructor,
                                       need_normalize: m.meta[name].need_normalize
                                    }
                }
                else {
                    assert(m.meta[name].num_elems === uni_meta[name].num_elems, this, "incompatible objects, array " + name + " num_elems different")
                    assert(m.meta[name].need_normalize === uni_meta[name].need_normalize, this, "incompatible objects, array " + name + " normalization different")
                    assert(m.meta[name].constructor === uni_meta[name].constructor, this, "incompatible objects, array " + name + " normalization different")
                }
            }
        }
        // count vertices
        let vtx_count = 0 // for meshes
        let face_count = 0  // for both
        let idx_count = 0
        const start_idxs = [] // for each mesh in the input, when offset its vertices start in, for fixing its idx
        if (obj_ctor === Mesh) {
            for(let m of meshes) {
                start_idxs.push(vtx_count)
                vtx_count += m.vtx_count()
                face_count += m.face_count()
                if (m.arrs.idx != undefined && m.arrs.idx !== null)
                    idx_count += m.arrs.idx.length
            }
        }
        else { // I'm building paths
            for(let m of meshes) {
                // if it's a mesh, I'm going to spread the indices. mesh of just vertices doesn't have idx
                vtx_count += (m.constructor == Mesh && m.arrs.idx !== null) ? m.arrs.idx.length : m.vtx_count()
                face_count += m.face_count()
            }
        }

        return {obj_ctor:obj_ctor, mesh_type:mesh_type, uni_meta:uni_meta, 
                vtx_count:vtx_count, idx_count:idx_count, start_idxs:start_idxs, face_count:face_count}
    }

    merge_to_mesh(d, meshes) 
    {
        const r = new Mesh()
        r.type = d.mesh_type
        for(let name in d.uni_meta) { // go array by array
            const isVtxProp = !name.startsWith("face_")
            const umeta = d.uni_meta[name]
            const narr = new umeta.ctor(((name === "idx") ? d.idx_count : d.vtx_count) * umeta.num_elems)
            let at_index = 0
            for(let si of this.sorted_order) // then go by all the input meshes
            {
                const m = meshes[si]
                if (name === 'idx') {
                    for(let i = 0; i < m.arrs.idx.length; ++i)
                        narr[at_index++] = m.arrs.idx[i] + d.start_idxs[si]
                    continue
                }                    
                if (m.arrs[name] === undefined) { // this mesh doesn't have this name
                    const count = isVtxProp ? m.vtx_count() : m.face_count()
                    at_index = fill_default_value(narr, at_index, name, umeta.num_elems, count)
                    continue 
                }
                // data attribute that exists in this mesh, just copy it
                narr.set(m.arrs[name], at_index)
                at_index += m.arrs[name].length
            }
            r.set(name, narr, umeta.num_elems, umeta.need_normalize)
        }
        return r
    }

    merge_to_paths(d, meshes)
    {
        const r = new MultiPath()
        // make ranges
        const ranges = []
        let at_index = 0; 
        for(let si of this.sorted_order)
        {
            const m = meshes[si]
            if (m.constructor === Mesh) {
                const step = m.face_size()
                const count_paths = (m.arrs.idx !== null) ? (m.arrs.idx.length / step) : m.vtx_count()
                for(let i = 0; i < count_paths; ++i) {
                    ranges.push(at_index, at_index + step, PATH_CLOSED)
                    at_index += step
                }
            }
            else {
                for(let i = 0; i < m.paths_ranges.length; i += 3) {
                    const start_idx = m.paths_ranges[i*3]
                    const end_idx = m.paths_ranges[i*3+1]
                    ranges.push(start_idx + at_index, end_idx + at_index, m.paths_ranges[i*3+2])
                    at_index += end_idx - start_idx // advanced by this many vertices
                }
            }
        }
        // all other attributes
        assert(d.face_count === ranges.length / 3, this, "Unexpected face_count from analyze (BUG)")
        r.paths_ranges = ranges
        for(let name in d.uni_meta)  // go array by array
        {
            if (name === 'idx')
                continue
            const isVtxProp = !name.startsWith("face_")
            const umeta = d.uni_meta[name]
            const narr = new umeta.ctor(d.vtx_count * umeta.num_elems)
            let at_index = 0
            for(let si of this.sorted_order) // then go by all the input meshes
            {
                const m = meshes[si]
                const marr = m.arrs[name]
                if (marr === undefined) { // this mesh doesn't have this name
                    let count;
                    if (isVtxProp)
                        count = (m.constructor === Mesh && m.arrs.idx !== null) ? m.arrs.idx.length : m.vtx_count()
                    else
                        count = m.face_count()
                    at_index = fill_default_value(narr, at_index, name, umeta.num_elems, count)
                    continue 
                }
                
                if (m.constructor === Mesh && m.arrs.idx !== null && !isVtxProp) {
                    for(let idx of m.arrs.idx) {  // expand idx
                        for(let elemi = 0; elemi < umeta.num_elems; ++elemi)
                            narr[at_index++] = marr[idx * umeta.num_elems + elemi]
                    }
                }
                else { // paths, just copy it
                    narr.set(m.arrs[name], at_index)
                    at_index += m.arrs[name].length
                }
            }
            r.set(name, narr, umeta.num_elems, umeta.need_normalize)
        }
        return r
    }

    dedup_vertices(obj) 
    {
        const points_hash = new Map() // map discretisized [x,y] to the first index it appears in
        const old_went_to = [] // went_to[i] is the index int the new vtx_pos where index i went to (for reconstructing idx)
        const new_vtx = []
        const new_to_old_indices = [] // what indices in the original vtx the new_vtx came from (for reconstructing all the other arrays)
        const vtx = obj.effective_vtx_pos // take the baked vertices
        const vtx_len = vtx.length, discrete_factor = 1/this.dedup_epsilon.v
        let count_dups = 0
        // do the deduplication according to coordinates
        for(let vi = 0, i = 0; vi < vtx_len; vi += 2, ++i) {
            const x = vtx[vi], y = vtx[vi+1]
            const key = "" + Math.round(x * discrete_factor) + "_" + Math.round(y * discrete_factor) // no tuple type in ES6 yet so need use string
            let goes_to = points_hash.get(key)
            if (goes_to === undefined) { // something not seen before
                points_hash.set(key, i)
                goes_to = i
                new_vtx.push(x, y)
                new_to_old_indices.push(i)
            }
            else
                ++count_dups
            old_went_to.push(goes_to)
        }
        if (count_dups === 0 && obj.constructor === Mesh) // need to actually do something?
            return obj;  // if it's not a mesh, we want to do it anyway because the output needs to be a mesh
        
        const new_mesh = new Mesh()
        new_mesh.set("vtx_pos", new TVtxArr(new_vtx), 2, false)
        // all other arrays
        for(let name in obj.arrs) {
            if (!name.startsWith("vtx_") || name == "vtx_pos" || name == "vtx_transform") // already baked the transform using effective_vtx so don't need it
                continue
            const arr = obj.arrs[name], meta = obj.meta[name]
            const new_arr = new arr.constructor(new_to_old_indices.length * meta.num_elems)
            let pi = 0
            for(let old_idx of new_to_old_indices) {
                for(let ei = 0; ei < meta.num_elems; ++ei)
                    new_arr[pi++] = arr[old_idx * meta.num_elems + ei]
            }
            new_mesh.set(name, new_arr, meta.num_elems, meta.need_normalize)
        }
        // recreate idx
        if (obj.constructor === Mesh) {
            if (obj.has_idx()) {
                const idx = obj.arrs.idx
                const new_idx = new TIdxArr(idx.length)
                let pi = 0;
                for(let old_idx of idx)
                    new_idx[pi++] = old_went_to[old_idx]
                new_mesh.set("idx", new_idx)
                new_mesh.type = obj.type
            }
            else {
                assert(obj.type === MESH_POINTS, this, "unexpected input mesh type " + obj.type)
                new_mesh.type = MESH_POINTS
            }
        }
        else { // it was paths, discard all the paths information except the points
            new_mesh.type = MESH_POINTS
        }
        return new_mesh
    }

    run() {
        const meshes = this.in_m.get_input_consts()
        if (meshes.length == 0) {
            this.out.set(new Mesh())
            return
        }
        let r = null
        if (meshes.length == 1) {
            r = meshes[0]
        }
        else {
            const d = this.analyze_inputs(meshes)
            if (d.obj_ctor == Mesh) // all inputs are meshes of the same type
                r = this.merge_to_mesh(d, meshes)
            else 
                r = this.merge_to_paths(d, meshes)
        }

        if (this.dedup_vtx.v)
            r = this.dedup_vertices(r)

        this.out.set(r)
    }
}

const VTX_NUM_ELEM = 2

function repeat_arr(arr, count) {
    const new_arr = new arr.constructor(arr.length * count)
    for(let ti = 0, at_index = 0; ti < count; ++ti, at_index += arr.length)
        new_arr.set(arr, at_index)
    return new_arr
}


// common functionality for NodeGeomCopy and D
let CopyNodeMixin =  (superclass) => class extends superclass 
{
    add_terminal_and_params(node) {
        this.in_target = new InTerminal(node, "in_target", (c)=>{
            this.create_count.set_enable(!c)
        }) // onto vertices of the target

        // before parameters so initialization would work
        this.bind_to = {sel_idx: 0} // just vertices
        node.set_state_evaluators({"in_target": (m,s)=>{ return new MeshPropEvaluator(m,s, this.bind_to) },
                                   "index": (m,s)=>{ return new ObjSingleEvaluator(m,s)}})

        this.create_count = new ParamInt(node, "Count", 10, {min:2, max:50})
        this.transform = new ParamTransform(node, "Object\nTransform", {tx: "in_target.vtx_pos.x", ty:"in_target.vtx_pos.y"})
    }
    get_meta_target() {
        const target = this.in_target.get_const()

        let tg_vtx_count = null
        const tr_need_target = this.transform.need_input_evaler("in_target")
        if (target !== null) { // if there's a target, it always controls the count
            tg_vtx_count = target.effective_vtx_pos.length / VTX_NUM_ELEM
            if (tr_need_target !== null)
                tr_need_target.dyn_set_obj(target)            
        }
        else {
            assert(tr_need_target === null, this, "in_target object not connected")
            tg_vtx_count = this.create_count.get_value()
        }
        return [tg_vtx_count, tr_need_target]
    }
    get_index_wrap() {
        const tr_need_index = this.transform.need_input_evaler("index")
        const index_wrap = [0]
        if (tr_need_index !== null)
            tr_need_index.dyn_set_obj(index_wrap)
        return index_wrap
    }
}

class NodeGeomCopy extends CopyNodeMixin(NodeCls)
{
    static name() { return "Copy" }
    constructor(node) {
        super(node)
        this.in_obj = new InTerminal(node, "in_obj") // object to copy
        this.out = new OutTerminal(node, "out_obj")

        this.add_terminal_and_params(node)
    }

    mesh_copy(in_mesh, tg_vtx_count, tr_need_target) 
    {
        const out_mesh = new Mesh()
        out_mesh.type = in_mesh.type

        // copy vertex attribs as is, we're not adding vtx attribs
        for(let name in in_mesh.arrs) {
            const meta = in_mesh.meta[name]
            const arr = in_mesh.arrs[name]
            let new_arr
            if (name.startsWith("vtx_"))
                new_arr = arr  // same vertices shared (will be unshared by Mesh when setting face_transform)
            else if (name.startsWith("face_"))
                new_arr = repeat_arr(arr, tg_vtx_count)
            out_mesh.set(name, new_arr, meta.num_elems, meta.need_normalize)
        }
        let idx = null
        if (in_mesh.has_idx()) {
            idx = in_mesh.arrs.idx
        }
        else {
            assert(in_mesh.type == MESH_POINTS, this, "unexpected mesh type")
            // case of a mesh of points with idx, add idx to it that repeats the points. 
            // every point is its own face
            const vtx_count = in_mesh.vtx_count()
            idx = new TIdxArr(vtx_count)
            for(let i = 0; i < vtx_count; ++i)
                idx[i] = i
        }

        const face_sz = in_mesh.face_size()
        const count_faces = idx.length / face_sz
        // make face transform for every face in the 
        const new_face_tr = this.make_face_transform(count_faces, tg_vtx_count, tr_need_target)
        
        // duplicate the indices
        const new_idx = repeat_arr(idx, tg_vtx_count)

        out_mesh.set("idx", new_idx)
        out_mesh.set("face_transform", new_face_tr, 6, false) // needs to come after idx since its using it
        return out_mesh
    }

    path_copy(in_obj, tg_vtx_count, tr_need_target) 
    {
        const out_paths = new MultiPath()

        // need to duplicate all arrays since there's no vertex sharing in paths
        const vtx_count = in_obj.vtx_count()
        const face_count = in_obj.face_count()
        for(let name in in_obj.arrs) {
            const meta = in_obj.meta[name]
            const arr = in_obj.arrs[name]
            if (name.startsWith("vtx_") || name.startsWith("ctrl_"))
                assert(arr.length === vtx_count * meta.num_elems, this, "unexpected vtx attrib array size")
            else if (name.startsWith("face_"))
                assert(arr.length === face_count * meta.num_elems, this, "unexpected vtx attrib array size")
            else 
                assert(false, this, "unexpected attr name " + name)
            const new_arr = repeat_arr(arr, tg_vtx_count)
            out_paths.set(name, new_arr, meta.num_elems, meta.need_normalize)
        }
        const new_ranges = []
        let at_vtx_index = 0
        for(let ti = 0; ti < tg_vtx_count; ++ti) {
            for(let fi = 0; fi < in_obj.paths_ranges.length; fi += 3) 
                new_ranges.push(in_obj.paths_ranges[fi] + at_vtx_index, in_obj.paths_ranges[fi+1] + at_vtx_index, in_obj.paths_ranges[fi+2])
            at_vtx_index += vtx_count
        }
        out_paths.paths_ranges = new_ranges

        const new_face_tr = this.make_face_transform(face_count, tg_vtx_count, tr_need_target)
        out_paths.set("face_transform", new_face_tr, 6, false)
        return out_paths
    }

    make_face_transform(count_faces, tg_vtx_count, tr_need_target)
    {
        const index_wrap = this.get_index_wrap()

        let pi = 0
        const new_face_tr = new Float32Array(count_faces * tg_vtx_count * 6)

        for(let i = 0; i < tg_vtx_count; ++i) 
        {
            index_wrap[0] = i
            if (tr_need_target !== null)
                tr_need_target.dyn_set_prop_index(i)

            const m = this.transform.dyn_eval()
            // duplicate the same transform for all faces of in_obj
            for(let dupi = 0; dupi < count_faces; ++dupi) {
                new_face_tr[pi++] = m[0]; new_face_tr[pi++] = m[1]; 
                new_face_tr[pi++] = m[3]; new_face_tr[pi++] = m[4]; 
                new_face_tr[pi++] = m[6]; new_face_tr[pi++] = m[7];
            }
        }
        return new_face_tr
    }

    run() {
        const in_obj = this.in_obj.get_const()
        assert(in_obj !== null, this, "No input object to copy")

        const [tg_vtx_count, tr_need_target] = this.get_meta_target()
            
        let out_obj = null
        if (in_obj.constructor === Mesh)
            out_obj = this.mesh_copy(in_obj, tg_vtx_count, tr_need_target)
        else if (in_obj.constructor === MultiPath)
            out_obj = this.path_copy(in_obj, tg_vtx_count, tr_need_target)
        else
            assert(false, this, "Expected geometry object input")
        this.out.set(out_obj)
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
    async pre_draw(m, display_values) {
        console.assert(display_values.length == this.v.length, "display_values length mismatch")
        for(let i in this.v) {
            await this.v[i].pre_draw(m, display_values[i])
        }        
    }
    draw(m, display_values) {
        console.assert(display_values.length == this.v.length, "display_values length mismatch")
        for(let i in this.v) {
            this.v[i].draw(m, display_values[i])
        }
    }
    get_disp_params(values) {
        let r = []
        for(let i in this.v) {
            r.push(this.v[i].get_disp_params(values[i]))
        }
        return r 
    }
    draw_template(m) {
        for(let i in this.v) {
            this.v[i].draw_template(m)
        }        
    }
}

// list of order in of items
// items are maps with { name: id: } only name is displayed
// simple reference: https://www.cssscript.com/demo/drag-drop-dragonflyjs/
class ParamInputOrderList extends ListParam
{
    constructor(node, label, table, sorted_order) {
        super(node, label, 1, table, Array)
        this.sorted_order = sorted_order  // list of indices
        this.sorted_d = [] // list of object that just contain the index. need to be an object since this number is modified on the fly
        this.dragged = null
        this.loaded_order = null
    }
    save() { return { sorted_order: this.sorted_order }}
    load(v) { this.loaded_order = v.sorted_order }
    post_load_hook() {
        // postpone loading sorted_order to after all lines are loaded for a final sort
        let new_d = []
        if (this.loaded_order === null)
            return
        for(let n of this.loaded_order) {
            console.assert(n >= 0 && n < this.sorted_d.length)
            new_d.push(this.sorted_d[n])
        }
        this.sorted_d = new_d
        this.loaded_order = null
        this.redo_sort()
    }

    create_elem(parent, start_val, index, change_func, get_cur_val) {
        let wrap = add_div(parent, "param_lst_order_cell")
        let elem = add_div(wrap, "param_lst_order_item")
        elem.innerText = start_val.name
        elem.p_lst_index = index // index of the item in the lst, before sorting
        let doc_mousemove = null, doc_mouseup = null

        elem.addEventListener('mousedown', (ev)=>{
            if (ev.buttons !== 1)
                return
            let trect = ev.target.getBoundingClientRect()
            let offset = [trect.left - ev.pageX, trect.top - ev.pageY - 2] // 2 for border

            let e = ev.target.cloneNode(true)
            e.style.position = 'fixed'
            e.style.top = ev.pageY + offset[1] + "px"
            e.style.left = ev.pageX + offset[0] + "px"
            e.style.width = trect.width - 11 + "px" // no idea
            e.style.pointerEvents = "none"
            edit_params.appendChild(e)

            this.dragged = {lst_index: ev.target.p_lst_index, elem: e, mouse_offset: offset }
            toggle_dragged_style(true)
           
            document.addEventListener('mousemove', doc_mousemove)
            document.addEventListener('mouseup', doc_mouseup)
        })

        let toggle_dragged_style = (v)=>{
            this.elem_lst[this.dragged.lst_index].classList.toggle("param_lst_order_drag_placeholder", v)
        }

        let do_drop = (to)=> {
            if (this.dragged.lst_index === to) 
                return
            const from_i = this.sorted_d.findIndex((d)=>{return d.lst_index == this.dragged.lst_index})
            this.sorted_d.splice(from_i, 1)

            const to_i = this.sorted_d.findIndex((d)=>{return d.lst_index == to})
            let offset = (to_i >= from_i)?1:0
            this.sorted_d.splice(to_i+offset, 0, {lst_index:this.dragged.lst_index})

            this.redo_sort()
            toggle_dragged_style(true)
        }
        myAddEventListener(elem, 'mousemove', (ev)=>{
            if (this.dragged === null)
                return
            this.dragged.elem.style.top = ev.pageY + this.dragged.mouse_offset[1] + "px"
            this.dragged.elem.style.left = ev.pageX + this.dragged.mouse_offset[0] + "px"
            const to = ev.target.p_lst_index
            do_drop(to)
        })

        doc_mousemove = (ev)=>{
            if (this.dragged === null)
                return
            this.dragged.elem.style.top = ev.pageY + this.dragged.mouse_offset[1] + "px"
            this.dragged.elem.style.left = ev.pageX + this.dragged.mouse_offset[0] + "px"
        }

        doc_mouseup = (ev)=>{
            if (this.dragged === null)
                return            
            edit_params.removeChild(this.dragged.elem)
            toggle_dragged_style(false)
            this.dragged = null

            document.removeEventListener('mousemove', doc_mousemove)
            document.removeEventListener('mouseup', doc_mouseup)
        }

        return elem
    }
    external_update(elem, value, index) {
        // nothing to do?
    }    

    idx_from_id(id) {
        return this.lst.findIndex((e)=>{return e.id === id})
    }    

    redo_sort() {  // produce sorted_order frmo sorted_d
        let changed = (this.sorted_d.length !== this.sorted_order.length)
        if (!changed)
            for(let i = 0; i < this.sorted_d.length; ++i)
                if (this.sorted_d[i].lst_index !== this.sorted_order[i]) {
                    changed = true
                    break
                }
        if (!changed)
            return
        this.sorted_order.length = 0
        for(let d of this.sorted_d)
            this.sorted_order.push(d.lst_index)
        this.table.remake_table()
        this.pset_dirty()
    }    
    add(v) {
        v.lst_index = this.lst.length // index in this.lst
        this.sorted_d.push({lst_index:v.lst_index})
        super.add(v) // need to be before redo_sort which recreates the table
        this.redo_sort()
    }
    remove(idx_lst) {
        console.assert(idx_lst.length == 1, "expected only single item to remove")
        let idx = idx_lst[0]
        let d = this.lst[idx]
        super.remove(idx_lst)
        let rm = this.sorted_d.findIndex((v)=>{return v.lst_index == d.lst_index})
        this.sorted_d.splice(rm, 1)
        // fix the indices of all the items that came after this item. (adjust for the culling of lst)
        for(let od of this.sorted_d)
            if (od.lst_index > d.lst_index)
                od.lst_index--;
        this.redo_sort()  
        return d      
    }
    
}

function mixin_multi_reorder_control(node, cls, sorted_order, in_m) 
{
    cls.order_table = new ParamTable(node, "Order", sorted_order)
    cls.order = new ParamInputOrderList(node, "OrderInputs", cls.order_table, sorted_order)
    cls.order_table.with_index_column = true
    cls.order_table.with_column_sep = false
    cls.did_connect = function(to_term, line) {
        if (to_term !== in_m)
            return
        const node = line.from_term.owner
        if (cls.order.idx_from_id(node.id) !== -1)
            return // already there
        const d = { name:node.name, 
                    id:node.id  } 
        d.rename_func = (new_name)=>{d.name = new_name; cls.order_table.remake_table()}
        node.register_rename_observer(d.rename_func)

        cls.order.add(d)
    }
    cls.doing_disconnect = function(to_term, line) {
        if (to_term !== in_m)
            return
        const node = line.from_term.owner
        const idx = cls.order.idx_from_id(node.id)
        console.assert(idx != -1)

        let d = cls.order.remove([idx])
        node.remove_rename_observer(d.rename_func)
    }
}


class NodeGroupObjects extends NodeCls {
    static name() { return "Group Objects" }
    constructor(node) {
        super(node)
        this.sorted_order = []
        
        this.in_m = new InTerminalMulti(node, "in_multi_mesh")
        this.out = new OutTerminal(node, "out_mesh")

        mixin_multi_reorder_control(node, this, this.sorted_order, this.in_m)
    }
    run() {
        this.node.display_values = []
        let r = new PObjGroup()
        //for(let line of this.in_m.lines) {
        for(let idx of this.sorted_order) {
            const line = this.in_m.lines[idx]
            const obj = line.to_term.get_const()
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
        assert(this.transform.is_valid(), this, "invalid transform")
        // TBD mutate only if not identity
        let obj = this.in.get_mutable()
        assert(obj, this, "missing input")
        obj.transform(this.transform.v)
        this.out.set(obj)
    }
    draw_selection(m) {
        let out = this.out.get_const()
        if (out === null) // No output object to select
            return
        this.transform.draw_dial_at_obj(out, m)
        out.draw_border(m)
    }    
    image_find_obj(vx, vy, ex, ey) {
        return this.transform.dial.find_obj(ex, ey)
    }
}

// need this since Math.random can't be seeded
class RandNumGen
{
    constructor(seed) {
        this.state = seed
    }
    next() {
        this.state = (this.state * 1664525 + 1013904223) % 4294967296
        return this.state / 4294967296
    }
}

function dist(ax, ay, bx, by) {
    let dx = ax - bx, dy = ay - by
    return Math.sqrt(dx*dx+dy*dy)
}
function m_dist(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
}

function distance2(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    return dx * dx + dy * dy;
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
    static name() { return "Scatter Uniform" }
    constructor(node) {
        super(node)
        node.set_state_evaluators({"vtx_pos":  (m,s)=>{ return new ObjSubscriptEvaluator(m,s) }} )        

        this.in_obj = new InTerminal(node, "in_obj")
        this.out_mesh = new OutTerminal(node, "out_mesh")
        this.seed = new ParamInt(node, "Seed", 1)
        this.min_dist = new ParamFloat(node, "Min Distance", 0.02, [0.02, 0.5])
        // example: 0.05 + 0.03*sin(vtx_pos.x*6)

        //this.by_density.change_func() // enact the changes it does
    }
        
    run() {
        let in_obj = this.in_obj.get_const()
        assert(in_obj !== null, this, "No mesh input")
        assert(in_obj.get_bbox !== undefined, this, "Input does not define a bounding box")
        let bbox = in_obj.get_bbox()  // TBD cut into shape if shape allows that
        assert(bbox !== null, this, "Object doesn't have content for a bounding box")

        let vtx = [] 
        const r = this.min_dist.v
        assert(r !== null, this, "varying distance not supported by this node")
        const inner2 = r * r
        const A = 4 * r * r - inner2
        const cellSize = r * Math.SQRT1_2
        const gridWidth = Math.ceil(bbox.width() / cellSize), gridHeight = Math.ceil(bbox.height() / cellSize)
        const min_x = bbox.min_x, min_y = bbox.min_y, hw = bbox.width()/2, hh = bbox.height()/2  // for centering the grid
        const grid = new Array(gridWidth * gridHeight)
        const tries_k = 20

        //let timer = new Timer()

        function emitSample(p) {
            queue.push(p)
            vtx.push(p[0], p[1])
            const gx = (p[0] - min_x) / cellSize | 0
            const gy = (p[1] - min_y) / cellSize | 0
            if (gx < 0 || gy < 0 || gx >= gridWidth || gy >= gridHeight)
                return             
            grid[gridWidth * gy + gx] = p;
        }

        function generateAround(p) {
            let phi = prng.next() * 2 * Math.PI
            let r = Math.sqrt(prng.next() * A + inner2); 
            return [p[0] + r * Math.cos(phi), p[1] + r * Math.sin(phi)];  
        }

        function withinExtent(p) {
            const x = p[0], y = p[1];
            return bbox.min_x <= x && x <= bbox.max_x && bbox.min_y <= y && y <= bbox.max_y;
        }
        function near(p) {
            const n = 1
            const gx = (p[0] - min_x ) / cellSize | 0
            const gy = (p[1] - min_y ) / cellSize | 0
            if (gx < 0 || gy < 0 || gx >= gridWidth || gy >= gridHeight)
                return true // prevent it 
            const x0 = Math.max(gx - n, 0)
            const y0 = Math.max(gy - n, 0)
            const x1 = Math.min(gx + n + 1, gridWidth)
            const y1 = Math.min(gy + n + 1, gridHeight);
            for (let y = y0; y < y1; ++y) {
                let o = y * gridWidth;
                for (let x = x0; x < x1; ++x) {
                    let g = grid[o + x];
                    if (g && distance2(g, p) < inner2) 
                        return true;
                }
            }
            return false;
        }
        
        const prng = new RandNumGen(this.seed.v)

        const queue = []
        emitSample([bbox.min_x + bbox.width()*prng.next(), bbox.min_y + bbox.height()*prng.next()]);
        
        while (queue.length > 0) {
            let i = prng.next() * queue.length | 0
            let p = queue[i], j

            
            for (j = 0; j < tries_k; ++j) {
                let q = generateAround(p);
                if (!withinExtent(q))
                    continue
                if (near(q)) 
                    continue
                emitSample(q);
                break;
            }
            if (j === tries_k) { // exhausted all possibilites with this point in the queue
                queue[i] = queue[queue.length-1]
                queue.pop();   
            }
            //if (vtx.length > 10000)
            //    break
        }
        //assert(!too_many_zeros, this, "Expression evaluates to zero too much")

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
            // do this even if the mesh is already triangle mesh so that we'll get the true triangulation
            let obj = this.in_obj.get_mutable()
            let d = new Delaunator(obj.effective_vtx_pos)
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

// build my kind of path from canvas ops
class PathsBuilder {
    constructor() {
        this.vtx_pos = []
        this.paths_ranges = []
        this.from_arr = [] // for each face, from what vertex index it came from 
    }
    moveTo(x,y, from_idx) {
        let l = this.vtx_pos.length / 2
        this.paths_ranges.push(l,l+1,0)
        this.vtx_pos.push(x,y)
        this.from_arr.push(from_idx)
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
        // there is a result but it might have holes (actually degenerate paths with just 2 points). 
        // To make it do the "right thing" the paths
        // itself need to be the hulls (and not the delaunay hull) as is computed in paths triangulate
        // but that would also not look good since the separate voronois would intersect each other
        // it is possible to introduce the concept of multiple hulls into the algorithm but I didn't do it

        let bbox = mesh.get_bbox()
        let mx = this.margin.x, my = this.margin.y

        let delaunay = { triangles:mesh.arrs.idx, points:mesh.effective_vtx_pos, halfedges:mesh.halfedges, hull:mesh.hull }
        let voronoi = new Voronoi(delaunay, [bbox.min_x-mx,bbox.min_y-my, bbox.max_x+mx,bbox.max_y+my]);
        let builder = new PathsBuilder()
        voronoi.renderCells(builder)
        let new_paths = new MultiPath()
        builder.finalize(new_paths)

        // transfer vertex attributes to face attributes
        for(let arr_name in mesh.arrs) {
            if (!arr_name.startsWith("vtx_") || arr_name === "vtx_pos")
                continue
            
            let from_arr = mesh.arrs[arr_name]
            let num_elems = mesh.meta[arr_name].num_elems
            let idx_src = builder.from_arr;

            let new_arr = new from_arr.constructor(idx_src.length * num_elems)
            let ni = 0
            for(let idx of idx_src) {
                for(let i = 0; i < num_elems; ++i) {
                    new_arr[ni++] = from_arr[idx*num_elems+i]  
                }
            }
            new_paths.set("face_" + arr_name.substr(4), new_arr, num_elems, mesh.meta[arr_name].need_normalize)
    
        }


        this.out_mesh.set(new_paths)
    }
}


class NodeGeomDivide extends NodeCls
{
    static name() { return "Divide" }
    constructor(node) {
        super(node)
        this.in_mesh = new InTerminal(node, "in_mesh")
        this.out_mesh = new OutTerminal(node, "out_mesh")
        this.by_dist = new ParamBool(node, "Set distance", false, (v)=>{
            this.divisions.set_enable(!v)
            this.distance.set_enable(v)
            this.distance_uv.set_enable(v)
            this.sep_uv.set_enable(v)
            this.exact.set_enable(v)
        })
        this.divisions = new ParamInt(node, "Divisions", 4, {min:1, max:10})
        this.sep_uv = new ParamBool(node, "Separate U-V", false, (v)=>{
            this.distance.set_visible(!v)
            this.distance_uv.set_visible(v)
        })
        this.distance = new ParamFloat(node, "Distance", 0.1)
        this.distance_uv = new ParamVec2(node, "Distance U-V", 0.1, 0.1)
        this.exact = new ParamBool(node, "Exact", false)

        node.param_alias("Set approximate distance", this.by_dist)
    }

    divide_quad(mesh, out_vtx, out_idx, idx0, idx1, idx2, idx3) {
        // assumes it's a parallelogram
        const vtx = mesh.effective_vtx_pos
        const p0_x = vtx[idx0*2], p0_y = vtx[idx0*2+1]
        const p1_x = vtx[idx1*2], p1_y = vtx[idx1*2+1]
        const p3_x = vtx[idx3*2], p3_y = vtx[idx3*2+1]
        let da_x = p1_x - p0_x, da_y = p1_y - p0_y // vector a from 0 to 1
        let db_x = p3_x - p0_x, db_y = p3_y - p0_y // vector b from 0 to 3

        let div_a, div_b;
        if (!this.by_dist.v)
            div_a = div_b = this.divisions.v;
        else {
            let dist_a, dist_b
            if (this.sep_uv.v) {
                dist_a = this.distance_uv.y, dist_b = this.distance_uv.x
            }
            else {
                dist_a = this.distance.v, dist_b = this.distance.v
            }
            assert(dist_a !== 0 && dist_b !== 0, this, "Division by zero")
            const da_len = Math.sqrt(da_x*da_x + da_y*da_y)
            div_a = Math.round(da_len/dist_a)
            const db_len = Math.sqrt(db_x*db_x + db_y*db_y)
            div_b = Math.round(db_len/dist_b) // how many dividers
            if (this.exact.v) {
                const new_da_len = dist_a*div_a, new_db_len=dist_b*div_b
                da_x *= new_da_len/da_len
                da_y *= new_da_len/da_len
                db_x *= new_db_len/db_len
                db_y *= new_db_len/db_len
            }   
        }
        assert(div_a != 0 && div_b != 0, this, "Division by zero")
        
        da_x /= div_a; da_y /= div_a
        db_x /= div_b; db_y /= div_b

        const vtx_start = out_vtx.length / mesh.meta.vtx_pos.num_elems
        for(let bi = 0; bi <= div_b; ++bi) {
            for(let ai = 0; ai <= div_a; ++ai) {
                const np_x = p0_x + da_x*ai + db_x*bi
                const np_y = p0_y + da_y*ai + db_y*bi
                out_vtx.push(np_x, np_y)
            }
        }

        // quads
        const sz_a = div_a+1
        for(let ai = 0; ai < div_a; ++ai) {
            for(let bi = 0; bi < div_b; ++bi) {
                const idx0 = ai+bi*sz_a
                const idx1 = idx0+1
                const idx2 = idx1+sz_a
                const idx3 = idx0+sz_a
                out_idx.push(vtx_start + idx0, vtx_start + idx1, vtx_start + idx2, vtx_start + idx3)
            }
        }
    }

    divide_line(out_vtx, prev_x, prev_y, x, y, add_last)
    {
        let da_x = x - prev_x, da_y = y - prev_y
        let div_a
        if (!this.by_dist.v)
            div_a = this.divisions.v;
        else {
            const dist = this.distance.v
            div_a = Math.round(Math.sqrt(da_x*da_x + da_y*da_y)/dist)
        }
        da_x /= div_a; da_y /= div_a
        if (add_last)
            div_a += 1
        for(let ai = 0; ai < div_a; ++ai) {
            const np_x = prev_x + da_x*ai
            const np_y = prev_y + da_y*ai
            out_vtx.push(np_x, np_y)
        }
    }

    run() {
        let obj = this.in_mesh.get_const()
        assert(obj !== null, this, "Missing input points")

        if (this.by_dist.v)
            assert(this.distance.v != 0, this, "Division by zero")
        if (obj.constructor === Mesh && obj.type == MESH_QUAD) 
        {
            // quad divides to little quads
            // each quad separately, not unifying vertices from different quads
            const out_vtx = [], out_idx = []
            const idx = obj.arrs.idx
            for(let i = 0; i < idx.length; i += 4) {
                this.divide_quad(obj, out_vtx, out_idx, idx[i], idx[i+1], idx[i+2], idx[i+3])
            }
            const out_mesh = new Mesh()
            out_mesh.set('vtx_pos', new TVtxArr(out_vtx), 2, false)
            out_mesh.set('idx', new TIdxArr(out_idx))
            out_mesh.type = MESH_QUAD
            this.out_mesh.set(out_mesh)
        }
        else if (obj.constructor === MultiPath) {
            const vtx = obj.effective_vtx_pos
            const out_vtx = [], out_ranges = []
            for(let pri = 0; pri < obj.paths_ranges.length; pri += 3) {
                const start_vidx = obj.paths_ranges[pri]*2
                const end_vidx = obj.paths_ranges[pri+1]*2
                const flags = obj.paths_ranges[pri+2]
                const closed = flags & PATH_CLOSED
                let prev_x = vtx[end_vidx-2], prev_y = vtx[end_vidx-2+1]
                const out_start = out_vtx.length
                let first_line = true
                for(let vidx = start_vidx; vidx < end_vidx; vidx += 2) {
                    const x = vtx[vidx], y = vtx[vidx+1]
                    const is_real_line = (!first_line) || (first_line && closed)
                    if (is_real_line) {
                        // in unclosed path, the last line should also include the last point since there's no line coming out of that point to complete it
                        this.divide_line(out_vtx, prev_x, prev_y, x, y, !closed && (vidx == end_vidx - 2))
                    }
                    prev_x = x; prev_y = y
                    first_line = false
                }
                const out_end = out_vtx.length
                out_ranges.push(out_start, out_end, flags)
            }
            const out_paths = new MultiPath()
            out_paths.paths_ranges = out_ranges
            out_paths.set('vtx_pos', new TVtxArr(out_vtx), 2, false)
            this.out_mesh.set(out_paths)
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
    draw_template_m(m) {
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

// TBD skip open paths
function path_lines(paths_ranges, vtx) {
    let lines = [], face_sizes = []
    for(let pri = 0; pri < paths_ranges.length; pri += 3) {
        let start_idx = paths_ranges[pri]
        let end_idx = paths_ranges[pri+1]
        let start_vidx = start_idx*2, end_vidx = end_idx*2
        let prev_x = vtx[end_vidx-2], prev_y = vtx[end_vidx-1]
        let prev_from_idx = end_idx-1
        for(let vidx = start_vidx; vidx < end_vidx; vidx += 2) {
            let p_prev = vec2.fromValues(prev_x, prev_y)
            p_prev.from_idx = prev_from_idx
            let x = vtx[vidx], y = vtx[vidx+1]
            let p_cur = vec2.fromValues(x, y)
            p_cur.from_idx = vidx/2
            prev_x = x, prev_y = y, prev_from_idx = p_cur.from_idx
            lines.push([p_prev, p_cur])
        }
        face_sizes.push(end_idx - start_idx)
    }
    return [lines, face_sizes]
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

// with paths, detect and skip a line that goes the other way that the rest of the poly since it was too short
// https://stackoverflow.com/questions/1165647/how-to-determine-if-a-list-of-polygon-points-are-in-clockwise-order
function skip_short_knots(intersections) 
{    
    let path_lines = []
    for(let i = 0; i < intersections.length; ++i)
        path_lines.push([intersections[i], intersections[(i+1)%intersections.length]])

    let found, len = path_lines.length
    if (len == 3)
        return
    do {
        found = false
        // go over the path with 3 indices, look for middle that's different in sign from ends
        let a, b, c, np;
        for(a = 0; a < len; ++a) {
            b = (a+1)%len, c = (a+2)%len
            np = get_line_intersection(path_lines[a], path_lines[c], false)
            if (np !== null) {
                found = true;
                break;
            }
        }
        if (found) {
            np.from_idx = intersections[b].from_idx
            intersections.splice(b, 1, np)
            intersections.splice((b+1)%len, 1)
            path_lines.splice(b, 1)
        }
        len = path_lines.length
    } while(found && len > 3) // if we found one knot and removed it, try to find another one
}

function get_line_intersection(l0, l1, allow_overshoot) 
{
    const p0_x = l0[0][0], p0_y = l0[0][1]
    const p1_x = l0[1][0], p1_y = l0[1][1]
    const p2_x = l1[0][0], p2_y = l1[0][1]
    const p3_x = l1[1][0], p3_y = l1[1][1]
    const s1_x = p1_x - p0_x;
    const s1_y = p1_y - p0_y;
    const s2_x = p3_x - p2_x;
    const s2_y = p3_y - p2_y;
    const s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / (-s2_x * s1_y + s1_x * s2_y);
    const t = ( s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / (-s2_x * s1_y + s1_x * s2_y);
    if (allow_overshoot || (s >= 0 && s <= 1 && t >= 0 && t <= 1))
    {
        // intersect detected
        const i_x = p0_x + (t * s1_x);
        const i_y = p0_y + (t * s1_y);
        return vec2.fromValues(i_x, i_y);
    }
    return null; // No collision
}



function fast_miter_run(mesh, offset, allow_overshoot, nodecls) 
{
    assert(mesh !== null, nodecls, "missing input mesh")
    //assert(mesh.face_size !== undefined, this, "input needs to be a mesh")

    // a line is a list of two points. `lines` has `face_size` lines for each face
    // if face_sizes is not null, then it's different size for every face
    if (mesh.constructor == Mesh) {
        var const_face_size = mesh.face_size()
        var lines = mesh_lines(mesh.arrs.idx, mesh.effective_vtx_pos, const_face_size)
        var face_sizes = null
    }
    else if (mesh.constructor == MultiPath) {
        var const_face_size = null
        var [lines, face_sizes] = path_lines(mesh.paths_ranges, mesh.effective_vtx_pos)
    }
    else {
        assert(false, nodecls, "input needs to be mesh or paths")
    }
    lines = inset_lines(lines, offset) // in-place


    //this.out_mesh.set(new LinesObj(lines))
    //return

    let new_vtx = [], new_idx = [], from_face = [], new_ranges = []
    let from_vidx = [] // for every vertex pushed to new_vtx, what's the index of the vertex in the original object it came from

    let ri = 0
    let cur_face_size = const_face_size
    for (let i = 0, fi = 0; i < lines.length; i += cur_face_size, ++fi) 
    {
        if (face_sizes !== null)
            cur_face_size = face_sizes[fi]

        let got_null = false, intersections = []
        for(let j = 0; j < cur_face_size; ++j) {
            let p = get_line_intersection(lines[i+j], lines[i+((j+1) % cur_face_size)], allow_overshoot)
            if (p === null) {
                got_null = true
                break
            }
            p.from_idx = lines[i+j][1].from_idx
            intersections.push(p)
        }
        if (mesh.constructor == MultiPath) { // knots
            skip_short_knots(intersections)
        }

        if (got_null)
            continue
        let start_idx = ri
        for(let p of intersections) {
            new_vtx.push(p[0], p[1])
            from_vidx.push(p.from_idx)
            new_idx.push(ri)
            ri += 1
        }
        new_ranges.push(start_idx, ri, PATH_CLOSED)
        from_face.push(fi)
    }
    // build output vertices and polys
    let out_obj = null
    if (mesh.constructor == Mesh) {
        out_obj = new Mesh()
        out_obj.set('idx', new TIdxArr(new_idx))
        out_obj.set_type(mesh.type)
    }
    else { // MultiPath
        out_obj = new MultiPath()
        out_obj.paths_ranges = new_ranges;
    }
    out_obj.set('vtx_pos', new TVtxArr(new_vtx), 2)

    // transfer other attributes
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
    out_obj.fill_objs = clone_fill_objs(mesh.fill_objs)
    return out_obj
}


class NodeOffsetPath extends NodeCls {
    static name() { return "Offset Path" }
    constructor(node) {
        super(node)
        this.in_obj = new InTerminal(node, "in_obj")
        this.out_obj = new OutTerminal(node, "out_obj")    
        this.offset = new ParamFloat(node, "Offset", 0.1, [-0.2,0.2])
        const arcTolVis = ()=>{
            this.arcTol.set_visible(this.point_type.sel_idx == 4 || this.open_op.sel_idx == 1)
        }
        this.point_type = new ParamSelect(node, "Point Type", 0, [["Square", ClipperLib.JoinType.jtSquare], 
                                                                  ["Miter", ClipperLib.JoinType.jtMiterAlways],
                                                                  ["Miter Thresh", ClipperLib.JoinType.jtMiter], 
                                                                  ["Fast Miter", -1],
                                                                  ["Round", ClipperLib.JoinType.jtRound]], (sel_idx)=>{
            this.miterLimit.set_visible(sel_idx === 2)
            this.closed_op.set_visible(sel_idx !== 3)
            this.open_op.set_visible(sel_idx !== 3)
            this.allow_overshoot.set_visible(sel_idx === 3)
            arcTolVis()        
        })
        this.closed_op = new ParamSelect(node, "Closed Paths", 0, [["Polygon", ClipperLib.EndType.etClosedPolygon],
                                                                   ["Line", ClipperLib.EndType.etClosedLine]])
        this.open_op = new ParamSelect(node, "Open Paths", 0, [["Square", ClipperLib.EndType.etOpenSquare],
                                                               ["Round", ClipperLib.EndType.etOpenRound],
                                                               ["Butt", ClipperLib.EndType.etOpenButt]], arcTolVis)

        this.miterLimit = new ParamFloat(node, "Miter Thresh", 2.0, [1.0, 4.0]) // sharp edges limit
        this.arcTol = new ParamFloat(node, "Arc Step", 0.002, [0.0001, 0.01]) 
        
        this.allow_overshoot = new ParamBool(node, "Allow over-shoot", false) 
    }


    run() {
        const obj = this.in_obj.get_const()
        assert(obj !== null, this, "missing input mesh")
        if (this.point_type.sel_idx == 3) {
            const new_obj = fast_miter_run(obj, -this.offset.get_value(), this.allow_overshoot.get_value(), this)
            this.out_obj.set(new_obj)
            return
        }

        let arcTol = this.arcTol.get_value()
        if (arcTol <= 0)
            arcTol = 0.1
        ClipperLib.use_xyz = true
        const co = new ClipperLib.ClipperOffset(this.miterLimit.get_value() * CLIPPER_SCALE, arcTol * CLIPPER_SCALE)
        co.ZFillFunction = (bot1, top1, bot2, top2, pt)=>{
            // getting the two lines that intersect, get the Z from the point that is the same on both lines, the common point to both lines
            if (bot1.Z == top1.Z)      pt.Z = bot1.Z
            else if (bot1.Z == bot2.Z) pt.Z = bot1.Z
            else if (bot1.Z == top2.Z) pt.Z = bot1.Z
            else if (top1.Z == bot2.Z) pt.Z = top1.Z
            else if (top1.Z == top2.Z) pt.Z = top1.Z
            else if (bot2.Z == top2.Z) pt.Z = bot2.Z
            else pt.Z = -1
        }
        const paths = obj.ensure_clipper(true)

        for(let p of paths) {
            co.AddPath(p, this.point_type.get_sel_val(), p.closed ? this.closed_op.get_sel_val() : this.open_op.get_sel_val())
        }
        let p_res = new ClipperLib.Paths()
        co.Execute(p_res, this.offset.get_value() * CLIPPER_SCALE);

        p_res = ClipperLib.JS.Lighten(p_res, 0.000001 * CLIPPER_SCALE);
        ClipperLib.use_xyz = false
        let new_obj = new MultiPath()
        
        const xfer_indices = new_obj.from_clipper_paths(p_res)
        // returned for every element in the new vtx_pos, what index it came from from the original vtx_pos (unmultiplied)

        // transfer other attributes
        for(let arr_name in obj.arrs) {
            if (arr_name == "idx" || arr_name == "vtx_pos")
                continue
            
            let src_arr = obj.arrs[arr_name]
            let num_elems = obj.meta[arr_name].num_elems
            // it's meaningful to transfer only vertices since faces may be merged
            if (!arr_name.startsWith("vtx_")) 
                continue

            let new_arr = new src_arr.constructor(xfer_indices.length * num_elems)
            let ni = 0

            for(let idx of xfer_indices) {
                if (idx !== -1)
                    for(let i = 0; i < num_elems; ++i) 
                        new_arr[ni++] = src_arr[idx*num_elems+i]  
                else  // happens when two expansions collide so there's no vertex use as sourse
                    for(let i = 0; i < num_elems; ++i) 
                        new_arr[ni++] = 0 // need some default value, this is as good as any  
            }
            new_obj.set(arr_name, new_arr, num_elems, obj.meta[arr_name].need_normalize)
        }        

        this.out_obj.set(new_obj)

    }
}