"use strict"


const MESH_NOT_SET = 0
const MESH_QUAD = 1
const MESH_TRI = 2

const MESH_DISP = { vtx_radius: 5, vtx_sel_radius: 7, sel_color:"#FFBB55" }

let TVtxArr = Float32Array
let TIdxArr = Uint16Array
let TColorArr = Uint8Array

function normalize_attr_name(s) {
    let r = s.toLowerCase().replace(/\s/g, '_')
    if (r == "point_color")
        return "vtx_color"
    if (r == "coord")
        return "vtx_pos"
    return r
}

class BBox {
    constructor(min_x, min_y, max_x, max_y) {
        this.min_x = min_x
        this.min_y = min_y
        this.max_x = max_x
        this.max_y = max_y
    }
    width() {
        return this.max_x - this.min_x
    }
    height() {
        return this.max_y - this.min_y
    }
}

class FillObj {
    constructor(obj_proxy) {
        this.obj_proxy = obj_proxy // ObjConstProxy which is not cloned
        this.clip_path = null
    }
}

class Mesh extends PObject
{
    static name() { return "Mesh" }
    constructor() {
        super()

        this.type = MESH_NOT_SET
        this.paths = null // list of Path2D, each corresponding to a tri/quad
        // vtx_color : Uint8Array
        this.arrs = { vtx_pos:null, idx:null }
        this.meta = { vtx_pos:null, idx:null } // metadata objects for every array in arrs (instead of setting properties in the array object itself which can't be cloned reasonably)
        
        this.tcache = { vtx_pos:null, m:null }  // transformed cache
        //this.lines_cache = null  // cache lines for stroke (so that every line be repeated twice
        this.glbufs = { vtx_pos:null, idx:null }
        this.fill_objs = [null]  // list of FillObj, used for face_fill attribute
                             // it's the nodes responsibility that there would not be left objects that are not needed
                             // first entry is null so ids start with 1. 0 is reserved to nothing

    }
    destructor() {
        for(let bi in this.glbufs) {
            let b = this.glbufs[bi]
            if (b) {
                //console.log("~~",b.buf_id)
                gl.deleteBuffer(b)
            }
        }
    }

    // API
    get_disp_params(disp_values) {
        return [ new DispParamBool(disp_values, "Show Vertices", 'show_vtx', true),
                 new DispParamBool(disp_values, "Show Lines", 'show_lines', true),
                 new DispParamBool(disp_values, "Show Faces", 'show_faces', true)
                ]
    }

    invalidate_pos() {
        this.tcache.vtx_pos = null  // invalidate
        if (this.meta.vtx_pos !== null)
            this.meta.vtx_pos.made_glbuf = false
        this.paths = null
        this.invalidate_fill()
    }
    invalidate_fill() {
        for(let fo of this.fill_objs)
            if (fo !== null)
                fo.clip_path = null
    }

    set(name, arr, num_elems, need_normalize) {
        name = normalize_attr_name(name)        
        this.arrs[name] = arr
        this.meta[name] = { made_glbuf: false,  // not really used for anything right now
                            num_elems: num_elems || 1, // count of numbers for each element. will be undefined for indices
                            need_normalize: need_normalize || false // true for color that needs to go from int to float [0,1]
                           }
        if (name == "vtx_pos") {
            this.invalidate_pos()
        }
        if (name == "face_fill") {
            this.invalidate_fill()
        }
    }

    set_type(v) { 
        this.type = v 
        this.invalidate_pos()
    }
    vtx_count() { return this.arrs.vtx_pos.length / 2 } // 2 for (x,y)
    face_count() {
        if (this.arrs.idx === null || this.arrs.idx === undefined)
            return 0
        if (this.type == MESH_TRI)
            return this.arrs.idx.length / 3
        if (this.type == MESH_QUAD)
            return this.arrs.idx.length / 4
        return 0 // type not set
    }
    face_size() {
        if (this.type == MESH_TRI) return 3
        if (this.type == MESH_QUAD) return 4
        return null
    }

