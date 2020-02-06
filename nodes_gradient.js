
function make_str_color(c) {
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (c[3]/255) + ")"
}

function svg_create_elem(elem_type) {
    return document.createElementNS("http://www.w3.org/2000/svg", elem_type);
}
function svg_add_elem(parent, elem_type) {
    let e = svg_create_elem(elem_type)
    parent.appendChild(e)
    return e
}

function rectEquals(a, b) {
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
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
        this.spread = 'pad'
        this.svg = null  // image object
        this.svg_of_rect = null // the pmin,pmax points of the rect this svg was generated with
    }
    add_stop(value, color) {
        this.stops.push({value:value,color:color})
        this.obj = null
    }
    get_disp_params(disp_values) {
        return [ new DispParamBool(disp_values, "Show Fill", 'show_fill', true),
                ]
    }

    need_svg() {
        return this.spread !== 'pad'
    }

    ensure_grd() { // it doesn't matter which context creates the gradient object, it will be usable in both img and shadow
        if (this.grd === null) {
            let grd = this.ctx_create_func.call()
            for(let s of this.stops) {
                dassert(s.value >= 0 && s.value <= 1, "stop out of range")
                grd.addColorStop(s.value, make_str_color(s.color))
            }
            this.grd = grd
        }
    }

    make_rect_points(pmin, pmax, is_viewport_coords) {
        let tinv = mat3.create()
        mat3.invert(tinv, this.t_mat)

        // need to make this rect a path and not fillRect since in the transformed space it's not axis aligned
        let rp = [pmin, pmax, vec2.fromValues(pmax[0], pmin[1]), vec2.fromValues(pmin[0], pmax[1])]

        for(let i = 0; i < 4; ++i) {
            if (is_viewport_coords)
                vec2.transformMat3(rp[i], rp[i], image_view.t_inv_viewport)
            if (!this.need_svg()) { // with svg the transform is in the image
                vec2.transformMat3(rp[i], rp[i], tinv)
            }
        }

        let rect = { x: rp[0][0], y: rp[0][1], w: rp[1][0] - rp[0][0], h: rp[1][1] - rp[0][1], pnts:rp }
        if (this.need_svg()) {
            // drawImage can't handle an image with coordinates that are not int, so enlarge the image
            // to the nearest int size and adjust the (x,y) point its drawn in
            const iw = Math.ceil(rect.w), ih = Math.ceil(rect.h)
            rect = {x: rect.x - (iw-rect.w), y: rect.y - (ih-rect.h), w: iw, h: ih }
        }
        return rect
    }

    make_viewport_rect_points() {
        return this.make_rect_points(vec2.fromValues(0,0), vec2.fromValues(canvas_image.width, canvas_image.height), true)
    }

    async draw_fill_rect(ctx, rect, allow_async) {        
        this.ensure_grd()
        // if we're coming from draw(), this would not await since the svg was generated in pre_draw with the same rect
        // if we're coming from SetAttr, this would generate a new svg so we'll need to really await
        if (this.need_svg()) {
            if (this.need_ensure_svg(rect)) {
                if (allow_async)
                    await this.ensure_svg(rect)
                // if not allows to do async ensure_svg (since we're in draw), use the svg from pre_draw()
                // it should be close enough (only might have changed if there as a small move/resize event since then)
            }
        }


        if (this.need_svg()) {
            dassert(this.svg !== null, "Missing svg") // can happen due to previous error
            
            ctx.drawImage(this.svg, rect.x, rect.y)         // PROBLEM width,height is in pixels integer   
        }
        else {
            ctx.save()
            canvas_transform(ctx, this.t_mat) // circle squash
    
            const rp = rect.pnts
            ctx.fillStyle = this.grd
            ctx.beginPath()
            // can't use x+w since if there's a transform, we actuall draw a rotated rect
            ctx.moveTo(rp[0][0], rp[0][1]); ctx.lineTo(rp[2][0], rp[2][1])
            ctx.lineTo(rp[1][0], rp[1][1]); ctx.lineTo(rp[3][0], rp[3][1])
            ctx.fill()
            ctx.restore()
        }

    }

    draw_fill() {
        // rect that fills all the viewport
        const rp = this.make_viewport_rect_points()
        //console.log("DRAW ", canvas_image.width)
        this.draw_fill_rect(ctx_img, rp, false)
        // we can't do async stuff in draw (since that would cause flicker) so we make sure we didn't make any promise just now
        
    }

    interp_point(pa, pb, t) {
        let x = pa[0] * (1-t) + pb[0] * t
        let y = pa[1] * (1-t) + pb[1] * t
        return [x,y]
    }

    transform(m) { mat3.multiply(this.t_mat, m, this.t_mat) }

    draw_line_points(pa, pb, line_color="#000") {
        let tpa = vec2.create(), tpb = vec2.create()
        vec2.transformMat3(tpa, pa, this.t_mat)
        vec2.transformMat3(tpb, pb, this.t_mat)

        let radius = MESH_DISP.vtx_radius / image_view.viewport_zoom
        let did1 = false, did0 = false
        ctx_img.beginPath();
        ctx_img.moveTo(tpa[0], tpa[1])
        ctx_img.lineTo(tpb[0], tpb[1])
        ctx_img.lineWidth = MESH_DISP.line_width/image_view.viewport_zoom
        ctx_img.strokeStyle = line_color
        ctx_img.stroke()
        for(let s of this.stops) {
            let [x,y] = this.interp_point(tpa, tpb, s.value)
            if (s.value == 1)
                did1 = true
            else if (s.value == 0)
                did0 = true

            ctx_img.beginPath();
            ctx_img.arc(x, y, radius, 0, 2*Math.PI)
            ctx_img.fillStyle = make_str_color(s.color)
            ctx_img.fill()
            ctx_img.stroke()
            // TBD what if it can't be seen?
        }
        if (!did1) {
            ctx_img.beginPath();
            ctx_img.arc(tpb[0], tpb[1], radius, 0, 2*Math.PI)
            ctx_img.stroke()
        }
        if (!did0) {
            ctx_img.beginPath();
            ctx_img.arc(tpa[0], tpa[1], radius, 0, 2*Math.PI)
            ctx_img.stroke()
        }
    }    

    // selected points on the line
    draw_sel_points(selected_indices, pa, pb) {
        let radius = MESH_DISP.vtx_sel_radius/image_view.viewport_zoom
        ctx_img.beginPath();
        for(let idx of selected_indices) {
            if (idx == 0) 
                var [x,y] = this.p1
            else if (idx == 1) 
                var [x,y] = this.p2
            else if (idx == 2) 
                var [x,y] = pa
            else if (idx == 3)
                var [x,y] = pb
            else 
                var [x,y] = this.interp_point(pa, pb, this.stops[idx-NODE_POINT_LST_OFFSET].value)
            
            ctx_img.moveTo(x + radius, y)
            ctx_img.arc(x, y, radius, 0, 2*Math.PI)
        }
        ctx_img.lineWidth = 2/image_view.viewport_zoom
        ctx_img.strokeStyle = MESH_DISP.sel_color
        ctx_img.stroke()        
    }

    async get_pixels_adapter(for_mesh) {
        let bbox = for_mesh.get_bbox()
        let ad = new GradientPixelsAdapter(bbox, this)
        await ad.make_pixels()
        return ad
    }

    async pre_draw(m, disp_values) {
        if (this.need_svg() && disp_values.show_fill) {
            //console.log("PRE-DRAW ", canvas_image.width)
            const rp = this.make_viewport_rect_points()  
            await this.ensure_svg(rp)
        }
    }

    draw_m(m, disp_values) {
        if (disp_values.show_fill) {
            this.draw_fill()
        }
    }


    make_svg_text(rect) {
        let [elem_name, geom] = this.svg_text_geom()

        //console.log("w=", rect.w, "  h=", rect.h)
        const m = this.t_mat
        let lst = ['<svg viewBox="', rect.x, " ", rect.y, " ", rect.w, " ", rect.h, '" xmlns="http://www.w3.org/2000/svg" width="', rect.w,'" height="', rect.h,'"><', elem_name,
                   ' id="grad" gradientUnits="userSpaceOnUse" spreadMethod="', this.spread ,'" gradientTransform="matrix(', m[0], " ", m[1], " ", m[3], " ", m[4], " ", m[6], " ", m[7] ,')" ']
        lst = lst.concat(geom)
        lst.push(' >')

        const isRadial = (elem_name == "radialGradient") 
        const add_stop = (s)=>{
            const c = s.color, v = (isRadial) ? (1.0 - s.value) : s.value            
            lst.push('<stop offset="', v * 100, '%" stop-color="rgb(', c[0], ',', c[1], ',', c[2], ')" stop-opacity="', c[3]/255, '" />')
        }
        if (!isRadial)
            for(let s of this.stops)
                add_stop(s)
        else 
            for(let i = this.stops.length-1; i >= 0; --i)
                add_stop(this.stops[i])
        
        lst.push('</', elem_name, '><rect x="', rect.x,'" y="', rect.y,'" width="', rect.w, '" height="', rect.h, '" fill="url(\'#grad\')" /></svg>')
        let text = lst.join('')
        return text
    }

    need_ensure_svg(rect) {
        if (this.svg !== null && this.svg_of_rect !== null && rectEquals(rect, this.svg_of_rect) )
            return false // cache is good
        return true
    }

    // this will be needed even if we're not going to draw it, for get_pixels, so make this async
    // rather than pre_draw
    // this function returns either a promise of an svg image or the svg image if it's already created
    async ensure_svg(rect) {
        //let svg_wrap = svg_create_elem("svg")
        //let im = svg_add_elem(svg_wrap, "image")


        const text = this.make_svg_text(rect)
        let svg = new Image()
        //let svg = im

        const promise = new Promise((resolve, reject) => {
            svg.onload = ()=>{resolve(svg) };
            svg.onerror = (e)=>{ reject( { message:"SVG error" }) };
        })

        svg.src = "data:image/svg+xml;base64," + btoa(text)
        //svg.setAttribute("href", "data:image/svg+xml;base64," + btoa(text))

        this.svg = await promise
        this.svg_of_rect = rect
        //main_view.appendChild(this.svg)
        return this.svg
    }

    
}


