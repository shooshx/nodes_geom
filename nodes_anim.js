"use strict"


//pick one of the inputs and set it to the output depending on an expression
class NodePickOne extends NodeCls
{
    static name() { return "Pick One" }
    constructor(node) {
        super(node)
        this.sorted_order = []

        this.in_m = new InTerminalMulti(node, "in_multi")
        this.out = new OutTerminal(node, "out")

        this.pick_expr = new ParamInt(node, "Pick Index", "(frame_num == 0) ? 0 : 1", {show_code:true})
        mixin_multi_reorder_control(node, this, this.sorted_order, this.in_m)
        this.last_line_picked = null
    }
    is_picking_lines() { return true }

    // called before run, selects which inputs to run
    pick_lines(of_terminal) {

        assert(of_terminal === this.in_m, this, "Unexpected terminal in pick_lines")
        assert(this.in_m.lines.length > 0, this, "No inputs")
        this.pick_expr.resolve_variables(this.vars_in.my_vsb, true, true) // this is needed since pick_lines runs before resolving variables
        const pick = this.pick_expr.get_value()
        assert(pick >= -1 && pick < this.in_m.lines.length, this, "Index out of range " + pick)
        if (pick === -1) {
            assert(this.out.get_const() !== null, this, "pick result is -1 but no previous output exists")
            this.last_line_picked = null
            return []
        }
        const idx = this.sorted_order[pick]
        const line = this.in_m.lines[idx]
        this.last_line_picked = line
        return [line]
    }

    should_clear_out_before_run() {
        return this.last_line_picked !== null
    }

    run() {
        if (this.last_line_picked === null)
            return  // keep the previous result
        const line = this.last_line_picked
        this.last_line_picked = null 
        collect_line(line) // manual collect, just the input we want
        const obj = line.to_term.get_const()
        // don't check if obj is empty here. If it's empty due to an error, forward it into the anim loop so that the error will reach there
        this.out.set(obj)
    }
}

// pass the input to output only if an expression changes
// this is needed for making a difference between a frame change and pan/zoom/space press
class NodeChangeFilter extends NodeCls 
{
    static name() { return "Change Filter" }
    constructor(node) {
        super(node)

        this.in = new InTerminal(node, "in")
        this.out = new OutTerminal(node, "out")

        // make this node pass-through
        // this can be unchecked if we want any parameter change to cause an animation frame (but not panning which doesn't do run in any case)
        this.enabled = new ParamBool(node, "Filter Enabled", true, (v)=>{
            this.change_expr.enabled = v;
        })
        // the value of this expr is not used, only the fact that the value changes
        this.change_expr = new ParamInt(node, "Change Expr", "frame_num", {show_code:true})
    }

    should_clear_out_before_run() { return false } // don't clear my cache

    is_dirty_override(parent_dirty) { // ignored parent_dirty
        // I know better than my terminals when I want to run
        if (!this.enabled.get_value())
            return null  // do the default behaviour
        if (this.out.get_const() !== null && !this.change_expr.pis_dirty())
            return false
        return true
    }

    run() {
        if (this.enabled.get_value() && this.out.get_const() !== null && !this.change_expr.pis_dirty())
            return
        const obj = this.in.get_const()
        assert(obj !== null, this, "No input")
        this.out.set(obj)
    }

}

// represents the shadow-nodes canvas sqare that snaps the follow node
class FollowTarget {
    constructor(node) {
        this.node = node
        this.wuid = node.of_program.alloc_ephemeral_obj_id(this)
    }
    draw_nshadow() {
        ctx_nd_shadow.beginPath();
        const x = this.node.x + NODE_WIDTH*0.5
        const y = this.node.y + NODE_HEIGHT
        //ctx_nd_shadow.arc(x, y , 35, 0, 2*Math.PI)
        ctx_nd_shadow.fillStyle = color_from_uid(this.wuid)
        ctx_nd_shadow.fillRect(x-40, y, 80, 35)
//        ctx_nd_shadow.fill()   
    }
}

function add_follow_target(inst)
{
    inst.node.follow_target = new FollowTarget(node)
    inst.node_move_hook = (ev, is_cascading)=>{
        if (!this.node.can_follow || is_cascading) // if it's a move due to the followee moving, don't need to do anything
            return
        this.node.unfollow() // start moving due to a user drag, disconnect it immediately
        const center_e = { cvs_x: (this.node.x + nodes_view.pan_x + NODE_WIDTH*0.5)*nodes_view.zoom,
                        cvs_y: (this.node.y + nodes_view.pan_y + NODE_HEIGHT*0.5)*nodes_view.zoom }
        const obj = nodes_find_obj_shadow(center_e)
        if (obj === null || obj.constructor !== FollowTarget || obj === this.node.follow_target || obj.node.followed_by_node !== null) {
            this.node.snap_suggest = null
            return
        }
        this.node.snap_suggest = {x:obj.node.x, y:obj.node.y + obj.node.height, obj:obj.node }
        console.log("FOUND " + obj.node.name)
    }
    inst.node_mouse_up_hook = (ev)=>{
        if (this.node.snap_suggest !== null) {
            const of_node = this.node.snap_suggest.obj
            this.node.unfollow()
            this.node.follow(of_node)
            this.node.mousemove( { dx: of_node.x - this.node.x, dy: of_node.y + of_node.height + 1 - this.node.y }, true)
            this.node.snap_suggest = null
            
            draw_nodes()
        }
        else {
            this.node.unfollow()
        }
    }
}


