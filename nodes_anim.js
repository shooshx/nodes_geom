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


class NodeAnimCls extends NodeCls 
{
    constructor(node) {
        super(node)
        node.can_display = false
        node.can_follow = true
        node.follow_target = new FollowTarget(node)
    }
    node_move_hook(ev) {
        if (!this.node.can_follow || this.node.is_following())
            return
        const center_e = { cvs_x: (this.node.x + nodes_view.pan_x + NODE_WIDTH*0.5)*nodes_view.zoom,
                           cvs_y: (this.node.y + nodes_view.pan_y + NODE_HEIGHT*0.5)*nodes_view.zoom }
        const obj = nodes_find_obj_shadow(center_e)
        if (obj === null || obj.constructor !== FollowTarget || obj === this.node.follow_target) {
            this.node.snap_suggest = null
            return
        }
        this.node.snap_suggest = {x:obj.node.x, y:obj.node.y + obj.node.height, obj:obj.node }
        console.log("FOUND " + obj.node.name)
    }
    node_mouse_up_hook(ev) {
        if (this.node.snap_suggest !== null) {
            const of_node = this.node.snap_suggest.obj
            this.node.follow(of_node)
            this.node.set_pos(of_node.x, of_node.y + of_node.height + 1)
            this.node.snap_suggest = null
            
            draw_nodes()
        }
        else {
            this.node.unfollow()
        }
    }
}

class AnimStartFlow extends NodeAnimCls
{
    static name() {
        return "Start Flow"
    }
    constructor(node) {
        super(node)
        node.can_enable = true
        node.can_follow = false // start node can't follow anything else
    }
}

class AnimSpan extends NodeAnimCls
{
    static name() {
        return "Flow Span"
    }
    constructor(node) {
        super(node)
    }

}