// adapts the gradient object which doesn't have dimentions to an object that can be used with
// SetAttr which samples pixels.
// take the bbox that we want to sample in and render the gradient only there
class GradientPixelsAdapter {
    constructor(bbox, grd_obj) {
        this.pixels = null
        this.obj = grd_obj
        this.bbox = bbox // in abstract coords
        this.w_width = this.bbox.width()   
        this.w_height = this.bbox.height()
        this.px_width = Math.round(this.w_width * image_view.viewport_zoom)
        this.px_height = Math.round(this.w_height * image_view.viewport_zoom)
        this.t_mat = grd_obj.t_mat
    }
    width() { return this.px_width }
    height() { return this.px_height }

    async make_pixels() {
        if (this.pixels !== null) 
            return
        this.obj.ensure_grd()

        canvas_img_shadow.width = this.px_width
        canvas_img_shadow.height = this.px_height

        ctx_img_shadow.save()
        // bring to top-left corner of the mesh to 0,0
        let m = mat3.create()
        mat3.scale(m, m, [image_view.viewport_zoom, image_view.viewport_zoom])
        canvas_setTransform(ctx_img_shadow, m)
        ctx_img_shadow.translate(-this.bbox.min_x, -this.bbox.min_y)

        const rp = this.obj.make_rect_points(vec2.fromValues(this.bbox.min_x,this.bbox.min_y), vec2.fromValues(this.w_width, this.w_height), false)
        await this.obj.draw_fill_rect(ctx_img_shadow, rp, true)

        ctx_img_shadow.restore()
        this.pixels = ctx_img_shadow.getImageData(0, 0, this.px_width, this.px_height).data;
    }

