"use strict"

const PATH_CLOSED = 1
const PATH_CONTINUE_PREV = 2  //means that there shouldn't be a new beingPath for this range, that it continues the previous path (it's a hole)

function get_flag(v, f) {
    return (v & f) == f
}

class PathStringBuilder {
    constructor() { this.lst = [] }
    moveTo(x,y) { this.lst.push('M',x,y) }
    lineTo(x,y) { this.lst.push('L',x,y) }
    bezierCurveTo(a,b,c,d,x,y) { this.lst.push('C',a,b,c,d,x,y) }
    closePath() { this.lst.push('Z') }
    getString() { const l = this.lst; this.lst = []; return l.join(' ') }
}

// https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths
class MultiPath extends PObject
{
    static name() { return "MultiPath" }
    constructor() {
        super()
        this.paths_ranges = [] // index (normal index, not multiplied) of start, one-past-end of every path, flags (1 for closed)
        this.paths = null // if created, for every triplet in paths_ranges, a Path2D
        this.arrs = { vtx_pos:null }  // common to all paths
        // bezier control points: for every point i in vtx_pos, ctrl_xx are the two control points of the line coming into i
        //   ctrl_to_prev is the control point coming from i towards the previous point in the path
        //   ctrl_from_prev is the control point coming from (i-1)%len towards point i
        //   for an unclosed path, both control points of the first point in the path are (0,0)
        //   all control points are relative to the point
        this.meta = { vtx_pos:null }
        this.tcache = { vtx_pos:null, m:null }  // transformed cache (for setattr)
        this.fill_objs = init_fill_objs()
        this.paper_obj = null // paper.js object
        this.clipper_obj = null // clipper.js object

        this.effective_vtx_pos = null
        this.eff_ctrl_to_prev = null
        this.eff_ctrl_from_prev = null
    }
    set(name, arr, num_elems, need_normalize=false) {
        name = normalize_attr_name(name)
        this.arrs[name] = arr
        this.meta[name] = { num_elems: num_elems,
                            need_normalize: need_normalize }
                           
        if (name == "vtx_pos" || name == "ctrl_to_prev" || name == "ctrl_from_prev" || 
            name == "face_color" || // saved with the path
            name == "face_transform" || name == "vtx_transform")
            this.invalidate_pos()
    }

    invalidate_pos() {
        this.paths = null
        this.paper_obj = null
        this.clipper_obj = null
        this.make_effective_vtx_pos()
    }
    make_effective_vtx_pos() {
        this.eff_ctrl_to_prev = this.arrs.ctrl_to_prev
        this.eff_ctrl_from_prev = this.arrs.ctrl_from_prev
        return Mesh.prototype.make_effective_vtx_pos.call(this)
    }


    get_disp_params(disp_values) {        
        const d = [new DispParamBool(disp_values, "Show Vertices", 'show_vtx', true), 
                   new DispParamBool(disp_values, "Show Lines", 'show_lines', true),]
        if (this.has_curves()) {
            const scc = new DispParamBool(disp_values, "Show Curve Controls ", 'show_ctrls', true)
            const sccp = new DispParamBool(disp_values, "Points", 'show_ctrls_pnts', true)
            sccp.share_line_elem_from(scc)
            d.push(scc, sccp)
        }
        if (this.arrs.face_color !== undefined)
            d.push(new DispParamBool(disp_values, "Show Faces", 'show_faces', true))
        return d
    }

    // API
    transform(m) {
        Mesh.transform_arr(m, this.arrs.vtx_pos, this.arrs.vtx_pos)
        let vm = mat3.clone(m)
        vm[6] = 0; vm[7] = 0
        if (this.is_curve()) {
            Mesh.transform_arr(vm, this.arrs.ctrl_to_prev, this.arrs.ctrl_to_prev)
            Mesh.transform_arr(vm, this.arrs.ctrl_from_prev, this.arrs.ctrl_from_prev)
        }
        this.invalidate_pos()
    }

