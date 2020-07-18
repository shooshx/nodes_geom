"use strict"


const FUNC_VERT_SRC = `
in vec4 vtx_pos;
out vec2 v_coord;
uniform mat3 t_mat;

void main(void)
{
    vec3 tmp = t_mat * vec3(vtx_pos.xy, 1.0);
    v_coord = tmp.xy;
    gl_Position = vec4(vtx_pos.xy, 1.0, 1.0);
}
`

const EXPR_FRAG_SRC = `

in vec2 v_coord;
out vec4 outColor;


#ifdef _D_IS_GLSL_CODE
#line 1
$GLSL_CODE$
#else // expr code

$UNIFORM_DEFS$

$FUNCS$

void main() {
    $BEFORE_EXPR$
#ifndef _D_EXPR_IS_COLOR
    float v = $EXPR$;
 #ifdef _D_HAS_TEXTURE
    outColor = texture(_u_in_tex_0, vec2(v,0));
 #else
    outColor = vec4(vec3(1.0, 0.5, 0.0) + vec3(v*2.0-1.0, v*2.0-1.0, v*2.0-1.0), 1.0);
 #endif
#else     
    outColor = $EXPR$;
#endif     
}

#endif // expr code
`

const GLSL_START_V_CODE = `void main() {
    outColor = vec4(1.0, v_coord.x, 0.0, 1.0);    
}
`

// texture can be samples implicitly by have a float expression (and a gradient)
// or explicitly by having a color expression and using in_tex() - takes x,y or vec2 and returns vec4 color

const in_tex_types = {[type_tuple(TYPE_VEC2)]: TYPE_VEC4, [type_tuple(TYPE_NUM, TYPE_NUM)]: TYPE_VEC4}
const in_texi_types = {[type_tuple(TYPE_NUM, TYPE_VEC2)]: TYPE_VEC4, [type_tuple(TYPE_NUM, TYPE_NUM, TYPE_NUM)]: TYPE_VEC4}


class ParamProxy extends Parameter {
    constructor(node, wrap, label=undefined) {
        super(node, (label === undefined) ? wrap.label : label)
        this.wrap = wrap
        if (this.wrap.my_expr_items !== undefined)
            this.my_expr_items = this.wrap.my_expr_items // make resolve_variables work
    }
    save() { return this.wrap.save() }
    load(v) { this.wrap.load(v) }
    add_elems(parent) {
        // the proxy group overrides that of the wrapped param
        if (this.group_param !== null && this.group_param.line_elem !== null)
            parent = this.group_param.line_elem        
        this.wrap.add_elems(parent)
    }
    pis_dirty() { return this.wrap.pis_dirty() }
    pclear_dirty() { this.wrap.pclear_dirty() }
    // don't forward set_group() since the proxy can be in a different group
}

// evaluator for the v_coord variable in glsl
class GlslTextEvaluator extends NodeBase {
    constructor(subscripts, glsl_name, allowed_subscripts, obj_type, func_ret_by_args=null) {        
        super()
        if (subscripts.length === 0) { // just name without sub
            this.type = obj_type
            this.name = glsl_name
        }
        else {
            eassert(subscripts.length == 1, "wrong number of subscripts")
            const sub = subscripts[0]
            eassert(allowed_subscripts.indexOf(sub) !== -1, "unknown subscript " + sub)
            this.name = glsl_name + "." + sub
            this.type = TYPE_NUM
        }
        this.func_ret_by_args = func_ret_by_args // map type tuple to function return type
    }
    consumes_subscript() { return true }
    eval() {
        eassert(false, "text evaluator can't be evaled")
    }
    check_type() {
        return this.type
    }
    func_ret_type(args_type_tuple) {
        if (this.func_ret_type_ === null)
            throw new TypeErr("Undefined func_ret_type for " + this.name)
        const t = this.func_ret_by_args[args_type_tuple]
        if (t === undefined)
            throw new TypeErr("No function overload of func " + this.name + "() takes arguments " + type_tuple_str(args_type_tuple))
        return t
    }
    clear_types_cache() {} // no need to clear since it's not dependent on anything that can change
    to_glsl(emit_ctx) {
        return this.name
    }
}

