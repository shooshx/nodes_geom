class MultiPath extends PObject
{
    static name() { return "MultiPath" }
    constructor() {
        super()
        this.cmds = [] // list of paths, each a list of ['M', 0, 'L', 1] where 0,1 are indices of vertices
        this.paths = null
        this.arrs = { vtx_pos:null }  // common to all paths
        this.meta = { vtx_pos:null }
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

    draw_lines() {
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
                    else if (cmd = 'Z') {
                        plst.push(cmd)
                        ++ci
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
        for(let p of this.paths) {
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
            this.draw_lines()
        if (disp_values.show_vtx)
            Mesh.prototype.draw_vertices.call(this)
        ctx_img.restore()
    }

    draw_selection(m, select_vindices) {
        Mesh.prototype.draw_selection.call(this, m, select_vindices)
    }
}