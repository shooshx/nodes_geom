"use strict"


const FUNC_VERT_SRC = `#version 300 es
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

const EXPR_FRAG_SRC = `#version 300 es
precision mediump float;

in vec2 v_coord;
out vec4 outColor;

void main() {
    float v = $EXPR$;
    outColor = vec4(vec3(1.0, 0.5, 0.0) + vec3(v, v, v), 1.0);    
}
`



class ParamProxy extends Parameter {
    constructor(node, wrap) {
        super(node, wrap.label)
        this.wrap = wrap
    }
    save() { return this.wrap.save() }
    load(v) { this.wrap.load(v) }
    add_elems(parent) {
        this.wrap.add_elems(parent)
    }
    pis_dirty() { return this.wrap.pis_dirty() }
    pclear_dirty() { this.wrap.pclear_dirty() }
}

class GlslTextEvaluator {
    constructor(subscripts, glsl_name, allowed_subscripts) {        
        eassert(subscripts.length == 1, "wrong number of subscripts")
        const sub = subscripts[0]
        eassert(allowed_subscripts.indexOf(sub) !== -1, "unknown subscript " + sub)
        this.name = glsl_name + "." + sub
    }
    eval() {
        eassert(false, "text evaluator can't be evaled")
    }
    check_type() {
        return TYPE_NUM
    }
    to_glsl() {
        return this.name
    }
}


class NodeFuncFill extends NodeCls
{
    static name() { return "Function Fill" }
    constructor(node) {
        super(node)
        this.prog = new Program()
        this.shader_node = this.prog.add_node(0, 0, null, NodeShader, null)
        this.shader_node.cls.attr_names = ["vtx_pos"]

        this.in_mesh = new TerminalProxy(node, this.shader_node.cls.in_mesh)

        this.in_tex = new TerminalProxy(node, this.shader_node.cls.in_tex)
        this.out_tex = new TerminalProxy(node, this.shader_node.cls.out_tex)

        node.set_state_evaluators({"coord":  (m,s)=>{ return new GlslTextEvaluator(s, "v_coord", ['x','y']) }} ) 

        //this.time = new ParamProxy(node, this.shader_node.cls.uniform_by_name('time').param)
        this.floatExpr = new ParamFloat(node, "Expression", "1+1")

        this.shader_node.cls.vtx_text.set_text(FUNC_VERT_SRC)
        //this.shader_node.cls.frag_text.set_text(NOISE_FRAG_SRC)

    }
    destructtor() {
        this.shader_node.cls.destructtor()
    }
    run() {
        if ( this.floatExpr.item.last_error !== null) {
            assert(false, this, "Expression error")
        }
        let expr = this.floatExpr.item.e, str
        if (expr !== null) {
            try {
                str = expr.to_glsl()
            }
            catch(ex) {
                assert(false, this, ex.message)
            }
        }
        else {  // it's a constant
            str = this.floatExpr.v 
            if (Number.isInteger(str))
                str += ".0"
        }
        console.log("EXPR: ", str)


        const frag_text = EXPR_FRAG_SRC.replace('$EXPR$', str)
        this.shader_node.cls.frag_text.set_text(frag_text, false)

        this.shader_node.cls.run()
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
        this.shader_node.clear_dirty()
    }
}


// Perlin noise: https://github.com/stegu/webgl-noise/tree/master/src

const NOISE_FRAG_SRC =  `#version 300 es
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








