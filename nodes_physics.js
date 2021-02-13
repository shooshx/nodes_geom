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
    constructor(cnode_id) {
        this.def = null
        this.obj = null
        this.cnode_id = cnode_id
    }
}

class B2Body {
    constructor(cnode_id) {
        this.name = null // for debugging
        this.def = null
        this.fixtures = []
        this.obj = null
        this.cnode_id = cnode_id // create node unique-id
        this.index = null // temporary for building the world
        this.t_mat = null // not actually used

        this.on_init_params = [] // functions that are called just after the initialization of the world (for things that are not in the defs, kinematic velocity)
    }
}

class B2Joint {
    constructor(cnode_id) {
        this.def = null
        this.body_refA = null // B2Body objects
        this.body_refB = null
        this.init_call = null // function to call for initializing the joint with the two real bodies
        this.obj = null
        this.cnode_id = cnode_id
    }
}

// for nodes that use a b2.World for display


class B2Def extends PObject
{
    constructor() {
        super()
        this.bodies = []  // list of B2Body
        this.joints = []  // list of B2Joint

        // kind of a hack to take advantage of the fact the world can draw itself
        this.p_draw_world_cache = null // not copied on clone

    }

    ensure_world_cache() {
        if (this.p_draw_world_cache !== null)
            return
        this.p_draw_world_cache = createWorld(this, [0,0], false) // create world just for callding DebugDraw    
    }

    draw_m(m, disp_values) {
        this.ensure_world_cache()
        this.p_draw_world_cache.draw_mw(disp_values)
    }

    can_draw_shadow() { 
        return true 
    }
    draw_shadow_m(m) {
        this.ensure_world_cache()
        this.p_draw_world_cache.draw_shadow_m()
    }
}

class B2World extends PObject
{
    constructor() {
        super()
        this.obj = null
        this.bodies = []

        // map cnode_id of the creator node to the object it created in the context of this world
        // this is done like this so that the same def can go to different worlds
        // used by online params
        this.cnode_to_obj = {} 

        this.p_draw_debug = null
        this.p_draw_shadow = null
        this.p_draw_template = null
    }

    clone() {
        assert(false, this, "World object can't be cloned")
        // due to the b2 objects and multiple refs to the same objects
    }


    do_draw(flags, drawer) {      
        drawer.SetFlags(flags)
        drawer.ctx.lineWidth = 1.0/image_view.viewport_zoom
        this.obj.SetDebugDraw(drawer);
        this.obj.DebugDraw()        
    }

    draw_mw(disp_values) { // used by B2Defs to draw without setting the current world
        if (this.p_draw_debug === null) 
            this.p_draw_debug = new CanvasDebugDraw(ctx_img);

        let flags = 0
        flags |= b2.DrawFlags.e_shapeBit
        flags |= b2.DrawFlags.e_jointBit
        //flags |= b2.DrawFlags.e_controllerBit
        //flags |= b2.DrawFlags.e_pairBit // lines connecting bodies
        this.do_draw(flags, this.p_draw_debug)
    }
    draw_m(m, disp_values) {
        g_current_worlds.push(this)
        this.draw_mw(disp_values, this)
    }

    draw_template_m(m) {
        if (this.p_draw_template === null) {
            this.p_draw_template = new CanvasDebugDraw(ctx_img);
            this.p_draw_template.set_color_template(true)
        }
        this.do_draw(b2.DrawFlags.e_shapeBit | b2.DrawFlags.e_jointBit, this.p_draw_template)
    }

    can_draw_shadow() { 
        return true 
    }

    draw_shadow_m(m) {
        // used for selecting object with click in image view
        if (this.p_draw_shadow === null) {
            this.p_draw_shadow = new CanvasDebugDraw(ctx_img_shadow);
            this.p_draw_shadow.set_color_from_shape(true)
        }
        this.do_draw(b2.DrawFlags.e_shapeBit, this.p_draw_shadow)
    }      

}

function b2VecFromArr(v) { return new b2.Vec2(v[0], v[1]) }
 

