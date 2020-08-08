"use strict"

// https://www.math3d.org/

const DISTANCE_VTX_TEXT = `
in vec4 vtx_pos;
out vec2 v_coord;
void main() {
    v_coord = vtx_pos.xy;
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

float value_func() {
    $EXPR$
}


void main() {
    float d = value_func();
   // d = d - 1.0;
    if (d < 0.0)
        outColor = vec4(1.0+d, 0.0, 0.0, 1.0);
    else
        outColor = vec4(0.0, 0.0, 1.0-d, 1.0);
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

        this.prog = new Program()
        this.shader_node = this.prog.add_node(0, 0, "<dist-shader>", NodeShader, null)

        //this.set_state_evaluators({"coord":  (m,s)=>{ return new ObjSingleEvaluator(m,s) } })
        this.shader_node.set_state_evaluators({"coord":  (m,s)=>{ return new GlslTextEvaluator(s, "v_coord", ['x','y'], TYPE_VEC2) }})
        this.shader_node.cls.vtx_text.set_text(DISTANCE_VTX_TEXT)

        this.args_tex = null
    }

    set_dfnode(dfnode) {
        this.dfnode = dfnode
    }

    transform(m) { mat3.multiply(this.t_mat, m, this.t_mat) }

    make_frag_text(template) 
    {
        ensure_webgl()
        const dfstate = new DFTextState()
        const var_name = this.dfnode.make_text(dfstate)

        let func_body = "int ai = 0;\n" + dfstate.text + "return " + var_name + ";"

        const text = template.replace('$FUNCS$', dfstate.func_set.to_text())
                             .replace('$EXPR$', func_body)

        this.shader_node.cls.frag_text.set_text(text)

        if (this.args_tex === null)
            this.args_tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.args_tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, dfstate.args_arr.length, 1, 0, gl.RED, gl.FLOAT, new Float32Array(dfstate.args_arr));
        setTexParams(false, 'pad', 'pad')
        this.args_tex.t_mat = mat3.create()
        this.shader_node.cls.override_texs = {3:this.args_tex}
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    async pre_draw(m, disp_values) {

        const fb = new FrameBufferFactory(800, 800, 2, 2, false, "pad") // TBD

        this.shader_node.cls.in_fb.force_set(fb)

        // TBD only if changed
        this.make_frag_text(DISTANCE_FRAG_TEXT)

        await this.shader_node.cls.run()
        this.shader_node.clear_dirty() // otherwise it remains dirty since it's not part of normal run loop

        this.img = this.shader_node.cls.out_tex.get_const()
        await this.img.pre_draw(null, null)
    }

    draw(m, disp_values) {
        this.img.draw(m, null)
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
        this.text = ""
        this.args_arr = []
        this.tr_arr = []
        this.func_set = new FuncsSet()
    }
}

// node in the tree that produces glsl code
class DFNode {
    constructor(make_call, tr, args, children, func_set) {
        this.make_call = make_call  //  afunction that takes list of arguments and returns a string with the function call
        this.tr = tr // actual matrix
        if (this.tr !== null) {
            this.inv_tr = mat3.create()
            mat3.invert(this.inv_tr, this.tr)
        }
        else 
            this.inv_tr = null
        this.args = args // list of floats
        this.children = children // list of DFNode
        this.func_set = func_set // my own functions (not children's)
    }
    make_text(dfstate) {
        // call order to any function is func_name(tr_index_in_args_arr_if_exists, child_vars_if_exist, float_args_if_exist)
        const child_vars = []
        for(let child of this.children) {
            const var_name = child.make_text(dfstate)
            child_vars.push(var_name)
        }

        const myvar = "v" + dfstate.var_count
        ++dfstate.var_count
        let args_strs = [], args_offset = 0
        if (this.inv_tr !== null) {
            const mytr_idx = dfstate.args_arr.length
            const tr = this.inv_tr
            dfstate.args_arr.push(tr[0], tr[1], tr[3],tr[4], tr[6],tr[7])
            args_strs.push(mytr_idx)
            args_offset += 6
        }

        for(let i = 0; i < this.args.length; ++i) {
            //args_strs.push("args_arr[ai+" + (i + args_offset) + "]")
            args_strs.push("get_arg(ai+" + (i + args_offset) + ")")
        }
        dfstate.args_arr.push(...this.args)

        dfstate.func_set.extend(this.func_set)

        let text = "float " + myvar + " = " + this.make_call(args_strs, child_vars) + ";\n"
        if (this.args.length > 0)
            text += "ai += " + (this.args.length + args_offset) + ";\n"
        dfstate.text += text
        return myvar
    }
}

function func_call_text(func_name) {
    return function(args_strs) {
        return func_name + "(" + args_strs.join(", ") + ")"
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
            const s = `float $NAME$(int tr_idx, $ARGS$) {
    mat3x2 tr = mat3x2(get_arg(tr_idx), get_arg(tr_idx+1), get_arg(tr_idx+2), get_arg(tr_idx+3), get_arg(tr_idx+4), get_arg(tr_idx+5));
    vec2 p = tr * vec3(v_coord, 1.0);
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

class NodeDFCombine extends BaseDFNodeCls 
{
    static name() { return "Distance Field Combine" }
    constructor(node) {
        super(node)
        this.in_df_objs = new InTerminalMulti(node, "in_fields")
        this.out = new OutTerminal(node, "out_field")

        this.op = new ParamSelect(node, "Operator", 0, ["Min (union)", "Max (intersect)", "Sum", "Smooth-min"], (sel_idx)=>{
        })
        this.radius = new ParamFloat(node, "Radius", 0.25, {enabled:true})

        this.out_obj = null // cache out object
    }

    run() {
        const objs = this.in_df_objs.get_input_consts()
        assert(objs.length > 0, this, "No inputs")
        const children = []
        for(let obj of objs) {
            assert(obj.constructor === DistanceField, this, "Input object is not a Distance Field")
            children.push(obj.dfnode)
        }

        let func_maker = null, func_set = new FuncsSet(), args=[]

        switch (this.op.sel_idx) {// min
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

        const dfnode = new DFNode(func_maker, null, args, children, func_set)

        this.set_out_dfnode(dfnode)
    }
}