"use strict"

// https://www.math3d.org/

const DISTANCE_VTX_TEXT = `
in vec4 vtx_pos;
out vec2 v_coord;
uniform mat3 t_mat;

void main() {
    vec3 tmp = t_mat * vec3(vtx_pos.xy, 1.0);
    v_coord = tmp.xy;
    gl_Position = vtx_pos;
}
`

const DISTANCE_FRAG_TEXT = `
out vec4 outColor;
in vec2 v_coord;
uniform bool u_raw_value;


float get_arg(int i) {
    return texelFetch(_u_in_tex_3, ivec2(i,0), 0).r;
}

$FUNCS$

float value_func(vec2 coord) {
    $EXPR$
}

vec3 lines_color_(float d) {
    d *= 2.0;
    if (d < 0.0)
        return vec3(1.0, 0.45, 0.5) + d;
    else
        return vec3(0.4, 0.5, 1.0) - d;
}

vec3 lines_color(float d) {
    d *= 2.0;
    vec3 col = vec3(0.7, 0.475, 0.75) - sign(d)*vec3(0.3, -0.025, -0.25);
    d = trunc(d*15.0)/15.0;

    col -= abs(d);
    return col;
}

vec3 smooth_lines_color(float d) {
    d *= 2.0;
    vec3 col = vec3(0.7, 0.475, 0.75) - sign(d)*vec3(0.3, -0.025, -0.25);
    float id = trunc(d*15.0)/15.0;
    float id2 = (trunc(d*15.0)+sign(d))/15.0;
    
    vec3 cola = col - abs(id);
    vec3 colb = col - abs(id2);
    col = mix(cola, colb, smoothstep(-0.0,0.05,abs(mod(sign(d)*d,1.0/15.0))) );
    return col;
}

void main() {
    float d = value_func(v_coord);
   // d = d - 1.0;

   if (u_raw_value)
       outColor = vec4(d, d, d, 1.0);
   else 
       outColor = vec4(lines_color(d), 1.0);
}
`
// stand-in for a real param to the ExpressionItem in DistanceField
class DummyParam {
    constructor(owner) {
        this.owner = owner
        this.v = null
        this.visible = true
        this.label = "<dummy>"
    }
    reg_expr_item() {}
    call_change() {}
    pset_dirty() {}
    
}
// stand-in owner for the Shader NodeCls in DistanceField
class NodeStandin {
    constructor() {
        this.inputs = []
        this.outputs = []
        this.parameters = []
        this.state_access = null
    }
    register_rename_observer() {}
}

function float_strs(nums) {
    const lst = []
    for(let n of nums)
        lst.push(asFloatStr(n))
    return lst
}

const ARGS_TEX_UNIT = 3

// used as from of dummy lines to shader for textures
class DummyNodePlaceholder {
    constructor(id) {
        this.lines = []  // needed by add line
        // needed by sort order mixin so that the shader node will have a proper sorted_order
        this.owner = {id: id, 
                      name: "dummy_node" + id,
                      register_rename_observer: ()=>{}
                    }
    }
    
}

class DistanceField extends PObject 
{
    constructor(dfnode) {
        super()
        this.t_mat = mat3.create()
        this.dfnode = dfnode

        this.p_prog = null // may not need to display at all
        this.p_shader_node = null
        this.p_args_tex = null
        this.p_img = null
        this.last_tex_premade = null
    }

    set_dfnode(dfnode) {
        this.dfnode = dfnode
    }

    transform(m) { 
        if (this.dfnode.tr === null) {
            this.dfnode.tr = mat3.create()
            this.dfnode.inv_tr = mat3.create()
        }
        mat3.multiply(this.dfnode.tr, m, this.dfnode.tr)
        mat3.invert(this.dfnode.inv_tr, this.dfnode.tr)
    }

    ensure_prog() {
        if (this.p_prog !== null)
            return
        this.p_prog = new Program()
        this.p_shader_node = this.p_prog.add_node(0, 0, "<dist-shader>", NodeShader, null)

        //this.set_state_evaluators({"coord":  (m,s)=>{ return new ObjSingleEvaluator(m,s) } })
        this.p_shader_node.set_state_evaluators({"coord":  (m,s)=>{ return new GlslTextEvaluator(m,s, "v_coord", ['x','y'], TYPE_VEC2) }})
        this.p_shader_node.cls.vtx_text.set_text(DISTANCE_VTX_TEXT)
    }

    make_frag_text(template)  // TBD cache this
    {
        ensure_webgl()
        this.ensure_prog()
        const dfstate = new DFTextState()
        const [var_name, dftext] = this.dfnode.make_text(dfstate)

        let func_body = dftext + "return " + var_name + ";"

        const text = template.replace('$FUNCS$', dfstate.func_set.to_text())
                             .replace('$EXPR$', func_body)

        this.p_shader_node.cls.frag_text.set_text(text)

        // args texture
        if (this.p_args_tex === null)
            this.p_args_tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.p_args_tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, dfstate.args_arr.length, 1, 0, gl.RED, gl.FLOAT, new Float32Array(dfstate.args_arr));
        setTexParams(false, 'pad', 'pad')
        this.p_args_tex.t_mat = mat3.create()
        this.p_args_tex.sz_x = 1; this.p_args_tex.sz_y = 1 // things requred by ShaderNode
        this.p_shader_node.cls.override_texs = {3:this.p_args_tex}
        gl.bindTexture(gl.TEXTURE_2D, null);

        // input textures
        this.p_prog.delete_lines_of(this.p_shader_node.cls.in_texs)
        let idx = 0
        for(let img_prox of dfstate.img_proxies) {
            const ln = new Line(new DummyNodePlaceholder(idx++), this.p_shader_node.cls.in_texs.get_attachment())
            this.p_prog.add_line(ln)
            ln.to_term.force_set(img_prox.prox_get_const_obj())
        }