// for change of parameters by user during sim
// also called from on_init for parameters the must be set only on world creation
// also called from eresolve when variables change
function make_phy_caller(obj_func_name, node_id, change_func, adapter=null) {
    return function(v) {
        for(let w of g_current_worlds) {
            const obj = w.cnode_to_obj[node_id]
            if (obj === undefined)
                continue
            if (typeof obj_func_name !== 'string') {
                obj_func_name(w, v, obj)  // it's actually a function override (for Density)
                continue
            }
            dassert(obj.obj[obj_func_name] !== undefined, "object missing function " + obj_func_name)
            if (adapter !== null)
                v = adapter(v)            
            obj.obj[obj_func_name](v)
        }
        if (change_func)
            change_func(v)
    }
}

class PhyParamFloat extends ParamFloat {
    constructor(node, label, start_v, conf, obj_func_name, id_suffix="") {
        super(node, label, start_v, conf, make_phy_caller(obj_func_name, node.id + id_suffix, null))
    }
}
class PhyParamFloatPositive extends PhyParamFloat {
    constructor(node, label, start_v, conf, obj_func_name, id_suffix="") {
        if (conf === null)
            conf = {}
        conf.validate = (v)=>{ if (v !== null) assert(v >= 0, node.cls, "Can't be negative")} 
        super(node, label, start_v, conf, obj_func_name, id_suffix)
    }
}

class PhyParamBool extends ParamBool {
    constructor(node, label, start_v, obj_func_name, change_func=null, id_suffix="") {
        super(node, label, start_v, make_phy_caller(obj_func_name, node.id + id_suffix, change_func))
    }
}
class PhyParamVec2 extends ParamVec2 {
    constructor(node, label, start_x, start_y, obj_func_name, change_func=null, id_suffix="") {
        super(node, label, start_x, start_y, null, make_phy_caller(obj_func_name, node.id + id_suffix, change_func, b2VecFromArr))
    }
}
class PhyParamTransform extends ParamTransform {
    constructor(node, label, start_v, id_suffix="") {
        super(node, label, start_v, {b2_style:true}, make_phy_caller((w, m)=>{
            const obj = w.cnode_to_obj[node.id]
            obj.obj.SetTransformXY(this.translate[0], this.translate[1], glm.toRadian(this.rotate))
        }, node.id + id_suffix, null))
    }
}

function b2MakeBox(w, h, pivot) {
    const s = new b2.PolygonShape()
    s.SetAsBox(Math.abs(w) * 0.5, Math.abs(h) * 0.5, pivot, 0)
    return s
}

class NodeB2Body extends NodeCls
{
    static name() { return "Physics Body" }
    constructor(node) {
        super(node)
        //this.in_obj = new InTerminal(node, "in_obj")
        this.out = new OutTerminal(node, "b2_defs")
        
        this.type = new ParamSelect(node, "Type", 0, [["Static", b2.staticBody], ["Kynematic", b2.kinematicBody], ["Dynamic",b2.dynamicBody]],(sel_idx)=>{
            this.kin_lin_velocity.set_visible(sel_idx == 1);
            this.kin_ang_velocity.set_visible(sel_idx == 1);
            this._sep2.set_visible(sel_idx == 1);
        })
        this.shape = new ParamSelect(node, "Shape", 0, ["Box", "Circle"],(sel_idx)=>{
            this.size.set_visible(sel_idx === 0)
            this.radius.set_visible(sel_idx === 1)
        })
        this.size = new PhyParamVec2(node, "Size(m)", 0.5, 0.5, (w, v, bobj)=>{
            const s = b2MakeBox(v[0], v[1], this.get_shape_pivot())
            const fobj = w.cnode_to_obj[node.id + "_f"]
            if (fobj !== undefined)
                fobj.obj.m_shape = s
            bobj.obj.SetAwake(true)
        })
        this.radius = new PhyParamFloatPositive(node, "Radius(m)", 0.5, {min:0, max:1}, (w, v, bobj)=>{
            const fobj = w.cnode_to_obj[node.id + "_f"]
            if (fobj !== undefined)
                fobj.obj.m_shape.m_radius = v
            // TBD mass???
            bobj.obj.SetAwake(true)
        })
       
        this._sep1 = new ParamSeparator(node, "_sep1")

        this.kin_lin_velocity = new PhyParamVec2(node, "Linear V(m/s)", 0, 0, "SetLinearVelocity")
        this.kin_ang_velocity = new PhyParamFloat(node, "Angular V(r/s)", 0, {min:-90, max:90}, "SetAngularVelocity")
        this._sep2 = new ParamSeparator(node, "_sep2")

        this.density = new PhyParamFloat(node, "Density(kg)", 1, {min:0, max:10}, (w, v, bobj)=>{
            const fobj = w.cnode_to_obj[node.id + "_f"]
            if (fobj !== undefined)
                fobj.obj.SetDensity(v)
            bobj.obj.ResetMassData() // to the body
        })
        this.restit = new PhyParamFloat(node, "Restitution", 0.1, {min:0, max:1}, "SetRestitution", "_f") // doesn't change existing contacts
        this.friction = new PhyParamFloat(node, "Friction", 0.1, {min:0, max:1}, "SetFriction", "_f")

        this.transform = new PhyParamTransform(node, "Transform", {})

        this.radius_dial = new PointDial((dx,dy)=>{
            this.radius.increment(dx)
        })
    }

