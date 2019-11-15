
function make_str_color(c) {
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (c[3]/255) + ")"
}

// number of points in the Node's list that are not stop points from the beginning of the index space
const NODE_POINT_LST_OFFSET = 4

class Gradient extends PObject 
{
    constructor(x1,y1, x2,y2) {
        super()
        this.p1 = vec2.fromValues(x1,y1) // point at v=0
        this.p2 = vec2.fromValues(x2,y2) // point at v=1
        this.stops = [] // list of [value,color] where color is [r,g,b,alpha]
        this.grd = null
        this.ctx_create_func = null
        this.t_mat = mat3.create() // transform for circles and fill
    }
    add_stop(value, color) {
        this.stops.push({value:value,color:color})
        this.obj = null
    }
    get_disp_params(disp_values) {
        return [ new DispParamBool(disp_values, "Show Controls", 'show_ctrl', true),
                 new DispParamBool(disp_values, "Show Fill", 'show_fill', true),
                ]
    }

    draw_fill() {        
        if (this.obj === null) {
            let grd = this.ctx_create_func.call(ctx_img, this.p1[0],this.p1[1], this.p2[0],this.p2[1])
            for(let s of this.stops) {
                dassert(s.value >= 0 && s.value <= 1, "stop out of range")
                grd.addColorStop(s.value, make_str_color(s.color))
            }
            this.grd = grd
        }

        ctx_img.save()
        ctx_img.transform(this.t_mat[0], this.t_mat[1], this.t_mat[3], this.t_mat[4], this.t_mat[6], this.t_mat[7])
        ctx_img.fillStyle = this.grd
        ctx_img.fillRect(-1,-1,2,2) // TBD whole screen
        ctx_img.restore()
    }
    interp_point(pa, pb, t) {
        let x = pa[0] * (1-t) + pb[0] * t
        let y = pa[1] * (1-t) + pb[1] * t
        return [x,y]
    }

    transform(m) { mat3.multiply(this.t_mat, m, this.t_mat) }

    draw_line_points(pa, pb) {
        let radius = MESH_DISP.vtx_radius / image_view.viewport_zoom
        let did1 = false, did0 = false
        ctx_img.beginPath();
        ctx_img.moveTo(pa[0], pa[1])
        ctx_img.lineTo(pb[0], pb[1])
        ctx_img.lineWidth = 1/image_view.viewport_zoom
        ctx_img.lineStyle = "#000"
        ctx_img.stroke()
        for(let s of this.stops) {
            let [x,y] = this.interp_point(pa, pb, s.value)
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
            ctx_img.arc(pb[0], pb[1], radius, 0, 2*Math.PI)
            ctx_img.stroke()
        }
        if (!did0) {
            ctx_img.beginPath();
            ctx_img.arc(pa[0], pa[1], radius, 0, 2*Math.PI)
            ctx_img.stroke()
        }
    }    

    draw_sel_points(selected_indices, pa, pb) {
        let radius = MESH_DISP.vtx_sel_radius/image_view.viewport_zoom
        ctx_img.beginPath();
        for(let idx of selected_indices) {
            if (idx == 0) {
                var x = this.p1[0], y = this.p1[1]
            }
            else if (idx == 1) {
                var x = this.p2[0], y = this.p2[1]
            }
            else if (idx == 2 || idx == 3) {
                continue
            }
            else {
                var [x,y] = this.interp_point(pa, pb, this.stops[idx-NODE_POINT_LST_OFFSET].value)
            }
            ctx_img.moveTo(x + radius, y)
            ctx_img.arc(x, y, radius, 0, 2*Math.PI)
        }
        ctx_img.lineWidth = 2/image_view.viewport_zoom
        ctx_img.strokeStyle = MESH_DISP.sel_color
        ctx_img.stroke()        
    }
}

class LinearGradient extends Gradient {
    static name() { return "Linear Gradient" }
    constructor(x1,y1, x2,y2) {
        super(x1,y1, x2, y2)
        this.ctx_create_func = ctx_img.createLinearGradient
    }

    draw_m(m, disp_values) {
        if (disp_values.show_fill)
            this.draw_fill()
        if (disp_values.show_ctrl)
            this.draw_line_points(this.p1, this.p2)
    }
    draw_selection_m(m, selected_indices) {
        this.draw_sel_points(selected_indices, this.p1, this.p2)
    }
}

// get the points on the circle that are used for changing the radius
function get_circle_points(p1, r1, p2, r2) {
    let v12 = vec2.fromValues(p2[0]-p1[0], p2[1]-p1[1])
    if (v12[0] == 0 && v12[1] == 0)
        v12 = vec2.fromValues(1,0)
    vec2.normalize(v12, v12)
    let pa = vec2.fromValues(p1[0], p1[1])
    vec2.scaleAndAdd(pa, pa, v12, -r1)
    let pb = vec2.fromValues(p2[0], p2[1])
    vec2.scaleAndAdd(pb, pb, v12, -r2)
    return [pa,pb]       
}
function get_circle_points_xy(p1, r1, p2, r2) {
    let r = get_circle_points(vec2.fromValues(p1.x,p1.y), r1, vec2.fromValues(p2.x,p2.y), r2)
    return [{x:r[0][0],y:r[0][1]}, {x:r[1][0],y:r[1][1]}]
}

