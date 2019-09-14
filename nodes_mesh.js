"use strict"

class NodeCls {
    constructor() {
        this.error = null
    }
    // mouse interaction in image_view
    image_click() {}
    image_find_obj() { return null }
    clear_selection() {}
    draw_selection() {}
    selected_obj_name() { return null }
}


class NodeTestDummy extends NodeCls {
    static name() { return "Test_Dummy" }
    constructor(node) {
        super()
        this.in_1 = new InTerminal(node, "in_1")
        this.in_2 = new InTerminal(node, "in_2")
        this.out = new OutTerminal(node, "out")
    }
}


class NodeGeomPrimitive extends NodeCls
{
    static name() { return "Geom_Primitive" }
    constructor(node) {
        super()
        this.out = new OutTerminal(node, "out_mesh")
        this.size = new ParamVec2(node, "Size", 0.5, 0.5)
    }
    run() {
        let m = new Mesh()
        // center at 0,0
        let hx = this.size.x * 0.5, hy = this.size.y * 0.5
        m.set_vtx(new TVtxArr([-hx, -hy, hx, -hy, hx, hy, -hx, hy]))
        m.set_idx(new TIdxArr([0, 1, 2, 3]))
        m.set_type(MESH_QUAD)
        this.out.set(m)
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
        this.ofnode.selected_indices = [this.index]
        trigger_frame_draw(false)
    }
    mouseup() {}
    mousemove(dx,dy, vx,vy, ex,ey) {
        this.ofnode.move_selection(dx, dy)
    }

}

class NodeManualPoints extends NodeCls
{
    static name() { return "Manual_Points" }
    constructor(node) {
        super()
        this.out = new OutTerminal(node, "out_mesh")
        this.points = new ListParam(node, "Point List", 2, function(v) { return "(" + v[0].toFixed(3) + "," + v[1].toFixed(3) + ")" })
        this.selected_indices = []
    }
    image_click(ex, ey) {
        let ti = image_view.epnt_to_model(ex, ey)
        this.points.add(ti)
        trigger_frame_draw(true)
    }
    move_selection(dx, dy) {
        dx /= image_view.viewport_zoom
        dy /= image_view.viewport_zoom
        for(let vidx of this.selected_indices)
            this.points.increment(vidx, [dx, dy])
        trigger_frame_draw(true)
    }
    clear_selection() {
        this.selected_indices = []
    }
    selected_obj_name() { return (this.selected_indices.length > 0) ? "points" : null }
    delete_selection() {
        this.points.remove(this.selected_indices)
        this.clear_selection()
        trigger_frame_draw(true)
    }
    image_find_obj(vx, vy, ex, ey) {
        let [x,y] = image_view.epnt_to_model(ex, ey)
        let lst = this.points.lst
        let r = Math.max(7, MESH_DISP.vtx_radius) / image_view.viewport_zoom// if the disp radius gets lower, we still want it at reasonable value
        for(let i = 0; i < lst.length; i += 2) {
            if (m_dist(lst[i], lst[i+1], x, y) < r) {
                return new PointSelectHandle(this.points, i, this)
            }
        }
        return null
    }
    run() {
        let mesh = new Mesh()
        mesh.set_vtx(new TVtxArr(this.points.lst))
        this.out.set(mesh)
    }
    draw_selection(m) {
        let mesh = this.out.get_const()
        console.assert(mesh != null, "draw_selection with out null")
        mesh.draw_selection(m, this.selected_indices)
    }
}

class NodePointColor extends NodeCls
{
    static name() { return "Point_Color" }
    constructor(node) {
        super()
        this.in_mesh = new InTerminal(node, "in_mesh")
        this.out_mesh = new OutTerminal(node, "out_mesh")
        this.color = new ParamColor(node, "Color", "#cccccc")
    }
    run() {
        if (this.color.v === null) {
            let mesh = this.in_mesh.get_const()
            assert(mesh, this, "missing in_mesh")
            this.out_mesh.set(mesh)
            return
        }
        
        let mesh = this.in_mesh.get_mutable()
        assert(mesh, this, "missing in_mesh")
        let prop = new Uint8Array(mesh.arrs.vtx.length * 1.5) // / 2 for (x,y) * 3 for (r,g,b)
        for(let i = 0; i < prop.length; i += 3) {
            prop[i] = this.color.v.r
            prop[i+1] = this.color.v.g
            prop[i+2] = this.color.v.b
        }
        mesh.set_vtx_color(prop)
        this.out_mesh.set(mesh)
    }
}

class NodeMeshMerge extends NodeCls
{
    static name() { return "Mesh_Merge" }
    constructor(node) {
        super()
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
        super()
        this.in_m = new InTerminalMulti(node, "in_multi_mesh")
        this.out = new OutTerminal(node, "out_mesh")
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
        super()
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
        super()
        let that = this
        this.in_mesh = new InTerminal(node, "in_mesh")
        this.out_mesh = new OutTerminal(node, "out_mesh")
        this.seed = new ParamInt(node, "Seed", 1)
        this.by_density = new ParamBool(node, "Set Density", false, function(v) {
            that.count.set_label(v ? "Max Count" : "Count")
            that.min_dist.set_enable(v)
        })
        this.min_dist = new ParamFloat(node, "Min Distance", 0.02)
        this.count = new ParamInt(node, "Count", 50)  // TBD or by density - not size dependent
        this.smooth_iter = new ParamInt(node, "Smoothness", 20)

        this.by_density.change_func() // enact the changes it does
    }
        
    run() {
        let in_mesh = this.in_mesh.get_const()
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
        r.set_vtx(vtx)
        this.out_mesh.set(r)
        
    }
}


class NodeTriangulate extends NodeCls
{
    static name() { return "Triangulate" }
    constructor(node) {
        super()
        this.in_mesh = new InTerminal(node, "in_mesh")
        this.out_mesh = new OutTerminal(node, "out_mesh")        
    }
    run() {
        let mesh = this.in_mesh.get_mutable()
        assert(mesh !== null, this, "Missing input mesh")
        assert(mesh.arrs !== undefined && mesh.arrs.vtx !== undefined, this, "Input doesn't have vertices. type: " + mesh.constructor.name())
        let d = new Delaunator(mesh.arrs.vtx)
        mesh.arrs.idx = d.triangles
        mesh.type = MESH_TRI
        this.out_mesh.set(mesh)
    }
}