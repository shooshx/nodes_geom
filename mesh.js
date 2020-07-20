"use strict"


const MESH_NOT_SET = 0
const MESH_QUAD = 1
const MESH_TRI = 2
const MESH_POINTS = 3

const MESH_DISP = { vtx_radius: 5, vtx_sel_radius: 7, sel_color:"#FFBB55", line_width:0.5 }
const DEFAULT_VTX_COLOR = { hex: "#cccccc", rgb: "rgb(204,204,204)", rgba: "rgba(204,204,204,1.0)", arr:[204,204,204,255] }

let TVtxArr = Float32Array
let TIdxArr = Uint32Array  // all indices are 32 bit, too much hassle to keep 16 bit indices around
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
    center() {
        return [(this.min_x + this.max_x)/2, (this.min_y + this.max_y)/2]
    }
}

class FillObj {
    constructor(obj_proxy) {
        this.obj_proxy = obj_proxy // ObjConstProxy which is not cloned
        this.clip_path = null
    }
}

// coping list of fill objs need to clone the FillObj as well since it's part of the state of the original object
// (the clip_path)
function clone_fill_objs(from_fill_objs) {
    const ret = []
    for(let f of from_fill_objs) {
        if (f === null)
            ret.push(null)
        else 
            ret.push(new FillObj(f.obj_proxy)) // the reference of the proxy is the only thing remaining shared
    }
    return ret
}
function init_fill_objs() {
    return [null]
}

// used in SetAttr to get the center of a face in an expression
class PropCallProxy {
    constructor(mesh, name, type) {
        this.mesh = mesh
        this.name = name
        this.type = type
    }
    computed_value(index) {
        return this.mesh[this.name](index)
    }
    computed_type() {
        return this.type
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
        this.fill_objs = init_fill_objs()  // list of FillObj, used for face_fill attribute
                             // it's the nodes responsibility that there would not be left objects that are not needed
                             // first entry is null so ids start with 1. 0 is reserved to nothing
        this.paper_obj = null
        this.clipper_obj = null
        this.effective_vtx_pos = null // if there is vtx_transform/face_transform, this is already transformed vertices, otherwise just equal to vtx_pos
        this.points_idx_cache = null // if not null: {idx_buf: index array, seed: seed used to generate }
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
        this.paper_obj = null
        this.clipper_obj = null
        this.points_idx_cache = null
        this.make_effective_vtx_pos()
        this.invalidate_fill()
    }
    invalidate_fill() {
        for(let fo of this.fill_objs)
            if (fo !== null)
                fo.clip_path = null
    }

    make_effective_vtx_pos() {
        this.effective_vtx_pos = this.arrs.vtx_pos // in case non of the below
        if (this.arrs.vtx_transform !== undefined) 
            this.transform_per_vtx()
        if (this.arrs.face_transform !== undefined)
            this.transform_per_face()  // transforms effective_vtx_pos      
    }

    set(name, arr, num_elems, need_normalize) {
        name = normalize_attr_name(name)        
        this.arrs[name] = arr
        this.meta[name] = { made_glbuf: false,  // not really used for anything right now
                            num_elems: num_elems || 1, // count of numbers for each element. will be undefined for indices
                            need_normalize: need_normalize || false // true for color that needs to go from int to float [0,1]
                           }
        if (name == "vtx_pos") 
            this.invalidate_pos()
        else if (name == "face_transform") 
            this.unshare_vertices_between_faces()
        else if (name == "vtx_transform")
            this.make_effective_vtx_pos()
        else if (name == "face_fill") 
            this.invalidate_fill()
    }

    set_type(v) { 
        this.type = v 
        this.invalidate_pos()
    }
    vtx_count() { return this.arrs.vtx_pos.length / 2 } // 2 for (x,y)
    face_count() {
        if (this.arrs.idx === null || this.arrs.idx === undefined) {
            if (this.type == MESH_POINTS)
                return this.vtx_count() // this actually counts how many ranges in a MultiPath this would take, for Merge
            dassert(false, "expected idx")
        }
        // can have mesh of points with idx (to repeat the points)
        return this.arrs.idx.length / this.face_size()
    }
    face_size() {
        switch(this.type) {
        case MESH_TRI: return 3
        case MESH_QUAD: return 4
        case MESH_POINTS: return 1;
        default: dassert(false, "face_size: type not set")
        }
    }

