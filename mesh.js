"use strict"


const MESH_NOT_SET = 0
const MESH_QUAD = 1
const MESH_TRI = 2

const MESH_DISP = { vtx_radius: 5 }

class Mesh
{
    constructor() {
        this.vtx = new Float32Array(0)
        this.idx = new Int16Array(0)
        this.type = MESH_NOT_SET
        this.vtx_color = null  // Uint8Array
    }

    set_vtx(arr) {
        this.vtx = arr
    }
    set_idx(arr) {
        this.idx = arr
    }
    set_type(v) {
        this.type = v
    }
    set_vtx_color(arr) {
        this.vtx_color = arr
    }

    transform(m) {
        for(let i = 0; i < this.vtx.length; i += 2) {
            let x = this.vtx[i], y = this.vtx[i+1]
            this.vtx[i]   = m[0] * x + m[3] * y + m[6];
            this.vtx[i+1] = m[1] * x + m[4] * y + m[7];            
        }
    }

    draw_vertices() {
        if (this.vtx_color !== null) {
            for(let i = 0; i < this.vtx.length; i += 2) {
                ctx_img.beginPath();
                ctx_img.arc(this.vtx[i], this.vtx[i+1], MESH_DISP.vtx_radius, 0, 2*Math.PI)
                let vidx = i*3
                ctx_img.fillStyle = "rgb(" + this.vtx_color[vidx] + "," + this.vtx_color[vidx+1] + "," + this.vtx_color[vidx+2]+ ")"
                ctx_img.fill()
            }
            ctx_img.lineWidth = 0.5
        }
        else {
            ctx_img.lineWidth = 1
        }
        ctx_img.beginPath();
        for(let i = 0; i < this.vtx.length; i += 2) {
            ctx_img.moveTo(this.vtx[i] + MESH_DISP.vtx_radius, this.vtx[i+1])
            ctx_img.arc(this.vtx[i], this.vtx[i+1], MESH_DISP.vtx_radius, 0, 2*Math.PI)
        }
        ctx_img.strokeStyle = "#000"
        ctx_img.stroke()       
    }

    draw_poly() {
        ctx_img.lineWidth = 1
        ctx_img.beginPath();
        let i = 0
        if (this.type == MESH_QUAD) {
            while(i < this.idx.length) {
                let idx = this.idx[i++]<<1
                ctx_img.moveTo(this.vtx[idx], this.vtx[idx+1])
                idx = this.idx[i++]<<1
                ctx_img.lineTo(this.vtx[idx], this.vtx[idx+1])
                idx = this.idx[i++]<<1
                ctx_img.lineTo(this.vtx[idx], this.vtx[idx+1])
                idx = this.idx[i++]<<1
                ctx_img.lineTo(this.vtx[idx], this.vtx[idx+1])
                idx = this.idx[i-4]<<1
                ctx_img.lineTo(this.vtx[idx], this.vtx[idx+1])
                ctx_img.stroke()
            }
        }
        else if (this.type == MESH_TRI) {
            while(i < this.idx.length) {
                let idx = this.idx[i++]<<1
                ctx_img.moveTo(this.vtx[idx], this.vtx[idx+1])
                idx = this.idx[i++]<<1
                ctx_img.lineTo(this.vtx[idx], this.vtx[idx+1])
                idx = this.idx[i++]<<1
                ctx_img.lineTo(this.vtx[idx], this.vtx[idx+1])
                ctx_img.stroke()
            }
        }
    }
    
    draw() {
        this.draw_vertices()
        this.draw_poly()
    }
}

