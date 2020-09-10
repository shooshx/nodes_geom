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

    async pre_draw(m, disp_values) 
    {
        const dfstate = this.make_frag_text(DISTANCE_FRAG_TEXT)
        //const fb = new FrameBufferFactory(800, 800, 2, 2, false, "pad", "rgba") // TBD
        const fb = this.make_viewport_fb()

        this.p_shader_node.cls.in_fb.force_set(fb)
        this.p_shader_node.cls.uniforms["u_raw_value"].param.modify(false)

        // variables values
        const uniforms = dfstate.uniform_values.get_kv()
        for(let u_name in uniforms) {
            const prm = this.p_shader_node.cls.uniforms[u_name]
            dassert(prm !== undefined, "Uniform not found " + u_name)
            prm.param.modify(uniforms[u_name])
        }

        await this.p_shader_node.cls.run()
        this.p_shader_node.clear_dirty() // otherwise it remains dirty since it's not part of normal run loop

        this.p_img = this.p_shader_node.cls.out_tex.get_const()
        await this.p_img.pre_draw(null, null)
    }

    draw(m, disp_values) {
        this.p_img.draw(m, null)
    }

    async get_pixels_for_fb(fb) {
        // TBD cache
        this.make_frag_text(DISTANCE_FRAG_TEXT)
        this.p_shader_node.cls.in_fb.force_set(fb)
        this.p_shader_node.cls.uniforms["u_raw_value"].param.modify(true)
        await this.p_shader_node.cls.run()
        this.p_shader_node.clear_dirty() 
        const img = this.p_shader_node.cls.out_tex.get_const()
        return img.get_pixels()
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
    get_kv() {
        return this.set
    }
};

class DFTextState {
    constructor() {
        this.var_count = 1
        this.args_arr = []
        this.tr_arr = []
        this.func_set = new FuncsSet()
        this.uniform_values = new FuncsSet() // not actually funcs, map uniform name to its value
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
    constructor(func_maker=null, tr=null, args=null, children=null, func_set=null) { // need default values for clone
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
                prefix += "  coord = tr * vec3(" + in_coord_var + ", 1.0);\n"
                postfix = "}\n"
                added_type = true
            }
            else {
                args_strs.push(mytr_idx)
            }
        }

        if (this.args !== null) {
            for(let i = 0; i < this.args.length; ++i) {
                const my_idx = dfstate.args_arr.length
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
    constructor(sitem, funcs, uniform_decls, uniform_values) {
        super()
        this.sitem = sitem  // ItemStandin
        this.funcs = funcs
        this.uniform_decls = uniform_decls
        this.uniform_values = uniform_values
    }
    make_func(args_strs, child_vars, dfstate) {
        // do glsl emit again now that the children names are known
        const value_need_in_field = this.sitem.need_input_evaler("in_fields")
        if (value_need_in_field) 
            value_need_in_field.dyn_set_obj(child_vars)
        
        const emit_ctx = new GlslEmitContext()
        emit_ctx.inline_str = this.sitem.eto_glsl(emit_ctx) 
        dassert(emit_ctx.inline_str !== null, 'unexpected expression null')

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

        node.set_state_evaluators({"coord":  (m,s)=>{ return new GlslTextEvaluator(s, "coord", ['x','y'], TYPE_VEC2) },
                                   "in_fields": (m,s)=>{ return new GlslArrayEvaluator(m,s) }
                                    })//...TEX_STATE_EVALUATORS} ) 

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
        const item = new ItemStandin(ditem) // BUG - item not supported

        const value_need_in_field = item.need_input_evaler("in_fields")
        if (value_need_in_field) {
            // for the first emit pass that's done here, give it dummy names for the child indices that exist so that the check in to_glsl pass
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

        const uniform_values = {}
        emit_ctx.set_uniform_vars_to_obj(uniform_values) // commit the variables to their current value to set in the output object
        return new DFNode(new Expr_FuncMaker(item, this.add_funcs, emit_ctx.uniform_decls, uniform_values), null, null, children, null)
    }


    run() {
        const objs = this.in_df_objs.get_input_consts()
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
        const fb = new FrameBufferFactory(width, height, sx, sy, false, "pad", "float")
        fb.transform(tr)
        const values = await df.get_pixels_for_fb(fb)

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



