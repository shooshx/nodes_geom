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

mat3x2[] tr_arr = mat3x2[]($TR_ARR$);
float[] args_arr = float[]($ARGS_ARR$);

$FUNCS$

float value_func() {
    $EXPR$
}

void main() {
    float d = value_func();
    d = d - 1.0;
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
    }



    transform(m) { mat3.multiply(this.t_mat, m, this.t_mat) }

    make_frag_text(template) 
    {
        const dfstate = new DFTextState()
        const var_name = this.dfnode.make_text(dfstate)

        const tr_str_arr = []
        for(let tr of dfstate.tr_arr)
            tr_str_arr.push("mat3x2(" + [tr[0], tr[1], tr[3],tr[4], tr[6],tr[7]].join(",") + ")")

        let func_body = "int ai = 0;\n" + dfstate.text + "return " + var_name + ";"

        const text = template.replace('$FUNCS$', dfstate.func_set.to_text())
                             .replace('$EXPR$', func_body)
                             .replace('$TR_ARR$', tr_str_arr.join(',\n'))
                             .replace('$ARGS_ARR$', dfstate.args_arr.join(','))

        this.shader_node.cls.frag_text.set_text(text)
    }

    async pre_draw(m, disp_values) {

        const fb = new FrameBufferFactory(800, 800, 2, 2, false, "pad") // TBD

        this.shader_node.cls.in_fb.force_set(fb)

        // TBD only if changed
        this.make_frag_text(DISTANCE_FRAG_TEXT)

        await this.shader_node.cls.run()
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
        const myvar = "v" + dfstate.var_count
        ++dfstate.var_count
        let args_strs = []
        if (this.inv_tr !== null) {
            const mytr_idx = dfstate.tr_arr.length        
            dfstate.tr_arr.push(this.inv_tr)
            args_strs.push(mytr_idx)
        }

        for(let i = 0; i < this.args.length; ++i) {
            args_strs.push("args_arr[ai+" + i + "]")
            dfstate.args_arr.push(...this.args)
        }
        for(let child of this.children) {
            const var_name = child.make_text(dfstate)
            args_strs.push(var_name)
        }
        dfstate.func_set.extend(this.func_set)

        let text = "float " + myvar + " = " + this.make_call(args_strs) + ";\n"
        if (this.args.length > 0)
            text += "ai += " + this.args.length + ";\n"
        dfstate.text += text
        return myvar
    }
}

function func_call_text(func_name) {
    return function(args_strs) {
        return func_name + "(" + args_strs.join(", ") + ")"
    }
}

function formula_shape_template(name, s) {
    return `float $NAME$(int tr_idx, float radius) {
    mat3x2 tr = tr_arr[tr_idx];
    vec2 coord = tr * vec3(v_coord, 1.0);
    return $F$;
}`.replace('$F$', s).replace('$NAME$', name)
}

class NodeDFPrimitive extends NodeCls 
{
    static name() { return "Distance Field Primitive" }
    constructor(node) {
        super(node)

        //node.set_state_evaluators({"coord":  (m,s)=>{ return new ObjSingleEvaluator(m,s) }})

        this.out = new OutTerminal(node, "out_field")

        this.type = new ParamSelect(node, "Shape", 0, ["Circle", "Inverse-Circle"], (sel_idx)=>{
        })
        this.radius = new ParamFloat(node, "Radius", 0.25, {enabled:true})

        this.transform = new ParamTransform(node, "Transform")

        //this.size_dial = new SizeDial(this.size)
    }

    run() {
        let dfnode = null, glsl_funcs = new FuncsSet()
        if (this.type.sel_idx === 0)  { // circle 
            glsl_funcs.add("circle", formula_shape_template("circle", "sqrt(coord.x*coord.x + coord.y*coord.y) - radius"))
            dfnode = new DFNode(func_call_text("circle"), this.transform.get_value(), [this.radius.get_value()], [], glsl_funcs)
        } 
        else if (this.type.sel_idx === 1) {
            // used for blobs with added level of 1
            glsl_funcs.add("inv_circle", formula_shape_template("inv_circle", "(radius*radius) / (coord.x*coord.x + coord.y*coord.y)")) 
            dfnode = new DFNode(func_call_text("inv_circle"), this.transform.get_value(), [this.radius.get_value()], [], glsl_funcs)
        }
        else {
            assert(false, this, "expr not set")
        }

        let obj = new DistanceField(dfnode)
        this.out.set(obj)
    }

    draw_selection(m) {
        this.transform.draw_dial_at_obj(null, m)
        //this.size_dial.draw(this.transform.v, m)
    }    
    image_find_obj(vx, vy, ex, ey) {
        let hit = this.transform.dial.find_obj(ex, ey) //|| this.size_dial.find_obj(ex, ey)
        if (hit)
            return hit
        return null
    }

}

// take a binary function like min(a,b) and make a chain to handle any number of arguments
function binary_func_to_multi(func_name) {
    return function multi_min(args_strs) {
        const len = args_strs.length
        if (len === 1)
            return args_strs[0]
        let ret = ""
        for(let i = 0; i < len - 2; ++i)
            ret += func_name + "(" + args_strs[i] + ", "
        ret += func_name + "(" + args_strs[len-2] + ", " + args_strs[len-1]
        ret += ')'.repeat(len-1)
        return ret
    }
}

function multi_sum(args_strs) {
    return "(" + args_strs.join(" + ") + ")"
}

class NodeDFCombine extends NodeCls 
{
    static name() { return "Distance Field Combine" }
    constructor(node) {
        super(node)
        this.op = new ParamSelect(node, "Operator", 0, ["Min (union)", "Max (intersect)", "Sum", "Smooth-min"], (sel_idx)=>{
        })
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

        let func_maker = null, func_set = new FuncsSet()

        switch (this.op.sel_idx) {// min
        case 0: func_maker = binary_func_to_multi("min"); break;
        case 1: func_maker = binary_func_to_multi("max"); break;
        case 2: func_maker = multi_sum; break;
        default: assert(false, this, "unexpected operator")
        }

        let dfnode = new DFNode(func_maker, null, [], children, func_set)
        let obj = new DistanceField(dfnode)
        this.out.set(obj)
    }
}