    get_pixels() {
        return this.pixels        
    }
    get_transform_to_pixels() {
        let transform = mat3.create()
        // for gradient we need to stretch all the points sampled to the size of the sampled bbox area
        mat3.scale(transform, transform, vec2.fromValues(this.width()-1, this.height()-1 ))
        mat3.scale(transform, transform, vec2.fromValues(1/this.bbox.width(), 1/this.bbox.height() ))
        mat3.translate(transform, transform, vec2.fromValues(-this.bbox.min_x, -this.bbox.min_y))
        return transform
    }
}


class LinearGradient extends Gradient {
    static name() { return "Linear Gradient" }
    constructor(x1,y1, x2,y2) {
        super(x1,y1, x2, y2)
        this.ctx_create_func = function() { return ctx_img.createLinearGradient(x1,y1, x2,y2) }
    }

    draw_selection_m(m, selected_indices) {
        this.draw_line_points(this.p1, this.p2)
        this.draw_sel_points(selected_indices, this.p1, this.p2)
    }
    draw_template_m(m) {
        this.draw_line_points(this.p1, this.p2, TEMPLATE_LINE_COLOR)
    }
    svg_text_geom() {
        return ["linearGradient", ['x1="', this.p1[0], '" y1="', this.p1[1], '" x2="', this.p2[0], '" y2="', this.p2[1], '"']]
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
    draw_circles(tp1, tp2, line_color="#000") {
        let p1 = this.p1, p2 = this.p2, r1 = this.r1, r2 = this.r2
        ctx_img.save()
        canvas_transform(ctx_img, this.t_mat)
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
        ctx_img.lineWidth = MESH_DISP.line_width/image_view.viewport_zoom
        ctx_img.strokeStyle = line_color
        ctx_img.stroke()

        // center circles should be different somehow so mark them with additional white
        ctx_img.beginPath()
        ctx_img.strokeStyle = "#ffffff"
        circle(tp1, radius*0.7) 
        circle(tp2, radius*0.7)
        ctx_img.stroke()
        ctx_img.strokeStyle = "#000"
    }

    draw_controls(line_color="#000") {
        // anything that draws point-marker circles can't use the canvas transform so the points
        // need to be manually transformed with t_mat.
        let tp1 = vec2.create(), tp2 = vec2.create()
        vec2.transformMat3(tp1, this.p1, this.t_mat)
        vec2.transformMat3(tp2, this.p2, this.t_mat)
        this.draw_circles(tp1, tp2, line_color)
        // not using tp1,tp2 for this since r1,r2 can't be transformed
        let [pa,pb] = get_circle_points(this.p1, this.r1, this.p2, this.r2)

        this.draw_line_points(pa, pb, line_color)        
    }

    draw_selection_m(m, selected_indices) {
        this.draw_controls()
        let [pa,pb] = get_circle_points(this.p1, this.r1, this.p2, this.r2)
        this.draw_sel_points(selected_indices, pa, pb)
    }
    draw_template_m(m) {
        this.draw_controls(TEMPLATE_LINE_COLOR)
    }

    svg_text_geom(grad) {
        return ["radialGradient", ['cx="', this.p1[0], '" cy="', this.p1[1], '" r="',  this.r1, '" fx="', this.p2[0], '" fy="', this.p2[1], '" fr="', this.r2, '"']]
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
        //if (idx == 0 || idx == 1)
        //    return [null,null] // test, select only radius points
        if (idx < this.move_prm.length) {
            if (this.move_prm[idx] === null) // 2,3 of linear are not used
                return [null,null]
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

function went_other_way(pr2, pcenter, pv) {
    const to_pr2 = vec2.fromValues(pr2.x-pcenter.x, pr2.y-pcenter.y)
    const to_pv = vec2.fromValues(pv[0]-pcenter.x, pv[1]-pcenter.y)
    return vec2.dot(to_pr2, to_pv) < 0
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
            const [pa,pb] = this.get_pa_pb()
            const pv = vec2.fromValues(pa.x + dv[0], pa.y + dv[1])
            const r = vec2.distance(pv, vec2.fromValues(this.p1.x, this.p1.y))
            this.r1.modify(r)

            const [pa2,pb2] = this.get_pa_pb()
            if (went_other_way(pa2, this.p1, pv))
                this.r1.modify(0)
        }
        else if (idx == 3) {
            const [pa,pb] = this.get_pa_pb()
            const pv = vec2.fromValues(pb.x + dv[0], pb.y + dv[1])
            const r = vec2.distance(pv, vec2.fromValues(this.p2.x, this.p2.y))
            this.r2.modify(r)
            
            const [pa2,pb2] = this.get_pa_pb()
            if (went_other_way(pb2, this.p2, pv))
                this.r2.modify(0)            
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


// not a proper combo-box, more line a combo-box of buttons, each with an image
class ParamImageSelectBtn extends Parameter
{
    constructor(node, label, opts, get_img_func, set_selected_func) {
        super(node, label)
        this.opts = opts
        this.get_img_func = get_img_func
        this.menu_elem = null
        this.set_selected_func = set_selected_func
    }
    save() { return null }
    load(v) {}
    add_elems(parent) {
        this.line_elem = add_param_line(parent, this)
        if (!this.is_sharing_line_elem()) 
            add_param_label(this.line_elem, null) 
        const dismiss_menu = ()=>{
            if (this.menu_elem !== null) {
                this.menu_elem.parentElement.removeChild(this.menu_elem)
                this.menu_elem = null
            }
            ein.checked = false
        }
        const [ein,btn] = add_checkbox_btn(this.line_elem, this.label, false, (v)=>{
            if (!v) {
                dismiss_menu()
                return
            }
            this.menu_elem = add_div(this.line_elem, "param_img_menu")

            this.menu_elem.style.top = btn.offsetTop + btn.offsetHeight + 2 + "px"
            this.menu_elem.style.left = btn.offsetLeft + "px"
            for(let o of this.opts) {
                const img_div = add_div(this.menu_elem, "param_img_item")
                const img = this.get_img_func(o)
                img_div.appendChild(img)
                myAddEventListener(img_div, "mousedown", ()=>{
                    this.set_selected_func(o)
                    dismiss_menu()
                })
            }
        })
        // prevent two calls to dismiss when pressing the button
        btn.addEventListener("mousedown", (ev)=>{ ev.stopPropagation() })
        param_reg_for_dismiss(()=>{dismiss_menu()})
    }
}

const GRADIENT_PRESETS = [
    [ {v:0, c:'#f00'}, {v:0.5, c:'#ff0'}, {v:1, c:'#0f0'}],
    [ {v:0, c:'hsl(0,100%,50%)'},{v:60/300, c:'hsl(60,100%,50%)'},{v:120/300, c:'hsl(120,100%,50%)'},
      {v:180/300, c:'hsl(180,100%,50%)'},{v:240/300, c:'hsl(240,100%,50%)'},{v:1, c:'hsl(300,100%,50%)'} ],
    [ {v:0, c:'#000'}, {v:1, c:"#fff"} ],
    [ {v:0, c:'#000'}, {v:1, c:"rgba(0,0,0,0)"} ],

    [ {v:0, c:'#f00'}, {v:1, c:"#fff"} ],
    [ {v:0, c:'#0f0'}, {v:1, c:"#fff"} ],
    [ {v:0, c:'#00f'}, {v:1, c:"#fff"} ],
    [ {v:0, c:'#0ff'}, {v:1, c:"#fff"} ],
    [ {v:0, c:'#ff0'}, {v:1, c:"#fff"} ],
    [ {v:0, c:'#f0f'}, {v:1, c:"#fff"} ],

]

function checkers_rect(ctx, w, h) {
    const l = ColorPicker.CHECKERS.light, d = ColorPicker.CHECKERS.dark, cw = ColorPicker.CHECKERS.width
    ctx.fillStyle = "rgb(" + l + "," + l + "," + l + ")"
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = "rgb(" + d + "," + d + "," + d + ")"
    for(let x = 0, xi = 0; x < w; x += cw, ++xi) {
        for(let y = 0, yi = 0; y < h; y += cw, ++yi) {
            if (xi % 2 == yi % 2)
                continue
            ctx.fillRect(x, y, cw, cw)
        }
    }
}

const PRESET_RECT_SZ = 45
function make_preset_img(pr) {
    if (pr.img !== undefined)
        return pr.img
    ensure_scratch_canvas()
    scratch_canvas.width = PRESET_RECT_SZ
    scratch_canvas.height = PRESET_RECT_SZ
    checkers_rect(ctx_scratch, PRESET_RECT_SZ, PRESET_RECT_SZ)
    let g = ctx_scratch.createLinearGradient(0,0,PRESET_RECT_SZ,PRESET_RECT_SZ)
    for(let stop of pr) {
        g.addColorStop(stop.v, stop.c)
    }
    ctx_scratch.fillStyle = g
    ctx_scratch.fillRect(0, 0, PRESET_RECT_SZ, PRESET_RECT_SZ)
    let url = scratch_canvas.toDataURL()
    let img = new Image()
    img.src = url
    pr.img = img // cache
    return img
}


function vec2col(c) {
    return [clamp(0, Math.round(c[0]), 255), 
            clamp(0, Math.round(c[1]), 255), 
            clamp(0, Math.round(c[2]), 255), 
            (c.length == 4) ? clamp(0, Math.round(c[3]), 255) : 255]
}

function col_equals(a, b) {
    const ACCURACY = 1
    return Math.abs(a[0]-b[0]) < ACCURACY && Math.abs(a[1]-b[1]) < ACCURACY && Math.abs(a[2]-b[2]) < ACCURACY && Math.abs(a[3]-b[3]) < ACCURACY
}

const GRAD_SPREAD_VALUES = ["pad", "reflect", "repeat"]

class NodeGradient extends NodeCls
{
    static name() { return "Gradient" }
    constructor(node) {
        super(node)
        this.sorted_order = [] // list is not recreated, just overwritten
        this.selected_indices = []
        this.points_adapter = null
        node.set_state_evaluators({"t":  (m,s)=>{ return new ObjSingleEvaluator(m,s) }})

        this.out = new OutTerminal(node, "out_gradient")
        this.type = new ParamSelect(node, "Type", 0, ["Linear", "Radial"], (sel_idx)=>{
            this.r1.set_visible(sel_idx == 1)
            this.r2.set_visible(sel_idx == 1)

            // set points adapter
            if (sel_idx == 0)
                this.points_adapter = new Linear_GradPointsAdapterParam(this.p1, this.p2, this.values, this)
            else
                this.points_adapter = new Radial_GradPointsAdapterParam(this.p1, this.r1, this.p2, this.r2, this.values, this)
            this.selected_indices.includes_shifted = function(v) { return this.includes(v + NODE_POINT_LST_OFFSET) } // used for yellow mark of the selected point
            add_point_select_mixin(this, this.selected_indices, this.points_adapter)
        })
        this.method = new ParamSelect(node, "Method", 0, ["Stops", "Function"], (sel_idx)=>{
            this.table.set_visible(sel_idx == 0)
            if (sel_idx == 0) 
                this.table.remake_table() // when it was not visible, it wasn't updated
            this.add_stops_btn.set_visible(sel_idx == 0)
            this.func.set_visible(sel_idx == 1)
            this.func_samples.set_visible(sel_idx == 1)
        })
        this.method.share_line_elem_from(this.type)
        this.p1 = new ParamVec2(node, "Point 1", -0.5, 0)
        this.r1 = new ParamFloat(node, "Radius 1", 0.1)
        this.p2 = new ParamVec2(node, "Point 2", 0.5, 0)
        this.r2 = new ParamFloat(node, "Radius 2", 0.7)
        this.spread = new ParamSelect(node, "Spread", 0, ["Pad", "Reflect", "Repeat"])
        this.func = new ParamColorExpr(node, "f(t)=", "rgb(255,128,t*128)") // just a way to generate points TBD not actally float example: rgb(255,128,0)+rgb(t,t,t)*255
        this.func_samples = new ParamInt(node, "Sample Num", 10, {min:1, max:30, visible:false})
        const presets_btn = new ParamImageSelectBtn(node, "Presets", GRADIENT_PRESETS, make_preset_img, (pr)=>{this.load_preset(pr)})
        this.add_stops_btn = new ParamBool(node, "Add stops", true, null)
        this.add_stops_btn.display_as_btn(true)
        this.add_stops_btn.share_line_elem_from(presets_btn)
        this.table = new ParamTable(node, "Stops", this.sorted_order)
        this.values = new ParamFloatList(node, "Value", this.table, this.selected_indices, ()=>{this.redo_sort()})
        this.colors = new ParamColorList(node, "Color", this.table)

        this.load_preset(GRADIENT_PRESETS[0])
        
        // TBD points as expressions
    }
    is_radial() { return this.type.sel_idx == 1 }
    post_load_hook() { this.redo_sort() } // sort loaded values for the table
    redo_sort(force) {
        let tmparr = []
        for(let i = 0; i < this.values.lst.length; ++i)
            tmparr.push([this.values.lst[i],i])
        tmparr.sort(function(a,b) { return a[0]-b[0] })
        let changed = force || (tmparr.length !== this.sorted_order.length)
        if (!changed)
            for(let i = 0; i < tmparr.length; ++i)
                if (tmparr[i][1] !== this.sorted_order[i]) { // anything changed?
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
    async run() {
        if (this.method.sel_idx == 1) {
            this.load_from_func()
        }
        let obj
        if (!this.is_radial()) 
            obj = new LinearGradient(this.p1.x, this.p1.y, this.p2.x, this.p2.y)
        else 
            obj = new RadialGradient(this.p1.x, this.p1.y, this.r1.v, this.p2.x, this.p2.y, this.r2.v)
        
        for(let i = 0, ci = 0; i < this.values.lst.length; ++i, ci += 4) {
            obj.add_stop(this.values.lst[i], this.colors.lst.slice(ci, ci+4))
        }
        obj.spread = GRAD_SPREAD_VALUES[this.spread.sel_idx] // TBD do this in ParamSelect
        // making the svg (if needed) is in pre_draw or in adapter's make_pixels()
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

    load_preset(pr) {
        this.values.clear()
        this.colors.clear()
        for(let stop of pr) {
            this.values.add(stop.v)
            let c = ColorPicker.parse_hex(stop.c)            
            this.colors.add([c.r, c.g, c.b, c.alphai])
        }
        this.redo_sort(true) // force sort since we want to force a remake_table 
        trigger_frame_draw(true)
    }

    load_from_func() {
        const value_need_t = this.func.need_input_evaler("t")
        this.values.clear()
        this.colors.clear()
        let samples = [] // array of [stop-val, color]

        if (value_need_t == null) { // doesn't depend on t
            const c = this.func.dyn_eval()
            samples.push({v:0, c:vec2col(c)})
        }
        else {
            let t_wrap = [0]
            value_need_t.dyn_set_obj(t_wrap)

            // start with sampling in steps of 0.1
            const STEPS = this.func_samples.v
            for(let i = 0; i <= STEPS; ++i) {
                t_wrap[0] = 1/STEPS*i
                const c = this.func.dyn_eval()
                samples.push({v:t_wrap[0], c:vec2col(c)})
            }
            

            // remove points that are not contributing (are a linear iterp of the two adjacent points)
            let did_remove = true
            while(did_remove) {
                did_remove = false
                let a=0, b=1, c=2
                while (c < samples.length) {
                    const va = samples[a].v, vb = samples[b].v, vc = samples[c].v
                    const fb = (vb-va)/(vc-va) // the fraction of b as if a=0 and c=1
                    const intrp = vec4.create()
                    vec4.lerp(intrp, samples[a].c, samples[c].c, fb)
                    if (col_equals(intrp, samples[b].c)) {
                        samples.splice(b, 1)
                        did_remove = true
                    }
                    ++a; ++b; ++c 
                    // skip anyway to the next triplet since we don't want to examine each time points that were adjacent in the 
                    // original sample since if there are many many samples, they would always be close to each other
                    // this is why we need the outer loop
                }
            }
        }
        for(let s of samples) {
            this.values.add(s.v)
            this.colors.add(s.c)
        }             
        this.redo_sort(true)

        // TBD don't do all the color table on every click (when doing colors.add)
    }
}