    transform_per_face() 
    { 
        const face_transform = this.arrs.face_transform
        dassert(face_transform.length / 6 === this.face_count(), "unexpect length of face_transform")

        let vtx_pos = this.effective_vtx_pos, ctp = this.eff_ctrl_to_prev, cfp = this.eff_ctrl_from_prev
        const is_curve = this.is_curve()
        if (this.effective_vtx_pos === null || this.effective_vtx_pos === this.arrs.vtx_pos || this.effective_vtx_pos.length != vtx_pos.length) {
            // when vtx needs to be new, all of them need to be new
            this.effective_vtx_pos = new TVtxArr(vtx_pos.length)
            if (is_curve) {
                this.eff_ctrl_to_prev = new TVtxArr(ctp.length)
                this.eff_ctrl_from_prev = new TVtxArr(cfp.length)
            }
        }
        const vtx_new = this.effective_vtx_pos, ctp_new = this.eff_ctrl_to_prev, cfp_new = this.eff_ctrl_from_prev
        
        for(let pri = 0, ti = 0; pri < this.paths_ranges.length; pri += 3, ti += 6) 
        {
            let start_vidx = this.paths_ranges[pri]*2
            let end_vidx = this.paths_ranges[pri+1]*2
            for(let vi = start_vidx; vi < end_vidx; vi += 2) 
            {
                let x = vtx_pos[vi], y = vtx_pos[vi+1]
                vtx_new[vi]   = face_transform[ti]   * x + face_transform[ti+2] * y + face_transform[ti+4];
                vtx_new[vi+1] = face_transform[ti+1] * x + face_transform[ti+3] * y + face_transform[ti+5];

                if (is_curve) {
                    x = ctp[vi]; y = ctp[vi+1]
                    ctp_new[vi]   = face_transform[ti]   * x + face_transform[ti+2] * y;
                    ctp_new[vi+1] = face_transform[ti+1] * x + face_transform[ti+3] * y;   

                    x = cfp[vi]; y = cfp[vi+1]
                    cfp_new[vi]   = face_transform[ti]   * x + face_transform[ti+2] * y;
                    cfp_new[vi+1] = face_transform[ti+1] * x + face_transform[ti+3] * y;   
                }
            }
        }        
    }


    vec_transform_per_vtx(arr_name) 
    {
        const orig_arr = this.arrs[arr_name], vtx_transform = this.arrs.vtx_transform
        dassert(vtx_transform.length / 6 === orig_arr.length / 2, "unexpect length of vtx_transform")

        let cur_eff = this["eff_" + arr_name]
        if (cur_eff === null || cur_eff === orig_arr || cur_eff.length != orig_arr.length)
            cur_eff = new TVtxArr(orig_arr.length)
        this["eff_" + arr_name] = cur_eff

        for(let vi = 0, ti = 0; vi < cur_eff.length; vi += 2, ti += 6) {
            let x = orig_arr[vi], y = orig_arr[vi+1]
            cur_eff[vi]   = vtx_transform[ti] * x + vtx_transform[ti+2] * y;
            cur_eff[vi+1] = vtx_transform[ti+1] * x + vtx_transform[ti+3] * y;                  
        }
    }

    transform_per_vtx() {
        Mesh.prototype.transform_per_vtx.call(this)
        if (this.is_curve()) {
            this.vec_transform_per_vtx('ctrl_to_prev')
            this.vec_transform_per_vtx('ctrl_from_prev')
        }
    }

    computed_prop(name) {
        return Mesh.prototype.computed_prop.call(this, name)
    }

    face_center(face_index) {
        const start_vidx = this.paths_ranges[face_index*3]*2
        const end_vidx = this.paths_ranges[face_index*3+1]*2
        let vtx = this.effective_vtx_pos
        let sx = 0, sy = 0
        for(let vidx = start_vidx; vidx < end_vidx; vidx += 2) {
            sx += vtx[vidx]
            sy += vtx[vidx+1]
        }
        const len = (end_vidx - start_vidx) / 2
        return vec2.fromValues(sx / len, sy / len)
    }