    get_sizes() {
        let r = { type: this.type, arrs:{} }       
        for(let n in this.arrs) {
            r.arrs[n] = { sz: this.arrs[n].length, type: this.arrs[n].constructor }
        }
        return r
    }

    static transform_arr(m, from, to) {
        for(let i = 0; i < from.length; i += 2) {
            let x = from[i], y = from[i+1]
            to[i]   = m[0] * x + m[3] * y + m[6];
            to[i+1] = m[1] * x + m[4] * y + m[7];            
        }
    }
    
    // API
    transform(m) {
        Mesh.transform_arr(m, this.arrs.vtx_pos, this.arrs.vtx_pos)
        this.invalidate_pos()
    }

    // API
    get_bbox() { // TBD can cache this
        let vtx = this.arrs.vtx_pos
        if (vtx.length == 0)
            return null
        let min_x = Number.MAX_VALUE, max_x = -Number.MAX_VALUE, min_y = Number.MAX_VALUE, max_y = -Number.MAX_VALUE
        for(let i = 0; i < vtx.length; i += 2) { 
            let x = vtx[i], y = vtx[i+1]
            if (x < min_x) min_x = x
            if (x > max_x) max_x = x
            if (y < min_y) min_y = y
            if (y > max_y) max_y = y
        }
        return new BBox(min_x, min_y, max_x, max_y)
    }

    is_point_inside(x, y) {
        this.ensure_paths_created()
        for(let p of this.paths) {
            if (ctx_img.isPointInPath(p, x, y))
                return true
        }
        return false
    }

    draw_border(m) {
        let bbox = this.get_bbox()
        ctx_img.save()
        ctx_img.setTransform(m[0], m[1], m[3], m[4], m[6], m[7])
        ctx_img.strokeStyle = "#000"
        ctx_img.lineWidth = 0.5 / image_view.viewport_zoom
        ctx_img.strokeRect(bbox.min_x, bbox.min_y, bbox.max_x - bbox.min_x, bbox.max_y - bbox.min_y)
        ctx_img.restore()
    }

    draw_vertices() 
    {
        let vtx = this.arrs.vtx_pos
        if (vtx === null)
            return
        let vtx_radius = null
        if (this.arrs.vtx_radius !== undefined) {
            vtx_radius = this.arrs.vtx_radius
            dassert(vtx_radius.length == this.arrs.vtx_pos.length / 2, "unexpected size of vtx_radius")
        }
        if (this.arrs.vtx_color !== undefined) {
            let vcol = this.arrs.vtx_color
            dassert(vcol.length / 4 == this.arrs.vtx_pos.length / 2, "unexpected size of vtx_color")
            for(let i = 0, vi = 0, icol = 0; vi < vtx.length; ++i, vi += 2, icol += 4) {
                // radius shouldn't be negative
                let radius = Math.max(0, (vtx_radius !== null) ? vtx_radius[i] : MESH_DISP.vtx_radius)
                radius /= image_view.viewport_zoom // radius is given in pixels, need to scale it back
                ctx_img.beginPath();
                ctx_img.arc(vtx[vi], vtx[vi+1], radius, 0, 2*Math.PI)
                ctx_img.fillStyle = "rgba(" + vcol[icol] + "," + vcol[icol+1] + "," + vcol[icol+2] + "," + (vcol[icol+3]/255) + ")"
                ctx_img.fill()
            }
            ctx_img.lineWidth = 0.5/image_view.viewport_zoom
        }
        else {
            ctx_img.lineWidth = 1/image_view.viewport_zoom
        }

        ctx_img.beginPath();
        for(let i = 0, vi = 0; vi < vtx.length; ++i, vi += 2) {
            let radius = Math.max(0, (vtx_radius !== null) ? vtx_radius[i] : MESH_DISP.vtx_radius)
            radius /= image_view.viewport_zoom
            let x = vtx[vi], y = vtx[vi+1]
            ctx_img.moveTo(x + radius, y)
            ctx_img.arc(x, y, radius, 0, 2*Math.PI)
        }
        ctx_img.strokeStyle = "#000"
        ctx_img.stroke()       

        if (this.arrs.vtx_normal !== undefined) {
            let norm = this.arrs.vtx_normal
            dassert(norm.length == this.arrs.vtx_pos.length, "unexpected size of vtx_normal")
            ctx_img.beginPath();
            for(let vi=0; vi < vtx.length; vi += 2) {
                ctx_img.moveTo(vtx[vi], vtx[vi+1])
                ctx_img.lineTo(vtx[vi] + norm[vi], vtx[vi+1] + norm[vi+1])
            }
            ctx_img.lineWidth = 0.5/image_view.viewport_zoom
            ctx_img.strokeStyle = "#ff0000"
            ctx_img.stroke()
        }        
    }