    get_shape_pivot() {
        return new b2.Vec2(-this.transform.rotate_pivot[0], -this.transform.rotate_pivot[1])
    }
    
    run() {
        const b = new B2Body(this.node.id)
        b.name = this.node.name
        b.def = new b2.BodyDef()
        b.def.type = this.type.get_sel_val()
        b.def.position.Set(this.transform.translate[0], this.transform.translate[1])
        b.def.angle = glm.toRadian(this.transform.rotate)
        b.t_mat = mat3.copy(mat3.create(), this.transform.v) // don't want this to be tied to the Param, best thing is to copy it

        let s = null
        const pivot = this.get_shape_pivot()
        if (this.shape.sel_idx === 0) {  // box
            s = b2MakeBox(this.size.x, this.size.y, pivot)
        }
        else if (this.shape.sel_idx === 1) { // circle 
            s = new b2.CircleShape(this.radius.v)
            s.Set(pivot)
        }
        else
            assert(false, node, "not supported")

        const f = new B2Fixture(this.node.id + "_f")
        f.def = new b2.FixtureDef()
        f.def.shape = s
        f.def.density = this.density.v
        f.def.restitution = this.restit.v
        f.def.friction = this.friction.v
        f.def.userData = { node_id: this.node.id } // for shadow find
        b.fixtures.push(f)
        if (this.type.sel_idx === 1) { // kinematic
            b.on_init_params.push(this.kin_lin_velocity, this.kin_ang_velocity)
        }
        
        const ret = new B2Def()
        ret.bodies.push(b)
        this.out.set(ret)
    }

    dials_hidden() {
        return g_current_worlds.length > 0 && this.type.sel_idx != 0
    }

    draw_selection(m) {
        if (this.dials_hidden()) {
            // moving objects should not show the move dial in the wrong place
            return
        }
        this.transform.draw_dial_at_obj(null, m)
        if (this.size.pis_visible())
            this.size.size_dial_draw(this.transform.v, m)
        if (this.radius.pis_visible())
            this.radius_dial.draw(this.radius.v, 0, this.transform.v, m)

    }

    image_find_obj(e) {
        if (this.dials_hidden()) 
            return null
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

    img_hit_find_obj() {
        return new MouseJointProxy(this.node)
    }
}

class MouseJointProxy
{
    constructor(node) {
        this.node = node
        this.joint = null
        this.target = new b2.Vec2()
        this.with_world = null
    }
    mousemovable() {
        const [obj,w] = this.get_dynamic_obj()
        return obj !== null
    }
    mousemove(dx, dy, e) {
        if (this.joint === null)
            return
        const mpnt = image_view.epnt_to_model(e.ex, e.ey)
        this.target.x = mpnt[0]
        this.target.y = mpnt[1]
    
        //console.log("~~", this.target.x, this.target.y)
        this.joint.SetTarget(this.target)
    } 
    mouseup() {
        if (this.joint === null)
            return
        this.with_world.obj.DestroyJoint(this.joint)
        this.joint = null
        this.with_world = null
    }

    get_dynamic_obj() {
        if (g_current_worlds.length === 0)
            return [null,null]
        const w = g_current_worlds[0]
        const obj = w.cnode_to_obj[this.node.id]
        if (obj === undefined || obj.constructor !== B2Body || obj.def.type !== b2.dynamicBody)
            return [null,null]
        return [obj,w]
    }
    
