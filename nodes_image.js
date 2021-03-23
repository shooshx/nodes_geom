"use strict"


class PImage extends FrameBuffer
{
    static name() { return "PImage" }
    constructor(js_img, smooth, spread, sz_x, sz_y) {
        let tex = null
        if (js_img !== undefined && js_img !== null) {
            tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            // if the input image is empty (not loaded), init with an empty texture
            const init_img =  (js_img.width > 0 && js_img.height > 0) ? js_img : null
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, js_img.width, js_img.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, init_img);
            tex.width = js_img.width
            tex.height = js_img.height
            setTexParams(smooth, spread, spread)
            gl.bindTexture(gl.TEXTURE_2D, null);
        }
        super(tex, sz_x, sz_y, smooth, "rgba", spread)
        this.img = js_img
        this.pixels = null
    }

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
        this.size = new ParamVec2(node, "size", 2, 2);

        this.size_fit = new ParamButton(node, "Fit size to viewport", ()=>{this.size_fit_func()})
        this.smooth_image = new ParamBool(node, "Smooth Scaling", true)
        this.transform = new ParamTransform(node, "Transform")
        this.out_img = new OutTerminal(node, "out_img")

       // size_fit_func() // fit to the viewport at the time the node is created
        this.tex_edge = new ParamSelect(node, "Texture Edge", 0, ["Pad", "Reflect", "Repeat"])

        this.pimg_cache = null
    }

    // setting the image size is only manual since there's currently no way to differentiate between dirty image param
    // due to page (which shouldn't change the size) load and dirty due to user setting a new file (which should)
    size_fit_func() { // make the image appear in its natural resolution
        const img = this.file_upload.try_get_image()
        if (img === null)
            return
        const nw = img.width/image_view.viewport_zoom
        const nh = img.height/image_view.viewport_zoom
        this.size.modify_e(nw, nh)
    }

    run() {
        ensure_webgl()
        if (this.file_upload.pis_dirty() || this.size.pis_dirty() || this.smooth_image.pis_dirty() || this.tex_edge.pis_dirty() || this.pimg_cache === null) {
            const image = this.file_upload.get_image()
            const sz = this.size.get_value()
            this.pimg_cache = new PImage(image, this.smooth_image.v, this.tex_edge.get_sel_name(), sz[0], sz[1])
        }

        assert(this.transform.is_valid(), this, "invalid transform")
        this.pimg_cache.set_transform(this.transform.v)
        this.out_img.set(this.pimg_cache)
    }

    // duplicated in NodeCreateFrameBuffer
    draw_selection(m) {
        let outimg = this.out_img.get_const()
        if (outimg === null) // happens if we never did run()
            return
        this.transform.draw_dial_at_obj(outimg, m)
        outimg.draw_border(m)

        this.size.size_dial_draw(this.transform.v, m)

    }    
    image_find_obj(e) {
        return this.transform.dial.find_obj(e) || this.size.size_dial_find_obj(e)
    }
}


class ScaleDial extends PointDial
{
    constructor(transform, get_width_height) {
        super( (dx, dy, ctx, e)=>{ // dx,dy are already transformed with the img transform into image coordinates
            const wh = get_width_height()
            if (wh === null)
                return

            //dx = dx*this.transform.scale[0]*image_view.viewport_zoom // fix dx to be really pixels
            //let actual_w_pixels = oimg.width()*this.transform.scale[0]*image_view.viewport_zoom // the actual size of the image currenly in pixels
            //let new_w = actual_w_pixels + dx*2
            //let sx = new_w/image_view.viewport_zoom/oimg.width() // change back to zoom units
            // all of this comes down to the following formula
            let sx = (1 + dx*2/wh[0])*transform.scale[0]
            let sy = (1 + dy*2/wh[1])*transform.scale[1]
            if (e.shiftKey) { // don't do the more fancy follow the minimum one like in primitive resize since that would be much harder here
                sy = sx * ctx.start_yx_ratio
            }
            transform.set_scale(sx, sy)
        }, ()=>{
            return { start_yx_ratio: (transform.scale[1]/transform.scale[0]) }
        })
        this.transform = transform
        this.get_width_height = get_width_height
    }
    draw(m) {
        const wh = this.get_width_height()
        if (wh === null)
            return
        super.draw(wh[0]/2, wh[1]/2, this.transform.v, m)
    }
}