        return dfstate
    }

    make_viewport_fb() {
        const pmin = vec2.fromValues(0,0), pmax = vec2.fromValues(canvas_image.width, canvas_image.height)
        vec2.transformMat3(pmin, pmin, image_view.t_inv_viewport)
        vec2.transformMat3(pmax, pmax, image_view.t_inv_viewport)
        const pavg = vec2.create()
        vec2.add(pavg, pmin, pmax)
        vec2.scale(pavg, pavg, 0.5)
        const tr = mat3.create()
        mat3.fromTranslation(tr, pavg)

        const fb = new FrameBufferFactory(canvas_image.width, canvas_image.height, pmax[0]-pmin[0], pmax[1]-pmin[1], false, "pad", "rgba")
        fb.transform(tr)
        //const fb = new FrameBufferFactory(canvas_image.width, canvas_image.height, 4, 4, false, "pad", "rgba")
        return fb
    }

    set_shader_variables_uniforms(dfstate) {
        // variables values
        const uniforms = dfstate.uniform_values.get_kv()
        for(let u_name in uniforms) {
            const prm = this.p_shader_node.cls.uniforms[u_name]
            dassert(prm !== undefined, "Uniform not found " + u_name)
            prm.param.modify(uniforms[u_name])
        }
    }

    async pre_draw(m, disp_values) 
    {
        const dfstate = this.make_frag_text(DISTANCE_FRAG_TEXT)
        //const fb = new FrameBufferFactory(800, 800, 2, 2, false, "pad", "rgba") // TBD
        const fb = this.make_viewport_fb()

        this.p_shader_node.cls.in_fb.force_set(fb)
        this.p_shader_node.cls.uniforms["u_raw_value"].param.modify(false)
        this.set_shader_variables_uniforms(dfstate)


        await this.p_shader_node.cls.run()
        this.p_shader_node.clear_dirty() // otherwise it remains dirty since it's not part of normal run loop

        this.p_img = this.p_shader_node.cls.out_tex.get_const()
        await this.p_img.pre_draw(null, null)
    }

    draw(m, disp_values) {
        this.p_img.draw(m, null)
    }

    // called from marching cubes
    async get_pixels_for_fb(fb_fact) {
        const img = await this.do_texture(fb_fact)
        return img.get_pixels()
    }

    async do_texture(fb_fact) {
        // TBD cache
        const dfstate = this.make_frag_text(DISTANCE_FRAG_TEXT)
        this.p_shader_node.cls.in_fb.force_set(fb_fact)
        this.p_shader_node.cls.uniforms["u_raw_value"].param.modify(true)
        this.set_shader_variables_uniforms(dfstate)
        await this.p_shader_node.cls.run()
        this.p_shader_node.clear_dirty() 
        //return null
        const img = this.p_shader_node.cls.out_tex.get_const()
        dassert(img !== null, "distance shader produced not output")
        return img
    }

    async premake_gl_texture(for_fb_factory) {
        const factory_copy = clone(for_fb_factory)
        factory_copy.set_type("float") // don't mess up the factory we're give since it's needed by the webgl node
        factory_copy.set_smooth(false) // float texture can't do linear interpolation without an additional extension
        const img = await this.do_texture(factory_copy)
        
        const tex = img.tex_obj
        tex.t_mat = mat3.create()
        mat3.copy(tex.t_mat, this.t_mat)
        // this is saved just to be returns in make_gl_texture since we can'd do all of the above in make_gl_texture since it's called in the middle of other webgl stuff
        this.last_tex_premade = tex 
    }

    make_gl_texture(for_fb_factory) {
        return this.last_tex_premade
    }

    draw_selection(m, select_vindices) {
    }

    draw_template(m) {
    }

}

function asFloatStr(v) {
    if (Number.isInteger(v))
        return v + ".0"
    return "" + v
}



class DFTextState {
    constructor() {
        this.var_count = 1
        this.args_arr = []
        this.tr_arr = []
        this.func_set = new FuncsSet()
        this.uniform_values = new FuncsSet() // not actually funcs, map uniform name to its value
        this.img_proxies = [];
    }
    alloc_var() {
        const v = this.var_count
        ++this.var_count;
        return v
    }
    alloc_tex_slots(img_proxies) {
        dassert(this.img_proxies.length + img_proxies.length <= IN_TEX_COUNT - 1, "Too many textures in distance field") // -1 since tex 3 is for args
        const ret = this.img_proxies.length;
        this.img_proxies.push(...img_proxies)
        return ret
    }
}

function range_getarg(a, b) {
    let s = []
    for(let i = a; i < b; ++i)
        s.push("get_arg(" + i + ")")
    return s.join(', ')
}

// node in the tree that produces glsl code
class DFNodeBase {
}


class DFNode extends DFNodeBase {
    constructor(func_maker=null, tr=null, args=null, children=null, func_set=null) { // need default values for clone
        super()
        this.func_maker = func_maker  //  afunction that takes list of arguments and returns a string with the function call        
        this.tr = tr // actual matrix
        if (this.tr !== null) {
            this.inv_tr = mat3.create()
            mat3.invert(this.inv_tr, this.tr)
        }
        else
            this.inv_tr = null
        this.inline_tr = false // is the transform inline or given to the function as arg
        this.args = args // list of floats
        this.children = children // list of DFNode
        this.func_set = func_set // my own functions (not children's)
        // pass just the index of the first arg instead of the values of all args
        // for functions that take lots of data (mesh)
        this.pass_first_arg_idx = false; 
    }
    make_text(dfstate) {
        // call order to any function is func_name(tr_index_in_args_arr_if_exists, child_vars_if_exist, float_args_if_exist)
        const child_vars = []
        let text = "", prefix = "", postfix = "", added_type = false
        const myvar = "v" + dfstate.alloc_var()

        if (this.children !== null) {
            for(let child of this.children) {
                const [var_name, add_text] = child.make_text(dfstate)
                child_vars.push(var_name)
                text += add_text
            }
        }

        let args_strs = []
        if (this.inv_tr !== null) {
            const mytr_idx = dfstate.args_arr.length
            const tr = this.inv_tr
            dfstate.args_arr.push(tr[0], tr[1], tr[3],tr[4], tr[6],tr[7])

            if (this.inline_tr) {
                let in_coord_var = "in_coord" + dfstate.alloc_var()
                prefix += "float " + myvar + " = 0.0;\n"
                prefix += "vec2 " + in_coord_var + " = coord;\n"
                prefix += "{\n"
                prefix += "  mat3x2 tr = mat3x2(" + range_getarg(mytr_idx, mytr_idx+6) + ");\n"
                prefix += "  vec2 coord = tr * vec3(" + in_coord_var + ", 1.0);\n"
                postfix = "}\n"
                added_type = true
            }
            else {
                args_strs.push(mytr_idx)
            }
        }

        if (this.args !== null) {
            if (this.pass_first_arg_idx)
                args_strs.push(dfstate.args_arr.length);
            for(let i = 0; i < this.args.length; ++i) {
                const my_idx = dfstate.args_arr.length
                if (!this.pass_first_arg_idx)
                    args_strs.push("get_arg(" + my_idx + ")")
                dfstate.args_arr.push(this.args[i])
            }
        }

        if (this.func_set !== null) {
            dfstate.func_set.extend(this.func_set)  
        }

        text += (added_type ? "" : "float ") + myvar + " = " + this.func_maker.make_func(args_strs, child_vars, dfstate) + ";\n"
        
        // returns the name of the variable in which the current result is in
        // and the text to add before to create this variable
        return [myvar, prefix + text + postfix]
    }
}

