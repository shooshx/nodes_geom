"use strict"

var gl = null

// frame buffer is a texture that covers the canvas and only the canvas
class FrameBuffer extends PObject
{
    static name() { return "FrameBuffer" }
    constructor(tex_obj) {
        super()
        this.tex_obj = tex_obj
        this.pixels = null
    }
    width() { return this.tex_obj.width }
    height() { return this.tex_obj.height }
    // no need for destructor, the texture is owned by the NodeShader that created it

    get_pixels() {
        if (this.pixels === null) {
            //let pixels = new Uint8ClampedArray(this.tex_obj.width * this.tex_obj.height * 4) // problem in firefox
            this.pixels = new Uint8Array(this.tex_obj.width * this.tex_obj.height * 4)
            gl.readPixels(0, 0, this.tex_obj.width, this.tex_obj.height, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
        }
        return this.pixels
    }

    draw(m) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex_obj, 0);
        //console.assert(gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE) //slows things down

        let pixels = this.get_pixels()
        let pixelsc = new Uint8ClampedArray(pixels)
        let img_data = new ImageData(pixelsc, this.tex_obj.width, this.tex_obj.height)
        ctx_img.putImageData(img_data, 0, 0)
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

function init_webgl() {
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
        this.out_tex = new OutTerminal(node, "out_texture")
        this.vtx_text = new ParamTextBlock(node, "Vertex Shader")
        this.frag_text = new ParamTextBlock(node, "Fragment Shader")

        this.program = null
        // it's ok for the texture to belong to this node since texture is const only so it won't be modified
        this.render_to_tex = null 
    }
    destructtor() {
        if (this.program)
            gl.deleteProgram(this.program)
        if (this.render_to_tex)
            gl.deleteTexture(this.render_to_tex)
    }
    dirty_viewport() { this.node.self_dirty = true }

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
        if (gl === null)
            init_webgl()
        let mesh = this.in_mesh.get_const()
        assert(mesh !== null, this, "empty input")
        
        this.program = createProgram(gl, this.vtx_text.text, this.frag_text.text);
        assert(this.program, this, "failed to compile shaders")

        this.program.attrs = {}
        for(let attr_name of ["vtx", "vtx_color"])
            this.program.attrs[attr_name] = gl.getAttribLocation(this.program, attr_name);
    
        // draw
        gl.viewport(0, 0, canvas_image.width, canvas_image.height);

        gl.useProgram(this.program);

        this.make_screen_texture(canvas_image.width, canvas_image.height)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.render_to_tex, 0);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        mesh.gl_draw(image_view.t_viewspace, this.program.attrs)


        this.out_tex.set(new FrameBuffer(this.render_to_tex))
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

