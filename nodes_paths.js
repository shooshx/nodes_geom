const PATH_CLOSED = 1

function get_flag(v, f) {
    return (v & f) == f
}

class MultiPath extends PObject
{
    static name() { return "MultiPath" }
    constructor() {
        super()
        //this.cmds = [] // list of paths, each a list of ['M', 0, 'L', 1] where 0,1 are indices of vertices
        this.paths_ranges = [] // index in (normal index) of start, one-past-end of every path, flags (1 for closed)
        this.paths = null
        this.arrs = { vtx_pos:null, ctrl_to_prev:null, ctrl_from_prev:null }  // common to all paths
        // bezier control points: for every point i in vtx_pos, ctrl_xx are the two control points of the line coming into i
        //   ctrl_to_prev is the control point coming from i towards the previous point in the path
        //   ctrl_from_prev is the control point coming from (i-1)%len towards point i
        //   for an unclosed path, both control points of the first point in the path are (0,0)
        //   all control points are relative to the point
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
                 new DispParamBool(disp_values, "Show Curve Controls", 'show_ctrls', true),
                 new DispParamBool(disp_values, "Show Lines", 'show_lines', true),
                 new DispParamBool(disp_values, "Show Faces", 'show_faces', true)
                ]
    }

    // API
    transform(m) {
        Mesh.transform_arr(m, this.arrs.vtx_pos, this.arrs.vtx_pos)
        let vm = mat3.clone(m)
        vm[6] = 0; vm[7] = 0
        Mesh.transform_arr(vm, this.arrs.ctrl_to_prev, this.arrs.ctrl_to_prev)
        Mesh.transform_arr(vm, this.arrs.ctrl_from_prev, this.arrs.ctrl_from_prev)
    }
    // API
    is_point_inside(x, y) {
        return Mesh.prototype.is_point_inside.call(this, x, y)
    }
    // API
    get_bbox() {
        if (this.arrs.ctrl_to_prev === null) {
            return Mesh.prototype.get_bbox.call(this)
        }
        else { // add control points as well (see pritive circle rotated)
            let vtx = this.arrs.vtx_pos, ctp = this.arrs.ctrl_to_prev, cfp = this.arrs.ctrl_from_prev
            if (vtx.length == 0)
                return null
            let min_x = Number.MAX_VALUE, max_x = -Number.MAX_VALUE, min_y = Number.MAX_VALUE, max_y = -Number.MAX_VALUE
            for(let i = 0; i < vtx.length; i += 2) { 
                let x = vtx[i], y = vtx[i+1]
                let ct_x = x + ctp[i], ct_y = y + ctp[i+1]
                let cf_x = x + cfp[i], cf_y = y + cfp[i+1]
                min_x = Math.min(min_x, x, ct_x, cf_x)
                max_x = Math.max(max_x, x, ct_x, cf_x)
                min_y = Math.min(min_y, x, ct_y, cf_y)
                max_y = Math.max(max_y, x, ct_y, cf_y)
            }
            return { min_x:min_x, max_x:max_x, min_y:min_y, max_y:max_y }
        }
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

    is_curve(vidx) {
        let ctp = this.arrs.ctrl_to_prev, cfp = this.arrs.ctrl_from_prev
        return ctp !== null && (ctp[vidx] != 0 || ctp[vidx+1] != 0 || cfp[vidx] != 0 || cfp[vidx+1] != 0)
    }

    ensure_paths_created() {
        if (this.paths !== null && this.paths.length*3 == this.paths_ranges.length) 
            return

        this.paths = []
        let vtx = this.arrs.vtx_pos;
        let ctp = this.arrs.ctrl_to_prev, cfp = this.arrs.ctrl_from_prev
        for(let pri = 0; pri < this.paths_ranges.length; pri += 3) {
            let start_vidx = this.paths_ranges[pri]*2
            let end_vidx = this.paths_ranges[pri+1]*2
            let prev_x = vtx[start_vidx], prev_y = vtx[start_vidx+1]
            let plst = ['M', prev_x, prev_y]
            for(let vidx = start_vidx + 2; vidx < end_vidx; vidx += 2) {
                let vx = vtx[vidx], vy = vtx[vidx+1]
                if (!this.is_curve(vidx))
                    plst.push('L', vx, vy)
                else 
                    plst.push('C', prev_x+cfp[vidx], prev_y+cfp[vidx+1], vx+ctp[vidx], vy+ctp[vidx+1], vx, vy)
                prev_x = vx; prev_y = vy
            }
            if (get_flag(this.paths_ranges[pri+2], PATH_CLOSED)) {
                if (this.is_curve(0)) {
                    let vx = vtx[start_vidx], vy = vtx[start_vidx+1]
                    plst.push('C', prev_x+cfp[start_vidx], prev_y+cfp[start_vidx+1], vx+ctp[start_vidx], vy+ctp[start_vidx+1], vx, vy)
                }
                plst.push('Z')
            }
            let s = plst.join(" ")
            let jp = new Path2D(s)
            this.paths.push(jp)
        }
    }

    draw_poly(do_lines, do_fill) {
        this.ensure_paths_created()
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

    draw_control_points() {
        let vtx = this.arrs.vtx_pos;
        let ctp = this.arrs.ctrl_to_prev, cfp = this.arrs.ctrl_from_prev
        ctx_img.beginPath()
        for(let pri = 0; pri < this.paths_ranges.length; pri += 3) {
            let start_vidx = this.paths_ranges[pri]*2
            let end_vidx = this.paths_ranges[pri+1]*2
            let prev_x = vtx[end_vidx-2], prev_y = vtx[end_vidx-2+1]
            for(let vidx = start_vidx; vidx < end_vidx; vidx += 2) {
                let vx = vtx[vidx], vy = vtx[vidx+1]
                if (this.is_curve(vidx))
                {
                    let abs_cfp_x = prev_x+cfp[vidx], abs_cfp_y = prev_y+cfp[vidx+1]
                    let abs_ctp_x = vx+ctp[vidx], abs_ctp_y = vy+ctp[vidx+1]
                    ctx_img.moveTo(prev_x, prev_y)
                    ctx_img.lineTo(abs_cfp_x, abs_cfp_y)
                    ctx_img.moveTo(vx, vy)
                    ctx_img.lineTo(abs_ctp_x, abs_ctp_y)
                }
                prev_x = vx; prev_y = vy
            }
        }
        ctx_img.lineWidth = 0.5/image_view.viewport_zoom
        ctx_img.stroke()
    }

    // API
    draw_m(m, disp_values) {
        if (this.arrs.vtx_pos === null)
            return
        if (disp_values.show_lines || disp_values.show_faces)
            this.draw_poly(disp_values.show_lines, disp_values.show_faces)
        if (disp_values.show_vtx) 
            Mesh.prototype.draw_vertices.call(this)
        if (disp_values.show_ctrls) 
            this.draw_control_points()
    }

    draw_selection_m(m, select_vindices) {
        Mesh.prototype.draw_selection_m.call(this, m, select_vindices)
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
            if (get_flag(last_flags, PATH_CLOSED))
                this.lst.push(last_end, last_end+1, 0)
            else
                ++this.lst[this.lst.length - 2]
        }
        this.pset_dirty()
    }
    close_current(clicked_index) {
        let last_flags = this.lst[this.lst.length - 1]
        if (get_flag(last_flags, PATH_CLOSED))
            return false
        // go backwards to see where the current poly starts
        let last_start = this.lst[this.lst.length - 3]
        if (last_start !== clicked_index)
            return false
        this.lst[this.lst.length - 1] |= PATH_CLOSED
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
    let halfedges = []
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
                tri.start_at_idx = idx.length
                //idx.push(tripnt[0].my_index, tripnt[1].my_index, tripnt[2].my_index)
                idx.push(tripnt[2].my_index, tripnt[1].my_index, tripnt[0].my_index)
                tripnt[0].visited = true; tripnt[1].visited = true; tripnt[2].visited = true
                halfedges.push(-1,-1,-1) // size of halfedges is the same as idx
            }
            // make halfedges, see what it needs to look like: https://github.com/mapbox/delaunator
            for(let tri of triangles) {
                let tripnt = tri.getPoints()
                for(let pi = 0; pi < 3; ++pi) {
                    let p = tripnt[pi]
                    let nei_tri = tri.getNeighbor(pi)  // beightbor across p
                    if (nei_tri === null || !nei_tri.interior_) {
                        continue
                    }
                    let p_after = tripnt[(pi+1)%3]
                    let p_before = tripnt[(pi-1+3)%3]
                    let index_in_tri = 2-tri.index(p_before)
                    let index_in_nei = 2-nei_tri.index(p_after)
                    halfedges[tri.start_at_idx + index_in_tri] = nei_tri.start_at_idx + index_in_nei
                }
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
    out_mesh.halfedges = halfedges


    let d = new Delaunator(out_mesh.arrs.vtx_pos)
    out_mesh.hull = d.hull
    
    return out_mesh
    
}

// Chaikin round corners
// see https://simblob.blogspot.com/2019/10/chaikin-curves.html and https://sighack.com/post/chaikin-curves
class NodeRoundCorners extends NodeCls
{
    static name() { return "Round Corners" }
    constructor(node) {
        super(node)
        this.in_obj = new InTerminal(node, "in_obj")
        this.out_paths = new OutTerminal(node, "out_paths")        
    }


    run() {
        let obj = this.in_obj.get_const()
        assert(obj !== null, this, "No input")
        let vtx = obj.arrs.vtx_pos
        let new_vtx = [], new_ranges = [], ctp = [], cfp = []

        let round_poly = (poly_len, get_vidx, is_closed)=>{
            let prev_vidx = get_vidx(poly_len-1)
            let prev_x = vtx[prev_vidx], prev_y = vtx[prev_vidx+1]
            let prev_mid_x = 0, prev_mid_y = 0
            let new_start_vidx = new_vtx.length
            for(let i = 0; i < poly_len; ++i) {
                let vidx = get_vidx(i)
                let x = vtx[vidx], y = vtx[vidx+1]
                let mid_x = (x + prev_x)/2, mid_y = (y + prev_y)/2
                new_vtx.push(mid_x, mid_y)
                ctp.push(prev_x - mid_x, prev_y - mid_y)
                cfp.push(prev_x - prev_mid_x, prev_y - prev_mid_y)
                prev_x = x; prev_y = y
                prev_mid_x = mid_x; prev_mid_y = mid_y
            }
            let vidx = get_vidx(0)
            if (is_closed) {
                cfp[new_start_vidx] = prev_x - prev_mid_x; cfp[new_start_vidx+1] = prev_y - prev_mid_y
            }
            else {
                cfp[new_start_vidx] = 0; cfp[new_start_vidx+1] = 0
            }
            new_ranges.push(new_start_vidx/2, new_vtx.length/2, is_closed?PATH_CLOSED:0)
        }

        if (obj.constructor === MultiPath) {
            for(let rpi = 0; rpi < obj.paths_ranges.length; rpi += 3) {
                let start_vidx = obj.paths_ranges[rpi]
                let end_vidx = obj.paths_ranges[rpi+1]
                let is_closed = get_flag(obj.paths_ranges[rpi+2], PATH_CLOSED)
                round_poly(end_vidx-start_vidx, (i)=>{ return (start_vidx+i)*2 }, is_closed)
            }
        }
        else if (obj.constructor === Mesh) {
            let face_size = obj.face_size()
            let idx = obj.arrs.idx
            assert(idx !== null, this, "Mesh is empty")
            for(let pi = 0; pi < idx.length; pi += face_size) {
                round_poly(face_size, (i)=>{ return idx[pi+i]*2 }, true)
            }
        }
        else {
            assert(false, this, "input is not Mesh or Paths")
        }
        let new_obj = new MultiPath()
        new_obj.set('vtx_pos', new TVtxArr(new_vtx), 2, false)
        new_obj.set('ctrl_to_prev', new TVtxArr(ctp), 2, false)
        new_obj.set('ctrl_from_prev', new TVtxArr(cfp), 2, false)
        new_obj.paths_ranges = new_ranges
        this.out_paths.set(new_obj)
    }
}