    ensure_paths_created() {
        if (this.arrs.idx === null) {
            this.paths = []
            return // no paths to create
        }
        if (this.paths !== null && this.paths.length*this.face_size() == this.arrs.idx.length) 
            return
        let vtx = this.arrs.vtx_pos
        let idxs = this.arrs.idx    
        this.paths = []
        let i = 0
        if (this.type == MESH_QUAD) {
            while(i < idxs.length) {
                let p = new Path2D()
                let idx = idxs[i++]<<1; p.moveTo(vtx[idx], vtx[idx+1])
                idx = idxs[i++]<<1; p.lineTo(vtx[idx], vtx[idx+1])
                idx = idxs[i++]<<1; p.lineTo(vtx[idx], vtx[idx+1])
                idx = idxs[i++]<<1; p.lineTo(vtx[idx], vtx[idx+1])
                p.closePath()
                this.paths.push(p)
            }
        }
        else if (this.type == MESH_TRI) {
            while(i < idxs.length) {
                let p = new Path2D()
                let idx = idxs[i++]<<1; p.moveTo(vtx[idx], vtx[idx+1])
                idx = idxs[i++]<<1; p.lineTo(vtx[idx], vtx[idx+1])
                idx = idxs[i++]<<1; p.lineTo(vtx[idx], vtx[idx+1])
                p.closePath()
                this.paths.push(p)      
            }
        }            
    }

    draw_poly_stroke() {
        this.ensure_paths_created()       
        ctx_img.lineWidth = 0.5/image_view.viewport_zoom
        ctx_img.strokeStyle = "#000"
        for(let p of this.paths) {
            ctx_img.stroke(p)        
        }        
    }

    draw_poly_fill_color() {
        this.ensure_paths_created()
        const fcol = this.arrs.face_color

        ctx_img.lineWidth = 1 / image_view.viewport_zoom
        let vidx = 0, style
        for(let p of this.paths) {
            style = "rgba(" + fcol[vidx] + "," + fcol[vidx+1] + "," + fcol[vidx+2] + "," + (fcol[vidx+3]/255) + ")"

            ctx_img.fillStyle = style
            ctx_img.fill(p)
            ctx_img.strokeStyle = style
            ctx_img.stroke(p) // need to stroke as well as as fill to fix the stupid stitching bug caused by per-poly antialiasing 
                             // https://stackoverflow.com/questions/15631426/svg-fill-not-filling-boundary/15638764#comment22224474_15638764
                             // This is wrong if the fill has alpha lower than 1 or ==1
            vidx += 4
        }
    }

