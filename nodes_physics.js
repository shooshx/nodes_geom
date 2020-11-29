"use strict"

// body - position and velocity, apply force


// Basic Body def node
// - static/dynamic
//    kynetic - moving but doesn't respond to force
// - shape - box, circle, from input polygon, from input fixtures
// - position, angle
// - density (disabled for static)
//    - warning if all fixtures have 0 density
// - friction, Restitution

// Rigid body ? - attache several fixtures

// World node

// screen control node
// pointer can grab bodies and move them - set position/apply force?



class B2Fixture {
    constructor() {
        this.def = null
        this.obj = null
    }
}

class B2Body {
    constructor() {
        this.def = null
        this.fixtures = []
        this.obj = null
    }
}

class B2Def extends PObject 
{
    constructor() {
        super()
        this.bodies = []  // list of B2Body
        this.joints = []

        this.p_draw_world_cache = null // not copied on clone
        this.p_draw_debug = null
    }

    ensure_world_cache() {
        if (this.p_draw_world_cache !== null)
            return
        this.p_draw_world_cache = createWorld(this, [0,0]) // create world just for callding DebugDraw
        this.p_draw_debug = new CanvasDebugDraw(ctx_img);
        this.p_draw_world_cache.obj.SetDebugDraw(this.p_draw_debug);        
    }

    draw_m(m, disp_values) {
        this.ensure_world_cache()
        this.p_draw_debug.SetFlags(b2.DrawFlags.e_shapeBit)
        ctx_img.lineWidth = 1.0/image_view.viewport_zoom
        this.p_draw_world_cache.obj.DebugDraw()
    }
    draw_template_m(m) {
    }
}

class B2World extends PObject 
{
    constructor() {
        super()
        this.obj = null
        this.bodies = []
        this.p_draw_debug = null
    }

    draw_m(m, disp_values) {
        if (this.p_draw_debug === null) {
            this.p_draw_debug = new CanvasDebugDraw(ctx_img);
            this.obj.SetDebugDraw(this.p_draw_debug);
        }
        this.p_draw_debug.SetFlags(b2.DrawFlags.e_shapeBit)
        ctx_img.lineWidth = 1.0/image_view.viewport_zoom
        this.obj.DebugDraw()
    }
    draw_template_m(m) {
    }

}
 


class NodeB2Body extends NodeCls
{
    static name() { return "Physics Body" }
    constructor(node) {
        super(node)
        //this.in_obj = new InTerminal(node, "in_obj")
        this.out = new OutTerminal(node, "b2_defs")
        
        this.type = new ParamSelect(node, "Type", 0, [["Static", b2.staticBody], ["Kynematic", b2.kinematicBody], ["Dynamic",b2.dynamicBody]],(sel_idx)=>{
        })
        this.shape = new ParamSelect(node, "Shape", 0, ["Box", "Circle"],(sel_idx)=>{
            this.size.set_visible(sel_idx === 0)
            this.radius.set_visible(sel_idx === 1)
        })
        this.size = new ParamVec2(node, "Size(m)", 0.5, 0.5)
        this.radius = new ParamFloat(node, "Radius(m)", 0.5)
       // this.position = new ParamVec2(node, "Position(m)", 0, 0);
       // this.angle = new ParamFloat(node, "Angle", 0, {min:0, max:360})
        this.density = new ParamFloat(node, "Density(kg)", 1)
        this.restit = new ParamFloat(node, "Restitution", 0.1, {min:0, max:1})
        this.friction = new ParamFloat(node, "Friction", 0.1, {min:0, max:1})

        this.transform = new ParamTransform(node, "Transform", {}, {b2_style:true})

        this.radius_dial = new PointDial((dx,dy)=>{
            this.radius.increment(dx)
        })
    }
    
    run() {
        const b = new B2Body()
        b.def = new b2.BodyDef()
        b.def.type = this.type.get_sel_val()
        b.def.position.Set(this.transform.translate[0], this.transform.translate[1])
        b.def.angle = glm.toRadian(this.transform.rotate)

        let s = null
        const pivot = new b2.Vec2(-this.transform.rotate_pivot[0], -this.transform.rotate_pivot[1])
        if (this.shape.sel_idx === 0) {  // box
            s = new b2.PolygonShape()
            s.SetAsBox(this.size.x * 0.5, this.size.y * 0.5, pivot, 0)
        }
        else if (this.shape.sel_idx === 1) { // circle 
            s = new b2.CircleShape(this.radius.v)
            s.Set(pivot)
        }
        else
            assert(false, node, "not supported")

        const f = new B2Fixture()
        f.def = new b2.FixtureDef()
        f.def.shape = s
        f.def.density = this.density.v
        f.def.restitution = this.restit.v
        f.def.friction = this.friction.v
        b.fixtures.push(f)
        
        const ret = new B2Def()
        ret.bodies.push(b)
        this.out.set(ret)
    }

