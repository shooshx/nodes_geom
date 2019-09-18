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

        let pixels = new Uint8ClampedArray(this.tex_obj.width * this.tex_obj.height * 4)
        let img_data = new ImageData(pixels, this.tex_obj.width, this.tex_obj.height)
        gl.readPixels(0, 0, this.tex_obj.width, this.tex_obj.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
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

        this.vao = null
        this.vtx_buf = null
        this.idx_buf = null
        // it's ok for the texture to belong to this node since texture is const only so it won't be modified
        this.render_to_tex = null 
    }
    destructtor() {
        // TBD
    }

    make_screen_texture() 
    {
        const cw = canvas_image.width, ch = canvas_image.height
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
        mesh.ensure_tcache(image_view.t_viewspace)  // TBD another cache?
        
        if (this.vtxShader === null)
            this.vtxShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        var fragShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
        this.program = createProgram(gl, this.vtxShader, fragShader);

        let a_position = gl.getAttribLocation(this.program, "a_position");
        
        if (this.vao === null)
            this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        if (!this.vtx_buf )
            this.vtx_buf  = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vtx_buf );
        gl.bufferData(gl.ARRAY_BUFFER, mesh.tcache.vtx, gl.STATIC_DRAW);

        if (!mesh.arrs.idx.glbuf)
            this.idx_buf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idx_buf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.arrs.idx, gl.STATIC_DRAW);

        gl.enableVertexAttribArray(a_position);
        gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0); 

        // draw
        gl.viewport(0, 0, canvas_image.width, canvas_image.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.program);

        this.make_screen_texture()
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.render_to_tex, 0);

        gl.drawElements(gl.TRIANGLES, mesh.arrs.idx.length, gl.UNSIGNED_INT, 0);
        this.out_tex.set(new Texture(this.render_to_tex))
    }
}




var vertexShaderSource = `#version 300 es

in vec4 a_position;
out vec2 coord;

void main() {
    coord = a_position.xy;
    gl_Position = a_position;
}
`;

var fragmentShaderSource = `#version 300 es
precision mediump float;

in vec2 coord;
out vec4 outColor;

void main() {
    outColor = vec4(abs(coord.x), abs(coord.y), 1, 1);
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
}