    make_clip_path(face_fill, foi) {
        let vtx = this.arrs.vtx_pos
        let idxs = this.arrs.idx        
        let p = new Path2D(), idx
        if (this.type == MESH_QUAD) {
            for(let vi = 0, i = 0; vi < idxs.length; vi += 4, ++i) {
                if (face_fill[i] != foi)
                    continue
                idx = idxs[vi]<<1; p.moveTo(vtx[idx], vtx[idx+1])
                idx = idxs[vi+1]<<1; p.lineTo(vtx[idx], vtx[idx+1])
                idx = idxs[vi+2]<<1; p.lineTo(vtx[idx], vtx[idx+1])
                idx = idxs[vi+3]<<1; p.lineTo(vtx[idx], vtx[idx+1])
                p.closePath()
            }
        }
        else if (this.type == MESH_TRI) {
            for(let vi = 0, i = 0; vi < idxs.length; vi += 3, ++i) {
                if (face_fill[i] != foi)
                    continue
                idx = idxs[vi]<<1; p.moveTo(vtx[idx], vtx[idx+1])
                idx = idxs[vi+1]<<1; p.lineTo(vtx[idx], vtx[idx+1])
                idx = idxs[vi+2]<<1; p.lineTo(vtx[idx], vtx[idx+1])
                p.closePath()
            }
        }       
        return p
    }

    async draw_poly_fill_clip(m) 
    {
        for(let foi in this.fill_objs) 
        {
            const fo = this.fill_objs[foi]
            if (fo === null)
                continue
            if (fo.clip_path === undefined || fo.clip_path === null)  // it's going to be undefined at the first time, null if it's invalidated?
                fo.clip_path = this.make_clip_path(this.arrs.face_fill, foi)
            ctx_img.save()
            ctx_img.clip(fo.clip_path, "nonzero"); // "evenodd" is not what we usually want
            try {
                await fo.obj_proxy.draw(m)
            } finally {
                ctx_img.restore()
            }
        }
    }
    
    ensure_tcache(m) {  // used for gl_draw and setattr node transform
        let do_trans = false
        if (this.tcache.vtx_pos === null) {
            this.tcache.vtx_pos = new Float32Array(this.arrs.vtx_pos)
            do_trans = true
        }
        else if (this.tcache.m === null || !mat3.equals(m, this.tcache.m)) {
            do_trans = true
        }
        if (do_trans) {
            Mesh.transform_arr(m, this.arrs.vtx_pos, this.tcache.vtx_pos)
            this.meta.vtx_pos.made_glbuf = false
        }
    }

    vidxs_of_face(i) { // get the vertices indices (of x) of face i
        let face_sz = this.face_size()
        let idxi = i * face_sz
        console.assert(idxi < this.arrs.idx.length, "Out of bound index")
        let r = []
        for(let fi = 0; fi < face_sz; ++fi) {
            let vidx = this.arrs.idx[idxi++] * 2
            r.push(vidx)
        }
        return r
    }

    // API
    async draw_m(m, disp_values) {
        if (!disp_values)
            disp_values = { show_faces:true, show_lines:true, show_vtx:true } // hack for group to work
        //this.ensure_tcache(m)

        if (disp_values.show_faces) {
            if (this.arrs.face_color)
                this.draw_poly_fill_color()
            else if (this.arrs.face_fill) 
                await this.draw_poly_fill_clip(m)
        }
        if (disp_values.show_lines)
            this.draw_poly_stroke()
        if (disp_values.show_vtx)
            this.draw_vertices()
    }

    draw_selection_m(m, select_indices) {
        //this.ensure_tcache(m)
        let vtx = this.arrs.vtx_pos
        ctx_img.beginPath();
        let radius = MESH_DISP.vtx_sel_radius/image_view.viewport_zoom
        for(let idx of select_indices) {
            let vidx = idx * 2
            let x = vtx[vidx], y = vtx[vidx+1]
            ctx_img.moveTo(x + radius, y)
            ctx_img.arc(x, y, radius, 0, 2*Math.PI)
        }
        ctx_img.lineWidth = 2/image_view.viewport_zoom
        ctx_img.strokeStyle = MESH_DISP.sel_color
        ctx_img.stroke()
    }