    mousedown(e) {
        this.node.select()
        const [obj,w] = this.get_dynamic_obj()
        if (obj === null)
            return
        const def = new b2.MouseJointDef()
        def.bodyB = obj.obj
        def.bodyA = obj.obj
        const mpnt = image_view.epnt_to_model(e.ex, e.ey)
        this.target.x = mpnt[0]
        this.target.y = mpnt[1]
        def.target = this.target
        def.maxForce = 100 *  obj.obj.GetMass()
        const frequencyHz = 5.0;
        const dampingRatio = 0.7;
        b2.LinearStiffness(def, frequencyHz, dampingRatio, def.bodyA, def.bodyB);
        this.joint = w.obj.CreateJoint(def)
        this.with_world = w
    }
}

function isSingleBody(def) {
    return def.bodies.length === 1 && def.joints.length === 0
}

function getWorldPoint_fromBodyDef(def, localPoint) {
    const xf = new b2.Transform();
    xf.p.Copy(b2Maybe(bd.position, b2Vec2.ZERO));
    xf.q.SetAngle(b2Maybe(bd.angle, 0));

    b2Transform.MulXV(this.m_xf, localPoint, out);
}

const FREQUENCY_HZ_FOR_DAMPING = 1.0

class NodeB2Joint extends NodeCls
{
    static name() { return "Physics Joint" }
    constructor(node) {
        super(node)

        this.inA = new InTerminal(node, "in_bodyA")
        this.inB = new InTerminal(node, "in_bodyB")
        this.out = new OutTerminal(node, "b2_defs")

        const anchors_vis = ()=>{
            const rel = this.rel_anchor.get_value()
            this.anchor.set_visible(this.type.sel_idx === 0 && !rel)
            const v = (this.type.sel_idx === 1) || (this.type.sel_idx === 0 && rel)
            this.anchorA.set_visible(v)
            this.anchorB.set_visible(v)
        }

        this.type = new ParamSelect(node, "Type", 0, ["Revolute", "Distance", ],(sel_idx)=>{
            this.enableMotor.set_visible(sel_idx === 0)
            this.motorSpeed.set_visible(sel_idx === 0)
            this.maxTorque.set_visible(sel_idx === 0)
            this.rel_anchor.set_visible(sel_idx === 0)

            anchors_vis()
            this.collideConnected.set_visible(sel_idx === 1)
            this.damping.set_visible(sel_idx === 1)
            this.min_len.set_visible(sel_idx === 1)
            this.max_len.set_visible(sel_idx === 1)
        })

        // ------- Revolute ---------
        this.rel_anchor = new ParamBool(node, "Body-Relative Anchors", false, (v)=>{
            anchors_vis()
        }) 
        // these can't change during sim
        this.anchor = new ParamVec2(node, "Anchor", 0, 0, null, (x,y)=>{
        })  
        // relative to body center
        this.anchorA = new PhyParamVec2(node, "Anchor A", 0, 0, (w, v, obj)=>{
            obj.obj.m_localAnchorA = b2VecFromArr(v)
            this.online_awake_objects(w)
        }) 
        this.anchorB = new PhyParamVec2(node, "Anchor B", 0, 0, (w, v, obj)=>{
            obj.obj.m_localAnchorB = b2VecFromArr(v)
            this.online_awake_objects(w)
        })

        this.enableMotor = new PhyParamBool(node, "Motor", false, "EnableMotor", (v)=>{
            this.motorSpeed.set_enable(v)
            this.maxTorque.set_enable(v)
        })
        this.motorSpeed = new PhyParamFloat(node, "Motor Speed(r/s)", 0.5, {min:-6, max:6}, "SetMotorSpeed")
        this.maxTorque = new PhyParamFloat(node, "Max Torque(N/m)", 10, {min:0, max:10}, "SetMaxMotorTorque")
        this.anchor.dial = new PointDial((dx,dy)=>{ this.anchor.increment(vec2.fromValues(dx, dy)) })

        // ------- Distance ---------
        // if two objects are connected by more than one joint this bool needs to be the same on all or only the last one initialized will take
        this.collideConnected = new PhyParamBool(node, "Collide Connected", false, (w, v, obj)=>{
            obj.obj.m_collideConnected = v
        })
        this.damping = new PhyParamFloat(node, "Damping", 0.2, {min:0, max:1}, (w, v, obj)=>{
            const objA = w.cnode_to_obj[this.last_A_def.cnode_id]
            const objB = w.cnode_to_obj[this.last_B_def.cnode_id]
            if (objA === undefined || objB === undefined)
                return
            const dummyDef = {}
            b2.LinearStiffness(dummyDef, FREQUENCY_HZ_FOR_DAMPING, v, objA.obj, objB.obj)
            obj.obj.SetStiffness(dummyDef.stiffness)
            obj.obj.SetDamping(dummyDef.damping)
        })
        // TBD validator
        this.min_len = new PhyParamFloatPositive(node, "Min Length", 0.1, {min:0, max:2}, (w, v, obj)=>{
            obj.obj.SetMinLength(obj.obj.GetLength() - v)
        })
        this.max_len = new PhyParamFloatPositive(node, "Max Length", 0.1, {min:0, max:2}, (w, v, obj)=>{
            obj.obj.SetMaxLength(obj.obj.GetLength() + v)
        })

        this.anchorA.dial = new PointDial((dx,dy)=>{ this.anchorA.increment(vec2.fromValues(dx, dy)) }, null)
        this.anchorA.member_body_def = "last_A_def" // for lookup in draw_selection

        this.anchorB.dial = new PointDial((dx,dy)=>{ this.anchorB.increment(vec2.fromValues(dx, dy)) }, null)
        this.anchorB.member_body_def = "last_B_def"

        this.dialed_params = [this.anchor, this.anchorA, this.anchorB]

        // the positions of the bodies in the last run, for placing the anchors that are relative
        this.last_A_def = null  // b2.Vec2
        this.last_B_def = null
    }