class FuncMaker
{
    make_func(args_strs, child_vars, dfstate) {
        dassert(false, "unimplemented")
    }
}


class Call_FuncMaker extends FuncMaker {
    constructor(func_name) { // func_call_text
        super()
        this.func_name = func_name
    }
    make_func(args_strs, child_vars, dfstate) {
        return this.func_name + "(coord, " + args_strs.join(", ") + ")"
    }
}


class BaseDFNodeCls extends NodeCls
{
    constructor(node) {
        super(node)
        this.out_obj = null // cache the out objet so that that the shader inside it compile the program only when needed
    }
    set_out_dfnode(dfnode) {
        assert(dfnode !== null, this, "null dfnode")
        if (this.out_obj === null)
            this.out_obj = new DistanceField(dfnode)
        else
            this.out_obj.set_dfnode(dfnode)
        this.out.set(this.out_obj)        
    }
}

// https://www.iquilezles.org/www/articles/distfunctions2d/distfunctions2d.htm
class NodeDFPrimitive extends BaseDFNodeCls 
{
    static name() { return "Field Primitive" }
    constructor(node) {
        super(node)

        //node.set_state_evaluators({"coord":  (m,s)=>{ return new ObjSingleEvaluator(m,s) }})

        this.out = new OutTerminal(node, "out_field")

        this.type = new ParamSelect(node, "Shape", 0, ["Circle", "Inverse-Circle", "Box"], (sel_idx)=>{
            this.radius.set_visible(sel_idx === 0 || sel_idx === 1)
            this.size.set_visible(sel_idx === 2)
        })
        this.radius = new ParamFloat(node, "Radius", 0.25, {enabled:true})
        this.size = new ParamVec2(node, "Size", 0.5, 0.3)

        this.transform = new ParamTransform(node, "Transform")      
    }

    need_size() {
        return this.type.sel_idx === 2
    }

    run() {
        let dfnode = null, glsl_funcs = new FuncsSet()
        
        const add = (name, args, args_vals, func)=>{
            const s = `float $NAME$(vec2 coord, int tr_idx, $ARGS$) {
    mat3x2 tr = mat3x2(get_arg(tr_idx), get_arg(tr_idx+1), get_arg(tr_idx+2), get_arg(tr_idx+3), get_arg(tr_idx+4), get_arg(tr_idx+5));
    vec2 p = tr * vec3(coord, 1.0);
    $F$
}`.replace('$F$', func).replace('$NAME$', name).replace('$ARGS$', 'float ' + args.join(', float ')) 
            glsl_funcs.add(name, s)
            dfnode = new DFNode(new Call_FuncMaker(name), this.transform.get_value(), args_vals, [], glsl_funcs)
        }

        switch (this.type.sel_idx) {
        case 0: 
            add("circle", ["radius"], [this.radius.get_value()], "return sqrt(p.x*p.x + p.y*p.y) - radius;")
            break
        case 1: // used for blobs with added level of 1
            add("inv_circle", ["radius"],  [this.radius.get_value()], "return sqrt((radius*radius) / (p.x*p.x + p.y*p.y));")
            break
        case 2:
            const sz = this.size.get_value()
            add("box", ["width", "height"], [sz[0], sz[1]], `vec2 d = abs(p)-vec2(width/2.0, height/2.0);
return length(max(d,0.0)) + min(max(d.x,d.y),0.0);`)
            break
        default:
            assert(false, this, "expr not set")
        }
        this.set_out_dfnode(dfnode)
    }

    draw_selection(m) {
        this.transform.draw_dial_at_obj(null, m)
        if (this.need_size())
            this.size.size_dial_draw(this.transform.v, m)
    }    
    image_find_obj(vx, vy, ex, ey) {
        let hit = this.transform.dial.find_obj(ex, ey) 
        if (hit)
            return hit
        if (this.need_size()) {
            hit = this.size.size_dial_find_obj(ex, ey)
            if (hit)
                return hit
        }
        return null
    }
}


const DFCALL_TRI = `
float sdTriangle(in vec2 p, in vec2 p0, in vec2 p1, in vec2 p2)
{
    vec2 e0 = p1-p0, e1 = p2-p1, e2 = p0-p2;
    vec2 v0 = p -p0, v1 = p -p1, v2 = p -p2;
    vec2 pq0 = v0 - e0*clamp( dot(v0,e0)/dot(e0,e0), 0.0, 1.0 );
    vec2 pq1 = v1 - e1*clamp( dot(v1,e1)/dot(e1,e1), 0.0, 1.0 );
    vec2 pq2 = v2 - e2*clamp( dot(v2,e2)/dot(e2,e2), 0.0, 1.0 );
    float s = sign( e0.x*e2.y - e0.y*e2.x );
    vec2 d = min(min(vec2(dot(pq0,pq0), s*(v0.x*e0.y-v0.y*e0.x)),
                     vec2(dot(pq1,pq1), s*(v1.x*e1.y-v1.y*e1.x))),
                     vec2(dot(pq2,pq2), s*(v2.x*e2.y-v2.y*e2.x)));
    return -sqrt(d.x)*sign(d.y);
}

float triMesh(vec2 coord, int startIdx) {
    int countTri = int(get_arg(startIdx));
    float d = 1e38;
    int idx = startIdx + 1;
    for(int i = 0; i < countTri; ++i) {
        d = min(d, sdTriangle(coord, vec2(get_arg(idx), get_arg(idx+1)), vec2(get_arg(idx+2), get_arg(idx+3)), vec2(get_arg(idx+4), get_arg(idx+5))));
        idx += 6;
    }
    return d;
}`


