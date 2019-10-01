
class PImage extends PObject
{
    static name() { return "FrameBuffer" }
    constructor(js_img) {
        super()
        this.img = js_img
        let hw = this.img.width * 0.5 / image_view.viewport_zoom // TBD this is wrong
        let hh = this.img.height * 0.5 / image_view.viewport_zoom
        this.top_left = vec2.fromValues(-hw,-hh)
        this.bottom_right = vec2.fromValues(hw,hh)

        this.t_mat = null
    }
    draw(m) {
        let tl = this.top_left, br = this.bottom_right

        let w_mat = mat3.create()
        mat3.multiply(w_mat, w_mat, m)
        mat3.multiply(w_mat, w_mat, this.t_mat)

        ctx_img.save()
        ctx_img.setTransform(w_mat[0], w_mat[1], w_mat[3], w_mat[4], w_mat[6], w_mat[7])
        ctx_img.drawImage(this.img, tl[0], tl[1], br[0] - tl[0], br[1] - tl[1])
        ctx_img.restore()
    }

    get_bbox() { // TBD wrong
        let tl = vec2.create(), br = vec2.create()
        vec2.transformMat3(tl, this.top_left, this.t_mat)
        vec2.transformMat3(br, this.bottom_right, this.t_mat)
        return { min_x:tl[0], max_x:br[0], min_y:tl[1], max_y:br[1] }
    }
    transform(m) {
        this.t_mat = m     
    } 
}

class NodeLoadImage extends NodeCls
{
    static name() { return "Load Image" }
    constructor(node) {
        super(node)
        this.file_upload = new ParamImageUpload(node, "File Upload")
        this.transform = new ParamTransform(node, "Transform")
        this.out_img = new OutTerminal(node, "out_img")

        //let inv_vz = 
        //this.transform.scale = vec2.fromValues(inv_vz,inv_vz)
        //this.transform.calc_mat()
    }

    run() {
        assert(this.file_upload.image !== null, this, "No image uploaded")
        let pimg = new PImage(this.file_upload.image)
        pimg.transform(this.transform.v)
        this.out_img.set(pimg)
    }

    draw_selection(m) {
        this.transform.draw_dial_at_obj(this.out_img.get_const(), m)
    }    
    image_find_obj(vx, vy, ex, ey) {
        return this.transform.dial.find_obj(ex, ey)
    }    
}