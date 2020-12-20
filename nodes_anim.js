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

    is_dirty_override() {
        // I know better than my terminals when I want to run
        if (this.enabled.get_value() && this.out.get_const() !== null && !this.change_expr.pis_dirty())
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