// input mesh for ImgInputSampler that represents a single point for the sampler
// like GradientPixelsAdapter, this is also viewport dependent
class SinglePointMeshDummy
{
    constructor(x, y) {
        this.x = x
        this.y = y
        const h = 1.5/image_view.viewport_zoom
        // goal is to have it 3x3 pixels big in viewport coordinates
        this.bbox = new BBox(this.x - h, this.y - h, this.x + h, this.y + h)
    }
    get_bbox() {
        return this.bbox
    }
}

// extract the color of a single pixel in the given coordinates of the input image or gradient into a variable
class NodeSampleColor extends NodeVarCls
{
    static name() { return "Sample Color" }

    constructor(node) {
        super(node)
        node.can_input = false
        this.in_source = new InTerminal(node, "in_src")

        this.pos = new ParamVec2(node, "Offset", 0, 0)
        this.pos.dial = new PointDial((dx,dy)=>{ this.pos.increment(vec2.fromValues(dx, dy)) })
        this.name = new ParamStr(node, "Name", "samp_color")
    }

    async run() {
        const src_samp = new ImgInputSampler(this.in_source, this)
        const p = this.pos.get_value()
        try {
            await src_samp.prepare(new SinglePointMeshDummy(p[0], p[1]))
        } catch(e) {
            // happens with non sampler gradient. Problem - scale is viewport dependent?
            assert(false, this, e.message)
        }
        src_samp.do_get_pixels()
        const value = src_samp.sample_at_v(p)
        
        this.out_single_var(this.name.get_value(), TYPE_VEC4, value)
    }

    draw_selection(m) {
        if (!this.pos.show_code) // not movable when showing code
            this.pos.dial.draw(this.pos.x, this.pos.y, null, m)
    }
    image_find_obj(e) {
        if (!this.pos.show_code)
            return this.pos.dial.find_obj(e)
        return null
    }
}


class ImgInputSampler
{
    constructor(in_source, in_node) {
        this.in_source = in_source
        this.src = null
        this.width_ = null
        this.height_ = null
        this.in_node = in_node
    }

    async prepare(mesh) {
        this.src = this.in_source.get_const()
        assert(this.src !== null, this.in_node, "missing input source")
        if (this.src.get_pixels_adapter !== undefined)
            this.src = await this.src.get_pixels_adapter(mesh, false) // for Gradient
        assert(this.src.get_pixels !== undefined, this.in_node, "expected object with pixels")
    }

    width() { return this.width_ }
    height() { return this.height_ }

    do_get_pixels() {
        this.pixels = this.src.get_pixels()
        this.transform = this.src.get_transform_to_pixels()
        assert(this.pixels !== null, this.in_node, "Input image is empty")
        this.width_ = this.src.width()
        this.height_ = this.src.height()
    }

    sample_at() {
        // this reimplements SetAttr prop_from_input_framebuffer
        eassert(arguments.length >= 1 && arguments.length <= 2, "Wrong number of arguments in call to at()")
        // if there is just one argument, check if it's a vec2, otherwise assume y=0 for the case of 1D sample gradient
        let v
        if (arguments.length == 1) {
            const a0 = arguments[0]
            if (a0.length !== undefined) {
                eassert(a0.length === 2, "expected numbers or vec2 argument")
                v = a0
            }
            else 
                v = [a0, 0]
        }
        else 
            v = arguments
        return this.sample_at_v(v)
    }

    sample_at_v(v) {
        vec2.transformMat3(v, v, this.transform)
        let rx = Math.round(v[0]), ry = Math.round(v[1])
        const spread = this.src.get_spread()
        const inrx = rx
        rx = handle_spread(spread, rx, this.width_)
        ry = handle_spread(spread, ry, this.height_)
        //if (rx < 0 || ry < 0 || rx >= this.width_ || ry >= this.height_) {
        //    return vec4.fromValues(0,0,0,0)
       // }
        const pidx = (ry * this.width_ + rx) * 4
        const pixels = this.pixels
        return vec4.fromValues(pixels[pidx], pixels[pidx+1], pixels[pidx+2], pixels[pidx+3])
    }

}

function handle_spread(spread, coord, length)
{
    if (coord < 0) {
        if (spread === "pad")
            return 0
        if (spread === "repeat")
            return length+(coord%length) - 1
        if (spread === "reflect") {
            coord = -coord
            return ((coord%(length*2)) < length)?(coord%length):(length-(coord%length))
        }
        dassert(false, "unexpected spread value " + spread)
    }
    else if (coord >= length) {
        if (spread === "pad")
            return length - 1
        if (spread === "repeat")
            return coord%length
        if (spread === "reflect")
            return ((coord%(length*2)) < length)?(coord%length):(length-(coord%length) - 1)
        dassert(false, "unexpected spread value " + spread)
    }
    return coord
}


