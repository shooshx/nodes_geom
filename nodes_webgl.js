"use strict"

var gl = null

class ImageBase extends PObject
{
    constructor(sz_x, sz_y, smooth) {
        super()
        this.t_mat = mat3.create() 
        this.smooth = smooth
        this.sz_x = sz_x
        this.sz_y = sz_y

        let hw = sz_x * 0.5
        let hh = sz_y * 0.5
        this.top_left = vec2.fromValues(-hw,-hh)
        this.bottom_right = vec2.fromValues(hw,hh)
    }

    transform(m) { mat3.multiply(this.t_mat, m, this.t_mat) } 

    draw_image(img_impl, m) {
        let tl = this.top_left, br = this.bottom_right

        // there's a half pixel mistake here when drawing a image with odd width on a texture of even width but I can't find how to fix it
        let w_mat = mat3.create()
        mat3.multiply(w_mat, w_mat, m)
        mat3.multiply(w_mat, w_mat, this.t_mat)

        ctx_img.save()
        canvas_setTransform(ctx_img, w_mat)
        ctx_img.imageSmoothingEnabled = this.smooth
        ctx_img.drawImage(img_impl, tl[0], tl[1], br[0] - tl[0], br[1] - tl[1])
        ctx_img.restore()   
    }

    get_bbox() { // TBD wrong (doesn't rotate)
        let tl = vec2.create(), br = vec2.create()
        vec2.transformMat3(tl, this.top_left, this.t_mat)
        vec2.transformMat3(br, this.bottom_right, this.t_mat)
        return new BBox(tl[0], tl[1], br[0], br[1])
    }

    draw_border(m, line_color="#000") {
        // we don't want to draw this under the canvas transform since that would also transform the line width
        // need 4 points for the rect to make it rotate
        let tl = vec2.clone(this.top_left), br = vec2.clone(this.bottom_right)
        let tr = vec2.fromValues(br[0], tl[1]), bl = vec2.fromValues(tl[0], br[1])

        let w_mat = mat3.create()
        mat3.multiply(w_mat, w_mat, m)
        mat3.multiply(w_mat, w_mat, this.t_mat)
        vec2.transformMat3(tl, tl, w_mat)
        vec2.transformMat3(tr, tr, w_mat)
        vec2.transformMat3(bl, bl, w_mat)
        vec2.transformMat3(br, br, w_mat)

        ctx_img.beginPath()
        closed_line(ctx_img, [tl[0],tl[1], tr[0],tr[1], br[0],br[1], bl[0],bl[1]])
        ctx_img.strokeStyle = line_color
        ctx_img.lineWidth = MESH_DISP.line_width
        ctx_img.stroke()
    } 

    draw_template(m) {
        this.draw_border(m, TEMPLATE_LINE_COLOR)
    }
}

// frame buffer is a texture that covers the canvas and only the canvas
class FrameBuffer extends ImageBase
{
    static name() { return "FrameBuffer" }
    constructor(tex_obj, sz_x, sz_y, smooth) {
        super(sz_x, sz_y, smooth)
        this.tex_obj = tex_obj
        this.pixels = null
        this.imgBitmap = null
    }

    // TBDno need for destructor, the texture is owned by the NodeShader that created it
    width() { return this.tex_obj.width }
    height() { return this.tex_obj.height }

