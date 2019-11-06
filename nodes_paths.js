const PATH_CLOSED = 1

class MultiPath extends PObject
{
    static name() { return "MultiPath" }
    constructor() {
        super()
        //this.cmds = [] // list of paths, each a list of ['M', 0, 'L', 1] where 0,1 are indices of vertices
        this.paths_ranges = [] // index in (normal index) of start, one-past-end of every path, flags (1 for closed)
        this.paths = null
        this.arrs = { vtx_pos:null }  // common to all paths
        this.meta = { vtx_pos:null }
        this.tcache = { vtx_pos:null, m:null }  // transformed cache (for setattr)
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
        return this.paths_ranges.length / 3
    }
    vtx_count() {
        return Mesh.prototype.vtx_count.call(this)
    }

    ensure_tcache(m) {
        return Mesh.prototype.ensure_tcache.call(this, m)
    }

    vidxs_of_face(i) {
        console.assert(i*3 < this.paths_ranges.length, "index out of bounds")
        let start_vidx = this.paths_ranges[i*3]*2
        let end_vidx = this.paths_ranges[i*3 + 1]*2
        let r = []
        for(let vidx = start_vidx; vidx < end_vidx; vidx += 2)
            r.push(vidx)
        return r
    }

    draw_poly(do_lines, do_fill) {
        if (this.paths === null || this.paths.length*3 != this.paths_ranges.length) 
        {
            this.paths = []
            let vtx = this.arrs.vtx_pos;
            for(let pri = 0; pri < this.paths_ranges.length; pri += 3) {
                let start_vidx = this.paths_ranges[pri]*2
                let end_vidx = this.paths_ranges[pri+1]*2
                let plst = ['M', vtx[start_vidx], vtx[start_vidx+1]]
                for(let vidx = start_vidx + 2; vidx < end_vidx; vidx += 2) {
                    plst.push('L', vtx[vidx], vtx[vidx+1])
                }
                if (this.paths_ranges[pri+2] == PATH_CLOSED)
                    plst.push('Z')
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
                ctx_img.lineWidth = 1 / image_view.viewport_zoom
                ctx_img.strokeStyle = col
                ctx_img.stroke(p) // fill antialiasing gaps
            }
            if (do_lines) {
                ctx_img.strokeStyle = "#000"
                ctx_img.lineWidth = 0.5/image_view.viewport_zoom
                ctx_img.stroke(p)
            }
        }
    }


    // API
    draw(m, disp_values) {
        if (this.arrs.vtx_pos === null)
            return
        ctx_img.save()
        try {
            ctx_img.setTransform(m[0], m[1], m[3], m[4], m[6], m[7])
            if (disp_values.show_lines || disp_values.show_faces)
                this.draw_poly(disp_values.show_lines, disp_values.show_faces)
            if (disp_values.show_vtx)
                Mesh.prototype.draw_vertices.call(this)
        }
        finally {
            ctx_img.restore()
        }
    }

    draw_selection(m, select_vindices) {
        Mesh.prototype.draw_selection.call(this, m, select_vindices)
    }
}


// used in NodeManualGeom
class PathRangesList extends Parameter {
    constructor(node) {
        super(node, "path_ranges")
        this.lst = []  // contains references to PathPoly objects all points of a poly point to the same object
    }
    save() { return {ranges:this.lst} }
    load(v) { this.lst = v.ranges }

    add_default() {
        let p
        if (this.lst.length == 0) {
            this.lst.push(0,1,0)
        }
        else {
            let last_end = this.lst[this.lst.length - 2]
            let last_flags = this.lst[this.lst.length - 1]
            if (last_flags == PATH_CLOSED)
                this.lst.push(last_end, last_end+1, 0)
            else
                ++this.lst[this.lst.length - 2]
        }
        this.pset_dirty()
    }
    close_current(clicked_index) {
        let last_flags = this.lst[this.lst.length - 1]
        if (last_flags == PATH_CLOSED)
            return false
        // go backwards to see where the current poly starts
        let last_start = this.lst[this.lst.length - 3]
        if (last_start !== clicked_index)
            return false
        this.lst[this.lst.length - 1] = PATH_CLOSED
        this.pset_dirty()
        return true // managed to close
    }
    remove(indices) { 
        // for simplicity, expand, remove and redo ranges
        let polys_index = [], polys = []
        for(let rpi = 0; rpi < this.lst.length; rpi += 3) {
            let start_vidx = this.lst[rpi], end_vidx = this.lst[rpi+1]
            let poly = { flags: this.lst[rpi+2], count: end_vidx-start_vidx}
            polys.push(poly)
            for(let vidx = start_vidx; vidx < end_vidx; ++vidx)
                polys_index.push(poly)
        }
        for(let index of indices) {
            --polys_index[index].count
            console.assert(polys_index[index].count >=0) // sanity
            delete polys_index[index]
        }
        polys = cull_list(polys)
        let new_lst = [], pos = 0
        for(let p of polys) 
            if (p.count > 0) {
                new_lst.push(pos, pos+p.count, p.flags)
                pos += p.count
            }
        this.lst = new_lst
    }
    add_elems(parent) {}
}


function triangulate_path(obj, node)         
{ // https://github.com/shooshx/ArNavNav/blob/352a5a3acaabbc0591fb995b36255dc750406d22/src/poly2tri/adapter.cc            
    var swctx = new poly2tri.SweepContext([]);
    let vtx = obj.arrs.vtx_pos;
    let added_poly = 0
    let all_pnts = []
    //for(let pcmds of obj.cmds) 
    for(let pri = 0; pri < obj.paths_ranges.length; pri += 3)
    {
        let plst = [] // of current hole
        let start_vidx = obj.paths_ranges[pri]*2
        let end_vidx = obj.paths_ranges[pri+1]*2
        for(let vidx = start_vidx; vidx < end_vidx; vidx += 2) {
            let tpnt = new poly2tri.Point(vtx[vidx], vtx[vidx+1])
            tpnt.my_index = vidx / 2
            tpnt.visited = false
            plst.push(tpnt)
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