    online_awake_objects(w) {
        if (this.last_A_def !== null) {
            const objA = w.cnode_to_obj[this.last_A_def.cnode_id]
            if (objA !== undefined)
                objA.obj.SetAwake(true)
        }
        if (this.last_B_def !== null) {
            const objB = w.cnode_to_obj[this.last_B_def.cnode_id]
            if (objB !== undefined)
                objB.obj.SetAwake(true)
        }
    }

    get_ab_anchors(bodyA, bodyB) {
        const ancA_obj = b2VecFromArr(this.anchorA.get_value())
        bodyA.GetWorldPoint(ancA_obj, ancA_obj)
        const ancB_obj = b2VecFromArr(this.anchorB.get_value())
        bodyB.GetWorldPoint(ancB_obj, ancB_obj)
        return [ancA_obj, ancB_obj]
    }

    run() {
        const defsA = this.inA.get_const()
        const defsB = this.inB.get_const()
        assert(defsA !== null && defsB !== null, this, "Missing input")
        assert(defsA.constructor === B2Def || !isSingleBody(defsA), this, "bodyA is not a physics body")
        assert(defsB.constructor === B2Def || !isSingleBody(defsB), this, "bodyB is not a physics body")

        const j = new B2Joint(this.node.id)
        j.body_refA = defsA.bodies[0]
        j.body_refB = defsB.bodies[0]
        this.last_A_def = j.body_refA
        this.last_B_def = j.body_refB

        if (this.type.sel_idx === 0) {
            j.def = new b2.RevoluteJointDef()
            j.init_call = (bodyA, bodyB)=>{
                j.def.Initialize(bodyA, bodyB, b2VecFromArr(this.anchor.get_value()))
                if (this.rel_anchor.get_value()) {
                    // init it on the single point and the move it since there's no INitialize with rel anchors
                    j.def.localAnchorA = b2VecFromArr(this.anchorA.get_value())
                    j.def.localAnchorB = b2VecFromArr(this.anchorB.get_value())
                }
            }
            j.def.motorSpeed = this.motorSpeed.get_value()
            j.def.enableMotor = this.enableMotor.get_value()
            j.def.maxMotorTorque = this.maxTorque.get_value()
        }
        else if (this.type.sel_idx === 1) {
            j.def = new b2.DistanceJointDef()
            j.def.collideConnected = this.collideConnected.get_value()
            j.init_call = (bodyA, bodyB)=>{
                const [ancA_obj, ancB_obj] = this.get_ab_anchors(bodyA, bodyB)
                j.def.Initialize(bodyA, bodyB, ancA_obj, ancB_obj)
                b2.LinearStiffness(j.def, FREQUENCY_HZ_FOR_DAMPING, this.damping.get_value(), bodyA, bodyB)
                j.def.minLength -= this.min_len.get_value()
                j.def.maxLength += this.max_len.get_value()
            }
        }
        else
            assert(false, this, "Unexpected type")

        const ret = new B2Def()
        ret.bodies.push(j.body_refA, j.body_refB)
        ret.joints.push(j)
        this.out.set(ret)
    }