const DFFUNC_MULTI_PATH = `
float sdPolygon(in vec2 p, int count, int idx)
{
    float d = 1e38;
    float s = 1.0;
    int lastIdx = idx+(count-1)*2;
    vec2 vj = vec2(get_arg(lastIdx), get_arg(lastIdx+1));

    for(int i = 0; i < count; ++i)
    {
        vec2 vi = vec2(get_arg(idx), get_arg(idx+1));
        idx += 2;

        vec2 e = vj - vi;
        vec2 w = p - vi;
        vec2 b = w - e*clamp( dot(w,e)/dot(e,e), 0.0, 1.0 );
        d = min(d, dot(b,b));
        bvec3 c = bvec3(p.y >= vi.y, p.y < vj.y, e.x*w.y > e.y*w.x);
        if (all(c) || all(not(c))) 
            s*=-1.0;  
        vj = vi;
    }
    return s*sqrt(d);
}

float multiPath(vec2 coord, int startIdx) {
    int countPaths = int(get_arg(startIdx));
    float d = 3.402823466e+38;
    int idx = startIdx + 1;
    for(int i = 0; i < countPaths; ++i) {
        int polyLen = int(get_arg(idx));
        idx += 1;
        d = min(d, sdPolygon(coord, polyLen, idx));
        idx += polyLen*2;
    }
    return d;
}
`

const DFFUNC_MULTI_PATH_CURVE = `

bool swichSign(vec2 p, vec2 vi, vec2 vj) {
    vec2 e = vj - vi;
    vec2 w = p - vi;
    bvec3 c = bvec3(p.y >= vi.y, p.y < vj.y, e.x*w.y > e.y*w.x);
    return (all(c) || all(not(c)));
}

float multiPathWithCurves(vec2 p, int startIdx) {
    int countPaths = int(get_arg(startIdx));
    float d =  1e38;
    int idx = startIdx + 1;
    for(int i = 0; i < countPaths; ++i) {
        int polyLen = int(get_arg(idx));
        idx += 1;
        // ------ inner function, inlined here since it needs to update idx

        float inner_d = 1e38;

        float s = 1.0, md;
        //int lastIdx = idx+(polyLen-1)*2;
        vec2 vj = vec2(get_arg(idx), get_arg(idx+1));
        idx += 2;
        vec2 vi;
        int inters = 0;
        //polyLen = 1;

        for(int i = 0; i < polyLen; ++i)
        {
            int isCurve = int(get_arg(idx));
            idx += 1;
            if (isCurve == 0) {
                vi = vec2(get_arg(idx), get_arg(idx+1));
                idx += 2;
    
                vec2 e = vj - vi;
                vec2 w = p - vi;
                vec2 b = w - e*clamp( dot(w,e)/dot(e,e), 0.0, 1.0 );
                md = dot(b,b);
    
                bvec3 c = bvec3(p.y >= vi.y, p.y < vj.y, e.x*w.y > e.y*w.x);
                //if (all(c) || all(not(c))) 
                //    s*=-1.0;  
            }
            else {
                vec2 prev_c = vec2(get_arg(idx), get_arg(idx+1));
                vec2 cur_c = vec2(get_arg(idx+2), get_arg(idx+3));
                vi = vec2(get_arg(idx+4), get_arg(idx+5));
                idx += 6;

                md = cubic_bezier_dis(p, vj, prev_c, cur_c, vi);
                inters += cubic_bezier_sign(p, vj, prev_c, cur_c, vi);                     
            }
    
            inner_d = min(inner_d, md);

            vj = vi;
        }
        float sb = ((inters % 2) == 0)?1.0:-1.0;

        float ret_d = sb*sqrt(inner_d);

        // ------
        d = min(d, ret_d); // between polygons
        
    }
    return d;
}
`

class ArgsCurveAdder {
    constructor(into_args) {
        this.args = into_args
        this.cur_moveTo = null
    }
    startPath(len) {
        this.args.push(len)
    }
    moveTo(x, y) {
        this.cur_moveTo = [x,y]
        this.args.push(x, y)
    }
    lineTo(x, y) {
        this.args.push(0, x, y)
    }
    bezierCurveTo(prev_cx, prev_cy, cur_cx, cur_cy, x, y) {
        this.args.push(1, prev_cx, prev_cy, cur_cx, cur_cy, x, y)
    }
    closePath(real_line) {
        dassert(this.cur_moveTo !== null, "nothing to close")
        if (real_line)
            this.args.push(0, this.cur_moveTo[0], this.cur_moveTo[1])
        this.cur_moveTo = null
    }
}

class NodeDFFromGeom extends BaseDFNodeCls 
{
    static name() { return "Field From Geometry" }
    constructor(node) {
        super(node)
        this.in_geom = new InTerminal(node, "in_geom")
        this.out = new OutTerminal(node, "out_field")
    }

    args_for_tri_mesh(mesh) {
        const args = [], vtx = mesh.effective_vtx_pos
        args.push(mesh.face_count()) 
        for(let idx of mesh.arrs.idx) {
            args.push(vtx[idx*2], vtx[idx*2+1])
        }
        return args
    }

    args_for_quad_mesh(mesh) {
        const args = [], vtx = mesh.effective_vtx_pos
        args.push(mesh.face_count()) 
        let i = 0;
        for(let idx of mesh.arrs.idx) {
            if ((i++ % 4) == 0)
                args.push(4)
            args.push(vtx[idx*2], vtx[idx*2+1])
        }
        return args        
    }

    args_for_multipath(obj) {
        const args = [], vtx = obj.effective_vtx_pos
        args.push(obj.face_count()) 
        for(let pri = 0; pri < obj.paths_ranges.length; pri += 3) {
            let start_vidx = obj.paths_ranges[pri]*2
            let end_vidx = obj.paths_ranges[pri+1]*2
            args.push((end_vidx - start_vidx)/2)
            for(let vidx = start_vidx; vidx < end_vidx; vidx += 2) {
                args.push(vtx[vidx], vtx[vidx+1])
            }
        }
        return args
    }

    args_for_multi_curves(obj) {
        const args = []
        args.push(obj.face_count()) 
        obj.call_all_paths_commands(new ArgsCurveAdder(args))
        return args
    }