    make_buffers() {
        for(let name in this.arrs) {
            if (!this.glbufs[name]) {
                this.glbufs[name] = gl.createBuffer()
                //this.glbufs[name].buf_id = g_buf_id++
                //console.log("++",this.glbufs[name].buf_id)
                this.meta[name].made_glbuf = false
            }
            if (this.meta[name] !== null && this.meta[name] !== undefined && !this.meta[name].made_glbuf) {
                let data_from = (name == "vtx_pos") ? this.tcache : this.arrs
                let bind_point = (name == 'idx') ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER
                    
                gl.bindBuffer(bind_point, this.glbufs[name]);
                gl.bufferData(bind_point, data_from[name], gl.STATIC_DRAW);
                this.meta[name].made_glbuf = true
            }
        }     
    }

    // program_attr makes name to index
    gl_draw(m, program_attr) 
    { 
        console.assert(this.type == MESH_TRI, "can't gl_draw non triangle mesh")
        this.ensure_tcache(m)  // TBD another cache?
        this.make_buffers()

        for(let attr_name in program_attr) {
            console.assert(!attr_name.startsWith('face_'), "Face attributes can't be drawen with webgl")
            let attr_buf = this.glbufs[attr_name]
            if (!attr_buf) {
                if (attr_name.substr(0,2) == 'a_') {
                    attr_name = attr_name.substr(2)
                    attr_buf = this.glbufs[attr_name]
                }
            }
            let attr_idx = program_attr[attr_name]
            dassert(attr_idx !== -1, "Can't find program attribute `" + attr_name + "`")
            let arr = this.arrs[attr_name]
            let meta = this.meta[attr_name]
            if (!attr_buf) {
                gl.disableVertexAttribArray(attr_idx)
            }
            else {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.glbufs[attr_name]);
                gl.enableVertexAttribArray(attr_idx);
                gl.vertexAttribPointer(attr_idx, meta.num_elems, arr_gl_type(arr), meta.need_normalize, 0, 0); 
            }
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.glbufs.idx);
        gl.drawElements(gl.TRIANGLES, this.arrs.idx.length, arr_gl_type(this.arrs.idx), 0);
    }

    add_fillobj(proxy) {
        const id = this.fill_objs.length
        this.fill_objs.push(new FillObj(proxy))
        return id
    }
}

let g_buf_id = 1

function arr_gl_type(arr) {
    let ctor = arr.constructor
    if (ctor === Float32Array)
        return gl.FLOAT
    if (ctor === Uint8Array || ctor === Uint8ClampedArray)
        return gl.UNSIGNED_BYTE
    if (ctor === Uint32Array)
        return gl.UNSIGNED_INT
    if (ctor === Uint16Array)
        return gl.UNSIGNED_SHORT
    throw "unexpected array type"
}

/*  make line segments, not really needed
    draw_poly_stroke() {
        if (this.type != MESH_TRI && this.type != MESH_QUAD)
            return
        let idx = this.arrs.idx
        if (this.lines_cache === null) {
            // upper bound to the number of lines is the the number of edges. it will be lower since the outer hull 
            let vtx_visited = new Uint8Array(this.arrs.vtx_pos.length)
            let lines_idx = new Uint32Array(idx.length)
            let ladd = 0
            function check_add(a,b) {
                if (vtx_visited[b] != 0)
                    return
                vtx_visited[b] = 1
                lines_idx[ladd++] = a
                lines_idx[ladd++] = b
            }
            for(let i = 0; i < idx.length; i += 3) {
                check_add(idx[i], idx[i+1])
                check_add(idx[i+1], idx[i+2])
                check_add(idx[i+2], idx[i])
            }
            this.lines_cache = lines_idx.slice(0,ladd)
            console.log("triangles-idx:" + idx.length + " lines-idx:" + ladd)
        }

        let lidx = this.lines_cache
        let i = 0
        while(i < lidx.length) {
            let idx = lidx[i++]<<1
            ctx_img.moveTo(vtx[idx], vtx[idx+1])
            idx = idxs[i++]<<1
            ctx_img.lineTo(vtx[idx], vtx[idx+1])
        }

    }
*/