    dials_hidden() {
        return g_current_worlds.length > 0
    }

    draw_selection(m) {
        if (this.dials_hidden())
            return
        for(let p of this.dialed_params)
            if (p.pis_visible()) {
                let t_mat = null
                if (p.member_body_def !== undefined) {
                    const last_def = this[p.member_body_def]
                    if (last_def !== null) {
                        t_mat = mat3.create()
                        // don't use the param t_mat since that include the pivot move which we don't want since this is just the position of the body
                        mat3.translate(t_mat, t_mat, [last_def.def.position.x, last_def.def.position.y])
                        mat3.rotate(t_mat, t_mat, last_def.def.angle)
                    }
                }
                p.dial.draw(p.x, p.y, t_mat, m)
            }
    }
    image_find_obj(e) {
        if (this.dials_hidden())
            return null
        for(let p of this.dialed_params) {
            if (p.pis_visible()) {
                const hit = p.dial.find_obj(e)
                if (hit)
                    return hit
            }
        }
        return null
    }
}

function createWorld(def, gravity, for_sim) 
{
    const w = new B2World()
    w.obj = new b2.World(new b2.Vec2(gravity[0], gravity[1]))
    if (for_sim)  // don't want to register if we're just creating it for drawing since that would make the dials disapper
        g_current_worlds.push(w) // for call_change on on_init to work
    let index_gen = 0

    for(let body of def.bodies)
        body.index = null

    for(let body of def.bodies) {
        if (body.index !== null) // can happen if the same body was added more than once through multiple paths
            continue // don't allow it to participate more than once since that complicates stuff
        body.index  = index_gen++ // this is the index of the new B2Body in w.bodies, for reference by joints
        const mb = new B2Body(body.cnode_id) // don't want to change the input one
        w.bodies.push(mb)
        w.cnode_to_obj[body.cnode_id] = mb
        mb.def = body.def
        mb.obj = w.obj.CreateBody(mb.def)
        for(let fixt of body.fixtures) {
            const mf = new B2Fixture()
            mb.fixtures.push(mf)
            mf.def = fixt.def
            mf.obj = mb.obj.CreateFixture(mf.def)      
            w.cnode_to_obj[fixt.cnode_id] = mf              
        }

        for(let pp of body.on_init_params)
            pp.call_change() // set config that needs the bodies 
    }

    for(let joint of def.joints) {
        dassert(joint.body_refA.index !== null && joint.body_refB.index !== null, "bodies not in world?") // sanity
        const mj = new B2Joint(joint.cnode_id)
        w.cnode_to_obj[joint.cnode_id] = mj
        mj.def = joint.def
        mj.body_refA = w.bodies[joint.body_refA.index]
        mj.body_refB = w.bodies[joint.body_refB.index]
        joint.init_call(mj.body_refA.obj, mj.body_refB.obj)
        mj.obj = w.obj.CreateJoint(mj.def)
        // bodies of this world stay referenced by this joint in the input world but that doesn't really matter since if it gets to
        // another world it will get reinited here
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
        const body_ids = new Set()
        for(let def of in_defs) {
            assert(def !== null, this, "empty input")
            for(let b of def.bodies)  { // the same body can arrive multiple times from different joints
                if (body_ids.has(b.cnode_id))
                    continue
                udef.bodies.push(b)
                body_ids.add(b.cnode_id)
            }
            udef.joints.push(...def.joints)
        }
        this.out.set(udef)
    }
}

// for online updates
// this gets set and reset every draw with the currently drawn worlds, also on createWorld
var g_current_worlds = []  
function phy_reset_current_worlds() {
    g_current_worlds.length = 0
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
            w = createWorld(inobj, this.gravity.get_value(), true)
        else
            assert(inobj.constructor === B2World, this, "input not a defs or world")

        const timeStep = 1.0 / 60.0
        const velocityIterations = 6
        const positionIterations = 2
        w.obj.Step(timeStep, velocityIterations, positionIterations)
        
        this.out.set(w)
    }
}