    draw_selection(m) {
        this.transform.draw_dial_at_obj(null, m)
        if (this.size.pis_visible())
            this.size.size_dial_draw(this.transform.v, m)
        if (this.radius.pis_visible())
            this.radius_dial.draw(this.radius.v, 0, this.transform.v, m)

    }

    image_find_obj(e) {
        if (this.radius.pis_visible()) { // radius before transform since they may overlap
            const hit = this.radius_dial.find_obj(e)
            if (hit)
                return hit
        }
        let hit = this.transform.dial.find_obj(e)
        if (hit)
            return hit
        if (this.size.pis_visible()) {
            hit = this.size.size_dial_find_obj(e)
            if (hit)
                return hit
        }
        return null
    }
}

function createWorld(def, gravity) 
{
    const w = new B2World()
    w.obj = new b2.World(new b2.Vec2(gravity[0], gravity[1]))

    for(let body of def.bodies) {
        const mb = new B2Body() // don't want to change the input one
        w.bodies.push(mb)
        mb.def = body.def
        mb.obj = w.obj.CreateBody(mb.def)
        for(let fixt of body.fixtures) {
            const mf = new B2Fixture()
            mb.fixtures.push(mf)
            mf.def = fixt.def
            mf.obj = mb.obj.CreateFixture(mf.def)                    
        }
    }
    return w
}

// merge several bodies definition to one scene
class NodeB2Merge extends NodeCls
{
    static name() { return "Physics Merge" }
    constructor(node) {
        super(node)

        this.in_defs = new InTerminalMulti(node, "b2_in_defs")
        this.out = new OutTerminal(node, "b2_defs")
    }

    run() {
        const in_defs = this.in_defs.get_input_consts()

        const udef = new B2Def();
        for(let def of in_defs) {
            udef.bodies.push(...def.bodies)
            udef.joints.push(...def.joints)
        }
        this.out.set(udef)
    }
}


class NodeB2Sim extends NodeCls
{
    static name() { return "Physics Simulator" }
    constructor(node) {
        super(node)

        // returns the same world object it got
        this.in = new InTerminal(node, "b2_in") // defs or world from prev frame
        this.out = new OutTerminal(node, "b2_world")

        this.gravity = new ParamVec2(node, "Gravity", 0, 9.8)

    }

    run() {
        const inobj = this.in.get_const()
        assert(inobj !== null, this, "no input")
        let w = inobj
        if (inobj.constructor === B2Def) // first frame
            w = createWorld(inobj, this.gravity.get_value())
        else
            assert(inobj.constructor === B2World, this, "input not a defs or world")

        const timeStep = 1.0 / 60.0
        const velocityIterations = 6
        const positionIterations = 2
        w.obj.Step(timeStep, velocityIterations, positionIterations)
        
        this.out.set(w)
    }
}




// from https://github.com/flyover/box2d.ts/blob/master/testbed/draw.ts
class CanvasDebugDraw extends b2.Draw 
{
    constructor(ctx) {
      super(ctx);
      this.ctx = ctx
    }
  
    PushTransform(xf) {
      const ctx = this.ctx
      if (ctx) {
        ctx.save();
        ctx.translate(xf.p.x, xf.p.y);
        ctx.rotate(xf.q.GetAngle());
      }
    }
  
    PopTransform(xf) {
      const ctx = this.ctx
      if (ctx) {
        ctx.restore();
      }
    }
  