function glsl_type_name(t) {
    switch(t) {
    case TYPE_NUM: return "float"
    case TYPE_VEC2: return "vec2"
    case TYPE_VEC3: return "vec3"
    case TYPE_VEC4: return "vec4"
    default: throw TypeErr("unexpected type for glsl " + t)
    }
}



class GlslEmitContext {
    constructor() {
        this.before_expr = []  // lines that go before the final expression
        this.add_funcs = []    // function definitions to go before main
        this.uniform_decls = []  // set of strings of the uniform declarations
        this.inline_str = null  // the final expression
        this.uniform_evaluators = {} // map name of uniform to UniformVarRef
        this.glsl_code = ""
    }
    add_uniform(type, name, evaluator) { // expression getting uniforms from variables
        if (this.uniform_evaluators[name] !== undefined)
            return  // happens if the same variable appears more than once in the expression
        this.uniform_decls.push("uniform " + glsl_type_name(type) + " " + name + ";")
        this.uniform_evaluators[name] = evaluator
    }

    do_replace(text) {
        return text.replace('$FUNCS$', this.add_funcs.join('\n'))
                   .replace('$BEFORE_EXPR$', this.before_expr.join('\n'))
                   .replace('$UNIFORM_DEFS$', this.uniform_decls.join('\n')) // from variables
                   .replace(/\$EXPR\$/g, this.inline_str)
                   .replace('$GLSL_CODE$', this.glsl_code)
    }
    
    set_uniform_vars(shader_cls) {
        for(let name in this.uniform_evaluators) {
            let evaluator = this.uniform_evaluators[name]
            const param = shader_cls.param_of_uniform(name)
            console.assert(param !== null, "Missing expected uniform param " + name)
            param.modify(ExprParser.do_eval(evaluator), false)
        }
    }
}

// glsl example: 
// void main () {
//    outColor = in_tex(v_coord);
// }

class NodeFuncFill extends BaseNodeShaderParcel
{
    static name() { return "Function Fill" }
    constructor(node) 
    {
        super(node)
        this.shader_node.cls.attr_names = ["vtx_pos"]

        //this.in_mesh = new TerminalProxy(node, this.shader_node.cls.in_mesh)
        this.in_texs = new TerminalProxy(node, this.shader_node.cls.in_texs)  
        this.in_texs.xoffset = 30

        this.in_fb = new TerminalProxy(node, this.shader_node.cls.in_fb)  
        this.out_tex = new TerminalProxy(node, this.shader_node.cls.out_tex)

        // this is the coordinates of the pixel to be referenced by the code as `coord`
        node.set_state_evaluators({"coord":  (m,s)=>{ return new GlslTextEvaluator(s, "v_coord", ['x','y'], TYPE_VEC2) },
                                   ...TEX_STATE_EVALUATORS} ) 

        //this.time = new ParamProxy(node, this.shader_node.cls.uniform_by_name('time').param)
        this.type = new ParamSelect(node, "Type", 0, ["Float to Gradient", "Direct Color", "GLSL Program"], (sel_idx)=>{
            this.float_expr.set_visible(sel_idx === 0)
            this.color_expr.set_visible(sel_idx === 1)
            this.glsl_text.set_visible(sel_idx === 2)
            if (sel_idx === 0) {
                this.active_param = this.float_expr
                this.active_item = this.float_expr.get_active_item()
                this.remove_param_proxies()
            }
            else if (sel_idx === 1) {
                this.active_param = this.color_expr
                this.active_item = this.color_expr.code_item  // color doesn't have non-code expr yet
                this.remove_param_proxies()
            }
            else {
                this.active_param = null
                this.active_item = null
                this.process_glsl_text(this.glsl_text.v)
            }
           // this.make_frag_text() // changes where we take the expr from
        })
        this.float_expr = new ParamFloat(node, "Float\nExpression", "coord.x", {show_code:true})
        // color_expr is expected to return a vec4 or vec3 with values in range [0,1]
        this.color_expr = new ParamColor(node, "Color\nExpression", ["#cccccc", "rgb(coord.x, coord.y, 1.0)"], {show_code:true})

        // with GLSL input we want go generate the text and get the uniforms before run so that panel parameters can be populated
        this.glsl_text = new ParamTextBlock(node, "GLSL\nCode", GLSL_START_V_CODE, (v)=>{
            this.process_glsl_text(v)
        })
        this.proxies_group = new ParamGroup(node, "Uniforms")

        this.order_table = new ParamProxy(node, this.shader_node.cls.order_table, "Tex Order")


        this.shader_node.cls.vtx_text.set_text(FUNC_VERT_SRC)
        //this.shader_node.cls.frag_text.set_text(NOISE_FRAG_SRC)
        node.param_alias("Expression", this.float_expr)

        // the expression is parsed when it's edited and glsl code is saved to this
        // the final text with $$ replaced depends on the input so it's made only in run
        this.active_param = null // points to either float_expr or color_expr
        this.active_item = null // points tot the ExpressionItem inside the active param
        this.glsl_emit_ctx = null
        this.param_proxies = []
    }

