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
        new ParamSeparator(node)
        this.transform = new ParamTransform(node, "Transform")
    }
    run() {
        let mesh = new Mesh()
        // center at 0,0
        let hx = this.size.x * 0.5, hy = this.size.y * 0.5
        mesh.set('vtx', new TVtxArr([-hx, -hy, hx, -hy, hx, hy, -hx, hy]), 2)
        mesh.set('idx', new TIdxArr([0, 1, 2, 3]))
        mesh.set_type(MESH_QUAD)
        mesh.transform(this.transform.v)
        this.out.set(mesh)
    }
    draw_selection(m) {
        let mesh = this.out.get_const()
        if (mesh === null)
            return // might be it's not connected so it doesn't have output
        let bbox = mesh.get_bbox()
        let center = vec2.fromValues((bbox.min_x + bbox.max_x) * 0.5, (bbox.min_y + bbox.max_y) * 0.5)
        vec2.transformMat3(center, center, m)
        this.transform.draw_dial(center[0], center[1])
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

class CoordListParam extends ListParam {
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
class FloatListParam extends ListParam {
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
class ColorListParam extends ListParam {
    constructor(node, label, table) {
        super(node, label, 4, table, TColorArr, { create_elem: function(parent, start_val, changed_func) { 
            let [col,elem] = add_param_color(parent, uint8arr_to_color(start_val), "param_table_input_color", function(c) {
                changed_func(color_to_uint8arr(c))
            })
            return elem
        }})
        this.need_normalize = true
    }
    def_value() { return [0xcc, 0xcc, 0xcc, 0xff] }
}

class NodeManualPoints extends NodeCls
{
    static name() { return "Manual_Points" }
    constructor(node) {
        super(node)
        this.selected_indices = [] // point indices

        this.out = new OutTerminal(node, "out_mesh")
        this.table = new TableParam(node, "Point List")
        this.points = new CoordListParam(node, "Coord", this.table, this.selected_indices)
        this.dummy = new FloatListParam(node, "Dummy", this.table)
        this.color = new ColorListParam(node, "Point Color", this.table)

        this.pnt_attrs = [this.dummy, this.color]  // Param objets of additional attributes of each point other than it's coordinate
    }
    image_click(ex, ey) {
        let ti = image_view.epnt_to_model(ex, ey)
        this.points.add(ti)
        for(let attr_param of this.pnt_attrs) {
            attr_param.add(attr_param.def_value())
        }
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
        this.points.reprint_all_lines()
    }
    set_selection(idx) {
        this.selected_indices.length = 0
        this.selected_indices.push(idx)
        this.points.reprint_all_lines()
    }
    selected_obj_name() { return (this.selected_indices.length > 0) ? "points" : null }
    delete_selection() {
        this.points.remove(this.selected_indices)
        for(let attr_param of this.pnt_attrs) {
            attr_param.remove(this.selected_indices)
        }
        this.clear_selection()
        trigger_frame_draw(true)
    }
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
    run() {
        let mesh = new Mesh()
        mesh.set('vtx', new TVtxArr(this.points.lst), 2)
        for (let attr of this.pnt_attrs) {
            mesh.set(attr.label, attr.lst, attr.values_per_entry, attr.need_normalize)
        }
        this.out.set(mesh)
    }
    draw_selection(m) {
        let mesh = this.out.get_const()
        if (mesh === null)
            return // might be it's not connected so it doesn't have output
        mesh.draw_selection(m, this.selected_indices)
    }
}

// TBD any attribute
class NodeSetAttr extends NodeCls
{
    static name() { return "Set Attribute" }
    constructor(node) {
        super(node)
        this.in_mesh = new InTerminal(node, "in_mesh")
        this.in_source = new InTerminal(node, "attr_source")
        this.out_mesh = new OutTerminal(node, "out_mesh")
        this.source_sel = new ParamSelect(node, "Source", 0, ["Constant", "Input"])
        this.bind_to = new ParamSelect(node, "Bind To", 0, ["Vertices", "Faces"]) // TBD also lines?
        this.color = new ParamColor(node, "Color", "#cccccc")
    }

    prop_from_const(prop) {
        let col = this.color.v
        for(let i = 0; i < prop.length; i += 4) {
            prop[i] = col.r
            prop[i+1] = col.g
            prop[i+2] = col.b
            prop[i+3] = col.alpha*255 // normalized back to 0-1 in mesh draw
        }
    }

    prop_from_input_framebuffer(prop, mesh, fb) {
        mesh.ensure_tcache(image_view.t_viewspace)
        let vtx = mesh.tcache.vtx
        // see https://www.khronos.org/opengl/wiki/Vertex_Post-Processing#Viewport_transform
        // from Xw = (w/2)*Xp + (w/2) 
        let w = fb.width()
        let wf = w/2
        let hf = fb.height()/2
        let pixels = fb.get_pixels()

        let samp_vtx = (this.bind_to.sel_idx == 0)
        let face_sz = mesh.face_size()
        let vtxi = 0, idxi = 0
        for(let i = 0; i < prop.length; i += 4) 
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

            x = Math.round(wf*x + wf)
            y = Math.round(hf*y + hf)
            let pidx = (y*w + x)*4

            prop[i] = pixels[pidx]
            prop[i+1] = pixels[pidx+1]
            prop[i+2] = pixels[pidx+2]
            prop[i+3] = pixels[pidx+3]
        }
    }

    run() {
        assert(this.bind_to.sel_idx != -1, this, "'Bind To' not set")
        assert(this.source_sel.sel_idx != -1, this, "'Bind To' not set")
        let mesh = this.in_mesh.get_const()
        assert(mesh, this, "missing in_mesh")

        if (this.source_sel.sel_idx == 0 && this.color.v === null) {
            this.out_mesh.set(mesh)
            return // TBD warning
        }
        let src = null
        if (this.source_sel.sel_idx == 1) {
            src = this.in_source.get_const()
            assert(src !== null, this, "missing attribute source")
            assert(src.constructor === FrameBuffer, this, "expected FrameBuffer as input") // for now
        }

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


        // commiting to work
        mesh = this.in_mesh.get_mutable()            
        
        let prop = new TColorArr(elem_num * 4) //  * 4 for (r,g,b,alpha)
        if (this.source_sel.sel_idx == 0) // from const
            this.prop_from_const(prop)
        else { // from input
            this.prop_from_input_framebuffer(prop, mesh, src)
        }

        mesh.set(attr_prefix + 'color', prop, 4, true)
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
    }
    transform(m) {
        for(let obj of this.v) {
            obj.transform(m)
        }
    }
    draw(m) {
        for(let obj of this.v) {
            obj.draw(m)
        }
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
        let r = new PObjGroup()
        for(let line of this.in_m.lines) {
            r.v.push(line.to_term.get_const())
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

        function nearest_neighbor_dist(of_px, of_py) {
            var min_d = Number.MAX_VALUE
            for(let vi = 0; vi < vtx.length; vi += 2) {
                let px = vtx[vi], py = vtx[vi+1]
                var d = dist(px, py, of_px, of_py)
                if (d < min_d)
                    min_d = d
            }
            return min_d
        }        

        let prng = new RandNumGen(this.seed.v)
        let addi = 0
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
        r.set("vtx", vtx, 2)
        this.out_mesh.set(r)
        
    }
}


class NodeTriangulate extends NodeCls
{
    static name() { return "Triangulate" }
    constructor(node) {
        super(node)
        this.in_mesh = new InTerminal(node, "in_mesh")
        this.out_mesh = new OutTerminal(node, "out_mesh")        
    }
    run() {
        let mesh = this.in_mesh.get_mutable()
        assert(mesh !== null, this, "Missing input mesh")
        assert(mesh.arrs !== undefined && mesh.arrs.vtx !== undefined, this, "Input doesn't have vertices. type: " + mesh.constructor.name())
        let d = new Delaunator(mesh.arrs.vtx)
        mesh.set('idx', d.triangles)
        mesh.set_type(MESH_TRI)
        this.out_mesh.set(mesh)
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
        let vtx = mesh.arrs.vtx
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
            out_mesh.set('vtx', new Float32Array(out_vtx), 2, false)
            out_mesh.set('idx', new Uint32Array(out_idx))
            out_mesh.type = MESH_QUAD
            this.out_mesh.set(out_mesh)
        }
    }
}