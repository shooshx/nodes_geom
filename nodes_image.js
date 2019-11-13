"use strict"


class PImage extends ImageBase
{
    static name() { return "PImage" }
    constructor(js_img, smooth) {
        super(js_img.width, js_img.height, smooth)
        this.img = js_img
        this.pixels = null
    }

    width() { return this.img.width }
    height() { return this.img.height }

    draw(m) {
        this.draw_image(this.img, m)
    }

    get_pixels() {
        if (this.pixels === null && this.img.width != 0 && this.img.height != 0) {
            canvas_img_shadow.width = this.img.width
            canvas_img_shadow.height = this.img.height
            ctx_img_shadow.drawImage(this.img, 0, 0, this.img.width, this.img.height);
            this.pixels = ctx_img_shadow.getImageData(0, 0, this.img.width, this.img.height).data;
        }
        return this.pixels
    }
}

class NodeLoadImage extends NodeCls
{
    static name() { return "Load Image" }
    constructor(node) {
        super(node)
        this.file_upload = new ParamImageUpload(node, "File Upload")
        this.smooth_image = new ParamBool(node, "Smooth Scaling", true)
        this.transform = new ParamTransform(node, "Transform")
        this.out_img = new OutTerminal(node, "out_img")
        let zoom_fit_func = ()=>{
            let inv_tz = 1/image_view.viewport_zoom
            this.transform.set_scale(inv_tz, inv_tz)
        }
        this.zoom_fit = new ParamButton(node, "Zoom to fit viewport pixel size", zoom_fit_func)
        zoom_fit_func() // fit to the viewport at the time the node is created
    }

    run() {
        let image = this.file_upload.get_image()
        assert(image !== null, this, "No image uploaded")
        let pimg = new PImage(image, this.smooth_image.v)
        pimg.transform(this.transform.v)
        this.out_img.set(pimg)
    }

    draw_selection(m) {
        let outimg = this.out_img.get_const()
        dassert(outimg !== null, "No output object to select")
        this.transform.draw_dial_at_obj(outimg, m)
        outimg.draw_border(m)
    }    
    image_find_obj(vx, vy, ex, ey) {
        return this.transform.dial.find_obj(ex, ey)
    }    
}


// --- gradients ---

function make_str_color(c) {
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (c[3]/255) + ")"
}

class LinearGradient extends PObject 
{
    static name() { return "Linear Gradient" }
    constructor(x1,y1, x2,y2) {
        super()
        this.p1 = vec2.fromValues(x1,y1) // point at v=0
        this.p2 = vec2.fromValues(x2,y2) // point at v=1
        this.stops = [] // list of [value,color] where color is [r,g,b,alpha]
        this.grd = null
    }
    add_stop(value, color) {
        this.stops.push({value:value,color:color})
        this.obj = null
    }
    draw_fill() {
        if (this.obj === null) {
            let grd = ctx_img.createLinearGradient(this.p1[0],this.p1[1], this.p2[0],this.p2[1])
            for(let s of this.stops) {
                dassert(s.value >= 0 && s.value <= 1, "stop out of range")
                grd.addColorStop(s.value, make_str_color(s.color))
            }
            this.grd = grd
        }
        ctx_img.fillStyle = this.grd
        ctx_img.fillRect(-1,-1,2,2) // TBD whole screen
    }
    interp_point(t) {
        let x = this.p1[0] * (1-t) + this.p2[0] * t
        let y = this.p1[1] * (1-t) + this.p2[1] * t
        return [x,y]
    }
    draw_points() {
        let radius = MESH_DISP.vtx_radius / image_view.viewport_zoom
        let did1 = false, did0 = false
        ctx_img.beginPath();
        ctx_img.moveTo(this.p1[0], this.p1[1])
        ctx_img.lineTo(this.p2[0], this.p2[1])
        ctx_img.lineWidth = 1/image_view.viewport_zoom
        ctx_img.lineStyle = "#000"
        ctx_img.stroke()
        for(let s of this.stops) {
            let [x,y] = this.interp_point(s.value)
            if (s.value == 1)
                did1 = true
            else if (s.value == 0)
                did0 = true

            ctx_img.beginPath();
            ctx_img.arc(x, y, radius, 0, 2*Math.PI)
            ctx_img.fillStyle = make_str_color(s.color)
            ctx_img.fill()
            ctx_img.strokeStyle = "#000"
            ctx_img.stroke()
            // TBD what if it can't be seen?
        }
        if (!did1) {
            ctx_img.beginPath();
            ctx_img.arc(this.p2[0], this.p2[1], radius, 0, 2*Math.PI)
            ctx_img.stroke()
        }
        if (!did0) {
            ctx_img.beginPath();
            ctx_img.arc(this.p1[0], this.p1[1], radius, 0, 2*Math.PI)
            ctx_img.stroke()
        }
    }
    draw_m(m) {
        this.draw_fill()
        this.draw_points()
    }
    transform(m) {

    }

    draw_selection_m(m, selected_indices) {
        let radius = MESH_DISP.vtx_sel_radius/image_view.viewport_zoom
        ctx_img.beginPath();
        for(let idx of selected_indices) {
            if (idx == 0) {
                var x = this.p1[0], y = this.p1[1]
            }
            else if (idx == 1) {
                var x = this.p2[0], y = this.p2[1]
            }
            else {
                var [x,y] = this.interp_point(this.stops[idx-2].value)
            }
            ctx_img.moveTo(x + radius, y)
            ctx_img.arc(x, y, radius, 0, 2*Math.PI)
        }
        ctx_img.lineWidth = 2/image_view.viewport_zoom
        ctx_img.strokeStyle = MESH_DISP.sel_color
        ctx_img.stroke()        
    }
}


