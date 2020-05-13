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
            var init_img =  (js_img.width > 0 && js_img.height > 0) ? js_img : null
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, js_img.width, js_img.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, init_img);
            tex.width = js_img.width
            tex.height = js_img.height
            setTexParams(smooth, spread, spread)
            gl.bindTexture(gl.TEXTURE_2D, null);
        }
        super(tex, sz_x, sz_y, smooth)
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

        this.size_dial = new ScaleDial(this.transform, ()=>{
            const oimg = this.out_img.get_const()
            if (oimg === null)
                return null
            return [oimg.width(), oimg.height()]
        })

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
        let image = this.file_upload.get_image()
        assert(this.transform.is_valid(), this, "invalid transform")
        let sz = this.size.get_value()
        let pimg = new PImage(image, this.smooth_image.v, this.tex_edge.get_sel_name(), sz[0], sz[1])
        pimg.transform(this.transform.v)
        this.out_img.set(pimg)
    }

    // duplicated in NodeCreateFrameBuffer
    draw_selection(m) {
        let outimg = this.out_img.get_const()
        if (outimg === null) // happens if we never did run()
            return
        this.transform.draw_dial_at_obj(outimg, m)
        outimg.draw_border(m)

        this.size_dial.draw(m)

    }    
    image_find_obj(vx, vy, ex, ey) {
        return this.transform.dial.find_obj(ex, ey) || this.size_dial.find_obj(ex, ey)
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