    run() {
        const in_obj = this.in_geom.get_const()
        assert(in_obj !== null, this, "no input")
        const glsl_funcs = new FuncsSet()
        let dfnode = null, args_vals = null

        if (in_obj.constructor === Mesh) {
            if (in_obj.type === MESH_TRI) {
                args_vals = this.args_for_tri_mesh(in_obj)
                glsl_funcs.add("triMesh", DFCALL_TRI)
                dfnode = new DFNode(new Call_FuncMaker("triMesh"), null, args_vals, null, glsl_funcs)
                dfnode.pass_first_arg_idx = true
            }
            else if (in_obj.type === MESH_QUAD) {
                args_vals = this.args_for_quad_mesh(in_obj)
            }
        }
        else if (in_obj.constructor == MultiPath) {
           // if (!in_obj.has_curves())
           //     args_vals = this.args_for_multipath(in_obj)
           // else 
            {
                glsl_funcs.add("sdCubicBezier", DFFUNC_BEZIER)
                glsl_funcs.add("multiPathWithCurves", DFFUNC_MULTI_PATH_CURVE)
                args_vals = this.args_for_multi_curves(in_obj)
                dfnode = new DFNode(new Call_FuncMaker("multiPathWithCurves"), null, args_vals, null, glsl_funcs)
                dfnode.pass_first_arg_idx = true
            }
        }
        else 
            assert(false, this, "unsupposedted input object")
        if (dfnode === null) {
            glsl_funcs.add("multiPath", DFFUNC_MULTI_PATH)
            dfnode = new DFNode(new Call_FuncMaker("multiPath"), null, args_vals, null, glsl_funcs)
            dfnode.pass_first_arg_idx = true
        }
        this.set_out_dfnode(dfnode)
    }
}

function commaize(arr) {
    let r = ""
    for(let c of arr)
        r += c + ", "
    return r
}
function commaize_pre(arr) {
    let r = ""
    for(let c of arr)
        r += ", " + c
    return r
}

// take a binary function like min(a,b) and make a chain to handle any number of arguments
class BinaryToMulti_FuncMaker extends FuncMaker {
    constructor(func_name) {
        super()
        this.func_name = func_name
    }// binary_func_to_multi

    make_func(args_strs, child_vars, dfstate) {
        const len = child_vars.length
        if (len === 1)
            return child_vars[0]
        let ret = ""
        for(let i = 0; i < len - 2; ++i) 
            ret += this.func_name + "(" + commaize(args_strs) + child_vars[i] + ", "
        ret += this.func_name + "(" + commaize(args_strs) + child_vars[len-2] + ", " + child_vars[len-1]
        ret += ')'.repeat(len-1)
        return ret
    }
}

class MultiSum_FuncMaker extends FuncMaker {
    make_func(args_strs, child_vars, dfstate) {
        return "(" + child_vars.join(" + ") + ")"
    }
}

// TBD code dup
const poly_smin = `float poly_smin(float k, float d1, float d2) {
    float h = clamp( 0.5 + 0.5*(d2-d1)/k, 0.0, 1.0 );
    return mix( d2, d1, h ) - k*h*(1.0-h); 
}
`


function make_combiner(op_sel_idx, radius)
{
    let func_maker = null, func_set = new FuncsSet(), args=[]

    switch (op_sel_idx) {
    case 0: func_maker = new BinaryToMulti_FuncMaker("min"); break;
    case 1: func_maker = new BinaryToMulti_FuncMaker("max"); break;
    case 2: func_maker = new MultiSum_FuncMaker(); break;
    case 3: 
        func_maker = new BinaryToMulti_FuncMaker('poly_smin'); 
        func_set.add('poly_smin', poly_smin)
        args.push(radius)
        break;
    default: assert(false, this, "unexpected operator")
    }
    return [func_maker, func_set, args]
}

class Expr_FuncMaker extends FuncMaker
{
    constructor(sitem, funcs, uniform_decls, uniform_values, imgs = null) {
        super()
        this.sitem = sitem  // ItemStandin
        this.funcs = funcs
        this.uniform_decls = uniform_decls
        this.uniform_values = uniform_values
        if (imgs !== null) {
            this.imgs = [] // references const objects
            for(let img of imgs)
                this.imgs.push(new ObjConstProxy(img, null))
            // this doesn't detect if the same image was added a few times just with different transform
            // Doing that would allow adding the same texture again and again more than 3 times
        }
        else
            this.imgs = null
    }
    make_func(args_strs, child_vars, dfstate) {
        // do glsl emit again now that the children names are known
        const value_need_in_field = this.sitem.need_input_evaler("in_fields")
        if (value_need_in_field) 
            value_need_in_field.dyn_set_obj(child_vars)
        if (this.imgs !== null) {
            const value_need_in_tex = this.sitem.need_input_evaler("in_texi")
            if (value_need_in_tex) {
                const offset = dfstate.alloc_tex_slots(this.imgs)
                value_need_in_tex.dyn_set_obj(offset)
            }
        }  
            
        const emit_ctx = new GlslEmitContext()
        emit_ctx.inline_str = this.sitem.eto_glsl(emit_ctx) 
        dassert(emit_ctx.inline_str !== null, 'unexpected expression null')

        dfstate.func_set.extend(this.funcs)

        const func_name = "expr_func_" + dfstate.alloc_var()
        let childs_args_declr = ""
        for(let c of child_vars)
            childs_args_declr += ', float ' + c

        let func = "float " + func_name + "(vec2 coord" + childs_args_declr + ") {\n"
        func += emit_ctx.inline_str + "\n"
        func += "}\n"
        for(let uniform_str of this.uniform_decls)
            dfstate.func_set.add("#uniform|" + uniform_str, uniform_str) // need key so that the same uniform won't be declared twice
        dfstate.func_set.add(func_name, func)
        for(let u_name in this.uniform_values)
            dfstate.uniform_values.add(u_name, this.uniform_values[u_name])

        return func_name + "(coord" + commaize_pre(child_vars) + ")"
    }
}

// reference object that must have subscripts that are ints
// the glsl result is a variable name that is of type float
class GlslArrayEvaluator extends EvaluatorBase {
    constructor(objref,subscripts) {
        super()
        eassert(subscripts.length == 1, "wrong number of subscripts")
        this.sub = subscripts[0]
        this.objref = objref
    }
    consumes_subscript() { return true }
    eval() { 
        eassert(false, "text evaluator can't be evaled", this.line_num)  
    }
    check_type() {
        return TYPE_NUM
    }
    clear_types_cache() {}
    to_glsl(emit_ctx) {
        eassert(this.objref.obj !== null, "object not set", this.line_num)
        let child = this.objref.obj[this.sub]
        eassert(child !== undefined, "subscript not found " + this.sub, this.line_num)        
        return child
    }
}

// this object is a one-time use standin for the long-term item that is inside the node param
// it holds the expression and what's needed to fill the evaluator needs of the expression
class ItemStandin
{
    constructor(item) {
        this.e = item.e
        this.parse_opt = item.parse_opt
        this.need_inputs = item.need_inputs // this, like e is also recreated each pase so we can just take reference it and not copy
    }

    need_input_evaler(input_name) {
        if (this.need_inputs === undefined || this.need_inputs === null)
            return null
        let ev = this.need_inputs[input_name]
        if (ev === undefined)
            return null
        return ev
    }