    // API
    is_point_inside(x, y) {
        return Mesh.prototype.is_point_inside.call(this, x, y)
    }
    // API
    get_bbox() {
        if (!this.has_curves()) {
            return Mesh.prototype.get_bbox.call(this)
        }
        else { // add control points as well (see pritive circle rotated)
            let vtx = this.effective_vtx_pos, ctp = this.eff_ctrl_to_prev, cfp = this.eff_ctrl_from_prev
            if (vtx.length == 0)
                return null
            let min_x = Number.MAX_VALUE, max_x = -Number.MAX_VALUE, min_y = Number.MAX_VALUE, max_y = -Number.MAX_VALUE
            this.foreach_line((vidx, prev_x, prev_y, x, y)=>{
                let ct_x = x + ctp[vidx], ct_y = y + ctp[vidx+1] 
                let cf_x = prev_x + cfp[vidx], cf_y = prev_y + cfp[vidx+1]
                min_x = Math.min(min_x, x, ct_x, cf_x)  // doing this is not accurate but it's good enough for now
                max_x = Math.max(max_x, x, ct_x, cf_x)
                min_y = Math.min(min_y, y, ct_y, cf_y)
                max_y = Math.max(max_y, y, ct_y, cf_y)
                prev_x = x, prev_y = y
            })
            return new BBox(min_x, min_y, max_x, max_y)
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
        return ctp !== undefined && (ctp[vidx] != 0 || ctp[vidx+1] != 0 || cfp[vidx] != 0 || cfp[vidx+1] != 0)
    }
    has_curves() {
        // can go over the arrays and check if all zeros
        return (this.arrs.ctrl_to_prev !== undefined && this.arrs.ctrl_to_prev !== null)
    }

    call_path_commands(obj, pri) {
        let vtx = this.effective_vtx_pos;
        let ctp = this.eff_ctrl_to_prev, cfp = this.eff_ctrl_from_prev

        let start_vidx = this.paths_ranges[pri]*2
        let end_vidx = this.paths_ranges[pri+1]*2
        let prev_x = vtx[start_vidx], prev_y = vtx[start_vidx+1]
        obj.moveTo(prev_x, prev_y, start_vidx/2) // 'M'
        for(let vidx = start_vidx + 2; vidx < end_vidx; vidx += 2) {
            let vx = vtx[vidx], vy = vtx[vidx+1]
            if (!this.is_curve(vidx))
                obj.lineTo(vx, vy, vidx/2) // 'L', third arg for Clipper
            else 
                obj.bezierCurveTo(prev_x+cfp[vidx], prev_y+cfp[vidx+1], vx+ctp[vidx], vy+ctp[vidx+1], vx, vy) // 'C'
            prev_x = vx; prev_y = vy
        }
        if (get_flag(this.paths_ranges[pri+2], PATH_CLOSED)) {
            const is_curve = this.is_curve(start_vidx)
            if (is_curve) {
                let vx = vtx[start_vidx], vy = vtx[start_vidx+1]
                obj.bezierCurveTo(prev_x+cfp[start_vidx], prev_y+cfp[start_vidx+1], vx+ctp[start_vidx], vy+ctp[start_vidx+1], vx, vy) //'C'
            }
            obj.closePath(!is_curve) // 'Z' parameter is true if this is supposed to create a real line, for distance field
        }
    }

    call_all_paths_commands(obj) {
        for(let pri = 0; pri < this.paths_ranges.length; pri += 3) {
            let start_idx = this.paths_ranges[pri]
            let end_idx = this.paths_ranges[pri+1]
            obj.startPath(end_idx - start_idx)
            this.call_path_commands(obj, pri)
        }
    }


    ensure_paths_created() {
        if (this.paths !== null && this.paths.length*3 === this.paths_ranges.length) 
            return

        // sample face_color here since the number of Path2D can be different from the number of faces in the array (due to holes)
        const fcol = this.arrs.face_color
        const do_fill = fcol !== undefined
        let cidx = 0

        this.paths = []
        let jp = null
        for(let pri = 0; pri < this.paths_ranges.length; pri += 3) {
            const flags = this.paths_ranges[pri+2]
            const continue_prev = get_flag(flags, PATH_CONTINUE_PREV)
            let col = null
            if (do_fill) {
                col = "rgba(" + fcol[cidx] + "," + fcol[cidx+1] + "," + fcol[cidx+2] + "," + (fcol[cidx+3]/255) + ")"
                cidx += 4            
            }
            if (!continue_prev) {
                jp = new Path2D()
                jp.face_color = col  // take just the color of the first face, ignore the potential case that the other faces can have a different color
            }
            else
                dassert(jp !== null, "continue-prev must have previous path")
            this.call_path_commands(jp, pri)
            if (!continue_prev)
                this.paths.push(jp)
        }
    }

    
    make_clip_path(face_fill, foi) 
    {
        let jp = new Path2D()
        for(let pri = 0, i = 0; pri < this.paths_ranges.length; pri += 3, ++i) {
            if (face_fill[i] != foi)
                continue
            this.call_path_commands(jp, pri);
        }
        return jp;
    }

    
    draw_poly(do_lines, do_fill, lines_color="#000") {
        this.ensure_paths_created()

        let line_width = 1 / image_view.viewport_zoom
        for(let p of this.paths) {
            if (do_fill && p.face_color !== null) {
                ctx_img.fillStyle = p.face_color
                ctx_img.fill(p)
                ctx_img.lineWidth = line_width
                ctx_img.strokeStyle = p.face_color
                ctx_img.stroke(p) // fill antialiasing gaps
            }
            if (do_lines) {
                ctx_img.strokeStyle = lines_color
                ctx_img.lineWidth = MESH_DISP.line_width/image_view.viewport_zoom
                ctx_img.stroke(p)
            }
        }
    }

    foreach_line(line_func) {
        let vtx = this.effective_vtx_pos;
        for(let pri = 0; pri < this.paths_ranges.length; pri += 3) {
            const start_vidx = this.paths_ranges[pri]*2
            const end_vidx = this.paths_ranges[pri+1]*2
            let  prev_x = vtx[end_vidx-2], prev_y = vtx[end_vidx-2+1]
            for(let vidx = start_vidx; vidx < end_vidx; vidx += 2) {
                const vx = vtx[vidx], vy = vtx[vidx+1]
                // first line is the closing line (between last and first point if it's a closed path
                line_func(vidx, prev_x, prev_y, vx, vy)
                prev_x = vx; prev_y = vy
            }
        }
    }

    draw_control_points(draw_points, lines_color="#000") {
        const ctp = this.eff_ctrl_to_prev, cfp = this.eff_ctrl_from_prev
        const radius = MESH_DISP.vtx_radius / image_view.viewport_zoom
        ctx_img.strokeStyle = lines_color
        ctx_img.beginPath()
        this.foreach_line((vidx, prev_x, prev_y, vx, vy)=>{
            if (this.is_curve(vidx))
            {
                const vcfp_x = cfp[vidx], vcfp_y = cfp[vidx+1]
                const vctp_x = ctp[vidx], vctp_y = ctp[vidx+1]
                const abs_cfp_x = prev_x+vcfp_x, abs_cfp_y = prev_y+vcfp_y
                const abs_ctp_x = vx+vctp_x, abs_ctp_y = vy+vctp_y
                ctx_img.moveTo(prev_x, prev_y)
                ctx_img.lineTo(abs_cfp_x, abs_cfp_y)
                ctx_img.moveTo(vx, vy)
                ctx_img.lineTo(abs_ctp_x, abs_ctp_y)
                
                if (draw_points) {
                    if (vcfp_x != 0 || vcfp_y != 0) {
                        ctx_img.moveTo(abs_cfp_x + radius, abs_cfp_y)
                        ctx_img.arc(abs_cfp_x, abs_cfp_y, radius, 0, 2*Math.PI)
                    }
                    if (vctp_x != 0 || vctp_y != 0) {
                        ctx_img.moveTo(abs_ctp_x + radius, abs_ctp_y)
                        ctx_img.arc(abs_ctp_x, abs_ctp_y, radius, 0, 2*Math.PI)
                    }
                }
            }
        })
        ctx_img.lineWidth = MESH_DISP.line_width/image_view.viewport_zoom
        ctx_img.stroke()
    }

    // API
    async pre_draw(m, disp_values) {
        if (this.arrs.vtx_pos !== null && !this.arrs.face_color && this.arrs.face_fill)
            await Mesh.prototype.pre_draw_poly_fill_clip.call(this, m)        
    }

    // API
    draw_m(m, disp_values) {
        if (this.arrs.vtx_pos === null)
            return
        if (!this.arrs.face_color && this.arrs.face_fill)
            Mesh.prototype.draw_poly_fill_clip.call(this, m)
            // do the line after the clip so it would be over it 
        if (disp_values.show_lines || disp_values.show_faces)
            this.draw_poly(disp_values.show_lines, disp_values.show_faces)
        if (disp_values.show_vtx) 
            Mesh.prototype.draw_vertices.call(this)
        if (disp_values.show_ctrls) 
            this.draw_control_points(disp_values.show_ctrls_pnts)
    }

    draw_selection_m(m, select_vindices) {
        Mesh.prototype.draw_selection_m.call(this, m, select_vindices)
    }

    draw_template_m(m) {
        this.draw_poly(true, false, TEMPLATE_LINE_COLOR)
        Mesh.prototype.draw_vertices.call(this, TEMPLATE_LINE_COLOR, false)
    }    

    add_fillobj(proxy) {
        return Mesh.prototype.add_fillobj.call(this, proxy)
    }

    
    ensure_paper() {
        if (this.paper_obj !== null && this.paper_obj.children.length*3 === this.paths_ranges.length)
            return this.paper_obj
        const p = new paper.CompoundPath()
        p.remove()  // avoid having it drawing to nowhere
        p.bezierCurveTo = p.cubicCurveTo
        for(let pri = 0; pri < this.paths_ranges.length; pri += 3) {
            this.call_path_commands(p, pri)
        }
        this.paper_obj = p
        return this.paper_obj
    }

    // should be called only after ctor
    from_paper(paper_obj) {
        let vtx = [], ctp = [], cfp = [], ranges = [], cur_idx = 0, has_curves = false
        for(let child of paper_obj.children) {
            const start_idx = cur_idx
            let prev_curve = child.lastCurve
            for(let curve of child.curves) {
                const p1 = curve.point1
                vtx.push(p1.x, p1.y)
                const ph2 = prev_curve.handle2, ph1 = prev_curve.handle1
                ctp.push(ph2.x, ph2.y)
                cfp.push(ph1.x, ph1.y)
                if (ph1.x !== 0 || ph1.y !== 0 || ph2.x !== 0 || ph2.y !== 0) {
                    has_curves = true
                }
                ++cur_idx
                prev_curve = curve
            }
            ranges.push(start_idx, cur_idx, child.closed ? PATH_CLOSED : 0)
        }
        this.set('vtx_pos', new TVtxArr(vtx), 2)
        if (has_curves) {
            this.set('ctrl_to_prev',   new TVtxArr(ctp), 2)
            this.set('ctrl_from_prev', new TVtxArr(cfp), 2)
        }
        this.paths_ranges = ranges
        this.invalidate_pos()
        this.paper_obj = paper_obj
    }

    has_open() {
        for(let pri = 0; pri < this.paths_ranges.length; pri += 3) {
            if (!get_flag(this.paths_ranges[pri+2], PATH_CLOSED))
                return true
        }
        return false
    }

    ensure_clipper() {     
        if (this.clipper_obj !== null)
            return this.clipper_obj
        const b = new ClipperPathsBuilder()
        for(let pri = 0; pri < this.paths_ranges.length; pri += 3) {
            this.call_path_commands(b, pri)
        }
        this.clipper_obj = b.d
        //ClipperLib.JS.ScaleUpPaths(this.clipper_obj, CLIPPER_INT_SCALE);
        return this.clipper_obj
    }

    from_clipper_paths(clipper_obj) {
        let vtx = [], ranges = [], cur_idx = 0, xfer_indices = []
        if (clipper_obj.constructor === ClipperLib.PolyTree) 
        {
            for(let path of clipper_obj.m_AllPolys) {
                const start_idx = cur_idx
                for(let pnt of path.m_polygon) {
                    vtx.push(pnt.X / CLIPPER_SCALE, pnt.Y / CLIPPER_SCALE)
                    xfer_indices.push(pnt.Z)
                    ++cur_idx
                }
                ranges.push(start_idx, cur_idx, path.IsOpen ? 0 : PATH_CLOSED) // Paths are implicitly closed
            }    

        }
        else {
            for(let path of clipper_obj) {
                const start_idx = cur_idx
                for(let pnt of path) {
                    vtx.push(pnt.X / CLIPPER_SCALE, pnt.Y / CLIPPER_SCALE)
                    xfer_indices.push(pnt.Z)
                    ++cur_idx
                }
                ranges.push(start_idx, cur_idx, PATH_CLOSED) // Paths are implicitly closed
            }    
        }
        this.set('vtx_pos', new TVtxArr(vtx), 2)
        this.paths_ranges = ranges
        this.invalidate_pos()
        this.clipper_obj = clipper_obj
        return xfer_indices
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
            let start_vidx = this.lst[rpi], end_vidx = this.lst[rpi+1] // not actually vidxs
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

    // given the index of a point, find the index of the previous point in the same path
    get_prev_point_in_path(idx) {
        // it's possible to cache the result and this this in O(1) but not actually needed for now
        for(let rpi = 0; rpi < this.lst.length; rpi += 3) {
            const start_idx = this.lst[rpi], end_idx = this.lst[rpi+1]
            if (idx >= start_idx && idx < end_idx) {
                if (idx > start_idx)
                    return idx-1
                return end_idx-1
            }
        }
        return null // index not found?
    }

    add_elems(parent) {}
}


function triangulate_path(obj, node)         
{ // https://github.com/shooshx/ArNavNav/blob/352a5a3acaabbc0591fb995b36255dc750406d22/src/poly2tri/adapter.cc            
    var swctx = new poly2tri.SweepContext([]);
    let vtx = obj.effective_vtx_pos;
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
        if (attrarr === null) // ctrl_to_x would be null if there's no rounded corners
            continue
        console.assert(isTypedArray(attrarr), "not a typed-array " + attrname)
        out_mesh.set(attrname, new attrarr.constructor(attrarr), obj.meta[attrname].num_elems, obj.meta[attrname].need_normalize)
    }
    out_mesh.set("idx", new TIdxArr(idx))
    out_mesh.set_type(MESH_TRI)
    out_mesh.halfedges = halfedges


    let d = new Delaunator(out_mesh.effective_vtx_pos)
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
        
        this.alg = new ParamSelect(node, "Algorithm", 0, ["Chaikin", "Continuous", "Catmull-Rom", "Geometric", "Simplify"],(sel_idx)=>{
            this.factor.set_visible(sel_idx == 2 || sel_idx == 3 || sel_idx == 4)
        })
        this.factor = new ParamFloat(node, "Factor", 0.5, [0,1])
    }