// add_point_select_mixin expects a list of points, gradient has 2 or 3 points
// outside the list, this adapts this data to the expected interface
class GradPointsAdapterParam {
    constructor(move_params, range_lst_param, nodecls) {
        this.move_prm = move_params
        this.p1 = move_params[0]
        this.p2 = move_params[1]
        this.range_lstprm = range_lst_param
        this.nodecls = nodecls
        // simulates a list with move_prm followed by range_lst_prm
    }
    count() {
        return this.move_prm.length + this.range_lstprm.count()
    }
    get_value(vidx) {
        let idx = vidx / 2
        if (idx < this.move_prm.length) {
            return this.move_prm[idx].get_value()
        }
        let t = this.range_lstprm.get_value(idx - this.move_prm.length)
        let x = this.p1.x * (1-t) + this.p2.x * t
        let y = this.p1.y * (1-t) + this.p2.y * t
        return [x,y]
    }
    increment(idx, dv) {
        if (idx < this.move_prm.length) {
            this.move_prm[idx].increment(dv)  // move end point
        }
        else {
            // project dv on the line
            let v12 = vec2.fromValues(this.p2.x - this.p1.x, this.p2.y - this.p1.y)
            let dt = vec2.dot(dv, v12) / vec2.dot(v12, v12);
            let ridx = idx - this.move_prm.length
            let v = Math.min(1, Math.max(0, this.range_lstprm.get_value(ridx) + dt))
            this.range_lstprm.modify(ridx, v) // moves stop value
            this.nodecls.redo_sort()
        } 
    }
    reprint_all_lines() { // TBD mark yellow
    }
}

function project_dist(cp, p1, p2) {
    let v12 = vec2.fromValues(p2.x - p1.x, p2.y - p1.y)
    let v1p = vec2.fromValues(cp[0] - p1.x, cp[1] - p1.y)
    let ad = vec2.dot(v1p, v12) / vec2.dot(v12, v12);
    let d = Math.min(1, Math.max(0, ad))
    let pp = vec2.fromValues(p1.x, p1.y) // projected point
    pp[0] += d * v12[0]
    pp[1] += d * v12[1]
    vec2.sub(pp, pp, cp) // vector from projected to cp
    let dist = vec2.len(pp)
    return [dist,d]
}

class NodeGradient extends NodeCls
{
    static name() { return "Gradient" }
    constructor(node) {
        super(node)
        this.sorted_order = [] // list is not recreated, just overwritten

        this.out = new OutTerminal(node, "out_gradient")
        this.type = new ParamSelect(node, "Type", 0, ["Linear", "Radial"])
        this.p1 = new ParamVec2(node, "Point 1", -0.5, 0)
        this.p2 = new ParamVec2(node, "Point 2", 0.5, 0)
        this.add_stops_btn = new ParamBool(node, "Add stops", true, null)
        this.add_stops_btn.display_as_btn(true)
        this.table = new ParamTable(node, "Stops", this.sorted_order)
        this.values = new ParamFloatList(node, "Value", this.table)
        this.colors = new ParamColorList(node, "Color", this.table)

        let ad = new GradPointsAdapterParam([this.p1, this.p2], this.values, this)
        this.selected_indices = []
        add_point_select_mixin(this, this.selected_indices, ad)

        this.values.add(0); this.colors.add([0xff, 0x00, 0x00, 0xff])
        this.values.add(0.5); this.colors.add([0xff, 0xff, 0x00, 0xff])
        this.values.add(1); this.colors.add([0x00, 0xff, 0x00, 0xff])
 
        // list sized line this.values.lst with indices of values in the order they should be displayed
        this.redo_sort()

        // TBD points as expressions
    }
    post_load_hook() { this.redo_sort() } // sort loaded values for the table
    redo_sort() {
        let tmparr = []
        for(let i = 0; i < this.values.lst.length; ++i)
            tmparr.push([this.values.lst[i],i])
        tmparr.sort(function(a,b) { return a[0]-b[0] })
        let changed = false;
        for(let i = 0; i < tmparr.length; ++i)
            if (tmparr[i][1] !== this.sorted_order[i]) {
                changed = true
                break
            }
        if (!changed)
            return
        this.sorted_order.length = 0
        for(let t of tmparr)
            this.sorted_order.push(t[1])
        this.table.remake_table()
    }
    image_click(ex, ey) {
        if (!this.add_stops_btn.v)
            return
        let cp = image_view.epnt_to_model(ex, ey)
        // project clicked point to the line and find the distance to the line the the value on the line for that point
        let [dist, d] = project_dist(cp, this.p1, this.p2)

        if (dist > 10/image_view.viewport_zoom)
            return
        this.values.add(d); 
        this.colors.add([0xcc, 0xcc, 0xcc, 0xff])
        this.redo_sort()
        trigger_frame_draw(true)
    }
    run() {
        if (this.type.sel_idx == 0) {
            let obj = new LinearGradient(this.p1.x, this.p1.y, this.p2.x, this.p2.y)
            for(let i = 0, ci = 0; i < this.values.lst.length; ++i, ci += 4) {
                obj.add_stop(this.values.lst[i], this.colors.lst.slice(ci, ci+4))
            }
            this.out.set(obj)
        }
    }
}