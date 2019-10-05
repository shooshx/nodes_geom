"use strict"

var gl = null


// frame buffer is a texture that covers the canvas and only the canvas
class FrameBuffer extends PObject
{
    static name() { return "FrameBuffer" }
    constructor(tex_obj, sz_x, sz_y) {
        super()
        this.tex_obj = tex_obj

        let hw = sz_x * 0.5//this.tex_obj.width * 0.5 
        let hh = sz_y * 0.5//this.tex_obj.height * 0.5
        this.top_left = vec2.fromValues(-hw,-hh)
        this.bottom_right = vec2.fromValues(hw,hh)

        this.t_mat = null
        this.pixels = null
        this.imgBitmap = null
    }
    width() { return this.tex_obj.width }
    height() { return this.tex_obj.height }
    transform(m) { this.t_mat = m } 
    // no need for destructor, the texture is owned by the NodeShader that created it

    get_pixels() {
        if (this.pixels === null) {
            //let pixels = new Uint8ClampedArray(this.tex_obj.width * this.tex_obj.height * 4) // problem in firefox
            this.pixels = new Uint8Array(this.tex_obj.width * this.tex_obj.height * 4)
            gl.readPixels(0, 0, this.tex_obj.width, this.tex_obj.height, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
        }
        return this.pixels
    }

    async draw(m) {
        if (this.imgBitmap === null) {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex_obj, 0);
            //console.assert(gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE) //slows things down

            // get the pixels from webgl
            let pixels = this.get_pixels()
            let pixelsc = new Uint8ClampedArray(pixels)
            let img_data = new ImageData(pixelsc, this.tex_obj.width, this.tex_obj.height)
            // draw the on the shadow canvas
            this.imgBitmap = await createImageBitmap(img_data)
        }
        // copy from PImage
        let tl = this.top_left, br = this.bottom_right
        let w_mat = mat3.create()
        mat3.multiply(w_mat, w_mat, m)
        mat3.multiply(w_mat, w_mat, this.t_mat)

        ctx_img.save()
        ctx_img.setTransform(w_mat[0], w_mat[1], w_mat[3], w_mat[4], w_mat[6], w_mat[7])
        ctx_img.drawImage(this.imgBitmap, tl[0], tl[1], br[0] - tl[0], br[1] - tl[1])
        ctx_img.restore()        
    }

    // copy from PImage
    get_bbox() { // TBD wrong (doesn't rotate)
        let tl = vec2.create(), br = vec2.create()
        vec2.transformMat3(tl, this.top_left, this.t_mat)
        vec2.transformMat3(br, this.bottom_right, this.t_mat)
        return { min_x:tl[0], max_x:br[0], min_y:tl[1], max_y:br[1] }
    }
    
    invalidate_img() {
        this.imgBitmap = null
    }
    
} 

class CreateTexture extends NodeCls
{
    static name() { return "Create Pixel-Buffer" }
    constructor(node) {
        super(node)
        this.out_tex = new OutTerminal(node, "out_tex")
        this.size = new ParamVec2(node, "Size", 1, 1) // TBD connect these two optionally yo be the same ratio
        this.resolution = new ParamVec2(node, "Resolution", 800, 800) // TBD VecInt
        this.transform = new ParamTransform(node, "Transform")
       // this.transform.set_scale(0.002, 0.002)
    }
    run() {
        ensure_webgl()
        let cw = this.resolution.x, ch = this.resolution.y
        let tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        tex.width = cw
        tex.height = ch
        
        // set the filtering so we don't need mips
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        let fb = new FrameBuffer(tex, this.size.x, this.size.y)
        fb.transform(this.transform.v)
        this.out_tex.set(fb)
    }

    draw_selection(m) {
        this.transform.draw_dial_at_obj(this.out_tex.get_const(), m)
    }    
    image_find_obj(vx, vy, ex, ey) {
        return this.transform.dial.find_obj(ex, ey)
    }
}

function createShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
        return shader;
    }

    console.log(gl.getShaderInfoLog(shader));  // eslint-disable-line
    gl.deleteShader(shader);
    return undefined;
}

function createProgram(gl, vtxSource, fragSource) {
    let vtxShader = createShader(gl, gl.VERTEX_SHADER, vtxSource);
    let fragShader = createShader(gl, gl.FRAGMENT_SHADER, fragSource);
    if (!vtxShader || !fragShader)
        return null // TBD integrate error message

    var program = gl.createProgram();
    gl.attachShader(program, vtxShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);
    gl.deleteShader(vtxShader)  // mark for deletion once the program is deleted
    gl.deleteShader(fragShader) 
    var success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!success) {
        console.log(gl.getProgramInfoLog(program));  // eslint-disable-line
        gl.deleteProgram(program);
    }
    return program;
}