    eto_glsl(emit_ctx) {
        return ExprParser.do_to_glsl(this.e, emit_ctx, this.parse_opt)                  
    }

    oclone() {
        // called from clone() when copying the object, no need to really copy since this is an immutable object
        // (except type cache in the expr but that's probably ok since it's not going to change due to changing variables or evaluators)
        return this
    }
}


class NodeDFCombine extends BaseDFNodeCls
{
    static name() { return "Field Combine" }
    constructor(node) {
        super(node)
        this.in_df_objs = new InTerminalMulti(node, "in_fields")
        this.out = new OutTerminal(node, "out_field")

        node.set_state_evaluators({"coord":  (m,s)=>{ return new GlslTextEvaluator(m,s, "coord", ['x','y'], TYPE_VEC2) },
                                   "in_fields": (m,s)=>{ return new GlslArrayEvaluator(m,s) }
                                    })//...TEX_STATE_EVALUATORS} ) 
        // in_fields is an array accessed with in_fields.0 - static index
        // since making it a function is not so simple, need to select one of N variables

        this.op = new ParamSelect(node, "Operator", 0, ["Min (union)", "Max (intersect)", "Sum", "Smooth-min", "Function"], (sel_idx)=>{
            this.radius.set_visible(sel_idx === 3)
            this.dist_func.set_visible(sel_idx === 4)
        })
        this.radius = new ParamFloat(node, "Radius", 0.25, {enabled:true})
        this.dist_func = new ParamFloat(node, "Distance\nFunction", "length(coord) - 1", {show_code:true})

        this.sorted_order = []
        mixin_multi_reorder_control(node, this, this.sorted_order, this.in_df_objs)
    }

    make_dist_func(children) {
        const ditem = this.dist_func.get_active_item()
        const item = new ItemStandin(ditem) 

        const value_need_in_field = item.need_input_evaler("in_fields")
        if (value_need_in_field) {
            // for the first emit pass that's done here, give it dummy variable names for the child indices that exist so that the check in to_glsl pass
            const dummy_names = []
            for(let i = 0; i < children.length; ++i)
                dummy_names[i] = "###dummy_name_" + i
            value_need_in_field.dyn_set_obj(dummy_names)
        }
        
        // do first emit here so that we can commit the variable values to the value the are during this run
        // and for error checking. In this emit child var names are still unknown, The final text will get emitted in make_text.
        const emit_ctx = new GlslEmitContext()
        try {
            emit_ctx.inline_str = ditem.eto_glsl(emit_ctx) 
        }
        catch(e) {
            assert(false, this, e.message)
        }
        assert(emit_ctx.inline_str !== null, this, 'unexpected expression null')
        // inline_str not used since this is going to run again in the object with the real variables
        // runs here so an error is visible in the node

        const uniform_values = {}
        emit_ctx.set_uniform_vars_to_obj(uniform_values) // commit the variables to their current value to set in the output object
        return new DFNode(new Expr_FuncMaker(item, emit_ctx.add_funcs, emit_ctx.uniform_decls, uniform_values, []), null, null, children, null)
    }


    run() {
        const objs = this.in_df_objs.get_input_consts()
        if (this.op.sel_idx !== 4) // function doesn't need to have inputs
            assert(objs.length > 0, this, "No inputs")
        const children = []
        for(let i = 0; i < objs.length; ++i) {
            const obj = objs[this.sorted_order[i]]
            assert(obj.constructor === DistanceField, this, "Input object is not a Distance Field")
            children.push(obj.dfnode)
        }
       
        let dfnode
        if (this.op.sel_idx !== 4) {
            const [func_maker, func_set, args] = make_combiner(this.op.sel_idx, this.radius.get_value())
            dfnode = new DFNode(func_maker, null, args, children, func_set)
        }
        else {
            dfnode = this.make_dist_func(children)
        }
        dfnode.inline_tr = true // in case we pass it through transform node
        this.set_out_dfnode(dfnode)
    }
}

class DFNodeForLoop extends DFNodeBase {
    constructor(child, tr_lst, combiner_maker, combiner_args, combiner_funcs) {
        this.child = child
        this.tr = null
        this.inv_tr = null

        this.tr_lst = tr_lst
        this.combiner_maker = combiner_maker
        this.combiner_args = combiner_args
        this.combiner_funcs = combiner_funcs
    }
    make_text(dfstate) {
        const myvar = "v" + dfstate.alloc_var()

        const [child_var_name, child_text] = this.child.make_text(dfstate)

        let args_strs = []

        for(let i = 0; i < this.combiner_args.length; ++i) {
            const my_idx = dfstate.args_arr.length
            args_strs.push("get_arg(" + my_idx + ")")
        }
        dfstate.args_arr.push(...this.combiner_args)

        dfstate.func_set.extend(this.combiner_funcs)

        const inv_tr = mat3.create()
        const trs_start = dfstate.args_arr.length
        for(let tr of this.tr_lst) {
            mat3.invert(inv_tr, tr)
            if (this.inv_tr !== null) // has a self transform as well?
                mat3.multiply(inv_tr, inv_tr, this.inv_tr)
            dfstate.args_arr.push(inv_tr[0], inv_tr[1], inv_tr[3],inv_tr[4], inv_tr[6],inv_tr[7])
        }

        const in_coord_var = "in_coord" + dfstate.alloc_var()
        let text = "float " + myvar + " = 999999.0;\n"  // TBD from combiner
        text += "vec2 " + in_coord_var + " = coord;\n"
        text += "for(int i = 0; i < " + this.tr_lst.length + "; ++i) {\n"
        text += "  int tr_idx = i*6 + " + trs_start + ";\n"
        text += "  mat3x2 tr = mat3x2(get_arg(tr_idx), get_arg(tr_idx+1), get_arg(tr_idx+2), get_arg(tr_idx+3), get_arg(tr_idx+4), get_arg(tr_idx+5));\n"
        text += "  coord = tr * vec3(" + in_coord_var + ", 1.0);\n"
        text += child_text
        text += "  " + myvar + " = " + this.combiner_maker(args_strs, [myvar, child_var_name]) + ";\n"
        text += "}\n"

        return [myvar, text]
    }
}