    remove_param_proxies(do_update=true) {
        for(let p of this.param_proxies)
            this.node.remove_param(p)
        this.param_proxies = []
        if (do_update)
            this.proxies_group.update_elems()
    }

    process_glsl_text(v) {
        this.glsl_emit_ctx = this.make_frag_text()
        let frag_text = this.glsl_emit_ctx.do_replace(EXPR_FRAG_SRC)
        this.shader_node.cls.frag_text.set_text(frag_text, false)
    
        this.remove_param_proxies(false)
        for(let p of this.shader_node.parameters) {
            if (p.label.startsWith('_u_') || p.label.startsWith('_D_') || (p.is_shader_generated && !p.is_shader_generated()))
                continue; // internal stuff
            const prox = new ParamProxy(this.node, p)
            prox.set_group(this.proxies_group)
            this.param_proxies.push(prox)
        }
        this.proxies_group.update_elems()
    }

    make_frag_text() 
    {
        let emit_ctx = new GlslEmitContext()
        if (this.type.sel_idx === 2) { // glsl
            emit_ctx.glsl_code = this.glsl_text.v
            return emit_ctx;
        }
        if (this.active_param.show_code && this.active_item.e !== null) {
            if (this.active_item.elast_error !== null) {
                assert(false, this, "Expression error")
            }
            try {
                // str is just whats returned, other lines are in before_expr
                emit_ctx.inline_str = this.active_item.e.to_glsl(emit_ctx)
                if (this.active_item.etype === TYPE_VEC3) {
                    emit_ctx.inline_str = "vec4(" + emit_ctx.inline_str + ", 1.0)"
                }
                // check type if vec3 add alpha
                assert(emit_ctx.inline_str !== null, this, 'unexpected expression null')
            }
            catch(ex) {
                assert(false, this, ex.message)
            }
        }
        else {  // it's a constant
            if (this.type.sel_idx === 0) {
                emit_ctx.inline_str = this.active_param.get_value()
                if (Number.isInteger(emit_ctx.inline_str))
                    emit_ctx.inline_str += ".0"
            }
            else {
                // expects the numbers from expr to be [0,1] range
                let c = this.active_param.get_value()
                emit_ctx.inline_str = "vec4(" + (c.r/255) + "," + (c.g/255) + "," + (c.b/255) + "," + c.alpha + ")"
            }
        }
        return emit_ctx;
    }