const LINE_COLOR_ANIM_FLOW = "#ACFFEC"
const TERM_COLOR_ANIM_FLOW = "#ACFFEC"

class NodeAnimCls extends NodeCls 
{
    constructor(node) {
        super(node)
        node.can_display = false
        //node.can_follow = true
        node.can_run_on_select = false // doesn't run when selected
    }  

    // called when flow just enters this node
    entered() {}
    get_anim_traits() { dassert(false, "unimplemented") }
    // for event
    want_flow_hijack() { dassert(false, "unimplemented") }

    run() { // do nothing
    }
}

class AnimInTerminal extends InTerminal
{
    constructor(node, name) {
        super(node, name)
        this.kind = KIND_FLOW_ANIM
        this.color = TERM_COLOR_ANIM_FLOW
    }
    is_dirty() {
        return false // doesn't transport object so it's never dirty
    }
}

class AnimOutTerminal extends OutTerminal
{
    constructor(node, name) {
        super(node, name)
        this.kind = KIND_FLOW_ANIM
        this.color = TERM_COLOR_ANIM_FLOW
    }
    // there can be only one output line, delete any existing
    pre_add_line_hook() {
        const lines_copy = [...this.lines]
        for(let line of lines_copy)
            program.delete_line(line, false) 
    }
}

const FRAME_RATE_NORMAL = -1 // normal rate from requestAnimationFrame
const FRAME_RATE_MAX = -2

// returned from get_anim_traits()
class AnimTraits
{
    constructor() {
        this.next = false //should skip to next flow node and call again on it
        this.frame_rate = FRAME_RATE_NORMAL
        this.render = true
        this.blocking_frames = 1
        this.jump_here = false // relevant only for EventFlow
    }
}


// controls program.anim_flow.start_node
class AnimStartFlow extends NodeAnimCls
{
    static name() {
        return "Start Flow"
    }
    constructor(node) {
        super(node)
        node.can_enable = true
        this.start = new AnimOutTerminal(node, "start")
        this.traits = new AnimTraits()
        this.traits.next = true // start does nothing but go to the first
    }

    toggle_enable_flag(do_draw) {
        this.node.of_program.anim_flow.set_anim_node(this.node)
    }

    get_anim_traits() {
        return this.traits
    }
}

class AnimEventFlow extends NodeAnimCls
{
    static name() {
        return "Event Flow"
    }
    constructor(node) {
        super(node)
        node.can_enable = true
        this.start = new AnimOutTerminal(node, "start")
        this.trigger_on = new ParamBool(node, "Trigger", false, null, {pulse_btn:true})

        this.traits = new AnimTraits()
        this.traits.next = true
        this.current_trigger_value = null
    }

    toggle_enable_flag(do_draw) {
        this.node.of_program.anim_flow.toggle_event_node(this.node)
    }

    get_anim_traits() {
        return this.traits
    }
    want_flow_hijack() {
        return this.current_trigger_value
    }
    run() {
        // need to cache it in run, before the dirty flag is cleared and the pulse ends
        this.current_trigger_value = this.trigger_on.get_value()
    }
}


class AnimSpan extends NodeAnimCls
{
    static name() {
        return "Flow Span"
    }
    constructor(node) {
        super(node)
        this.prev = new AnimInTerminal(node, "previous")
        this.next = new AnimOutTerminal(node, "next")

        this.frame_rate = new ParamSelect(node, "Frame Rate", 0, [["Normal", FRAME_RATE_NORMAL], ["Maximum", FRAME_RATE_MAX]], (sel_idx)=>{
            this.blocking_frames.set_visible(sel_idx === 1)
        })
        // number of frames to run at the same time without returning
        this.blocking_frames = new ParamInt(node, "Block Frames", 1)
        this.render = new ParamBool(node, "Render", true)
        this.stop_at = new ParamSelect(node, "Stop", 0, ["Never", "Frame Count", "Condition"], (sel_idx)=>{
            this.stop_at_count.set_visible(sel_idx === 1)
        })
        this.stop_at_count = new ParamInt(node, "After Count", 0) 

        this.traits = new AnimTraits()
        this.first_frame = null // for frame_count
    }

    entered() {
        this.first_frame = null
    }

    get_anim_traits() {
        if (this.stop_at.sel_idx === 1) {
            const now_frame_num = g_anim.frame_num
            if (this.first_frame === null)
                this.first_frame = now_frame_num
            else {
                const check_count = this.stop_at_count.get_value()
                if (now_frame_num - this.first_frame > check_count) {
                    this.traits.next = true
                    return this.traits
                }
            }
        }
        this.traits.frame_rate = this.frame_rate.get_sel_val()
        if (this.traits.frame_rate === FRAME_RATE_MAX) {
            const blf = this.blocking_frames.get_value()
            assert(blf >= 1, this, "Block Frames can't be less than 1")
            this.traits.blocking_frames = blf
        }
        this.traits.render = this.render.get_value()
        this.traits.next = false
        this.traits.blocking_frames = 1 // reset to default
        return this.traits
    }
}



class FlowVariable extends NodeVariable
{
    static name() {
        return "Flow Set Variable"
    }
    constructor(node) {
        super(node)
        node.can_display = false
        //node.can_follow = true
        node.can_run_on_select = false // doesn't run when selected

        this.prev = new AnimInTerminal(node, "previous")
        this.next = new AnimOutTerminal(node, "next")

        this.traits = new AnimTraits()
        this.traits.next = true
    }  

    // called when flow just enters this node
    get_anim_traits() { 
        return this.traits
     }


}