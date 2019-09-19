"use strict"

var gl = null

class Texture extends PObject
{
    static name() { return "Mesh" }
    constructor(tex_obj) {
        super()
        this.tex_obj = tex_obj
    }
    destructor() {
        // TBD
    }

    draw(m) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex_obj, 0);
        //console.assert(gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE)

        //let pixels = new Uint8ClampedArray(this.tex_obj.width * this.tex_obj.height * 4) // problem in firefox
        let pixels = new Uint8Array(this.tex_obj.width * this.tex_obj.height * 4)
        gl.readPixels(0, 0, this.tex_obj.width, this.tex_obj.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let pixelsc = new Uint8ClampedArray(pixels)
        let img_data = new ImageData(pixelsc, this.tex_obj.width, this.tex_obj.height)
        ctx_img.putImageData(img_data, 0, 0)
    }
} 

class NodeShader extends NodeCls
{
    static name() { return "Shader" }
    constructor(node) {
        super()
        this.in_mesh = new InTerminal(node, "in_mesh")
        this.out_tex = new OutTerminal(node, "out_texture")

        this.vtxShader = null
        this.fragShader = null
        this.program = null

        this.vtx_buf = null
        this.idx_buf = null
        this.color_buf = null
        // it's ok for the texture to belong to this node since texture is const only so it won't be modified
        this.render_to_tex = null 
    }
    destructtor() {
        // TBD
    }

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
        
        if (this.vtxShader === null)
            this.vtxShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        var fragShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
        this.program = createProgram(gl, this.vtxShader, fragShader);

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


        this.out_tex.set(new Texture(this.render_to_tex))
    }
}




var vertexShaderSource = `#version 300 es

in vec4 vtx;
in vec4 vtx_color;

out vec2 v_coord;
out vec4 v_color;

void main() {
    v_coord = vtx.xy;
    v_color = vtx_color;
    gl_Position = vtx;
}
`;

var fragmentShaderSource = `#version 300 es
precision mediump float;

in vec2 v_coord;
in vec4 v_color;
out vec4 outColor;

void main() {
    outColor = v_color;
    //outColor = vec4(abs(v_coord.x), abs(v_coord.y), 1, 1);
    //outColor = vec4(1, 0, 0.5, 1);
}
`;

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

function createProgram(gl, vertexShader, fragmentShader) {
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    var success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {
        return program;
    }

    console.log(gl.getProgramInfoLog(program));  // eslint-disable-line
    gl.deleteProgram(program);
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