    get_pixels() {
        if (this.pixels === null) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, gl.my_fb);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex_obj, 0);
            //let pixels = new Uint8ClampedArray(this.tex_obj.width * this.tex_obj.height * 4) // problem in firefox
            this.pixels = new Uint8Array(this.tex_obj.width * this.tex_obj.height * 4)
            gl.readPixels(0, 0, this.tex_obj.width, this.tex_obj.height, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
        }
        return this.pixels
    }

    async pre_draw_x(m, disp_values) { // old way to do it with always get_pixels
        if (this.imgBitmap === null) {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex_obj, 0);
            //console.assert(gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE) //slows things down

            // get the pixels from webgl
            let pixels = this.get_pixels()
            dassert(pixels !== null, "Image is empty")
            let pixelsc = new Uint8ClampedArray(pixels)
            let img_data = new ImageData(pixelsc, this.tex_obj.width, this.tex_obj.height)

            this.imgBitmap = await createImageBitmap(img_data)
        }        
    }

    async pre_draw(m, disp_values) {
        this.imgBitmap = await renderTexToImgBitmap(this.tex_obj, this.sz_x, this.sz_y)
    }

    draw(m, disp_values) {
        dassert(this.imgBitmap !== null, "Missing imgBitmap")
        this.draw_image(this.imgBitmap, m)
    }
    
    invalidate_img() {
        this.imgBitmap = null
        this.pixels = null
    }
    get_transform_to_pixels() {
        let transform = mat3.create()
        // half in the case of frame buffer since frame buffers are sized 2x2 (actually sz_x*sz_y)
        let hsf = vec2.fromValues(this.width()/2, this.height()/2) // yea.. I don't know why but that works.
        let hs = vec2.fromValues(this.width()/this.sz_x, this.height()/this.sz_y)
        mat3.translate(transform, transform, hsf)
        mat3.scale(transform, transform, hs)
        let inv_t = mat3.create()
        mat3.invert(inv_t, this.t_mat)     
        mat3.mul(transform, transform, inv_t)    
        return transform
    }
    make_gl_texture() {
        dassert(this.tex_obj !== null, "No texture in object")
        this.tex_obj.t_mat = mat3.create()
        mat3.copy(this.tex_obj.t_mat, this.t_mat)
        return this.tex_obj
    }
} 

class NodeCreateFrameBuffer extends NodeCls
{
    static name() { return "Create Pixel-Buffer" }
    constructor(node) {
        super(node)
        this.out_tex = new OutTerminal(node, "out_tex")
        this.resolution = new ParamVec2Int(node, "Resolution", 800, 800)
        this.size = new ParamVec2(node, "Size", 2, 2)                                                                        
        const res_fit = ()=>{
            const minp = Math.min(canvas_image.width, canvas_image.height)
            // if it's scaled, the size in pixels need to adjust for that
            const rx = minp * this.transform.scale[0] * image_view.zoom * this.size.x/2
            const ry = minp * this.transform.scale[1] * image_view.zoom * this.size.y/2
            this.resolution.set(rx, ry)
        }
        this.zoom_fit = new ParamButton(node, "Fit resolution to viewport", res_fit)
        const size_fit = ()=>{
            const sx = (image_view.rect.right - image_view.rect.left) / image_view.viewport_zoom
            const sy = (image_view.rect.bottom - image_view.rect.top) / image_view.viewport_zoom
            this.size.modify(vec2.fromValues(sx, sy))

            //transform to where the middle of the canvas goes
            let mid = vec2.fromValues(canvas_image.width*0.5, canvas_image.height*0.5)
            vec2.transformMat3(mid, mid, image_view.t_inv_viewport)
            this.transform.set_translate(mid[0], mid[1]);
        }
        this.size_fit = new ParamButton(node, "Fit size to viewport", size_fit)
        this.size_fit.share_line_elem_from(this.zoom_fit)
        this.smoothImage = new ParamBool(node, "Smooth Scaling", true)
        this.transform = new ParamTransform(node, "Transform")
        res_fit()
        this.size_dial = new SizeDial(this.size)
    }
    run() {
        assert(this.transform.is_valid(), this, "invalid transform")
        ensure_webgl()
        let cw = this.resolution.x, ch = this.resolution.y
        let tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        tex.width = cw
        tex.height = ch
        
        setTexParams(this.smoothImage.get_value(), 'pad', 'pad')

        const sz = this.size.get_value()
        let fb = new FrameBuffer(tex, sz[0], sz[1], this.smoothImage.get_value())
        fb.transform(this.transform.v)
        gl.bindTexture(gl.TEXTURE_2D, null);
        this.out_tex.set(fb)
    }