    run_paper_alg() {
        let obj = this.in_obj.get_const()
        assert(obj !== null, this, "No input")

        const p = obj.ensure_paper()
        obj.paper_obj = null // changed in place        
        switch(this.alg.sel_idx) {
        case 1: p.smooth({type:"continuous"}); break;
        case 2: p.smooth({type:"catmull-rom", factor:this.factor.v }); break;
        case 3: p.smooth({type:"geometric", factor:this.factor.v }); break;
        case 4: assert(p.simplify(this.factor.v), this, "Failed simplify"); break; //
        }
        
        let new_obj = new MultiPath()
        new_obj.from_paper(p)
        this.out_paths.set(new_obj)
    }

    run() {
        let obj = this.in_obj.get_const()
        assert(obj !== null, this, "No input")
        if (this.alg.sel_idx !== 0) {
            this.run_paper_alg()
            return
        }
        // "Chaikin"
        let vtx = obj.effective_vtx_pos
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
        new_obj.set('vtx_pos', new TVtxArr(new_vtx), 2, false) // this operation has to flatten the any transform property
        new_obj.set('ctrl_to_prev', new TVtxArr(ctp), 2, false)
        new_obj.set('ctrl_from_prev', new TVtxArr(cfp), 2, false)
        new_obj.paths_ranges = new_ranges
        this.out_paths.set(new_obj)

        // preserve face attributes. vertices changed place so are not preserved
        for(let arr_name in obj.arrs) {
            if (!arr_name.startsWith("face_") || arr_name == "vtx_transform") 
                continue
            let from_arr = obj.arrs[arr_name]
            let new_arr = new from_arr.constructor(from_arr)
            new_obj.set(arr_name, new_arr, obj.meta[arr_name].need_normalize)
        }
        new_obj.fill_objs = clone_fill_objs(obj.fill_objs)
    }
}


