class MultiPath extends PObject
{
    static name() { return "MultiPath" }
    constructor() {
        super()
        this.cmds = [] // list of paths, each a list of ['M', 0, 'L', 1] where 0,1 are indices of vertices
        this.paths = null
        this.arrs = { vtx_pos:null }  // common to all paths
        this.meta = { vtx_pos:null }
        this.tcache = { vtx_pos:null, m:null }  // transformed cache (for setattr)
    }
    add_path(p) {
        this.cmds.push(p)
    }
    set(name, arr, num_elems, need_normalize) {
        name = normalize_attr_name(name)
        this.arrs[name] = arr
        this.meta[name] = { num_elems: num_elems,
                            need_normalize: need_normalize }
    }

    get_disp_params(disp_values) {
        return [ new DispParamBool(disp_values, "Show Vertices", 'show_vtx', true),
                 new DispParamBool(disp_values, "Show Lines", 'show_lines', true),
                 new DispParamBool(disp_values, "Show Faces", 'show_faces', true)
                ]
    }

    // API
    transform(m) {
        Mesh.transform_arr(m, this.arrs.vtx_pos, this.arrs.vtx_pos)
    }

    // API
    get_bbox() {
        return Mesh.prototype.get_bbox.call(this)
    }
    draw_border(m) {
        Mesh.prototype.draw_border.call(this, m)
    }

    face_count() {
        return this.cmds.length
    }
    vtx_count() {
        return Mesh.prototype.vtx_count.call(this)
    }

    ensure_tcache(m) {
        return Mesh.prototyle.ensure_tcache(m)
    }

    draw_poly(do_fill) {
        if (this.paths === null || this.paths.length != this.cmds.length) 
        {
            this.paths = []
            let vtx = this.arrs.vtx_pos;
            for(let pcmds of this.cmds) {
                let plst = []
                let ci = 0;
                while(ci < pcmds.length) {
                    let cmd = pcmds[ci]
                    if (cmd == 'M' || cmd == 'L') {
                        let vidx = pcmds[ci+1] * 2
                        plst.push(cmd, vtx[vidx], vtx[vidx+1])
                        ci += 2
                    }
                    else if (cmd == 'Z') {
                        plst.push(cmd)
                        ++ci
                    }
                    else if (cmd == 'A') { // arc: A,its arguments,index of end-point
                        let vidx = pcmds[ci+2] * 2
                        plst.push(cmd, pcmds[ci+1], vtx[vidx], vtx[vidx+1]) 
                        ci += 3
                    }
                    else {
                        dassert(false, "Unexpected path cmd " + cmd)
                    }
                }
                let s = plst.join(" ")
                let jp = new Path2D(s)
                this.paths.push(jp)
            }
        }
        let cidx = 0
        let fcol = this.arrs.face_color
        do_fill = do_fill && (fcol !== undefined)
        for(let p of this.paths) {
            if (do_fill) {
                let col = "rgba(" + fcol[cidx] + "," + fcol[cidx+1] + "," + fcol[cidx+2] + "," + (fcol[cidx+3]/255) + ")"
                cidx += 4
                ctx_img.fillStyle = col
                ctx_img.fill(p)
            }
            ctx_img.strokeStyle = "#000"
            ctx_img.lineWidth = 0.5/image_view.viewport_zoom
            ctx_img.stroke(p)
        }
    }


    // API
    draw(m, disp_values) {
        if (this.arrs.vtx_pos === null)
            return
        ctx_img.save()
        ctx_img.setTransform(m[0], m[1], m[3], m[4], m[6], m[7])
        if (disp_values.show_lines)
            this.draw_poly(disp_values.show_faces)
        if (disp_values.show_vtx)
            Mesh.prototype.draw_vertices.call(this)

        ctx_img.restore()
    }

    draw_selection(m, select_vindices) {
        Mesh.prototype.draw_selection.call(this, m, select_vindices)
    }
}




class PathPoly {
    constructor(id) {
        this.closed = false
    }
}
// used in NodeManualGeom
class PathPolysList extends Parameter {
    constructor(node) {
        super(node, "polys")
        this.lst = []  // contains references to PathPoly objects all points of a poly point to the same object
    }
    save() { 
        let polys = []
        let refs = []
        let cur = null
        for(let p of this.lst) {
            if (p !== cur) {
                polys.push(p)
                cur = p
            }
            refs.push(polys.length-1) // the index of the last poly seen
        }
        return {polys:polys, refs:refs} 
    }
    load(v) { 
        this.lst = []
        for(let r of v.refs) {
            this.lst.push(v.polys[r])
        }
    } 
    add(v) {
        this.lst.push(v)
        this.pset_dirty()
    }
    add_default() {
        let p
        if (this.lst.length == 0)
            p = new PathPoly()
        else {
            let last_poly = this.lst[this.lst.length - 1]
            if (last_poly.closed)
                p = new PathPoly()
            else
                p = last_poly
        }
        this.add(p)
    }
    close_current(clicked_index) {
        // go backwards to see where the current poly starts
        let cur_poly = this.lst[this.lst.length-1]
        if (cur_poly.closed)
            return false
        for(let i = this.lst.length-1; i >= 0; --i) {
            if (this.lst[i] !== cur_poly) {
                if (i + 1 != clicked_index)
                    return false;
                break // found the first and it is the expected index
            }
        }
        
        cur_poly.closed = true
        this.pset_dirty()
        return true // managed to close
    }
    remove(indices) {
        for(let index of indices)
            delete this.lst[index]
            this.lst = cull_list(this.lst)
    }
    add_elems(parent) {}
}


function triangulate_path(obj, node)         
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
                assert(vidx + 1 < vtx.length, node, "wrong path cmd")
                let tpnt = new poly2tri.Point(vtx[vidx], vtx[vidx+1])
                tpnt.my_index = idx
                tpnt.visited = false
                plst.push(tpnt)
                
                ci += 2
            }
            else if (cmd = 'Z')
                ++ci
            else 
                assert(false, node, "Unexpected path cmd " + cmd)
        }
        if (plst.length >= 3) {
            swctx.addHole(plst)
            all_pnts.push.apply(all_pnts, plst)
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
                assert(false, node, "Failed triangulation")
            }
            var triangles = swctx.getTriangles();
            for(let tri of triangles) {
                let tripnt = tri.getPoints()
                console.assert(tripnt.length == 3, "unexpected size of triangle")
                // for the edge case of triangulation emitting points that it created, not from the input (don't know how to reproduce this)
                console.assert(tripnt[0].my_index !== undefined && tripnt[1].my_index !== undefined && tripnt[2].my_index !== undefined, "External helper point?")
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
    return out_mesh
    
}