function ensure_webgl() {
    if (gl !== null)    
        return
    gl = canvas_webgl.getContext("webgl2");
    if (!gl) {
        return;
    }

    gl.my_fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, gl.my_fb);

    // create a depth renderbuffer
   // gl.my_depthBuffer = gl.createRenderbuffer();
   // gl.bindRenderbuffer(gl.RENDERBUFFER, gl.my_depthBuffer);
    
        // make a depth buffer and the same size as the targetTexture
       // gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas_image.width, canvas_image.height);
       // gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, gl.my_depthBuffer);
}

class NodeShader extends NodeCls
{
    static name() { return "Shader" }
    constructor(node) {
        super(node)
        this.in_mesh = new InTerminal(node, "in_mesh")
        this.in_tex = new InTerminal(node, "in_tex")
        this.out_tex = new OutTerminal(node, "out_texture")
        this.vtx_text = new ParamTextBlock(node, "Vertex Shader")
        this.frag_text = new ParamTextBlock(node, "Fragment Shader")

        this.program = null
        // it's ok for the texture to belong to this node since texture is const only so it won't be modified
        //this.render_to_tex = null 
    }
    destructtor() {
        if (this.program)
            gl.deleteProgram(this.program)
        //if (this.render_to_tex)
        //    gl.deleteTexture(this.render_to_tex)
    }
    //dirty_viewport() { this.node.self_dirty = true }

    make_screen_texture(cw, ch) 
    {
        if (this.render_to_tex !== null && this.render_to_tex.width == cw && this.render_to_tex.height == ch)
            return  // no need to regenerate it
        if (this.render_to_tex === null)
            this.render_to_tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.render_to_tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        this.render_to_tex.width = cw
        this.render_to_tex.height = ch
        
        // set the filtering so we don't need mips
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    run() {
        ensure_webgl()
        let mesh = this.in_mesh.get_const()
        assert(mesh !== null, this, "missing input mesh") 
        assert(mesh.type == MESH_TRI, this, "No triangle faces in input mesh")

        let tex = this.in_tex.get_const() // TBD wrong
        assert(tex !== null, this, "missing input texture")
        
        this.program = createProgram(gl, this.vtx_text.text, this.frag_text.text);
        assert(this.program, this, "failed to compile shaders")

        this.program.attrs = {}
        for(let attr_name of ["vtx", "vtx_color"])
            this.program.attrs[attr_name] = gl.getAttribLocation(this.program, attr_name);
    
        // draw
        canvas_webgl.width = tex.width()
        canvas_webgl.height = tex.height()
        gl.viewport(0, 0, canvas_webgl.width, canvas_webgl.height);

        gl.useProgram(this.program);

        //this.make_screen_texture(canvas_image.width, canvas_image.height)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.tex_obj, 0);

        gl.clearColor(0.5, 0, 0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        let transform = mat3.create()
        mat3.invert(transform, tex.t_mat) 
        let vt = image_view.t_viewspace

        mesh.gl_draw(transform, this.program.attrs)
        tex.invalidate_img()

        this.out_tex.set(tex)
    }
}

function copy_members(from, to, names) {
    for(let name of names)
        to[name] = function(){ return from[name].apply(from, arguments) }
}

class TerminalProxy extends Terminal
{
    constructor(node, wterm) {
        super(wterm.name, node, wterm.is_input)
        copy_members(wterm, this, ["set", "get_const", "get_mutable", "clear", "set_dirty"])
    }
}


class PointGradFill extends NodeCls
{
    static name() { return "Point Gradient Fill" }
    dirty_viewport() { this.node.self_dirty = true }
    constructor(node) {
        super(node)
        this.prog = new Program()
        this.shader_node = this.prog.add_node(0, 0, null, NodeShader, null)
        this.in_mesh = new TerminalProxy(node, this.shader_node.cls.in_mesh)
        this.in_tex = new TerminalProxy(node, this.shader_node.cls.in_tex)
        this.out_tex = new TerminalProxy(node, this.shader_node.cls.out_tex)

        this.shader_node.cls.vtx_text.set_text(`#version 300 es
in vec4 vtx;
in vec4 vtx_color;

out vec2 v_coord;
out vec4 v_color;

void main() {
    v_coord = vtx.xy;
    v_color = vtx_color;
    gl_Position = vtx;
}
`)
        this.shader_node.cls.frag_text.set_text( `#version 300 es
precision mediump float;

in vec2 v_coord;
in vec4 v_color;
out vec4 outColor;

void main() {
    outColor = v_color;
}
`)
    }
    destructtor() {
        this.shader_node.cls.destructtor()
    }
    run() {
        this.shader_node.cls.run()
    }
    get_error() {
        return this.shader_node.cls.get_error()
    }
    clear_error() {
        this.shader_node.cls.clear_error()
    }
}