class NodeBoolOp extends NodeCls
{
    static name() { return "Boolean Operation" }
    constructor(node) {
        super(node)
        this.in_obj1 = new InTerminalMulti(node, "in_obj_subject")
        this.in_obj1.width = 17
        this.in_obj2 = new InTerminalMulti(node, "in_obj_clip")
        this.in_obj2.width = 17
        this.out_paths = new OutTerminal(node, "out_paths")
        
        this.op = new ParamSelect(node, "Operation", 0, [["Union", ClipperLib.ClipType.ctUnion],
                                                         ["Intersection", ClipperLib.ClipType.ctIntersection],
                                                         ["Subtract", ClipperLib.ClipType.ctDifference],
                                                         ["Xor", ClipperLib.ClipType.ctXor]], (sel_idx)=>{
            this.swap.set_visible(sel_idx === 2)
        })
        this.swap = new ParamBool(node, "Swap", false)
    }

    run() {
        let objs1 = this.in_obj1.get_input_consts()
        let objs2 = this.in_obj2.get_input_consts()

        if (this.swap.v && (this.op.sel_idx == 2)) {
            const t = objs1; objs1 = objs2; objs2 = t
        }
        if (this.op.sel_idx !== 0) {
            assert(objs1.length > 0, this, "Missing input subject")
            assert(objs2.length > 0, this, "Missing input clip")
        }
        else {
            assert(objs1.length + objs2.length > 0, this, "Missing input")
        }

        // see https://sourceforge.net/p/jsclipper/wiki/documentation/
        ClipperLib.use_xyz = false
        const cpr = new ClipperLib.Clipper();
        let p_res = null
        try {
            let has_open = false
            for(let obj of objs1) {
                const p = obj.ensure_clipper()
                for(let pp of p) {
                    has_open |= !pp.closed
                    assert(cpr.AddPath(pp, ClipperLib.PolyType.ptSubject, pp.closed), this, "failed AddPath")
                }
            }
            for(let obj of objs2) {
                const p = obj.ensure_clipper()
                 for(let pp of p) {
                    assert(pp.closed, this, "Clip obj should not be open") // also checked in AddPath
                    assert(cpr.AddPath(pp, ClipperLib.PolyType.ptClip, true), this, "failed AddPath")
                }
            }
            if (has_open)
                p_res = new ClipperLib.PolyTree()
            else
                p_res = new ClipperLib.Paths();
    
            const succeeded = cpr.Execute(this.op.get_sel_val(), p_res, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
            assert(succeeded, this, "Clipper failed")
        }
        catch(e) {
            assert(false, this, e.message)
        }

        let new_obj = new MultiPath()
        new_obj.from_clipper_paths(p_res)
        this.out_paths.set(new_obj)
    }

}