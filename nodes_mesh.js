"use strict"

class NodeCls {
    constructor() {

    }
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
        this.size = new ParamVec2(node, "size", 0.5, 0.5)
    }
    run() {
        let m = new Mesh()
        // center at 0,0
        let hx = this.size.x * 0.5, hy = this.size.y * 0.5
        m.set_vtx([-hx, -hy, hx, -hy, hx, hy, -hx, hy])
        m.set_idx([0, 1, 2, 3])
        m.set_type(MESH_QUAD)
        this.out.set(m)
    }
}

class NodePointColor extends NodeCls
{
    static name() { return "Point_Color" }
    constructor(node) {
        super()
        this.in_mesh = new InTerminal(node, "in_mesh")
        this.out_mesh = new OutTerminal(node, "out_mesh")
        this.color = new ParamColor(node, "color", "#cccccc")
    }
    run() {
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