    draw_selection(m) {
        let tex = this.out_tex.get_const()
        if (tex === null)  // happens if we never did run()
            return
        this.transform.draw_dial_at_obj(tex, m)
        this.size_dial.draw(this.transform.v, m)
        tex.draw_border(m)
    }    
    image_find_obj(vx, vy, ex, ey) {
        return this.transform.dial.find_obj(ex, ey) || this.size_dial.find_obj(ex, ey)
    }
}


function setTexParams(smooth, spread_x, spread_y) {
    let minfilt = gl.LINEAR
    if (!smooth)
        minfilt = gl.NEAREST
    // set the filtering so we don't need mips
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minfilt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, minfilt);
    let wrap_x = gl.CLAMP_TO_EDGE // "pad"
    if (spread_x == "reflect")
        wrap_x = gl.MIRRORED_REPEAT
    else if (spread_x == "repeat")
        wrap_x = gl.REPEAT
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap_x);
    let wrap_y = gl.CLAMP_TO_EDGE // "pad"
    if (spread_x == "reflect")
        wrap_y = gl.MIRRORED_REPEAT
    else if (spread_x == "repeat")
        wrap_y = gl.REPEAT    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap_y);
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

function createProgram(gl, vtxSource, fragSource, attr_names, defines) {
    let prefixSrc = "#version 300 es\n"
    for(let name in defines)
        prefixSrc += "#define " + name + " (" + defines[name] + ")\n"
    prefixSrc += "#line 1\n"

    let vtxShader = createShader(gl, gl.VERTEX_SHADER, prefixSrc + vtxSource);
    let fragShader = createShader(gl, gl.FRAGMENT_SHADER, prefixSrc + fragSource);
    if (!vtxShader || !fragShader || !attr_names)
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
    program.attrs = {}
    for(let attr_name of attr_names)
        program.attrs[attr_name] = gl.getAttribLocation(program, attr_name);

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


function is_ws(c) {
    return c == ' ' || c == '\t' || c == '\n' || c == '\r'
}
function is_identifier_rest(c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' || (c >= '0' && c <= '9')
}
function is_digit(c) {
    return (c >= '0' && c <= '9')
}

const SUPPORTED_TYPES = ['float', 'int', 'vec2', 'vec4', 'sampler2D', 'bool', 'mat3']


class NodeShader extends NodeCls
{
    static name() { return "Shader" }
    constructor(node) {
        super(node)
        this.in_mesh = new InTerminal(node, "in_mesh")
        this.in_fb = new InTerminal(node, "in_fb") // don't want to change the name to avoid breakage
        this.out_tex = new OutTerminal(node, "out_texture")
        this.vtx_text = new ParamTextBlock(node, "Vertex Shader", (text)=>{
            this.update_uniforms(text, this.uniforms_vert, this.vert_group)
        })
        this.frag_text = new ParamTextBlock(node, "Fragment Shader", (text)=>{
            this.update_uniforms(text, this.uniforms_frag, this.frag_group)
        })
        // used so that the uniforms would get mixed up and rearranged each time they are parsed
        this.vert_group = new ParamGroup(node, "Vertex Shader Uniforms")
        this.frag_group = new ParamGroup(node, "Fragment Shader Uniforms")

        this.attr_names = null // will be set by caller
        this.program = null
        this.uniforms_frag = [] // list of {name:,type:} (also defines)
        this.uniforms_vert = [] 
        this.uniforms = {} // (unified) map name to Param object
        this.defines = {} // map name to Param object, #defines that the source depends on
        this.last_uniforms_err = null

        // it's ok for the texture to belong to this node since texture is const only so it won't be modified
        //this.render_to_tex = null 
    }
    destructtor() {
        if (this.program)
            gl.deleteProgram(this.program)
        //if (this.render_to_tex)
        //    gl.deleteTexture(this.render_to_tex)
    }
    uniform_by_name(name) {
        return this.uniforms[name]
    }
    uniform_by_name_in(lst, name) {
        for(let u of lst)
            if (u.name === name)
                return u
        return null
    }

    param_of_uniform(name) {
        let d = this.uniforms[name]
        if (d === undefined || d === null)
            return null
        return d.param
    }
    param_of_define(name) {
        let d = this.defines[name]
        if (d === undefined || d === null)
            return null
        return d.param
    }

    parse_glsl_uniform_and_defines(text) 
    {
        // not handling comments or pre-processor
        let uniforms = []
        let ci = 0, len = text.length
        const consume_ws = ()=>{
            while (is_ws(text[ci]) && ci < len)
                ++ci;
        }
        const consume_identifier = ()=>{
            consume_ws()
            if (ci == len)
                return null
            const start = ci
            while (is_identifier_rest(text[ci]) && ci < len)
                ++ci;       
            const value = text.substring(start, ci)
            if (value.length == 0)
                return null
            return value
        }

        while(true) {
            ci = text.indexOf('uniform', ci);
            if (ci === -1)
                break
            ci += 7
            const type = consume_identifier()
            let name = consume_identifier()
            if (type === null || name === null)
                break
            if (name == "t_mat") {
                continue // internal names that should not turn to params
            }

            assert(SUPPORTED_TYPES.includes(type), this, "Unsupported uniform type " + type)
            uniforms.push({type:type, name:name})
        }
        // preprocessor conditions turn to boolean parameters
        const search_prepro = (keyword)=>{
            while(true) {
                ci = text.indexOf(keyword, ci)
                if (ci === -1)
                    break
                ci += keyword.length
                const name = consume_identifier()
                if (name === null)
                    break
                uniforms.push({type:'define', name:name})
            }
        }
        search_prepro('#ifdef')
        search_prepro('#ifndef')
        return uniforms
    }
    

    update_uniforms(text, into, in_group) 
    {
        this.last_uniforms_err = null
        let new_uniforms = this.parse_glsl_uniform_and_defines(text)
        let changed = into.length !== new_uniforms.length

        // need to do this the iteration anyway to do the type check
        for(let nu of new_uniforms) {
            const eu = this.uniform_by_name_in(into, nu.name)
            if (eu === null || eu.type !== nu.type) {
                changed = true // new name not found in old or it changed type in the same source
                continue
            }
        } 
        if (!changed)
            return
        // check type matches between vert and frag
        into.length = 0;
        for(let nu of new_uniforms)
            into.push(nu)
        let new_unified = {}
        const check_redef_and_add = (from_cont)=>{
            for(let u of from_cont) {
                if (new_unified[u.name] !== undefined) {
                    if (new_unified[u.name].type !== u.type) {
                        this.last_uniforms_err = "Mismatch type " + u.name
                        return
                    }
                }
                else
                    new_unified[u.name] = u
            }
        }
        check_redef_and_add(this.uniforms_frag)
        check_redef_and_add(this.uniforms_vert)

        // removed uniforms - remove param objects
        // want to keep the surviving ones around so they won't be reset
        const del_non_existing = (from_cont)=> {
            for(let ename in from_cont) {
                if (new_unified[ename] === undefined) {
                    this.node.remove_param(from_cont[ename].param)
                    delete from_cont[ename]
                }
            }
        }
        del_non_existing(this.uniforms)
        del_non_existing(this.defines)
        // create new ones that were just added
        for(let new_name in new_unified) {
            if (this.uniforms[new_name] !== undefined || this.defines[new_name] !== undefined)
                continue
            const nu = new_unified[new_name]
            let p = {}
            if (nu.type == 'float')
                p.param = new ParamFloat(this.node, nu.name, 0, [0,1])
            else if (nu.type == 'int' || nu.type == 'sampler2D')
                p.param = new ParamInt(this.node, nu.name, 0)
            else if (nu.type == 'vec2')
                p.param = new ParamVec2(this.node, nu.name, 0, 0, false)
            else if (nu.type == 'vec4')
                p.param = new ParamColor(this.node, nu.name, "rgba(204,204,204,1.0)")
            else if (nu.type == 'bool' || nu.type == 'define') 
                p.param = new ParamBool(this.node, nu.name, false)
            else if (nu.type == 'mat3')
                p.param = new ParamTransform(this.node, nu.name)
            else
                assert(false, this, "unexpected uniform type")
            if (nu.type == 'define')
                this.defines[new_name] = p
            else                
                this.uniforms[new_name] = p
            p.param.set_group(in_group)
        }
        // both groups need to update since we might have removed something from the other group
        this.vert_group.update_elems()
        this.frag_group.update_elems()
        // TBD - save,load

    }

    make_tex_aligned_mesh(tex, sz_x, sz_y) {
        let obj = make_mesh_quadtri(sz_x, sz_y) // can probably be 2,2 but not sure
        obj.transform(tex.t_mat);
        return obj
    }

    is_defines_dirty() {
        for(let dname in this.defines)
            if (this.defines[dname].param.pis_dirty())
                return true
        return false
    }

    run() {
        ensure_webgl()
        assert(this.last_uniforms_err === null, this, this.last_uniforms_err)
        let tex = this.in_fb.get_const() // TBD wrong
        assert(tex !== null, this, "missing input texture")

        let mesh = this.in_mesh.get_const()
        if (mesh === null)
            mesh = this.make_tex_aligned_mesh(tex, tex.sz_x, tex.sz_y)
        //assert(mesh !== null, this, "missing input mesh") 
        assert(mesh.type == MESH_TRI, this, "No triangle faces in input mesh")
//        assert(this.attr_names !== null, this, "Missing attr_names") // TBD parse this from the shaders

        if (this.vtx_text.pis_dirty() || this.frag_text.pis_dirty() || this.is_defines_dirty()) 
        {
            if (this.program)
                gl.deleteProgram(this.program)
            const defines = {}
            for(let def_name in this.defines) {
                const bv = this.defines[def_name].param.get_value()
                if (bv === true || bv === 1)
                    defines[def_name] = 1 // it's either defined or not defines
            }

            this.program = createProgram(gl, this.vtx_text.text, this.frag_text.text, this.attr_names, defines);
            assert(this.program, this, "failed to compile shaders")
                
            this.program.uniforms = {}
            for(let uniform_name of Object.keys(this.uniforms).concat(['t_mat'])) {
                this.program.uniforms[uniform_name] = gl.getUniformLocation(this.program, uniform_name);
            }
        }

        // draw
        gl.bindFramebuffer(gl.FRAMEBUFFER, gl.my_fb);
        if (canvas_webgl.width !== tex.width() || canvas_webgl.height !== tex.height()) {
            // this takes time 
            canvas_webgl.width = tex.width()
            canvas_webgl.height = tex.height()
        }
        gl.viewport(0, 0, canvas_webgl.width, canvas_webgl.height);

        gl.useProgram(this.program);

        // transform for the geometry
        let transform = mat3.create()
        mat3.invert(transform, tex.t_mat)  // frame-buffer movement, rotation
        const szsc = mat3.create()
        mat3.fromScaling(szsc, vec2.fromValues(2/tex.sz_x, 2/tex.sz_y)) // account for the size of the frame-buffer, normalize it to the [2,2] of the normalized coordinate system
        mat3.mul(transform, szsc, transform)

        // transform to pass to the shader 
        let t_shader = mat3.create()
        mat3.copy(t_shader, tex.t_mat)
        mat3.scale(t_shader, t_shader, vec2.fromValues(tex.sz_x/2, tex.sz_y/2))

        if (this.program.uniforms['t_mat'] !== null)
            gl.uniformMatrix3fv(this.program.uniforms['t_mat'], false, t_shader)
        
        for(let uniform_name in this.uniforms) {
            if (this.program.uniforms[uniform_name] !== null)
                this.uniforms[uniform_name].param.gl_set_value(this.program.uniforms[uniform_name])
        }

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.tex_obj, 0);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        try {
            mesh.gl_draw(transform, this.program.attrs)
        }
        catch(ex) {
            console.warn(ex.message)
            assert(false, this, "Failed webgl draw")
        }

        tex.invalidate_img()

        // draw the texture on the actual canvas so we'll have a imgBitmap instead of doing readPixels from the texture


        this.out_tex.set(tex)
    }
}

