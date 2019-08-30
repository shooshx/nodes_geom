"use strict"


const MESH_NOT_SET = 0
const MESH_QUAD = 1
const MESH_TRI = 2

const MESH_DISP = { vtx_radius: 5 }


class Mesh extends PObject
{
    constructor() {
        super()
        this.type = MESH_NOT_SET
        // vtx_color : Uint8Array
        this.arrs = { vtx:new Float32Array(0), idx:new Int16Array(0) }
        this.tcache = { vtx:null, m:null }  // transformed cache
    }

    set(name, arr) {
        this.arrs[name] = arr
        if (this.tcache[name] !== undefined)
            this.tcache[name] = null  // invalidate
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

    draw_poly() {
        let vtx = this.tcache.vtx
        let idxs = this.arrs.idx
        ctx_img.lineWidth = 1
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
                ctx_img.stroke()
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
                ctx_img.stroke()
            }
        }
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
        this.draw_poly()
    }
}