    has_idx() {
        return this.arrs.idx !== null && this.arrs.idx !== undefined
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

    transform_per_vtx() 
    {
        const vtx_pos = this.arrs.vtx_pos, vtx_transform = this.arrs.vtx_transform
        dassert(vtx_transform.length / 6 === vtx_pos.length / 2, "unexpect length of vtx_transform")

        if (this.effective_vtx_pos === null || this.effective_vtx_pos === this.arrs.vtx_pos || this.effective_vtx_pos.length != vtx_pos.length)
            this.effective_vtx_pos = new TVtxArr(vtx_pos.length)
        const vtx_new = this.effective_vtx_pos

        for(let vi = 0, ti = 0; vi < vtx_new.length; vi += 2, ti += 6) {
            let x = vtx_pos[vi], y = vtx_pos[vi+1]
            vtx_new[vi]   = vtx_transform[ti] * x + vtx_transform[ti+2] * y + vtx_transform[ti+4];
            vtx_new[vi+1] = vtx_transform[ti+1] * x + vtx_transform[ti+3] * y + vtx_transform[ti+5];                  
        }
    }

    transform_per_face() 
    { // assume vertices are unshared
        const vtx_pos = this.effective_vtx_pos, face_transform = this.arrs.face_transform
        dassert(face_transform.length / 6 === this.face_count(), "unexpect length of face_transform")

        if (this.effective_vtx_pos === null || this.effective_vtx_pos === this.arrs.vtx_pos || this.effective_vtx_pos.length != vtx_pos.length)
            this.effective_vtx_pos = new TVtxArr(vtx_pos.length)
        const vtx_new = this.effective_vtx_pos
        
        const face_size = this.face_size()
        const idx = this.arrs.idx
        for(let ii = 0, ti = 0; ii < idx.length; ii += face_size, ti += 6) {
            for(let ei = 0; ei < face_size; ++ei) {
                const vi = idx[ii+ei]*2
                let x = vtx_pos[vi], y = vtx_pos[vi+1]
                vtx_new[vi]   = face_transform[ti] * x + face_transform[ti+2] * y + face_transform[ti+4];
                vtx_new[vi+1] = face_transform[ti+1] * x + face_transform[ti+3] * y + face_transform[ti+5];                      
            }
        }
    }

    // make every vertex be referenced only by a single polygon. needed if we want to move polys individually with face_transform
    // there's two ways to do this, the easy way 
    //   1. just recreate all the vtx_ arrays without sharing - advantage: index is remains localized
    //   2. the slightly harder way - find sharing and only change only that - advantage - original vertex order is not changed (not really important?)
    // I do 1. here because it's easier and there's no reason to do 2. 
    unshare_vertices_between_faces()
    {
        const idx = this.arrs.idx
        for(let name in this.arrs) {
            if (!name.startsWith('vtx_'))
                continue
            const prop = this.arrs[name]
            const num_elems = this.meta[name].num_elems
            const new_prop = new prop.constructor(idx.length * num_elems)
            let nidx = 0
            for(let i = 0; i < idx.length; ++i) {
                const oidx = idx[i]
                for(let ei = 0; ei < num_elems; ++ei)
                    new_prop[nidx*num_elems + ei] = prop[oidx*num_elems + ei]
                //idx[i] = nidx;
                ++nidx;
            }
            this.arrs[name] = new_prop;
        }
        // now fix idx
        let nidx = 0
        for(let i = 0; i < idx.length; ++i) {
            idx[i] = nidx++;
        }
        this.invalidate_pos()
    }

    computed_prop(name) {
        if (name === "face_center")
            return new PropCallProxy(this, name, TYPE_VEC2)
        return null
    }
    // called from PropCallProxy, from SetAttr
    face_center(face_index) {
        const face_size = this.face_size()
        const idx = this.arrs.idx
        let vtx = this.effective_vtx_pos
        let sx = 0, sy = 0
        for(let i = 0; i < face_size; ++i) {
            const vi = idx[face_index*face_size + i]*2
            sx += vtx[vi]
            sy += vtx[vi+1]
        }
        return vec2.fromValues(sx / face_size, sy / face_size)
    }


    // API
    get_bbox() { // TBD can cache this
        let vtx = this.effective_vtx_pos
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
        canvas_setTransform(ctx_img, m)
        ctx_img.strokeStyle = "#000"
        ctx_img.lineWidth = MESH_DISP.line_width/image_view.viewport_zoom
        ctx_img.strokeRect(bbox.min_x, bbox.min_y, bbox.max_x - bbox.min_x, bbox.max_y - bbox.min_y)
        ctx_img.restore()
    }

    draw_vertices(lines_color="#000", do_fill=true) 
    {
        let vtx = this.effective_vtx_pos
        if (vtx === null)
            return
        let vtx_radius = null
        if (this.arrs.vtx_radius !== undefined) {
            vtx_radius = this.arrs.vtx_radius
            dassert(vtx_radius.length == this.arrs.vtx_pos.length / 2, "unexpected size of vtx_radius")
        }
        if (do_fill && this.arrs.vtx_color !== undefined) {
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
            ctx_img.lineWidth = MESH_DISP.line_width/image_view.viewport_zoom
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
        ctx_img.strokeStyle = lines_color
        ctx_img.stroke()       

        if (this.arrs.vtx_normal !== undefined) {
            let norm = this.arrs.vtx_normal
            dassert(norm.length == this.arrs.vtx_pos.length, "unexpected size of vtx_normal")
            ctx_img.beginPath();
            for(let vi=0; vi < vtx.length; vi += 2) {
                ctx_img.moveTo(vtx[vi], vtx[vi+1])
                ctx_img.lineTo(vtx[vi] + norm[vi], vtx[vi+1] + norm[vi+1])
            }
            ctx_img.lineWidth = MESH_DISP.line_width/image_view.viewport_zoom
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
        let vtx = this.effective_vtx_pos

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

    draw_poly_stroke(lines_color = "#000") {
        this.ensure_paths_created()       
        ctx_img.lineWidth = MESH_DISP.line_width/image_view.viewport_zoom
        ctx_img.strokeStyle = lines_color
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
        let vtx = this.effective_vtx_pos
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

    draw_poly_fill_clip(m) 
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
                fo.obj_proxy.draw(m)
            } finally {
                ctx_img.restore()
            }
        }
    }

    async pre_draw_poly_fill_clip(m) 
    {
        for(let foi in this.fill_objs) {
            const fo = this.fill_objs[foi]
            if (fo === null)
                continue
            await fo.obj_proxy.pre_draw(m)       
        }        
    }
    
    ensure_tcache(m) {  // used for gl_draw and setattr node transform
        let do_trans = false
        if (this.tcache.vtx_pos === null) {
            this.tcache.vtx_pos = new Float32Array(this.arrs.vtx_pos.length)
            do_trans = true
        }
        else if (this.tcache.m === null || !mat3.equals(m, this.tcache.m)) {
            do_trans = true
        }
        if (do_trans) {
            Mesh.transform_arr(m, this.effective_vtx_pos, this.tcache.vtx_pos)
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
    async pre_draw(m, disp_values) {
        if (disp_values.show_faces) {
            if (!this.arrs.face_color && this.arrs.face_fill) {
                await this.pre_draw_poly_fill_clip(m)
            }
        }
    }

    // API
    draw_m(m, disp_values) {
        console.log("Mesh ", this.face_size(), " vtx:", this.arrs.vtx_pos.length/2, " faces:", this.face_count()) 
        if (!disp_values)
            disp_values = { show_faces:true, show_lines:true, show_vtx:true } // hack for group to work
        //this.ensure_tcache(m)

        if (disp_values.show_faces) {
            if (this.arrs.face_color)
                this.draw_poly_fill_color()
            else if (this.arrs.face_fill) 
                this.draw_poly_fill_clip(m)
        }
        if (disp_values.show_lines)
            this.draw_poly_stroke()
        if (disp_values.show_vtx)
            this.draw_vertices()
    }

    draw_selection_m(m, select_indices) {
        //this.ensure_tcache(m)
        let vtx = this.effective_vtx_pos
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

    draw_template_m(m) {
        this.draw_poly_stroke(TEMPLATE_LINE_COLOR)
        this.draw_vertices(TEMPLATE_LINE_COLOR, false)
    }

    make_buffers() {
        for(let name in this.arrs) {
            if (this.arrs[name] === null)
                continue // happens for idx array when rendering just points
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

    make_point_suffle(seed, len) 
    {
        // it makes sense to generate the shuffle and cache it in the mesh since that's when we can create the gl buffer as well
        if (this.points_idx_cache !== null && this.points_idx_cache.seed === seed && this.points_idx_cache.len === len)
            return this.points_idx_cache.idx_buf
        const idx = new TIdxArr(len)
        for(let i = 0; i < len; ++i)
            idx[i] = i;
        // Fisher–Yates shuffle
        const prng = new RandNumGen(seed)
        for (let i = len - 1; i > 0; i--) {
            const j = Math.floor(prng.next() * (i + 1));
            [idx[i], idx[j]] = [idx[j], idx[i]];
        }

        let idx_buf = null
        if (this.points_idx_cache !== null) // if it's not null, it has idx_buf
            idx_buf = this.points_idx_cache.idx_buf 
        else
            idx_buf = gl.createBuffer()
                    
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx_buf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
        this.points_idx_cache = { idx_buf:idx_buf, seed:seed, len:len } 

        return idx_buf 
    }

    // program_attr maps attribute name to index (location)
    gl_draw(m, program_attr, opt={}) 
    { 
        dassert(this.type === MESH_TRI || this.type === MESH_POINTS || opt.override_just_points, "can't gl_draw non triangle mesh")
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

        if (this.type === MESH_TRI && !opt.override_just_points) {
            dassert(this.glbufs.idx !== null, "Tri mesh without indices")
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.glbufs.idx);
            gl.drawElements(gl.TRIANGLES, this.arrs.idx.length, arr_gl_type(this.arrs.idx), 0);
        }
        else {  // just points
            const count = this.arrs.vtx_pos.length / this.meta.vtx_pos.num_elems
            if (opt.shuffle_points_seed !== null) {
                const idx_buf = this.make_point_suffle(opt.shuffle_points_seed, count)
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx_buf)
                gl.drawElements(gl.POINTS, count, arr_gl_type(this.arrs.idx), 0);
            }
            else {
                gl.drawArrays(gl.POINTS, 0, count)
            }
        }

        // disable everything we just enabled for the future other programs running
        for(let attr_name in program_attr) {
            let attr_idx = program_attr[attr_name]
            gl.disableVertexAttribArray(attr_idx)
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, null)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)
    }

    add_fillobj(proxy) {
        const id = this.fill_objs.length
        this.fill_objs.push(new FillObj(proxy))
        return id
    }

    make_single_object_calls(p) {
        let vtx = this.effective_vtx_pos
        let idxs = this.arrs.idx        
        let idx, vidx
        if (this.type == MESH_QUAD) {
            for(let vi = 0, i = 0; vi < idxs.length; vi += 4, ++i) {
                vidx = idxs[vi];   idx = vidx<<1; p.moveTo(vtx[idx], vtx[idx+1], vidx)
                vidx = idxs[vi+1]; idx = vidx<<1; p.lineTo(vtx[idx], vtx[idx+1], vidx)
                vidx = idxs[vi+2]; idx = vidx<<1; p.lineTo(vtx[idx], vtx[idx+1], vidx)
                vidx = idxs[vi+3]; idx = vidx<<1; p.lineTo(vtx[idx], vtx[idx+1], vidx)
                p.closePath()
            }
        }
        else if (this.type == MESH_TRI) {
            for(let vi = 0, i = 0; vi < idxs.length; vi += 3, ++i) {
                vidx = idxs[vi];   idx = vidx<<1; p.moveTo(vtx[idx], vtx[idx+1], idx)
                vidx = idxs[vi+1]; idx = vidx<<1; p.lineTo(vtx[idx], vtx[idx+1], idx)
                vidx = idxs[vi+2]; idx = vidx<<1; p.lineTo(vtx[idx], vtx[idx+1], idx)
                p.closePath()
            }
        }       
        return p        
    }

    ensure_paper() {
        if (this.paper_obj !== null && this.paper_obj.children.length*this.face_size() == this.arrs.idx.length) 
            return this.paper_obj
        const p = new paper.CompoundPath()
        p.remove()  // avoid having it drawing to nowhere
        this.make_single_object_calls(p)
        this.paper_obj = p
        return this.paper_obj        
    }

    ensure_clipper() {
        if (this.clipper_obj !== null)
            return this.clipper_obj
        const b = new ClipperPathsBuilder()
        this.make_single_object_calls(b)
        this.clipper_obj = b.d
        //ClipperLib.JS.ScaleUpPaths(this.clipper_obj, CLIPPER_SCALE);
        return this.clipper_obj
    }
}

const CLIPPER_SCALE = 1

// construct a clipper.js style object from context ops
class ClipperPathsBuilder 
{
    constructor() {
        this.d = []
        this.cur_path = null
    }
    moveTo(x, y, vidx) {
        this.cur_path = [{X:x, Y:y, Z:vidx}]
        this.cur_path.closed = false
        this.d.push(this.cur_path)
    }
    lineTo(x, y, vidx) {
        dassert(this.cur_path !== null, "Path needs to start with moveTo")
        this.cur_path.push({X:x, Y:y, Z:vidx})
    }
    closePath() {
        dassert(this.cur_path !== null, "Path needs to start with moveTo")
        this.cur_path.closed = true
    }
    bezierCurveTo() {
        dassert(false, "not implemented")
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
    throw new Error("unexpected array type")
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