    DrawPolygon(vertices, vertexCount, color) {
      const ctx = this.ctx
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertexCount; i++) {
          ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
        ctx.strokeStyle = color.MakeStyleString(1);
        ctx.stroke();
      }
    }
  
    DrawSolidPolygon(vertices, vertexCount, color) {
      const ctx = this.ctx
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertexCount; i++) {
          ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = color.MakeStyleString(0.5);
        ctx.fill();
        ctx.strokeStyle = color.MakeStyleString(1);
        ctx.stroke();
      }
    }
  
    DrawCircle(center, radius, color) {
      const ctx = this.ctx
      if (ctx) {
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, b2.pi * 2, true);
        ctx.strokeStyle = color.MakeStyleString(1);
        ctx.stroke();
      }
    }
  
    DrawSolidCircle(center, radius, axis, color) {
      const ctx = this.ctx
      if (ctx) {
        const cx = center.x;
        const cy = center.y;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, b2.pi * 2, true);
        ctx.moveTo(cx, cy);
        ctx.lineTo((cx + axis.x * radius), (cy + axis.y * radius));
        ctx.fillStyle = color.MakeStyleString(0.5);
        ctx.fill();
        ctx.strokeStyle = color.MakeStyleString(1);
        ctx.stroke();
      }
    }
  
    // #if B2_ENABLE_PARTICLE
    DrawParticles(centers, radius, colors, count) {
      const ctx = this.ctx
      if (ctx) {
        if (colors !== null) {
          for (let i = 0; i < count; ++i) {
            const center = centers[i];
            const color = colors[i];
            ctx.fillStyle = color.MakeStyleString();
            // ctx.fillRect(center.x - radius, center.y - radius, 2 * radius, 2 * radius);
            ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, b2.pi * 2, true); ctx.fill();
          }
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          // ctx.beginPath();
          for (let i = 0; i < count; ++i) {
            const center = centers[i];
            // ctx.rect(center.x - radius, center.y - radius, 2 * radius, 2 * radius);
            ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, b2.pi * 2, true); ctx.fill();
          }
          // ctx.fill();
        }
      }
    }
    // #endif
  
    DrawSegment(p1, p2, color) {
      const ctx = this.ctx
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = color.MakeStyleString(1);
        ctx.stroke();
      }
    }
  
    DrawTransform(xf) {
      const ctx = this.ctx
      if (ctx) {
        this.PushTransform(xf);
  
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(1, 0);
        ctx.strokeStyle = b2.Color.RED.MakeStyleString(1);
        ctx.stroke();
  
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 1);
        ctx.strokeStyle = b2.Color.GREEN.MakeStyleString(1);
        ctx.stroke();
  
        this.PopTransform(xf);
      }
    }
  
    DrawPoint(p, size, color) {
      const ctx = this.ctx
      if (ctx) {
        ctx.fillStyle = color.MakeStyleString();
        //size *= g_camera.m_zoom;
        //size /= g_camera.m_extent;
        const hsize = size / 2;
        ctx.fillRect(p.x - hsize, p.y - hsize, size, size);
      }
    }
  
    rawString_s_color = new b2.Color(0.9, 0.6, 0.6);
    DrawString(x, y, message) {
      return // TBD  
      const ctx = this.ctx
      if (ctx) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.font = "15px DroidSans";
        const color = DebugDraw.DrawString_s_color;
        ctx.fillStyle = color.MakeStyleString();
        ctx.fillText(message, x, y);
        ctx.restore();
      }
    }
  
    DrawStringWorld_s_p = new b2.Vec2();
    DrawStringWorld_s_cc = new b2.Vec2();
    DrawStringWorld_s_color = new b2.Color(0.5, 0.9, 0.5);
    DrawStringWorld(x, y, message) {
      return  // TBD going to need some work
      const ctx = this.ctx
      if (ctx) {
        const p = DebugDraw.DrawStringWorld_s_p.Set(x, y);
  
        // world -> viewport
        const vt = g_camera.m_center;
        b2.Vec2.SubVV(p, vt, p);
        ///const vr = g_camera.m_roll;
        ///b2.Rot.MulTRV(vr, p, p);
        const vs = g_camera.m_zoom;
        b2.Vec2.MulSV(1 / vs, p, p);
  
        // viewport -> canvas
        const cs = 0.5 * g_camera.m_height / g_camera.m_extent;
        b2.Vec2.MulSV(cs, p, p);
        p.y *= -1;
        const cc = DebugDraw.DrawStringWorld_s_cc.Set(0.5 * ctx.canvas.width, 0.5 * ctx.canvas.height);
        b2.Vec2.AddVV(p, cc, p);
  
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.font = "15px DroidSans";
        const color = DebugDraw.DrawStringWorld_s_color;
        ctx.fillStyle = color.MakeStyleString();
        ctx.fillText(message, p.x, p.y);
        ctx.restore();
      }
    }
  
    DrawAABB(aabb, color) {
      const ctx = this.ctx
      if (ctx) {
        ctx.strokeStyle = color.MakeStyleString();
        const x = aabb.lowerBound.x;
        const y = aabb.lowerBound.y;
        const w = aabb.upperBound.x - aabb.lowerBound.x;
        const h = aabb.upperBound.y - aabb.lowerBound.y;
        ctx.strokeRect(x, y, w, h);
      }
    }
  }