// this is not the same node as NodeGeomCopy since we need the combine params
class NodeDFCopy extends CopyNodeMixin(BaseDFNodeCls)
{
    static name() { return "Field Copy" }
    constructor(node) {
        super(node)
        this.in_df_obj = new InTerminal(node, "in_field")
        this.out = new OutTerminal(node, "out_field")

        this.op = new ParamSelect(node, "Operator", 0, ["Min (union)", "Max (intersect)", "Sum", "Smooth-min"], (sel_idx)=>{
            this.radius.set_visible(sel_idx === 3)
        })
        this.radius = new ParamFloat(node, "Radius", 0.25, {enabled:true})        

        this.add_terminal_and_params(node)
    }
    run() {
        const in_obj = this.in_df_obj.get_const()
        assert(in_obj !== null, this, "No input object to copy")
        assert(in_obj.constructor === DistanceField, this, "input is not DistanceField")

        const [tg_vtx_count, tr_need_target] = this.get_meta_target()
        const index_wrap = this.get_index_wrap()

        
        const [func_maker, func_set, args] = make_combiner(this.op.sel_idx, this.radius.get_value())

        const in_dfnode = in_obj.dfnode
        const tr_lst = []
        for(let i = 0; i < tg_vtx_count; ++i) 
        {
            index_wrap[0] = i
            if (tr_need_target !== null)
                tr_need_target.dyn_set_prop_index(i)
            const m = this.transform.dyn_eval()
            tr_lst.push(m)
        }

        const dfnode = new DFNodeForLoop(in_dfnode, tr_lst, func_maker, args, func_set)
        this.set_out_dfnode(dfnode)
    }
}

// a call to in_texi that can change its index according to the texture index allocation in the Object it is in
class DFImgGlslTextEvaluator extends GlslTextEvaluator {
    to_glsl_mutate_args(emit_ctx, args) {
        // all textures that came from the same NodeDFImage will have the same offset
        const tex_offset = this.objref.obj
        dassert(tex_offset !== null, "texi offset not set")
        dassert(Number.isInteger(tex_offset), "texi offset expected to be int")

        args[0] += " + " + tex_offset + ".0"
        return this.name
    }
}


// this is a separate not from NodeDFCombine just so that there won't be confusion with the input terminals
class NodeDFImage extends BaseDFNodeCls
{
    static name() { return "Field Image" }
    constructor(node) {
        super(node)
        this.in_texs = new InTerminalMulti(node, "in_texs")
        this.out = new OutTerminal(node, "out_field")

        node.set_state_evaluators({"coord":  (m,s)=>{ return new GlslTextEvaluator(m,s, "coord", ['x','y'], TYPE_VEC2) },
                                   "in_texi":  (m,s)=>{ return new DFImgGlslTextEvaluator(m,s, "in_texi", [], TYPE_FUNCTION, in_texi_types )}} ) 

        this.dist_func = new ParamFloat(node, "Distance\nFunction", "in_texi(0,coord).r", {show_code:true})

        this.sorted_order = []
        mixin_multi_reorder_control(node, this, this.sorted_order, this.in_texs)
    }

    run() {
        const imgs = this.in_texs.get_input_consts()

        const ditem = this.dist_func.get_active_item()
        const item = new ItemStandin(ditem) 

        const value_need_in_tex = item.need_input_evaler("in_texi")
        if (value_need_in_tex) 
            value_need_in_tex.dyn_set_obj(0) // placeholder for in_texi offset, just so that the test glsl generation won't complain

        // same idea as NodeDFCombine
        const emit_ctx = new GlslEmitContext()
        try {
            emit_ctx.inline_str = ditem.eto_glsl(emit_ctx) 
        }
        catch(e) {
            assert(false, this, e.message)
        }
        assert(emit_ctx.inline_str !== null, this, 'unexpected expression null')

        // order imges 
        const sorted_imgs = []
        for(let i of this.sorted_order)
            sorted_imgs.push(imgs[i])

        const uniform_values = {}
        emit_ctx.set_uniform_vars_to_obj(uniform_values) // commit the variables to their current value to set in the output object
        const dfnode = new DFNode(new Expr_FuncMaker(item, null, emit_ctx.uniform_decls, uniform_values, sorted_imgs), null, null, null, null)
        dfnode.inline_tr = true
        this.set_out_dfnode(dfnode)
    }
}




// See https://en.wikipedia.org/wiki/Test_functions_for_optimization
function goldsteinPrice(x, y) {
    return (1 + Math.pow(x + y + 1, 2) * (19 - 14 * x + 3 * x * x - 14 * y + 6 * x * x + 3 * y * y))
        * (30 + Math.pow(2 * x - 3 * y, 2) * (18 - 32 * x + 12 * x * x + 48 * y - 36 * x * y + 27 * y * y));
  }

class NodeMarchingSquares extends NodeCls
{
    static name() { return "Marching Squares" }
    constructor(node) {
        super(node)
        this.in_df_obj = new InTerminal(node, "in_field")
        this.out = new OutTerminal(node, "out_paths")

        this.alg = new ParamSelect(node, "Algorithm", 0, ["Square Marching", "Po-Trace"])
        this.thresh = new ParamFloat(node, "Threshold", 0, {enabled:true, min:-1, max:1})
        this.res = new ParamVec2Int(node, "Resolution", 256, 256)
        this.size = new ParamVec2(node, "Size", 2, 2)
        this.flip_sign = new ParamBool(node, "Flip sign", false)
        this.transform = new ParamTransform(node, "Transform")
    }

    async values_from_df(df, width, height, sx, sy, tr, sign) {
        const fb_fact = new FrameBufferFactory(width, height, sx, sy, false, "pad", "float")
        fb_fact.transform(tr)
        const values = await df.get_pixels_for_fb(fb_fact)

        if (sign < 0) {
            const len = values.length
            for(let i = 0; i < len; ++i)
                values[i] = -values[i]
        }
      
        return values
    }

    values_test_func(width, height, sx, sy, tr, sign)
    {
        const top_left = vec2.fromValues(-sx/2, -sy/2), bot_left = vec2.fromValues(-sx/2, sy/2), top_right = vec2.fromValues(sx/2, -sy/2)
        vec2.transformMat3(top_left, top_left, tr)
        vec2.transformMat3(bot_left, bot_left, tr)
        vec2.transformMat3(top_right, top_right, tr)
        const da = vec2.create(), db = vec2.create() // the square has two orthogonal vectors a,b
        vec2.subtract(da, top_right, top_left)
        vec2.subtract(db, bot_left, top_left)
        da[0] /= width-1; da[1] /= width-1
        db[0] /= height-1; db[1] /= height-1

        const values = new Float32Array(width * height);
        let k = 0
        for (let ib = 0; ib < height; ++ib) {
            for (let ia = 0; ia < width; ++ia) {
                const x = da[0] * ia + db[0] * ib + top_left[0]
                const y = da[1] * ia + db[1] * ib + top_left[1]
                //values[k] = goldsteinPrice(x, y);
                values[k] = sign * (Math.sqrt(x*x + y*y) - 1)
                k++
            }
        }
        return values
    }

