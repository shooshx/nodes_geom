"use strict"


const MESH_NOT_SET = 0
const MESH_QUAD = 1
const MESH_TRI = 2

const MESH_DISP = { vtx_radius: 5, vtx_sel_radius: 7 }

let TVtxArr = Float32Array
let TIdxArr = Int16Array
let TColorArr = Uint8Array

function normalize_attr_name(s) {
    let r = s.toLowerCase().replace(' ', '_')
    if (r == "point_color")
        return "vtx_color"
    if (r == "coord")
        return "vtx"
    return r
}

class Mesh extends PObject
{
    static name() { return "Mesh" }
    constructor() {
        super()
        this.type = MESH_NOT_SET
        // vtx_color : Uint8Array
        this.arrs = { vtx:null, idx:null }
        this.meta = { vtx:null, idx:null } // metadata objects for every array in arrs (instead of setting properties in the array object itself which can't be cloned reasonably)
        
        this.tcache = { vtx:null, m:null }  // transformed cache
        //this.lines_cache = null  // cache lines for stroke (so that every line be repeated twice
        this.glbufs = { vtx:null, idx:null }
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

    set(name, arr, num_elems, need_normalize) {
        name = normalize_attr_name(name)        
        this.arrs[name] = arr
        this.meta[name] = { made_glbuf: false,
                            num_elems: num_elems || false, // count of numbers for each element. will be undefined for indices
                            need_normalize: need_normalize || false // true for color that needs to go from int to float [0,1]
                           }
        if (name == "vtx" && this.tcache[name] !== undefined)
            this.tcache[name] = null  // invalidate
        //if (name == "idx")
        //    this.lines_cache = null
    }

    set_type(v) { this.type = v }

    get_sizes() {
        let r = { type: this.type, arrs:{} }       
        for(let n in this.arrs) {
            r.arrs[n] = { sz: this.arrs[n].length, type: this.arrs[n].constructor }
        }
        return r
    }

    transform_arr(m, from, to) {
        for(let i = 0; i < from.length; i += 2) {
            let x = from[i], y = from[i+1]
            to[i]   = m[0] * x + m[3] * y + m[6];
            to[i+1] = m[1] * x + m[4] * y + m[7];            
        }
        to.made_glbuf = false
    }
    
    transform(m) {
        this.transform_arr(m, this.arrs.vtx, this.arrs.vtx)
    }

    get_bbox() {
        let vtx = this.arrs.vtx
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
        return { min_x:min_x, max_x:max_x, min_y:min_y, max_y:max_y }
    }

    draw_vertices() {
        let vtx = this.tcache.vtx
        if (this.arrs.vtx_color !== undefined) {
            console.assert(this.arrs.vtx_color.length / 4 == this.arrs.vtx.length / 2, "unexpected size of vtx_color")
            for(let i = 0; i < vtx.length; i += 2) {
                ctx_img.beginPath();
                ctx_img.arc(vtx[i], vtx[i+1], MESH_DISP.vtx_radius, 0, 2*Math.PI)
                let vidx = i/2*4
                ctx_img.fillStyle = "rgb(" + this.arrs.vtx_color[vidx] + "," + this.arrs.vtx_color[vidx+1] + "," + this.arrs.vtx_color[vidx+2]+ ")"
                ctx_img.fill()
            }
            ctx_img.lineWidth = 0.5
        }
        else {
            ctx_img.lineWidth = 1
        }
        ctx_img.beginPath();
        for(let i = 0; i < vtx.length; i += 2) {
            let x = vtx[i], y = vtx[i+1]
            ctx_img.moveTo(x + MESH_DISP.vtx_radius, y)
            ctx_img.arc(x, y, MESH_DISP.vtx_radius, 0, 2*Math.PI)
        }
        ctx_img.strokeStyle = "#000"
        ctx_img.stroke()       
    }


    draw_poly_stroke() {            
        let vtx = this.tcache.vtx
        let idxs = this.arrs.idx
        ctx_img.lineWidth = 0.5
        ctx_img.beginPath();
        let i = 0
        if (this.type == MESH_QUAD) {
            while(i < idxs.length) {
                let idx = idxs[i++]<<1; ctx_img.moveTo(vtx[idx], vtx[idx+1])
                idx = idxs[i++]<<1; ctx_img.lineTo(vtx[idx], vtx[idx+1])
                idx = idxs[i++]<<1; ctx_img.lineTo(vtx[idx], vtx[idx+1])
                idx = idxs[i++]<<1; ctx_img.lineTo(vtx[idx], vtx[idx+1])
                idx = idxs[i-4]<<1; ctx_img.lineTo(vtx[idx], vtx[idx+1])
            }
        }
        else if (this.type == MESH_TRI) {
            while(i < idxs.length) {
                let idx = idxs[i++]<<1; ctx_img.moveTo(vtx[idx], vtx[idx+1])
                idx = idxs[i++]<<1; ctx_img.lineTo(vtx[idx], vtx[idx+1])
                idx = idxs[i++]<<1; ctx_img.lineTo(vtx[idx], vtx[idx+1])
                idx = idxs[i-3]<<1; ctx_img.lineTo(vtx[idx], vtx[idx+1])                
            }
        }
        ctx_img.stroke()        
    }
    
    ensure_tcache(m) {
        let do_trans = false
        if (this.tcache.vtx === null) {
            this.tcache.vtx = new Float32Array(this.arrs.vtx)
            do_trans = true
        }
        else if (this.tcache.m === null || !mat3.equals(m, this.tcache.m)) {
            do_trans = true
        }
        if (do_trans)
            this.transform_arr(m, this.arrs.vtx, this.tcache.vtx)
    }

    draw(m) {
        this.ensure_tcache(m)
        this.draw_vertices()
        this.draw_poly_stroke()
    }

    draw_selection(m, select_vindices) {
        this.ensure_tcache(m)

        let vtx = this.tcache.vtx
        ctx_img.lineWidth = 2
        ctx_img.beginPath();
        for(let idx of select_vindices) {
            let vidx = idx * 2
            let x = vtx[vidx], y = vtx[vidx+1]
            ctx_img.moveTo(x + MESH_DISP.vtx_sel_radius, y)
            ctx_img.arc(x, y, MESH_DISP.vtx_sel_radius, 0, 2*Math.PI)
        }
        ctx_img.strokeStyle = "#FFBB55"
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
            if (!this.meta[name].made_glbuf) {
                let data_from = (name == "vtx") ? this.tcache : this.arrs
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
        this.ensure_tcache(m)  // TBD another cache?
        this.make_buffers()

        for(let attr_name in program_attr) {
            let attr_buf = this.glbufs[attr_name]
            if (!attr_buf) {
                if (attr_name.substr(0,2) == 'a_') {
                    attr_name = attr_name.substr(2)
                    attr_buf = this.glbufs[attr_name]
                }
            }
            let attr_idx = program_attr[attr_name]
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
            let vtx_visited = new Uint8Array(this.arrs.vtx.length)
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