const render_teximg = {
    mesh: null, program:null,
    vtx_src:`
in vec4 vtx_pos;
out vec2 v_coord;
void main() {
    v_coord = vec2(vtx_pos.x*0.5+0.5,  1.0-(vtx_pos.y*0.5+0.5));
    gl_Position = vtx_pos;
}
    `,
    frag_src:`
precision mediump float;
in vec2 v_coord;
uniform sampler2D uTex;
out vec4 outColor;
void main() {
    outColor = texture(uTex, v_coord);
}
    `
}
async function renderTexToImgBitmap(tex_obj, sz_x, sz_y)
{
    // render to actual canvas
    dassert(tex_obj.width !== undefined && tex_obj.height !== undefined, "Missing dimentions of tex")
    if (canvas_webgl.width !== tex_obj.width || canvas_webgl.height !== tex_obj.height) {
        canvas_webgl.width = tex_obj.width
        canvas_webgl.height = tex_obj.height
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas_webgl.width, canvas_webgl.height); // we just set this to the size from the texture

    if (render_teximg.mesh === null) {
        render_teximg.program = createProgram(gl, render_teximg.vtx_src, render_teximg.frag_src, ['vtx_pos'], [])
        dassert(render_teximg.program !== null, "failed compile teximg")

        render_teximg.mesh = make_mesh_quadtri(sz_x, sz_y)
    }
    gl.useProgram(render_teximg.program);
    // no need to set value to uTex since default 0 is ok

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex_obj);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    const transform = mat3.create()
    render_teximg.mesh.gl_draw(transform, render_teximg.program.attrs)

    const imgBitmap = await createImageBitmap(canvas_webgl)
    gl.bindTexture(gl.TEXTURE_2D, null);
    return imgBitmap
}


