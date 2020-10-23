"use strict"



class NodePickOne extends NodeCls
{
    static name() { return "Pick One" }
    constructor(node) {
        super(node)
        this.sorted_order = []

        this.in_m = new InTerminalMulti(node, "in_multi_mesh")
        this.out = new OutTerminal(node, "out_mesh")

        this.pick_expr = new ParamInt(node, "Pick Index", 0, {show_code:true})
        mixin_multi_reorder_control(node, this, this.sorted_order, this.in_m)
        this.last_line_picked = null
    }
    is_picking_lines() { return true }

    // called before run
    pick_lines(of_terminal) {
        assert(of_terminal === this.in_m, this, "Unexpected terminal in pick_lines")
        assert(this.in_m.lines.length > 0, this, "No inputs")
        const pick = this.pick_expr.get_value()
        assert(pick < this.in_m.lines.length, this, "Index out of range " + pick)
        const idx = this.sorted_order[pick]
        const line = this.in_m.lines[idx]
        this.last_line_picked = line
        return [line]
    }

    run() {
        const line = this.last_line_picked
        this.last_line_picked = null 
        collect_line(line) // manual collect
        const obj = line.to_term.get_const()
        this.out.set(obj)
    }
}
