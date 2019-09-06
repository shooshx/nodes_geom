"use strict"


const MESH_NOT_SET = 0
const MESH_QUAD = 1
const MESH_TRI = 2

const MESH_DISP = { vtx_radius: 5 }

let TVtxArr = Float32Array
let TIdxArr = Int16Array

class Mesh extends PObject
{
    constructor() {
        super()
        this.type = MESH_NOT_SET
        // vtx_color : Uint8Array
        this.arrs = { vtx:new TVtxArr(0), idx:new TIdxArr(0) }
        
        this.tcache = { vtx:null, m:null }  // transformed cache
        this.lines_cache = null  // cache lines for stroke (so that every line be repeated twice
    }

    set(name, arr) {
        this.arrs[name] = arr
        if (name == "vtx" && this.tcache[name] !== undefined)
            this.tcache[name] = null  // invalidate
        if (name == "idx")
            this.lines_cache = null
    }

    set_type(v) { this.type = v }
    set_vtx(arr) { this.set("vtx", arr)  }
    set_idx(arr) {  this.set("idx", arr) }
    set_vtx_color(arr) { this.set("vtx_color", arr) }

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
            for(let i = 0; i < vtx.length; i += 2) {
                ctx_img.beginPath();
                ctx_img.arc(vtx[i], vtx[i+1], MESH_DISP.vtx_radius, 0, 2*Math.PI)
                let vidx = i*3
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
            ctx_img.moveTo(vtx[i] + MESH_DISP.vtx_radius, vtx[i+1])
            ctx_img.arc(vtx[i], vtx[i+1], MESH_DISP.vtx_radius, 0, 2*Math.PI)
        }
        ctx_img.strokeStyle = "#000"
        ctx_img.stroke()       
    }


    draw_poly_fill() {            
        let vtx = this.tcache.vtx
        let idxs = this.arrs.idx
        ctx_img.lineWidth = 0.5
        ctx_img.beginPath();
        let i = 0
        if (this.type == MESH_QUAD) {
            while(i < idxs.length) {
                let idx = idxs[i++]<<1
                ctx_img.moveTo(vtx[idx], vtx[idx+1])
                idx = idxs[i++]<<1
                ctx_img.lineTo(vtx[idx], vtx[idx+1])
                idx = idxs[i++]<<1
                ctx_img.lineTo(vtx[idx], vtx[idx+1])
                idx = idxs[i++]<<1
                ctx_img.lineTo(vtx[idx], vtx[idx+1])
                idx = idxs[i-4]<<1
                ctx_img.lineTo(vtx[idx], vtx[idx+1])
            }
        }
        else if (this.type == MESH_TRI) {
            while(i < idxs.length) {
                let idx = idxs[i++]<<1
                ctx_img.moveTo(vtx[idx], vtx[idx+1])
                idx = idxs[i++]<<1
                ctx_img.lineTo(vtx[idx], vtx[idx+1])
                idx = idxs[i++]<<1
                ctx_img.lineTo(vtx[idx], vtx[idx+1])
                idx = idxs[i-3]<<1
                ctx_img.lineTo(vtx[idx], vtx[idx+1])                
            }
        }
        ctx_img.stroke()        
    }
    
    draw(m) {
        if (this.tcache.vtx === null) {
            this.tcache.vtx = new Float32Array(this.arrs.vtx)
            this.transform_arr(m, this.arrs.vtx, this.tcache.vtx)
        }
        else if (this.tcache.m === null || !mat3.equals(m, this.tcache.m)) {
            this.transform_arr(m, this.arrs.vtx, this.tcache.vtx)
        }

        this.draw_vertices()
        this.draw_poly_fill()
    }
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