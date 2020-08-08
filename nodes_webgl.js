"use strict"

var gl = null


function draw_rect(top_left, bottom_right, m, tmat, line_color)
{
    // we don't want to draw this under the canvas transform since that would also transform the line width
    // need 4 points for the rect to make it rotate
    let tl = vec2.clone(top_left), br = vec2.clone(bottom_right)
    let tr = vec2.fromValues(br[0], tl[1]), bl = vec2.fromValues(tl[0], br[1])

    let w_mat = mat3.create()
    mat3.multiply(w_mat, w_mat, m)
    mat3.multiply(w_mat, w_mat, tmat)
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

class ImageBase extends PObject
{
    constructor(sz_x, sz_y, smooth) {
        super()
        this.t_mat = mat3.create() 
        this.smooth = smooth
        this.sz_x = sz_x // logical size in world coords
        this.sz_y = sz_y

        let hw = sz_x * 0.5
        let hh = sz_y * 0.5
        this.top_left = vec2.fromValues(-hw,-hh)
        this.bottom_right = vec2.fromValues(hw,hh)
    }

    logical_size() { return [this.sz_x, this.sz_y] }

    set_transform(m) { mat3.copy(this.t_mat, m) }
    transform(m) { mat3.multiply(this.t_mat, m, this.t_mat) } 

    draw_image(img_impl, m) { // called from derived draw()
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

    get_bbox() { 
        const mn = vec2.fromValues(Number.MAX_VALUE, Number.MAX_VALUE), mx = vec2.fromValues(-Number.MAX_VALUE, -Number.MAX_VALUE)
        const p = vec2.create()
        const mnmx = (ep)=>{            
            vec2.transformMat3(p, ep, this.t_mat)
            vec2.min(mn, mn, p)
            vec2.max(mx, mx, p)
        }
        mnmx(this.top_left)
        mnmx(this.bottom_right)
        mnmx(vec2.fromValues(this.top_left[0], this.bottom_right[1]))
        mnmx(vec2.fromValues(this.bottom_right[0], this.top_left[1]))
        return new BBox(mn[0], mn[1], mx[0], mx[1])
    }

    draw_border(m, line_color="#000") {
        draw_rect(this.top_left, this.bottom_right, m, this.t_mat, line_color)
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
        if (this.tex_obj.width === 0 || this.tex_obj.height === 0)
            return // happens when an file image was not loaded yet
        // cached for the same of PImage which needs to only generate this once and reuses the output object
        if (this.imgBitmap === null)
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

// tells whoever gets it how to create the initial plain texture to draw on
class FrameBufferFactory extends ImageBase
{
    static name() { return "FrameBufferParams" }
    constructor(resolution_x, resolution_y, sz_x, sz_y, smooth, edge) {
        super(sz_x, sz_y, smooth)
        this.t_mat = mat3.create() 
        this.resolution_x = resolution_x
        this.resolution_y = resolution_y
        this.edge = edge  // str
    }

    draw(m) {
        this.draw_border(m)
    }
    
    width() { return this.resolution_x }
    height() { return this.resolution_y }

    create_tex() {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.resolution_x, this.resolution_y, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        tex.width = this.resolution_x
        tex.height = this.resolution_y
        
        setTexParams(this.smooth, this.edge, this.edge)

        const fb = new FrameBuffer(tex, this.sz_x, this.sz_y, this.smooth)
        fb.transform(this.t_mat)
        gl.bindTexture(gl.TEXTURE_2D, null);
        return fb
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
        this.tex_edge = new ParamSelect(node, "Texture Edge", 0, ["Pad", "Reflect", "Repeat"])
        this.transform = new ParamTransform(node, "Transform")
        res_fit()
        this.size_dial = new SizeDial(this.size)
    }
    run() {
        assert(this.transform.is_valid(), this, "invalid transform")
        
        const sz = this.size.get_value()
        const res = this.resolution.get_value()
        const ret = new FrameBufferFactory(res[0], res[0], sz[0], sz[1], this.smoothImage.get_value(), this.tex_edge.get_sel_name());
        ret.transform(this.transform.v)

        this.out_tex.set(ret)
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

function generateTexture(width, height, source, smooth, spread_x, spread_y)
{
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    tex.width = width
    tex.height = height
    
    // should be pad always for y since the gradient change is in x direction
    setTexParams(smooth, spread_x, spread_y)
    gl.bindTexture(gl.TEXTURE_2D, null);    
    return tex
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
    if (spread_y == "reflect")
        wrap_y = gl.MIRRORED_REPEAT
    else if (spread_y == "repeat")
        wrap_y = gl.REPEAT    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap_y);
}

function strip_null_term(text) {
    if (text[text.length-1] == '\0') // happens in chrome
        return text.substr(0,text.length-1)
    return text
}

function analyzeInfoLog(text) {
    text = strip_null_term(text)
    const lines = text.split('\n')
    const messages = {}
    for(let line of lines) {
        const trl = line.trim()
        if (trl.length == 0)
            continue
        if (!line.startsWith('ERROR:')) 
            throw Error("unknown line")
        const prefix_len = 6
        const tl = trl.substr(prefix_len)    
        let numcol = 0, numline = 1, nxcolon = prefix_len
        const colon = tl.indexOf(":")
        if (colon !== -1) {
            nxcolon = tl.indexOf(":",colon+1) 
            if (nxcolon !== -1) {  // "ERROR: Missing main" doesn't have a line
                numcol = parseInt(tl.substr(0,colon))
                numline = parseInt(tl.substr(colon+1, nxcolon))            
            }
        }
        const msg = tl.substr(nxcolon+1).trim()
        //messages.push({line:numline, col:numcol, text:trl})
        if (messages[numline] === undefined)
            messages[numline] = {text: trl}
        else
            messages[numline].text += "\n" + trl
    }
    return messages
}

function createShader(gl, type, source) {
    let shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    let success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
        return [shader, null];
    }

    const errlog = gl.getShaderInfoLog(shader)
    console.log(errlog);  // eslint-disable-line
    gl.deleteShader(shader);
    const errlst = analyzeInfoLog(errlog)
    return [null, errlst];
}

const TEXTURES_ACCESS_CODE = `
uniform sampler2D _u_in_tex_0;
uniform sampler2D _u_in_tex_1;
uniform sampler2D _u_in_tex_2;
uniform sampler2D _u_in_tex_3;
uniform mat3 _u_tex_tmat_0;
uniform mat3 _u_tex_tmat_1;
uniform mat3 _u_tex_tmat_2;
uniform mat3 _u_tex_tmat_3;

vec4 in_tex(float x, float y) { 
    return texture(_u_in_tex_0, (_u_tex_tmat_0 * vec3(x, y, 1.0)).xy); 
}
vec4 in_texi(float i, float x, float y) {  // float since expr puts out only floats
    switch(int(i)) {
    case 0: return texture(_u_in_tex_0, (_u_tex_tmat_0 * vec3(x, y, 1.0)).xy);
    case 1: return texture(_u_in_tex_1, (_u_tex_tmat_1 * vec3(x, y, 1.0)).xy);
    case 2: return texture(_u_in_tex_2, (_u_tex_tmat_2 * vec3(x, y, 1.0)).xy);
    case 3: return texture(_u_in_tex_3, (_u_tex_tmat_3 * vec3(x, y, 1.0)).xy);
    }
}
vec4 in_tex(vec2 v) { return in_tex(v.x, v.y); }
vec4 in_texi(float i, vec2 v) { return in_texi(i, v.x, v.y); }
`

const IN_TEX_COUNT = 4
const FLAG_WITH_TEXTURE_ACCESS = 1

const TEX_STATE_EVALUATORS = { "in_tex":  (m,s)=>{ return new GlslTextEvaluator(s, "in_tex", [], TYPE_FUNCTION, in_tex_types ) },
                               "in_texi":  (m,s)=>{ return new GlslTextEvaluator(s, "in_texi", [], TYPE_FUNCTION, in_texi_types ) }
                             }  // also takes index of texture



function createProgram(gl, vtxSource, fragSource, attr_names, defines, flags=0) {
    let prefixSrc = "#version 300 es\nprecision mediump float;\n"
    for(let name in defines)
        prefixSrc += "#define " + name + " (" + defines[name] + ")\n"
    if ((flags & FLAG_WITH_TEXTURE_ACCESS) != 0)
        prefixSrc += TEXTURES_ACCESS_CODE
    prefixSrc += "#line 1\n"

    const [vtxShader, vtxerr] = createShader(gl, gl.VERTEX_SHADER, prefixSrc + vtxSource);
    const [fragShader, fragerr] = createShader(gl, gl.FRAGMENT_SHADER, prefixSrc + fragSource);
    if (!vtxShader || !fragShader || !attr_names)
        return [null, vtxerr, fragerr] // TBD integrate error message

    let program = gl.createProgram();
    gl.attachShader(program, vtxShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);
    gl.deleteShader(vtxShader)  // mark for deletion once the program is deleted
    gl.deleteShader(fragShader) 
    let success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!success) {
        const errlog = gl.getProgramInfoLog(program)
        console.log(errlog);  // eslint-disable-line
        gl.deleteProgram(program);
        const err = {1:{text:strip_null_term(errlog)}}
        return [null, err, err]
    }
    program.attrs = {}
    for(let attr_name of attr_names)
        program.attrs[attr_name] = gl.getAttribLocation(program, attr_name);

    return [program, vtxerr, fragerr];
}

const g_dummy_texture_opt = {sz:50, width:5, dark:180, light:255 }
function make_dummy_texture()
{
    ensure_scratch_canvas()
    const sz = g_dummy_texture_opt.sz
    scratch_canvas.width = sz
    scratch_canvas.height = sz
    checkers_rect(ctx_scratch, sz, sz, g_dummy_texture_opt)

    const t = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sz, sz, 0, gl.RGBA, gl.UNSIGNED_BYTE, scratch_canvas)
    setTexParams(false, 'repeat', 'repeat')
    gl.bindTexture(gl.TEXTURE_2D, null)
    return t
}

let g_dummy_texture = null
function ensure_webgl() {
    if (gl !== null)    
        return
    gl = canvas_webgl.getContext("webgl2");
    if (!gl) {
        return;
    }

    gl.my_fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, gl.my_fb);

    // dummy texture
    g_dummy_texture = make_dummy_texture()


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
        this.in_texs = new InTerminalMulti(node, "in_texs")
        this.in_texs.xoffset = 60 // fix the position of the terminal on the node

        this.in_fb = new InTerminal(node, "in_fb") // don't want to change the name to avoid breakage
        this.out_tex = new OutTerminal(node, "out_texture")

        this.vtx_text = new ParamTextBlock(node, "Vertex Shader", "", (text)=>{
            this.try_update_uniforms(this.vtx_text, text, this.uniforms_vert, this.vert_group)
        })
        this.frag_text = new ParamTextBlock(node, "Fragment Shader", "", (text)=>{
            this.try_update_uniforms(this.frag_text, text, this.uniforms_frag, this.frag_group)
        })
        // used so that the uniforms would get mixed up and rearranged each time they are parsed
        this.vert_group = new ParamGroup(node, "Vertex Shader Uniforms")
        this.frag_group = new ParamGroup(node, "Fragment Shader Uniforms")
        
        this.clear_color = [0,0,0,0] // this can be a param but doesn't need to be yet, needed for Scatter2

        this.sorted_order = []
        mixin_multi_reorder_control(node, this, this.sorted_order, this.in_texs)
        this.override_texs = null // the node we're in can override a specific index of a texture with an internal texture - clip texture in scatter

        this.attr_names = ["vtx_pos"] //null // will be set by caller TODO just figure it out with errors
        this.program = null
        this.uniforms_frag = [] // list of {name:,type:} (also defines). need two groups to know if anything changed in the specific text
        this.uniforms_vert = [] 
        this.uniforms = {} // (unified) map name to Param object
        this.defines = {} // map name to Param object, #defines that the source depends on
        this.last_uniforms_err = null
        this.opt = { override_just_points: false, // override the mesh type and display just the points
                     shuffle_points_seed: null }  // if not null, seed of the shuffling of points when drawing just vertices
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

    param_of_uniform(name, exception_not_found=false) {
        let d = this.uniforms[name]
        if (d === undefined || d === null) {
            if (exception_not_found)
                assert(false, this, "Uniform not found " + name)
            return null
        }
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
        let new_uniforms = this.parse_glsl_uniform_and_defines(TEXTURES_ACCESS_CODE + text)
        let changed = into.length !== new_uniforms.length

        if (!changed) {
            // check if someone changed type. type sameness is made by the compilation
            for(let nu of new_uniforms) {
                const eu = this.uniform_by_name_in(into, nu.name)
                if (eu === null || eu.type !== nu.type) {
                    changed = true // new name not found in old or it changed type in the same source
                    break
                }
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
                if (new_unified[u.name] === undefined) {
                    // type sameness is checked better in createProgram. better since it runs every run and not just on change (shows the error)
                    new_unified[u.name] = u
                }                    
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
                p.param = new ParamColor(this.node, nu.name, DEFAULT_VTX_COLOR.rgba)
            else if (nu.type == 'bool' || nu.type == 'define') 
                p.param = new ParamBool(this.node, nu.name, false)
            else if (nu.type == 'mat3')
                p.param = new ParamTransform(this.node, nu.name)
            else
                assert(false, this, "unexpected uniform type")
            if (!nu.name.startsWith('_u_'))
                p.param.set_shader_generated(true)
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

    try_update_uniforms(prm, a, b, c) {
        prm._last_err = null
        try{ 
            this.update_uniforms(a, b, c)
        }
        catch(e) {
            this.last_uniforms_err = e.message
        }
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

    async bind_textures(texs, in_fb) 
    {
        assert(texs.length == this.sorted_order.length, this, "unexpected sorted_order size") // sanity

        const empty_indices = []
        for(let ti = 0; ti < IN_TEX_COUNT; ++ti)
        {
            let tex = null // FrameBuffer object
            if (this.override_texs !== null && this.override_texs[ti] !== undefined && this.override_texs[ti] !== null)
                tex = this.override_texs[ti]
            else if (ti < this.sorted_order.length)
                tex = texs[this.sorted_order[ti]]
            else {
                empty_indices.push(ti)
                continue
            }

            const texParam = this.param_of_uniform('_u_in_tex_' + ti, true)  // was supposed to be there from uniform parsing
            
            // if we're creating the texutre, create it in the right unit so that it won't overwrite other stuff
            gl.activeTexture(gl.TEXTURE0 + ti)
            let tex_obj;
            try {           
                if (tex.constructor === WebGLTexture)
                    tex_obj = tex // comes from override (from distance fields)
                else {         
                    tex_obj = tex.make_gl_texture(in_fb)  // in_fb needed for gradient
                    if (isPromise(tex_obj))
                        tex_obj = await tex_obj
                }
            }
            catch(e) {
                assert(false, this, e.message)
            }

            texParam.modify(ti, false)   // don't dirtify since we're in run() and that would cause a loop
            gl.bindTexture(gl.TEXTURE_2D, tex_obj);
            assert(tex_obj.t_mat !== undefined, this, "texture has not transform") 

            // the texture has an associated transform with it, need to make the glsl code move it accordingly
            const tex_tmat = this.param_of_uniform('_u_tex_tmat_' + ti, true)

            let adj_m = mat3.create()
            mat3.translate(adj_m, adj_m, vec2.fromValues(0.5,0.5))

            const tr_from = (tex instanceof Gradient) ? in_fb : tex

            // scale 0-1 range of a texture to -1:1 of the framebuffer (with the translation above)
            mat3.scale(adj_m, adj_m, vec2.fromValues(1 / tr_from.sz_x, 1 / tr_from.sz_y))
        
            let inv_tex_tmat = mat3.create()
            mat3.invert(inv_tex_tmat, tr_from.t_mat)
            mat3.mul(adj_m, adj_m, inv_tex_tmat)

            tex_tmat.modify(adj_m, false)

        }
        // make sure textures uniform that don't have connected inputs to fill it are not set to something unknown
        const ident = mat3.create()
        for(let ti of empty_indices) {
            gl.activeTexture(gl.TEXTURE0 + ti)
            gl.bindTexture(gl.TEXTURE_2D, g_dummy_texture);
            const texParam = this.param_of_uniform('_u_in_tex_' + ti, true)
            texParam.modify(ti, false)
            const texMat = this.param_of_uniform('_u_tex_tmat_' + ti, true)
            texMat.modify(ident, false)
        }
        gl.activeTexture(gl.TEXTURE0); // restore default state
    }

    unbind_textures(texs) {
        // restore state to default state to avoid texture leak and easier bug finding
        for(let ti = 0; ti < texs.length; ++ti) {
            gl.activeTexture(gl.TEXTURE0 + ti)
            gl.bindTexture(gl.TEXTURE_2D, g_dummy_texture);
        }
        gl.activeTexture(gl.TEXTURE0);
    }

    async run() 
    {
        ensure_webgl()
        assert(this.last_uniforms_err === null, this, this.last_uniforms_err)
        const fb_factory = this.in_fb.get_const() 
        assert(fb_factory !== null, this, "missing input FrameBuffer factory")
        assert(fb_factory.create_tex !== undefined, this, "Expected FrameBuffer factory object")
        const fb = fb_factory.create_tex()
        assert(fb !== null, this, "missing input texture")

        const texs = this.in_texs.get_input_consts()
        assert(texs.length < IN_TEX_COUNT, this, "Too many input textures")
        for(let tex of texs) {
            assert(tex !== null, this, "Connected texture input has null object") // if it's connected, there should be something on it
            assert(tex.make_gl_texture !== undefined, this, "Input should be able to convert to textute")
        }

        let mesh = this.in_mesh.get_const()
        if (mesh === null)
            mesh = this.make_tex_aligned_mesh(fb, fb.sz_x, fb.sz_y)            
        
        // triangles or just vertices
        assert(mesh.type !== undefined, this, "input needs to be a mesh object")
        assert(mesh.type === MESH_TRI || mesh.type === MESH_NOT_SET || this.opt.override_just_points, this, "No triangle faces in input mesh")
//        assert(this.attr_names !== null, this, "Missing attr_names") // TBD parse this from the shaders

        if (this.vtx_text.pis_dirty() || this.frag_text.pis_dirty() || this.is_defines_dirty() || this.program === null) 
        { // program can be null if we reset dirty (due to internal node) without actually doing run
            if (this.program)
                gl.deleteProgram(this.program)
            const defines = {}
            for(let def_name in this.defines) {
                const bv = this.defines[def_name].param.get_value()
                if (bv === true || bv === 1)
                    defines[def_name] = 1 // it's either defined or not defines
            }

            const [_prog, vtxerr, fragerr] = createProgram(gl, this.vtx_text.v, this.frag_text.v, this.attr_names, defines, FLAG_WITH_TEXTURE_ACCESS);
            this.program = _prog
            this.vtx_text.set_errors(vtxerr)
            this.frag_text.set_errors(fragerr)
            assert(this.program, this, "failed to compile shaders")
                
            this.program.uniforms = {}
            for(let uniform_name of Object.keys(this.uniforms).concat(['t_mat'])) {
                this.program.uniforms[uniform_name] = gl.getUniformLocation(this.program, uniform_name);
            }
        }

        // draw
        gl.bindFramebuffer(gl.FRAMEBUFFER, gl.my_fb);
        if (canvas_webgl.width !== fb.width() || canvas_webgl.height !== fb.height()) {
            // this takes time 
            canvas_webgl.width = fb.width()
            canvas_webgl.height = fb.height()
        }
        gl.viewport(0, 0, canvas_webgl.width, canvas_webgl.height);

        gl.useProgram(this.program);

        await this.bind_textures(texs, fb) // before uniforms are sent

        // transform for the geometry
        let transform = mat3.create()
        mat3.invert(transform, fb.t_mat)  // frame-buffer movement, rotation
        const szsc = mat3.create()
        mat3.fromScaling(szsc, vec2.fromValues(2/fb.sz_x, 2/fb.sz_y)) // account for the size of the frame-buffer, normalize it to the [2,2] of the normalized coordinate system
        mat3.mul(transform, szsc, transform)

        // transform to pass to the shader 
        let t_shader = mat3.create()
        mat3.copy(t_shader, fb.t_mat)
        mat3.scale(t_shader, t_shader, vec2.fromValues(fb.sz_x/2, fb.sz_y/2))

        if (this.program.uniforms['t_mat'] !== null)
            gl.uniformMatrix3fv(this.program.uniforms['t_mat'], false, t_shader)
        
        for(let uniform_name in this.uniforms) {
            if (this.program.uniforms[uniform_name] !== null)
                this.uniforms[uniform_name].param.gl_set_value(this.program.uniforms[uniform_name])
        }

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fb.tex_obj, 0);

        gl.clearColor(this.clear_color[0], this.clear_color[1], this.clear_color[2], this.clear_color[3]);
        gl.clear(gl.COLOR_BUFFER_BIT);
        try {
            mesh.gl_draw(transform, this.program.attrs, this.opt)
        }
        catch(ex) {
            console.warn(ex.message)
            assert(false, this, "Failed webgl draw")
        }

        this.unbind_textures(texs)

        fb.invalidate_img()

        // Don't draw the texture on the canvas. draw on a frame buffer so we'll have a texture we can do stuff with later
        // the texture goes then to the canvas and turns to imgBitmap


        this.out_tex.set(fb)
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
        const [_prog, vtxerr, fragerr] = createProgram(gl, render_teximg.vtx_src, render_teximg.frag_src, ['vtx_pos'], [], 0)
        render_teximg.program = _prog
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


function copy_members(from, to, with_that, names) {
    for(let name of names)
        if (from[name] !== undefined)
            to[name] = function(){ return from[name].apply(with_that, arguments) }
}

class TerminalProxy extends Terminal
{
    constructor(node, wterm, name_override=null, conn_ev=null) {
        super((name_override !== null)?name_override:wterm.name, node, wterm.is_input, conn_ev)
        this.wrap_term = wterm
        this.width = wterm.width
        this.lines = wterm.lines // not sure if needed...
        this.is_input = wterm.is_input
        copy_members(wterm, this, wterm, ["set", "get_const", "get_mutable", "clear", "tset_dirty", "is_dirty", 
                                          "get_input_consts"])

        copy_members(wterm, this, this, ["draw_path"])
            
        if (wterm.constructor === InTerminalMulti) {
            this.get_attachment = ()=> {
                // goes through the proxy
                return new InAttachMulti(this)
            }
        }
    }
    
    // connect events need to go to the owner of what we're wrapping, not the owner of the proxy (order mixin)
    tdid_connect(line) {
        super.tdid_connect(line)
        this.wrap_term.owner.cls.did_connect(this.wrap_term, line)
    }
    tdoing_disconnect(line) {
        super.tdoing_disconnect(line)
        this.wrap_term.owner.cls.doing_disconnect(this.wrap_term, line)
    }
}


// base class for nodes that have an internal program
class BaseNodeParcel extends NodeCls
{
    constructor(node) {
        super(node)
        this.prog = new Program()
        this.nodes = []
    }
    add_parcel_node(cls) {
        const n = this.prog.add_node(0, 0, null, cls, null)
        this.nodes.push(n)
        return n
    }
    destructtor() {
        for(let n of this.nodes)
            n.cls.destructtor()
    }
    get_error() {
        if (this.error !== null)
            return this.error
        for(let n of this.nodes) {
            const e = n.cls.get_error()
            if (e !== null)
                return e
        }
        return null
    }
    clear_error() {
        this.error = null
        for(let n of this.nodes)
            n.cls.clear_error()
    }
    cclear_dirty() {
        // without this the shader_node texts are never cleaned
        for(let n of this.nodes)
            n.clear_dirty()
    }

    is_internal_dirty() {
        for(let n of this.nodes)
            if (n.has_anything_dirty())
                return true
        return false
    }
}

class BaseNodeShaderParcel extends BaseNodeParcel {
    constructor(node) {
        super(node)
        this.shader_node = this.add_parcel_node(NodeShader)
    }
}


class NodePointGradFill extends BaseNodeShaderParcel
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

    async run() {
        await this.shader_node.cls.run()
    }


}


// just passes the input to the output.
// used for changing a multi-terminal in the internal node to a single-terminal outside
class NodePassThrough extends NodeCls 
{
    static name() { return "Pass Through" }
    constructor(node) {
        super(node)
        this.in = new InTerminal(node, "in") // don't want to change the name to avoid breakage
        this.out = new OutTerminal(node, "out")
        this.line = null
    }
    prepare_connection(prog, to_term) {
        this.prog = prog
        this.to_term = to_term
    }
    run() {
        const obj = this.in.get_const()
        if (obj !== null)
            this.out.set(obj)
    }
    did_connect(term, line) {
        if (term !== this.in)
            return
        // adding the line to the desitnation only when I'm connected since I don't want the destination
        // to think it has input when it doesn't
        this.line = new Line(this.out.get_attachment(), this.to_term.get_attachment())
        this.prog.add_line(this.line)
    }
    doing_disconnect(term, line) {
        if (term !== this.in)
            return
        this.prog.delete_line(this.line, false)
    }
}

function link_pass_through(prog, to_term) {
    const ptnode = prog.add_node(0, 0, null, NodePassThrough, null)
    ptnode.cls.prepare_connection(prog, to_term)
    return [ptnode, ptnode.cls.in]
}

// snippet for pass through node (not currently used)
// in ctor
        //const [ptnode, ptin] = link_pass_through(this.prog, this.shader_node.cls.in_texs)
        //this.tex_ptnode = ptnode
        //this.in_src = new TerminalProxy(node, ptin, "in_src")
// in run
        // move tex input to shader node       
        //this.tex_ptnode.cls.run()
        //progress_io(this.tex_ptnode)



const SCATTER_VTX_TEXT = `
in vec2 vtx_pos;

uniform mat3 t_mat;
uniform vec2 res;
uniform float rel_res; // in screen units

flat out float v_size;

$UNIFORM_DEFS$

$FUNCS$

float flt_expr(vec2 v_coord) {
    $EXPR$
}

void main() {
    vec3 tmp = t_mat * vec3(vtx_pos.xy, 1.0);
    vec2 v_coord = tmp.xy;
    
    if (in_texi(3.0, v_coord).r == 0.0) {
        v_size = -1.0;
        gl_PointSize = 1.0; // should not be 0
    }
    else {
        float f = flt_expr(v_coord);

        // discretisize the pixel position to whole pixels
        gl_Position = vec4( (floor(vtx_pos.xy * res) + vec2(0.5,0.5)) / res, 0.0, 1.0) ;

        f = f * rel_res ;
        v_size = f;
        gl_PointSize = f;
    }
}   
    
`

const SCATTER_FRAG_TEXT =  `
flat in float v_size;
out vec4 outColor;

void main() {
    if (v_size < 0.0)
        discard;
    // center on vertex
    vec2 pc = (gl_PointCoord - vec2(0.5));

    float dist = length(pc);
    if (dist > 0.5)
        discard;

    if (dist * v_size <= 0.7) // black dot
        outColor = vec4(1.0, 0.0, 0.0, 1.0);
    else {
        outColor = vec4(0.7, 0.7, 0.7, 1.0);
    }
}
`

const SCATTER_CLIP_VTX_TEXT = `
in vec4 vtx_pos;
void main() {
    gl_Position = vtx_pos;
}
`
const SCATTER_CLIP_FRAG_TEXT = `
out vec4 outColor;
void main() {
    outColor = vec4(1.0, 1.0, 1.0, 1.0);
}
`

class NodeScatter2 extends BaseNodeParcel
{
    static name() { return "Scatter Func" }
    constructor(node) 
    {
        super(node)
        this.shader_node = this.add_parcel_node(NodeShader) // main rendering
        this.clip_shader_node = this.add_parcel_node(NodeShader)
        this.triangulate = this.add_parcel_node(NodeTriangulate)
        this.shader_node.cls.attr_names = ["vtx_pos"] //, "vtx_color"]

        let seed_set_enable = ()=>{
            // seed is only relevant if we don't have connection (internal random) of if we have a connection but want to randomize it
            this.seed.set_enable(this.shuffle_in_points.v || !this.in_points.has_connection())
        }

        this.in_points = new TerminalProxy(node, this.shader_node.cls.in_mesh, "in_points", (v)=>{
            this.start_point_count.set_enable(!v) // only relevant for internal geometry
            this.shuffle_in_points.set_enable(v)  // only relevant for external
            seed_set_enable()
        })
        this.in_texs = new TerminalProxy(node, this.shader_node.cls.in_texs, "in_texs")
        this.in_texs.width = 16

        this.in_clip_shape = new InTerminal(node, "clip_shape", (v)=>{
            this.do_clip.set_enable(v)
        })
        this.out_tex = new TerminalProxy(node, this.shader_node.cls.out_tex)
        //this.out_tex = new TerminalProxy(node, this.clip_shader_node.cls.out_tex) // for testing clip

        //this.sz = new ParamVec2(node, "Size", 2, 2);
        this.rel_res = new ParamFloat(node, "Pixels Per Unit", 200)
        this.start_point_count = new ParamInt(node, "Start Count", 10000) // assuming there's no in_points
        this.shuffle_in_points = new ParamBool(node, "Shuffle Input", true, ()=>{
            seed_set_enable()
        })

        this.seed = new ParamInt(node, "Seed", 1)
        this.do_clip = new ParamSelect(node, "Clip Object", 0, ["Clips by bounding-box", "Clips by shape"])
        this.density = new ParamFloat(node, "Density", 0.1, {show_code:true})

        node.set_state_evaluators({"coord":  (m,s)=>{ return new GlslTextEvaluator(s, "v_coord", ['x','y'], TYPE_VEC2) },
                                   ...TEX_STATE_EVALUATORS} ) 

        this.shader_node.cls.frag_text.set_text(SCATTER_FRAG_TEXT)
        this.shader_node.cls.opt.override_just_points = true // even if the input mesh has faces, display just the vertices

        //----- clip_shader ------
        this.clip_shader_node.cls.vtx_text.set_text(SCATTER_CLIP_VTX_TEXT)
        this.clip_shader_node.cls.frag_text.set_text(SCATTER_CLIP_FRAG_TEXT)
    }

    make_vtx_text(expr_param, template_text, to_shader_prm)  // TBD refactor with func
    {
        const emit_ctx = new GlslEmitContext()

        const item = expr_param.get_active_item()
        if (item.e !== null) {
            if (item.elast_error !== null) {
                assert(false, this, "Expression error")
            }
            try {
                emit_ctx.inline_str = ExprParser.do_to_glsl(item.e, emit_ctx)
            }
            catch(ex) {
                assert(false, this, ex.message)
            }
        }
        else {
            emit_ctx.inline_str = expr_param.get_value()
            if (Number.isInteger(emit_ctx.inline_str))
                emit_ctx.inline_str += ".0"
        }

        const vtx_text = emit_ctx.do_replace(template_text)
        to_shader_prm.set_text(vtx_text)

        emit_ctx.set_uniform_vars(this.shader_node.cls)
    }

    create_fb(clip_bbox) {
        const sz_x = clip_bbox.width(), sz_y = clip_bbox.height()
        const res_x = Math.round(this.rel_res.v * sz_x)
        const res_y = Math.round(this.rel_res.v * sz_y)
        //console.log("resolution: ", res_x, ", ", res_y)
        const fb = new FrameBufferFactory(res_x, res_y, sz_x, sz_y, false, "pad") // 
        const tr = mat3.create()
        mat3.fromTranslation(tr, clip_bbox.center())
        fb.transform(tr)
        return fb
    }

    random_points_mesh(bbox, seed, len)
    {
        const prng = new RandNumGen(seed)
        const vtx_pos = new TVtxArr(len * 2)
        const bminx = bbox.min_x, bminy = bbox.min_y, bw = bbox.width(), bh = bbox.height()
        for(let i = 0, vi = 0; i < len; ++i) {
            vtx_pos[vi++] = bminx + bw* prng.next() 
            vtx_pos[vi++] = bminy + bh* prng.next()
        }
        const mesh = new Mesh()
        mesh.type = MESH_POINTS
        mesh.set("vtx_pos", vtx_pos, 2, false)
        return mesh
    }

    async render_clip_mask(clip_shape, fb)
    {
        if (this.in_clip_shape.is_dirty()) {
            if (clip_shape.constructor !== Mesh || clip_shape.type != MESH_TRI) {
                this.triangulate.cls.in_obj.force_set(clip_shape)
                this.triangulate.cls.run()
                clip_shape = this.triangulate.cls.out_mesh.get_const()
            }
            this.clip_shader_node.cls.in_mesh.force_set(clip_shape) // instead of messing around with lines
        }
        this.clip_shader_node.cls.in_fb.force_set(fb)
        this.clip_shader_node.cls.clear_color = [0,0,0,1]
        await this.clip_shader_node.cls.run()
        const out_tex = this.clip_shader_node.cls.out_tex.get_const()  
        assert(out_tex !== null, this, "failed clip render")
        return out_tex
    }

    async run() 
    {
        // inputs check
        let clip_bbox = null
        const clip_shape = this.in_clip_shape.get_const()
        const in_points = this.in_points.get_const()
        if (clip_shape !== null) {
            assert(clip_shape.get_bbox !== undefined, this, "clip_shape input needs to be a shape")
            clip_bbox = clip_shape.get_bbox();
        }
        else {
            assert(in_points !== null, this, "missing geometry to define area by")
            assert(in_points.get_bbox !== undefined, this, "in_points input needs to geometry")
            clip_bbox = in_points.get_bbox()
        }


        let points = in_points
        if (points === null) { // shader checks that it is geometry
            points = this.random_points_mesh(clip_bbox, this.seed.v, this.start_point_count.v, clip_shape)
            this.in_points.set(points)
            this.shader_node.cls.opt.shuffle_points_seed = null // don't need to shuffle the randomness we just made
        }
        else {
            this.shader_node.cls.opt.shuffle_points_seed = (this.shuffle_in_points.v) ? this.seed.v : null
        }

        this.make_vtx_text(this.density, SCATTER_VTX_TEXT, this.shader_node.cls.vtx_text) // TBD check dirty

        // make framebuffer factory
        const fb = this.create_fb(clip_bbox)
        this.shader_node.cls.in_fb.force_set(fb) // TBD check if dirty
        
        if (clip_shape !== null && this.do_clip.sel_idx == 1) {
            const clip_tex = await this.render_clip_mask(clip_shape, fb)
            this.shader_node.cls.override_texs = {3:clip_tex}
        }
        else 
            this.shader_node.cls.override_texs = null

        this.shader_node.cls.param_of_uniform('res').modify([fb.resolution_x, fb.resolution_y])
        this.shader_node.cls.param_of_uniform('rel_res').modify(this.rel_res.v)

        await this.shader_node.cls.run()
    }

}



class NodePixelsToVertices extends NodeCls
{
    static name() { return "Pixels to Vertices" }
    constructor(node) {
        super(node)
        this.in_tex = new InTerminal(node, "in_tex")
        this.out_pnt = new OutTerminal(node, "out_pnt")
    }

    extract_points(tex) 
    {
        const vtx_pos = []
        const pixels = tex.get_pixels() // Uint8Array
        const w = tex.width(), h = tex.height()
        const [sz_x, sz_y] = tex.logical_size()
        const f_x = sz_x/w, f_y = sz_y/h, hsz_x = sz_x*0.5, hsz_y = sz_y * 0.5
        const t_mat = tex.t_mat
        let i = 0
        const v1 = vec2.create(), v2 = vec2.create()

        for(let iy = 0; iy < h; ++iy) {
            for(let ix = 0; ix < w; ++ix) {
                const c = pixels[i]
                i += 4
                if (c == 255) {
                    v1[0] = ix*f_x-hsz_x
                    v1[1] = iy*f_y-hsz_y
                    vec2.transformMat3(v2, v1, t_mat)
                    vtx_pos.push(v2[0], v2[1])
                }
            }
        }
        const mesh = new Mesh()
        mesh.set("vtx_pos", new TVtxArr(vtx_pos), 2, false)
        mesh.type = MESH_POINTS
        return mesh       
    }

    run() {
        // extract vertices from image
        const in_tex = this.in_tex.get_const()
        assert(in_tex !== null, this, "Missing image input")
        const mesh = this.extract_points(in_tex)
        this.out_pnt.set(mesh)
    }
}