    run_square_march(values, thresh, width, height) {
        //const contours = d3.contours().size([width, height]).thresholds([this.thresh.v])(values);
        const gen = d3.contours()
        gen.size([width, height])
        gen.smooth(true) // without this it's just steps
        const cont = gen.contour(values, thresh)
        // returns a list of multipaths
        return cont
    }

    square_march(values, thresh, width, height, sx, sy, tr) 
    {
        const cont = this.run_square_march(values, thresh, width, height)

        const v = vec2.create()
        function tr_p(out, p) {
            out[0] = (p[0]-0.5) / (width-1) * sx - (sx/2)
            out[1] = (p[1]-0.5) / (height-1) * sy - (sy/2)
            vec2.transformMat3(out, out, tr)
        }

        const vtx = [], ranges = []
        for(let paths of cont.coordinates) {
            for(let path of paths) { // can have 1 or two paths if there's an outside when the value is negative inside
                const start_at = vtx.length/2
                for(let point of path) {
                    tr_p(v, point)
                    vtx.push(v[0], v[1])
                }
                ranges.push(start_at, vtx.length/2, PATH_CLOSED)
            }
        }

        const obj = new MultiPath()
        obj.set('vtx_pos', new TVtxArr(vtx), 2)
        obj.paths_ranges = ranges
        return obj
    }

    potrace_res_to_obj(paths, width, height, sx, sy, tr) 
    {
        function tr_p(out, p) {
            out[0] = (p.x-0.5) / (width-1) * sx - (sx/2)
            out[1] = (p.y-0.5) / (height-1) * sy - (sy/2)
            vec2.transformMat3(out, out, tr)
        }

        const vtx = [], ranges = [], ctp = [], cfp = []
        const t = vec2.create(), tc = vec2.create()  // scratchpads for transformed points
        for(let path of paths) {
            const c = path.curve
            const startIdx = vtx.length / 2
            tr_p(t, c.c[(c.n - 1) * 3 + 2])
            let prev_x = t[0], prev_y = t[1]
            for(let i = 0; i < c.n; ++i) {
                if (c.tag[i] === "CURVE") {
                    tr_p(t, c.c[i*3 + 2])
                    vtx.push(t[0], t[1])
                    tr_p(tc, c.c[i*3 + 1])
                    ctp.push(tc[0] - t[0], tc[1] - t[1])
                    tr_p(tc, c.c[i*3 + 0])
                    cfp.push(tc[0] - prev_x, tc[1] - prev_y)
                    prev_x = t[0]; prev_y = t[1]
                }
                else if (c.tag[i] == "CORNER") {
                    tr_p(t,  c.c[i*3 + 1])
                    tr_p(tc, c.c[i*3 + 2])
                    vtx.push(t[0],t[1],  tc[0],tc[1])
                    ctp.push(0, 0, 0, 0)
                    cfp.push(0, 0, 0, 0)
                    prev_x = tc[0]; prev_y = tc[1]
                }
                else
                    assert(false, this, "unexpected tag")
            }
            ranges.push(startIdx, vtx.length /2, PATH_CLOSED)
        }

        const obj = new MultiPath()
        obj.set('vtx_pos', new TVtxArr(vtx), 2)
        obj.set('ctrl_to_prev',   new TVtxArr(ctp), 2)
        obj.set('ctrl_from_prev', new TVtxArr(cfp), 2)
        obj.paths_ranges = ranges
        return obj        
    }

    potrace(values, thresh, width, height, sx, sy, tr) {
        const arr = new Int8Array(width * height)
        const len = width * height
        for(let i = 0; i < len; ++i)
            arr[i] = (values[i] < thresh) ? 0 : 1
        Potrace.setBm(arr, width, height)
        const paths = Potrace.process()
        //const svg = Potrace.getSVG(0.1, 'curve')
        //console.log(svg)
        //console.log(paths)
        Potrace.clear()

        return this.potrace_res_to_obj(paths, width, height, sx, sy, tr)
    }

    // the idea with this is that instead of the simple tracing potrace does, feed it the output of square marching
    // but the result is worse than any one of them so don't really need this
    march_then_potrace(values, thresh, width, height, sx, sy, tr)
    {
        const cont = this.run_square_march(values, thresh, width, height)

        // convert to the input potrace expects
        const po_paths = []
        for(let paths of cont.coordinates) {
            for(let path of paths) { // can have 1 or two paths if there's an outside when the value is negative inside
                const po_path = []
                for(let point of path) {
                    po_path.push({x:point[0], y:point[1]})
                }
                po_paths.push({pt:po_path, len:po_path.length})
            }
        }

        const pathlist = Potrace.do_processPath(po_paths)
        Potrace.clear()

        return this.potrace_res_to_obj(pathlist, width, height, sx, sy, tr)
    }

    async run() {
        const df = this.in_df_obj.get_const()
        assert(df !== null || df.constructor !== DistanceField, this, "Missing input distance field")

        const width = this.res.x, height = this.res.y
        const sx = this.size.x, sy = this.size.y
        const tr = this.transform.v
        const sign = this.flip_sign.v ? -1 : 1

        let values
        if (true)
            values = await this.values_from_df(df, width, height, sx, sy, tr, sign)
        else
            values = this.values_test_func(width, height, sx, sy, tr, sign)

        let obj, thresh = this.thresh.v * sign
        if (this.alg.sel_idx === 0)
            obj = this.square_march(values, thresh, width, height, sx, sy, tr)
        else if (this.alg.sel_idx === 1)
            obj = this.potrace(values, thresh, width, height, sx, sy, tr)
     

        this.out.set(obj)
    }

    draw_selection(m) {
        this.transform.draw_dial_at_obj(null, m)
        this.size.size_dial_draw(this.transform.v, m)
        
        const sx = this.size.x, sy = this.size.y
        const top_left = vec2.fromValues(-sx/2, -sy/2), bottom_right = vec2.fromValues(sx/2, sy/2)
        draw_rect(top_left, bottom_right, m, this.transform.v, "#000")
    }    
    image_find_obj(vx, vy, ex, ey) {
        return this.transform.dial.find_obj(ex, ey) || this.size.size_dial_find_obj(ex, ey)
    }
}

