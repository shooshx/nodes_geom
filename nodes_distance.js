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

//float[] args_arr = float[]($ARGS_ARR$);

float get_arg(int i) {
    return texelFetch(_u_in_tex_3, ivec2(i,0), 0).r;
    //return args_arr[i];
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
        this.p_shader_node.set_state_evaluators({"coord":  (m,s)=>{ return new GlslTextEvaluator(s, "v_coord", ['x','y'], TYPE_VEC2) }})
        this.p_shader_node.cls.vtx_text.set_text(DISTANCE_VTX_TEXT)
    }

    make_frag_text(template) 
    {
        ensure_webgl()
        this.ensure_prog()
        const dfstate = new DFTextState()
        const [var_name, dftext] = this.dfnode.make_text(dfstate)

        let func_body = dftext + "return " + var_name + ";"

        const text = template.replace('$FUNCS$', dfstate.func_set.to_text())
                             .replace('$EXPR$', func_body)

        this.p_shader_node.cls.frag_text.set_text(text)

        if (this.p_args_tex === null)
            this.p_args_tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.p_args_tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, dfstate.args_arr.length, 1, 0, gl.RED, gl.FLOAT, new Float32Array(dfstate.args_arr));
        setTexParams(false, 'pad', 'pad')
        this.p_args_tex.t_mat = mat3.create()
        this.p_shader_node.cls.override_texs = {3:this.p_args_tex}
        gl.bindTexture(gl.TEXTURE_2D, null);
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

        const fb = new FrameBufferFactory(canvas_image.width, canvas_image.height, pmax[0]-pmin[0], pmax[1]-pmin[1], false, "pad")
        fb.transform(tr)
        //const fb = new FrameBufferFactory(canvas_image.width, canvas_image.height, 4, 4, false, "pad")
        return fb
    }

    async pre_draw(m, disp_values) 
    {
        this.make_frag_text(DISTANCE_FRAG_TEXT)
        //const fb = new FrameBufferFactory(800, 800, 2, 2, false, "pad") // TBD
        const fb = this.make_viewport_fb()

        this.p_shader_node.cls.in_fb.force_set(fb)


        await this.p_shader_node.cls.run()
        this.p_shader_node.clear_dirty() // otherwise it remains dirty since it's not part of normal run loop

        this.p_img = this.p_shader_node.cls.out_tex.get_const()
        await this.p_img.pre_draw(null, null)
    }

    draw(m, disp_values) {
        this.p_img.draw(m, null)
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

class FuncsSet {
    constructor() {
        this.set = {}
    }
    add(name, text) {
        if (this.set[name] !== undefined)
            return
        this.set[name] = text
    }
    extend(v) {
        this.set = {...this.set, ...v.set}
    }
    to_text() {
        const func_lst = []
        for(let ft_name in this.set)
            func_lst.push(this.set[ft_name])
        return func_lst.join("\n")
    }
};

class DFTextState {
    constructor() {
        this.var_count = 1
        this.args_arr = []
        this.tr_arr = []
        this.func_set = new FuncsSet()
    }
    alloc_var() {
        const v = this.var_count
        ++this.var_count;
        return v
    }
}

function range_getarg(a, b) {
    let s = []
    for(let i = a; i < b; ++i)
        s.push("get_arg(" + i + ")")
    return s.join(', ')
}

// node in the tree that produces glsl code
class DFNode {
    constructor(make_call=null, tr=null, args=null, children=null, func_set=null) { // need default values for clone
        this.make_call = make_call  //  afunction that takes list of arguments and returns a string with the function call        
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
    }
    make_text(dfstate) {
        // call order to any function is func_name(tr_index_in_args_arr_if_exists, child_vars_if_exist, float_args_if_exist)
        const child_vars = []
        let text = "", prefix = "", postfix = "", added_type = false
        const myvar = "v" + dfstate.alloc_var()

        for(let child of this.children) {
            const [var_name, add_text] = child.make_text(dfstate)
            child_vars.push(var_name)
            text += add_text
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
                prefix += "  coord = tr * vec3(" + in_coord_var + ", 1.0);\n"
                postfix = "}\n"
                added_type = true
            }
            else {
                args_strs.push(mytr_idx)
            }
        }

        for(let i = 0; i < this.args.length; ++i) {
            const my_idx = dfstate.args_arr.length
            args_strs.push("get_arg(" + my_idx + ")")
            dfstate.args_arr.push(this.args[i])
        }

        dfstate.func_set.extend(this.func_set)

        text += (added_type ? "" : "float ") + myvar + " = " + this.make_call(args_strs, child_vars) + ";\n"
        
        return [myvar, prefix + text + postfix]
    }
}

function func_call_text(func_name) {
    return function(args_strs, child_vars) {
        return func_name + "(coord, " + args_strs.join(", ") + ")"
    }
}


