"use strict"


class PImage extends ImageBase
{
    static name() { return "PImage" }
    constructor(js_img, smooth) {
        super((js_img !== undefined)?js_img.width:0, (js_img !== undefined)?js_img.height:0, smooth)
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
    get_transform_to_pixels() {
        let transform = mat3.create()
        // with image scaling x,y by the wf,hf is not needed since the image t_mat includes the zoom factor
        // still using halfs since the center is the reference point
        mat3.translate(transform, transform, vec2.fromValues(this.width()/2, this.height()/2))
        let inv_t = mat3.create()
        mat3.invert(inv_t, this.t_mat)
        mat3.mul(transform, transform, inv_t)
        return transform
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
        assert(this.transform.is_valid(), this, "invalid transform")
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
        if (this.transform.dial === null)
            return null
        return this.transform.dial.find_obj(ex, ey)
    }
}