    async run() {
        let in_fb = this.in_fb.get_const() // TBD wrong
        assert(in_fb !== null, this, "missing input texture-params")

        const texs = this.in_texs.get_input_consts()

        if (this.type.sel_idx !== 2) { // was already done for GLSL during change
            // need to remake text due to expression change
            if (this.active_param.pis_dirty() || this.type.pis_dirty()) {
                this.glsl_emit_ctx = this.make_frag_text()
            }
            let frag_text = this.glsl_emit_ctx.do_replace(EXPR_FRAG_SRC)
            //console.log("TEXT: ", frag_text)
            this.shader_node.cls.frag_text.set_text(frag_text, false)
        }

        // set_text creates parameters for the uniforms in the text, which are then read in run and transfered to gl
        this.glsl_emit_ctx.set_uniform_vars(this.shader_node.cls)
        this.shader_node.cls.param_of_define("_D_EXPR_IS_COLOR").modify( this.type.sel_idx === 1, false)
        this.shader_node.cls.param_of_define("_D_HAS_TEXTURE").modify(texs.length >= 1, false)
        this.shader_node.cls.param_of_define("_D_IS_GLSL_CODE").modify( this.type.sel_idx === 2, false)

        // don't need to actually give anything to the evaluator since it's not doing eval, it's doing to_glsl

        try {
            await this.shader_node.cls.run()
        }
        finally {
            if (this.type.sel_idx === 2) { // transfer glsl errors back to editor
                this.glsl_text.set_errors( this.shader_node.cls.frag_text.get_errors() )
            }
        }

    }

}


// Perlin noise: https://github.com/stegu/webgl-noise/tree/master/src

const NOISE_FRAG_SRC =  `
precision mediump float;

in vec2 v_coord;
out vec4 outColor;


vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289(vec2 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
    return mod289(((x*34.0)+1.0)*x);
}

vec4 permute(vec4 x) {
    return mod289(((x*34.0)+1.0)*x);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise_2d(vec2 v)
{
    const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                        0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                        -0.577350269189626,  // -1.0 + 2.0 * C.x
                        0.024390243902439); // 1.0 / 41.0
    // First corner
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);

    // Other corners
    vec2 i1;
    //i1.x = step( x0.y, x0.x ); // x0.x > x0.y ? 1.0 : 0.0
    //i1.y = 1.0 - i1.x;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    // x0 = x0 - 0.0 + 0.0 * C.xx ;
    // x1 = x0 - i1 + 1.0 * C.xx ;
    // x2 = x0 - 1.0 + 2.0 * C.xx ;
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;

    // Permutations
    i = mod289(i); // Avoid truncation effects in permutation
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
            + i.x + vec3(0.0, i1.x, 1.0 ));

    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;

    // Gradients: 41 points uniformly over a line, mapped onto a diamond.
    // The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)

    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;

    // Normalise gradients implicitly by scaling m
    // Approximation of: m *= inversesqrt( a0*a0 + h*h );
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

    // Compute final noise value at P
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}


float snoise_3d(vec3 v)
{ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

// First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

// Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

// Permutations
  i = mod289(i); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

// Gradients: 7x7 points over a square, mapped onto an octahedron.
// The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

//Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

// Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}

uniform float time;

void main_x() {
    float v = snoise_3d(vec3(v_coord.xy, time));
    //float v = snoise_2d(v_coord);
    outColor = vec4(v, v, v, 1.0);
    //outColor = vec4(abs(v_coord.x), abs(v_coord.y), time, 1.0);

}



void main() {
    vec3 v_coord3 = vec3(v_coord.xy, 0.0);
    // Perturb the texcoords with three components of noise
    vec3 uvw = v_coord3 + 0.1*vec3(snoise_3d(v_coord3 + vec3(0.0, 0.0, time)),
                                   snoise_3d(v_coord3 + vec3(43.0, 17.0, time)),
                                   snoise_3d(v_coord3 + vec3(-17.0, -43.0, time)));
    //uvw = v_coord3;                                   
    // Six components of noise in a fractal sum
    float n = snoise_3d(uvw - vec3(0.0, 0.0, time));
    n += 0.5 * snoise_3d(uvw * 2.0 - vec3(0.0, 0.0, time*1.4)); 
    n += 0.25 * snoise_3d(uvw * 4.0 - vec3(0.0, 0.0, time*2.0)); 
    n += 0.125 * snoise_3d(uvw * 8.0 - vec3(0.0, 0.0, time*2.8)); 
    n += 0.0625 * snoise_3d(uvw * 16.0 - vec3(0.0, 0.0, time*4.0)); 
    n += 0.03125 * snoise_3d(uvw * 32.0 - vec3(0.0, 0.0, time*5.6)); 
    n = n * 0.7;
    // A "hot" colormap - cheesy but effective 
    outColor = vec4(vec3(1.0, 0.5, 0.0) + vec3(n, n, n), 1.0);    

}

`