class BaseDFNodeCls extends NodeCls
{
    constructor(node) {
        super(node)
        this.out_obj = null // cache the out objet so that that the shader inside it compile the program only when needed
    }
    set_out_dfnode(dfnode) {
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
    static name() { return "Distance Field Primitive" }
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

        this.size_dial = new SizeDial(this.size)        
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
            dfnode = new DFNode(func_call_text(name), this.transform.get_value(), args_vals, [], glsl_funcs)
        }

        switch (this.type.sel_idx) {
        case 0: 
            add("circle", ["radius"], [this.radius.get_value()], "return sqrt(p.x*p.x + p.y*p.y) - radius;")
            break
        case 1: // used for blobs with added level of 1
            add("inv_circle", ["radius"],  [this.radius.get_value()], "return (radius*radius) / (p.x*p.x + p.y*p.y);")
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
            this.size_dial.draw(this.transform.v, m)
    }    
    image_find_obj(vx, vy, ex, ey) {
        let hit = this.transform.dial.find_obj(ex, ey) 
        if (hit)
            return hit
        if (this.need_size()) {
            hit = this.size_dial.find_obj(ex, ey)
            if (hit)
                return hit
        }
        return null
    }

}

function commaize(arr) {
    let r = ""
    for(let c of arr)
        r += c + ", "
    return r
}

// take a binary function like min(a,b) and make a chain to handle any number of arguments
function binary_func_to_multi(func_name) {
    return function multi_min(args_strs, child_vars) {
        const len = child_vars.length
        if (len === 1)
            return child_vars[0]
        let ret = ""
        for(let i = 0; i < len - 2; ++i) 
            ret += func_name + "(" + commaize(args_strs) + child_vars[i] + ", "
        ret += func_name + "(" + commaize(args_strs) + child_vars[len-2] + ", " + child_vars[len-1]
        ret += ')'.repeat(len-1)
        return ret
    }
}

function multi_sum(args_strs, child_vars) {
    return "(" + child_vars.join(" + ") + ")"
}

const poly_smin = `float poly_smin(float k, float d1, float d2) {
    float h = clamp( 0.5 + 0.5*(d2-d1)/k, 0.0, 1.0 );
    return mix( d2, d1, h ) - k*h*(1.0-h); 
}
`




class BaseDFCombine extends BaseDFNodeCls 
{
    constructor(node) {
        super(node)

        this.op = new ParamSelect(node, "Operator", 0, ["Min (union)", "Max (intersect)", "Sum", "Smooth-min"], (sel_idx)=>{
            this.radius.set_visible(sel_idx === 3)
        })
        this.radius = new ParamFloat(node, "Radius", 0.25, {enabled:true})
    }

    make_combiner()
    {
        let func_maker = null, func_set = new FuncsSet(), args=[]

        switch (this.op.sel_idx) {
        case 0: func_maker = binary_func_to_multi("min"); break;
        case 1: func_maker = binary_func_to_multi("max"); break;
        case 2: func_maker = multi_sum; break;
        case 3: 
            func_maker = binary_func_to_multi('poly_smin'); 
            func_set.add('poly_smin', poly_smin)
            args.push(this.radius.get_value())
            break;
        default: assert(false, this, "unexpected operator")
        }
        return [func_maker, func_set, args]
    }

}

class NodeDFCombine extends BaseDFCombine
{
    static name() { return "Distance Field Combine" }
    constructor(node) {
        super(node)
        this.in_df_objs = new InTerminalMulti(node, "in_fields")
        this.out = new OutTerminal(node, "out_field")
    }

    run() {
        const objs = this.in_df_objs.get_input_consts()
        assert(objs.length > 0, this, "No inputs")
        const children = []
        for(let obj of objs) {
            assert(obj.constructor === DistanceField, this, "Input object is not a Distance Field")
            children.push(obj.dfnode)
        }
       
        const [func_maker, func_set, args] = this.make_combiner()

        const dfnode = new DFNode(func_maker, null, args, children, func_set)
        dfnode.inline_tr = true
        this.set_out_dfnode(dfnode)
    }
}

class DFNodeForLoop {
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
class NodeDFCopy extends CopyNodeMixin(BaseDFCombine)
{
    static name() { return "Field Copy" }
    constructor(node) {
        super(node)
        this.in_df_obj = new InTerminal(node, "in_field")
        this.out = new OutTerminal(node, "out_field")

        this.add_terminal_and_params(node)
    }
    run() {
        const in_obj = this.in_df_obj.get_const()
        assert(in_obj !== null, this, "No input object to copy")
        assert(in_obj.constructor === DistanceField, this, "input is not DistanceField")

        const [tg_vtx_count, tr_need_target] = this.get_meta_target()
        const index_wrap = this.get_index_wrap()

        
        const [func_maker, func_set, args] = this.make_combiner()

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