function copy_members(from, to, names) {
    for(let name of names)
        to[name] = function(){ return from[name].apply(from, arguments) }
}

class TerminalProxy extends Terminal
{
    constructor(node, wterm) {
        super(wterm.name, node, wterm.is_input)
        copy_members(wterm, this, ["set", "get_const", "get_mutable", "clear", "tset_dirty", "is_dirty"])
    }
}


// base class for nodes that are running a shader
class BaseNodeShaderWrap extends NodeCls
{
    constructor(node) {
        super(node)
        this.prog = new Program()
        this.shader_node = this.prog.add_node(0, 0, null, NodeShader, null)
    }
    destructtor() {
        this.shader_node.cls.destructtor()
    }
    get_error() {
        if (this.error !== null)
            return this.error
        return this.shader_node.cls.get_error()
    }
    clear_error() {
        this.error = null
        this.shader_node.cls.clear_error()
    }
    cclear_dirty() {
        // without this the shader_node texts are never cleaned
        this.shader_node.clear_dirty()
    }
}


class NodePointGradFill extends BaseNodeShaderWrap
{
    static name() { return "Point Gradient Fill" }
    constructor(node) {
        super(node)
        this.shader_node.cls.attr_names = ["vtx_pos", "vtx_color"]
        this.in_mesh = new TerminalProxy(node, this.shader_node.cls.in_mesh)
        this.in_fb = new TerminalProxy(node, this.shader_node.cls.in_fb)
        this.out_tex = new TerminalProxy(node, this.shader_node.cls.out_tex)

        this.shader_node.cls.vtx_text.set_text(`
in vec4 vtx_pos;
in vec4 vtx_color;

out vec2 v_coord;
out vec4 v_color;

void main() {
    v_coord = vtx_pos.xy;
    v_color = vtx_color;
    gl_Position = vtx_pos;
}
`)
        this.shader_node.cls.frag_text.set_text( `
precision mediump float;

in vec2 v_coord;
in vec4 v_color;
out vec4 outColor;

void main() {
    outColor = v_color;
    //outColor = vec4(v_coord.xy, 1.0, 1.0);
}
`)
    }

    run() {
        this.shader_node.cls.run()
    }


}