function circle(p, r) {
    ctx_img.moveTo(p[0]+r, p[1])
    ctx_img.arc(p[0], p[1], r, 0, 2*Math.PI)
}

class RadialGradient extends Gradient {
    static name() { return "Radial Gradient" }
    constructor(x1,y1,r1, x2,y2,r2) {
        super(x1,y1, x2, y2)
        this.r1 = r1
        this.r2 = r2
        this.ctx_create_func = function() { return ctx_img.createRadialGradient(x1,y1,r1, x2,y2,r2) }
    }
    draw_circles(tp1, tp2) {
        let p1 = this.p1, p2 = this.p2, r1 = this.r1, r2 = this.r2
        ctx_img.save()
        ctx_img.transform(this.t_mat[0], this.t_mat[1], this.t_mat[3], this.t_mat[4], this.t_mat[6], this.t_mat[7])
        {
            ctx_img.beginPath()
            circle(p1, r1)
            circle(p2, r2)
        }
        ctx_img.restore()
        // point marker
        let radius = MESH_DISP.vtx_radius / image_view.viewport_zoom
        circle(tp1, radius)
        circle(tp2, radius)
        ctx_img.lineWidth = 1/image_view.viewport_zoom
        ctx_img.strokeStyle = "#000"
        ctx_img.stroke()

        // center circles should be different somehow so mark them with additional white
        ctx_img.beginPath()
        ctx_img.strokeStyle = "#ffffff"
        circle(tp1, radius*0.7) 
        circle(tp2, radius*0.7)
        ctx_img.stroke()
        ctx_img.strokeStyle = "#000"
    }

    draw_m(m, disp_values) {
        if (disp_values.show_fill)
            this.draw_fill()
        if (disp_values.show_ctrl) {
            // anything that draws point-marker circles can't use the canvas transform so the points
            // need to be manually transformed with t_mat.
            let tp1 = vec2.create(), tp2 = vec2.create()
            vec2.transformMat3(tp1, this.p1, this.t_mat)
            vec2.transformMat3(tp2, this.p2, this.t_mat)
            this.draw_circles(tp1, tp2)
            // not using tp1,tp2 for this since r1,r2 can't be transformed
            let [pa,pb] = get_circle_points(this.p1, this.r1, this.p2, this.r2)
            let tpa = vec2.create(), tpb = vec2.create()
            vec2.transformMat3(tpa, pa, this.t_mat)
            vec2.transformMat3(tpb, pb, this.t_mat)
            this.draw_line_points(tpa, tpb)
        }
    }
    draw_selection_m(m, selected_indices) {
        let [pa,pb] = get_circle_points(this.p1, this.r1, this.p2, this.r2)
        this.draw_sel_points(selected_indices, pa, pb)
    }
}

// add_point_select_mixin expects a list of points, gradient has 2 or 3 points
// outside the list, this adapts this data to the expected interface
class GradPointsAdapterParam {
    constructor(p1, p2, range_lst_param, nodecls) {
        this.p1 = p1
        this.p2 = p2
        this.move_prm = [p1,p2,null,null]    
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
        let [pa,pb] = this.get_pa_pb()
        let t = this.range_lstprm.get_value(idx - this.move_prm.length)
        let x = pa.x * (1-t) + pb.x * t
        let y = pa.y * (1-t) + pb.y * t
        return [x,y]
    }
    increment(idx, dv) {
        if (idx < this.move_prm.length) {
            this.move_prm[idx].increment(dv)  // move end point
        }
        else {
            let [pa,pb] = this.get_pa_pb()
            // project dv on the line
            let v12 = vec2.fromValues(pb.x - pa.x, pb.y - pa.y)
            let dt = vec2.dot(dv, v12) / vec2.dot(v12, v12);
            let ridx = idx - this.move_prm.length
            let v = Math.min(1, Math.max(0, this.range_lstprm.get_value(ridx) + dt))
            this.range_lstprm.modify(ridx, v) // moves stop value
            this.nodecls.redo_sort()
        } 
    }
    reprint_all_lines() { // mark yellow
        this.range_lstprm.reprint_all_lines()
    }
}