// extract the transform relative to a given body in a given world and set it to a given object
class ExtractTransform extends NodeVarCls
{
    static name() { return "Extract Transform" }
    constructor(node) {
        super(node)
        node.can_input = false

        this.in_world = new InTerminal(node, "in_world")
        this.in_body = new InTerminal(node, "in_body")

        this.name = new ParamStr(node, "Name", "trans")

        this.var_out = new VarOutTerminal(node, "variable_out")
    }
    run() {
        const in_body = this.in_body.get_const()
        assert(in_body !== null, this, "missing in_body")
        assert(in_body.constructor === B2Def && in_body.bodies.length === 1, this, "in_body should be a single body definition")
        const in_world = this.in_world.get_const()
        assert(in_world !== null, this, "missing in_world")
        assert(in_world.constructor === B2World, this, "in_world needs to be a B2World")

        const body_def = in_body.bodies[0]
        const body = in_world.cnode_to_obj[body_def.cnode_id]
        assert(body !== undefined, this, "Can't find body " + body_def.cnode_id)
        const pos = body.obj.GetPosition()
        const angle = body.obj.GetAngle()
        const m = mat3.create()
        mat3.translate(m, m, vec2.fromValues(pos.x, pos.y))
        mat3.rotate(m, m, angle)

        const vsb = new VariablesBox()
        const vb = new VarBox()
        vsb.add(this.name.v, vb)
        vb.vbset(m, TYPE_MAT3)
        this.var_out.set(vsb)
    }
}

//class NodePen



// from https://github.com/flyover/box2d.ts/blob/master/testbed/draw.ts
class CanvasDebugDraw extends b2.Draw 
{
    constructor(ctx) {
      super(ctx);
      this.ctx = ctx
      this.col_from_shape = false
      this.last_shape_color = null
      this.col_template = false
    }

    set_color_from_shape(v) {
        this.col_from_shape = v
    }
    set_color_template(v) {
        this.col_template = v
    }

    NextShape(ud) {
        this.last_shape_color = color_from_uid(ud.node_id)
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

    resolve_color(color, alpha) {
        if (this.col_from_shape) {
            if (this.last_shape_color === null)
                return "rgba(0,0,0,0)"
            return this.last_shape_color
        }
        if (alpha === null)
            alpha = color.a
        if (this.col_template)
            return "rgba(" + TEMPLATE_LINE_COLOR_V[0] + "," + TEMPLATE_LINE_COLOR_V[1] + "," + TEMPLATE_LINE_COLOR_V[2] + "," + alpha + ")"
        return color.MakeStyleString(alpha)
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
        ctx.strokeStyle = this.resolve_color(color, 1);
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
        ctx.fillStyle = this.resolve_color(color, 0.5);
        ctx.fill();
        ctx.strokeStyle = this.resolve_color(color, 1);
        ctx.stroke();
      }
    }
  
    DrawCircle(center, radius, color) {
      const ctx = this.ctx
      if (ctx) {
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, b2.pi * 2, true);
        ctx.strokeStyle = this.resolve_color(color, 1);
        ctx.stroke();
      }
    }
  
    DrawSolidCircle(center, radius, axis, color) {
      const ctx = this.ctx
      if (radius < 0)
        return
      if (ctx) {
        const cx = center.x;
        const cy = center.y;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, b2.pi * 2, true);
        ctx.moveTo(cx, cy);
        ctx.lineTo((cx + axis.x * radius), (cy + axis.y * radius));
        ctx.fillStyle = this.resolve_color(color, 0.5);
        ctx.fill();
        ctx.strokeStyle = this.resolve_color(color, 1);
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
        ctx.strokeStyle = this.resolve_color(color, 1);
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
        ctx.fillStyle = this.resolve_color(color, null);
        size /= image_view.viewport_zoom;
        //size /= g_camera.m_extent;
        const hsize = size / 2;
        ctx.fillRect(p.x - hsize, p.y - hsize, size, size);
      }
    }
  
    DrawAABB(aabb, color) {
      const ctx = this.ctx
      if (ctx) {
        ctx.strokeStyle = this.resolve_color(color, null);
        const x = aabb.lowerBound.x;
        const y = aabb.lowerBound.y;
        const w = aabb.upperBound.x - aabb.lowerBound.x;
        const h = aabb.upperBound.y - aabb.lowerBound.y;
        ctx.strokeRect(x, y, w, h);
      }
    }
  }