class Linear_GradPointsAdapterParam extends GradPointsAdapterParam {
    constructor(p1, p2, range_lst_param, nodecls) {
        super(p1, p2, range_lst_param, nodecls)
    }
    get_pa_pb() {
        return [this.p1, this.p2]
    }
}
class Radial_GradPointsAdapterParam extends GradPointsAdapterParam {
    constructor(p1, r1, p2, r2, range_lst_param, nodecls) {
        super(p1, p2, range_lst_param, nodecls)
        this.r1 = r1; this.r2 = r2
    }
    get_pa_pb() {
        return get_circle_points_xy(this.p1, this.r1.v, this.p2, this.r2.v)
    }
    get_value(vidx) {
        let idx = vidx / 2
        // special handling of the points on the radius
        if (idx == 2) {
            let [pa,pb] = this.get_pa_pb()
            return [pa.x, pa.y]
        }
        if (idx == 3) {
            let [pa,pb] = this.get_pa_pb()
            return [pb.x, pb.y]
        }
        return super.get_value(vidx)
    }
    increment(idx, dv) {
        // special handling of the points on the radius
        if (idx == 2) {
            let [pa,pb] = this.get_pa_pb()
            let pv = vec2.fromValues(pa.x + dv[0], pa.y + dv[1])
            let r = vec2.distance(pv, vec2.fromValues(this.p1.x, this.p1.y))
            this.r1.modify(r)
        }
        else if (idx == 3) {
            let [pa,pb] = this.get_pa_pb()
            let pv = vec2.fromValues(pb.x + dv[0], pb.y + dv[1])
            let r = vec2.distance(pv, vec2.fromValues(this.p2.x, this.p2.y))
            this.r2.modify(r)            
        }
        else
            super.increment(idx, dv)
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
        this.selected_indices = []
        this.points_adapter = null

        this.out = new OutTerminal(node, "out_gradient")
        this.type = new ParamSelect(node, "Type", 0, ["Linear", "Radial"], (sel_idx)=>{
            this.r1.set_visible(sel_idx == 1)
            this.r2.set_visible(sel_idx == 1)

            // set points adapter
            if (sel_idx == 0)
                this.points_adapter = new Linear_GradPointsAdapterParam(this.p1, this.p2, this.values, this)
            else
                this.points_adapter = new Radial_GradPointsAdapterParam(this.p1, this.r1, this.p2, this.r2, this.values, this)
            let ad = this.points_adapter
            this.selected_indices.includes_shifted = function(v) { return this.includes(v + NODE_POINT_LST_OFFSET) } // used for yellow mark of the selected point
            add_point_select_mixin(this, this.selected_indices, this.points_adapter)
        })
        this.p1 = new ParamVec2(node, "Point 1", -0.5, 0)
        this.r1 = new ParamFloat(node, "Radius 1", 0.1)
        this.p2 = new ParamVec2(node, "Point 2", 0.5, 0)
        this.r2 = new ParamFloat(node, "Radius 2", 0.7)
        this.add_stops_btn = new ParamBool(node, "Add stops", true, null)
        this.add_stops_btn.display_as_btn(true)
        this.table = new ParamTable(node, "Stops", this.sorted_order)
        this.values = new ParamFloatList(node, "Value", this.table, this.selected_indices, ()=>{this.redo_sort()})
        this.colors = new ParamColorList(node, "Color", this.table)

        this.values.add(0); this.colors.add([0xff, 0x00, 0x00, 0xff])
        this.values.add(0.5); this.colors.add([0xff, 0xff, 0x00, 0xff])
        this.values.add(1); this.colors.add([0x00, 0xff, 0x00, 0xff])
 
        // list sized line this.values.lst with indices of values in the order they should be displayed
        this.redo_sort()

        // TBD points as expressions
    }
    is_radial() { return this.type.sel_idx == 1 }
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
        let [pa,pb] = this.points_adapter.get_pa_pb()
        // project clicked point to the line and find the distance to the line the the value on the line for that point
        let [dist, d] = project_dist(cp, pa, pb)

        if (dist > 10/image_view.viewport_zoom)
            return
        this.values.add(d); 
        this.colors.add([0xcc, 0xcc, 0xcc, 0xff])
        this.redo_sort()
        trigger_frame_draw(true)
    }
    run() {
        let obj
        if (!this.is_radial()) 
            obj = new LinearGradient(this.p1.x, this.p1.y, this.p2.x, this.p2.y)
        else 
            obj = new RadialGradient(this.p1.x, this.p1.y, this.r1.v, this.p2.x, this.p2.y, this.r2.v)
        
        for(let i = 0, ci = 0; i < this.values.lst.length; ++i, ci += 4) {
            obj.add_stop(this.values.lst[i], this.colors.lst.slice(ci, ci+4))
        }
        this.out.set(obj)
    }

    selected_obj_name() { return (this.selected_indices.length > 0) ? "stops" : null }
    delete_selection() {
        let rm_indices = []
        // indices 0,1 are the end points, cant remove them, the stops are shifted by 2
        for(let idx of this.selected_indices) 
            if (idx >= NODE_POINT_LST_OFFSET)
                rm_indices.push(idx - NODE_POINT_LST_OFFSET)
        this.values.remove(rm_indices)
        this.colors.remove(rm_indices)
        this.redo_sort()
        this.clear_selection()
        trigger_frame_draw(true)
    }
}